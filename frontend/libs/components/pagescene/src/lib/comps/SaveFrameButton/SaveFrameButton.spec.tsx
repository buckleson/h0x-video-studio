import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SaveFrameButton } from "./SaveFrameButton";
import { EngineContext } from "../../contexts/EngineContext";
import { ToastTypes } from "../../enums";
import type Editor from "../../engine/editor";

vi.mock("../../contexts/EngineContext", async () => {
  const { createContext } = await import("react");
  return { EngineContext: createContext(null) };
});

const file = new File(["png"], "frame.png", { type: "image/png" });
let snapShotOfCurrentFrame: ReturnType<typeof vi.fn>;

beforeEach(() => {
  snapShotOfCurrentFrame = vi.fn().mockReturnValue({ base64Snapshot: "AAAA", file });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("hands the PNG to adapter.saveFrame without uploading or downloading", async () => {
  const saveFrame = vi.fn().mockResolvedValue(undefined);
  const uploadMedia = vi.fn();
  const showToast = vi.fn();
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  renderButton({ saveFrame, uploadMedia, showToast });
  fireEvent.click(screen.getByRole("button", { name: "Save frame" }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith(ToastTypes.SUCCESS, "Frame saved"));
  expect(snapShotOfCurrentFrame).toHaveBeenCalledTimes(1);
  expect(snapShotOfCurrentFrame).toHaveBeenCalledWith(false);
  expect(saveFrame).toHaveBeenCalledTimes(1);
  expect(saveFrame).toHaveBeenCalledWith(file);
  expect(uploadMedia).not.toHaveBeenCalled();
  expect(anchorClick).not.toHaveBeenCalled();
});

it("reports a failed host save", async () => {
  const showToast = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
  renderButton({ saveFrame: vi.fn().mockRejectedValue(new Error("disk full")), showToast });
  fireEvent.click(screen.getByRole("button", { name: "Save frame" }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith(ToastTypes.ERROR, "Could not save the frame"));
});

it("falls back to a timestamped browser download when the host has no saveFrame", async () => {
  const uploadMedia = vi.fn();
  const createObjectURL = vi.fn().mockReturnValue("blob:frame");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  let clicked: HTMLAnchorElement | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked = this;
  });
  renderButton({ uploadMedia, showToast: vi.fn() });
  fireEvent.click(screen.getByRole("button", { name: "Save frame" }));
  await waitFor(() => expect(clicked).toBeDefined());
  expect(snapShotOfCurrentFrame).toHaveBeenCalledTimes(1);
  expect(snapShotOfCurrentFrame).toHaveBeenCalledWith(false);
  expect(createObjectURL).toHaveBeenCalledWith(file);
  expect(clicked!.getAttribute("href")).toBe("blob:frame");
  expect(clicked!.download).toMatch(/^\d+\.png$/);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:frame");
  expect(uploadMedia).not.toHaveBeenCalled();
});

function renderButton(adapter: Partial<Editor["adapter"]>) {
  return render(
    <EngineContext.Provider value={{ adapter, snapShotOfCurrentFrame } as unknown as Editor}>
      <SaveFrameButton />
    </EngineContext.Provider>,
  );
}
