// R3-4b edge cases for the "Save frame" toolbar button: missing editor or
// snapshot, host save failures, exact download naming, toolbar placement,
// the no-Tauri rule for pagescene, and brand leaks in user-visible strings.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveFrameButton } from "./SaveFrameButton";
import { EngineContext } from "../../contexts/EngineContext";
import { ToastTypes } from "../../enums";
import type Editor from "../../engine/editor";

vi.mock("../../contexts/EngineContext", async () => {
  const { createContext } = await import("react");
  return { EngineContext: createContext(null) };
});

const BRAND_LEAK = /artcraft|getartcraft|storyteller\.ai|fakeyou|ltx|lightricks/i;
const LIB_DIR = resolve(__dirname, "../..");
const FRONTEND_DIR = resolve(LIB_DIR, "../../../../..");

const file = new File(["png"], "frame.png", { type: "image/png" });
let snapShotOfCurrentFrame: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  snapShotOfCurrentFrame = vi.fn().mockReturnValue({ base64Snapshot: "AAAA", file });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWith(editor: unknown) {
  return render(
    <EngineContext.Provider value={editor as Editor}>
      <SaveFrameButton />
    </EngineContext.Provider>,
  );
}

function renderButton(adapter: Partial<Editor["adapter"]>) {
  return renderWith({ adapter, snapShotOfCurrentFrame });
}

const clickSave = () => fireEvent.click(screen.getByRole("button", { name: "Save frame" }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("SaveFrameButton edge cases", () => {
  it("does nothing when no editor is mounted", async () => {
    const createObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    renderWith(null);
    expect(() => clickSave()).not.toThrow();
    await flush();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("does nothing when the snapshot fails (renderer or camera missing)", async () => {
    snapShotOfCurrentFrame.mockReturnValue(null);
    const saveFrame = vi.fn();
    const showToast = vi.fn();
    const uploadMedia = vi.fn();
    renderButton({ saveFrame, showToast, uploadMedia });
    clickSave();
    await flush();
    expect(snapShotOfCurrentFrame).toHaveBeenCalledTimes(1);
    expect(snapShotOfCurrentFrame).toHaveBeenCalledWith(false);
    expect(saveFrame).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it("does not fall back to a browser download or report success when the host save fails", async () => {
    const showToast = vi.fn();
    const uploadMedia = vi.fn();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    renderButton({ saveFrame: vi.fn().mockRejectedValue(new Error("cancelled")), showToast, uploadMedia });
    clickSave();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(ToastTypes.ERROR, "Could not save the frame"));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalledWith(ToastTypes.SUCCESS, expect.anything());
    expect(anchorClick).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it("takes exactly one snapshot per click", async () => {
    const saveFrame = vi.fn().mockResolvedValue(undefined);
    renderButton({ saveFrame, showToast: vi.fn() });
    clickSave();
    clickSave();
    await waitFor(() => expect(saveFrame).toHaveBeenCalledTimes(2));
    expect(snapShotOfCurrentFrame).toHaveBeenCalledTimes(2);
    for (const call of snapShotOfCurrentFrame.mock.calls) expect(call).toEqual([false]);
  });

  it("names the download after Date.now() and revokes the object URL after the click", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    const order: string[] = [];
    const createObjectURL = vi.fn(() => {
      order.push("create");
      return "blob:frame";
    });
    const revokeObjectURL = vi.fn(() => order.push("revoke"));
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    let clicked: HTMLAnchorElement | undefined;
    anchorClick.mockImplementation(function (this: HTMLAnchorElement) {
      order.push("click");
      clicked = this;
    });
    const showToast = vi.fn();
    renderButton({ showToast, uploadMedia: vi.fn() });
    clickSave();
    await waitFor(() => expect(clicked).toBeDefined());
    expect(clicked!.download).toBe("1700000000000.png");
    expect(clicked!.hasAttribute("download")).toBe(true);
    expect(order).toEqual(["create", "click", "revoke"]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("does not leak brand names in its label, tooltip or toasts", async () => {
    const showToast = vi.fn();
    renderButton({ saveFrame: vi.fn().mockResolvedValue(undefined), showToast });
    const button = screen.getByRole("button", { name: "Save frame" });
    expect(button.textContent ?? "").not.toMatch(BRAND_LEAK);
    clickSave();
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    for (const [, message] of showToast.mock.calls) expect(String(message)).not.toMatch(BRAND_LEAK);

    const source = readFileSync(join(__dirname, "SaveFrameButton.tsx"), "utf8");
    const strings = source.match(/"[^"]*"|`[^`]*`/g) ?? [];
    const visible = strings.filter((s) => !s.startsWith('"@') && !s.startsWith('"..') && !s.startsWith('"./'));
    for (const s of visible) expect(s).not.toMatch(BRAND_LEAK);
    expect(source).toContain('"Save frame as PNG"');
  });
});

describe("SaveFrameButton wiring (source checks)", () => {
  it("is rendered right after AspectRatioMenu in the Stage3DBody toolbar and hidden in record mode", () => {
    const body = readFileSync(join(LIB_DIR, "Stage3DBody.tsx"), "utf8");
    expect(body).toMatch(/import\s+\{\s*SaveFrameButton\s*\}\s+from\s+"\.\/comps\/SaveFrameButton\/SaveFrameButton"/);
    expect(body).toMatch(/\{!isRecord && <AspectRatioMenu \/>\}\s*\{!isRecord && <SaveFrameButton \/>\}/);
    expect(body.match(/<SaveFrameButton\b/g)).toHaveLength(1);
  });

  it("declares saveFrame as one optional adapter method taking a Blob", () => {
    const adapter = readFileSync(join(LIB_DIR, "adapter.ts"), "utf8");
    const decls = adapter.match(/saveFrame\??\s*\(/g) ?? [];
    expect(decls).toHaveLength(1);
    expect(adapter).toMatch(/saveFrame\?\(blob: Blob\): Promise<void>;/);
  });

  it("keeps the pagescene lib free of @tauri-apps imports", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.tsx?$/.test(name)) {
          if (/from\s+["']@tauri-apps\//.test(readFileSync(p, "utf8"))) offenders.push(p);
        }
      }
    };
    walk(resolve(LIB_DIR, ".."));
    expect(offenders).toEqual([]);
  });

  it("implements saveFrame in the Tauri adapter by invoking save_scene_frame_command with PNG bytes", () => {
    const tauri = readFileSync(
      join(FRONTEND_DIR, "apps/artcraft/app/src/pages/PageScene/useTauriPageSceneAdapter.tsx"),
      "utf8",
    );
    const impl = tauri.slice(tauri.indexOf("saveFrame:"), tauri.indexOf("saveFrame:") + 300);
    expect(impl).toContain("blob.arrayBuffer()");
    expect(impl).toMatch(/invoke\(\s*"save_scene_frame_command",\s*\{\s*pngBytes\s*\}\s*\)/);
    expect(impl).not.toMatch(/uploadMedia/);
  });
});
