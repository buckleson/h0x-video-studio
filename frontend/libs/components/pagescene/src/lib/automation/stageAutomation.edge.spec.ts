import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Editor from "../engine/editor";
import { installStageAutomation } from "./stageAutomation";

function mockEditor(overrides: { camera?: unknown; snapshot?: unknown } = {}) {
  const obj = new THREE.Object3D();
  const camera =
    "camera" in overrides ? overrides.camera : new THREE.PerspectiveCamera();
  const editor = {
    activeScene: { loadObject: vi.fn().mockResolvedValue(obj) },
    cameraController: { camera },
    timelineController: {
      recordEdit: vi.fn((_label: string, fn: () => unknown) => fn()),
      addClipLane: vi.fn().mockReturnValue("lane-1"),
      getPlayhead: vi.fn().mockReturnValue(9),
      seekTo: vi.fn(),
    },
    snapShotOfCurrentFrame: vi
      .fn()
      .mockReturnValue(
        "snapshot" in overrides ? overrides.snapshot : { base64Snapshot: "AAAA" },
      ),
  };
  return { editor, obj };
}

const asEditor = (e: unknown) => e as Editor;

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

function install(search: string, dev: boolean, overrides = {}) {
  vi.stubEnv("DEV", dev);
  setSearch(search);
  const m = mockEditor(overrides);
  const uninstall = installStageAutomation(asEditor(m.editor));
  return { ...m, uninstall, stage: window.__h0xStage };
}

afterEach(() => {
  vi.unstubAllEnvs();
  setSearch("");
  delete window.__h0xStage;
});

describe("installStageAutomation gating", () => {
  it("installs in DEV with no query", () => {
    expect(install("", true).stage).toBeDefined();
  });

  it.each(["?automation=0", "?automation=true", "?automation=", "?Automation=1", "?automation=11"])(
    "does not install outside DEV for %s",
    (q) => {
      expect(install(q, false).stage).toBeUndefined();
    },
  );

  it("installs when automation=1 is mixed with other params", () => {
    expect(install("?scene=abc&automation=1&x=2", false).stage).toBeDefined();
  });

  it("disabled uninstall is a no-op and does not remove an existing hook", () => {
    const keep = install("?automation=1", false);
    const disabled = install("", false);
    expect(() => disabled.uninstall()).not.toThrow();
    expect(window.__h0xStage).toBe(keep.stage);
  });

  it("uninstall is idempotent", () => {
    const { uninstall } = install("", true);
    uninstall();
    expect(() => uninstall()).not.toThrow();
    expect(window.__h0xStage).toBeUndefined();
  });

  it("a stale uninstall does not remove a newer editor's hook", () => {
    const first = install("", true);
    const second = install("", true);
    first.uninstall();
    expect(window.__h0xStage).toBe(second.stage);
    second.uninstall();
    expect(window.__h0xStage).toBeUndefined();
  });

  it("exposes only functions", () => {
    const { stage } = install("", true);
    for (const v of Object.values(stage!)) expect(typeof v).toBe("function");
  });
});

describe("__h0xStage edge cases", () => {
  it("addCharacter flags the object as a character and handles zero/negative transforms", async () => {
    const { stage, obj, editor } = install("", true);
    const id = await stage!.addCharacter("m", { x: 0, y: -1, z: 0, rotY: -Math.PI, scale: 0.25 });
    expect(id).toBe(obj.uuid);
    expect(obj.userData["isCharacter"]).toBe(true);
    expect(obj.rotation.y).toBeCloseTo(-Math.PI);
    expect(obj.scale.toArray()).toEqual([0.25, 0.25, 0.25]);
    const pos = editor.activeScene.loadObject.mock.calls[0][3] as THREE.Vector3;
    expect(pos).toBeInstanceOf(THREE.Vector3);
    expect(pos.toArray()).toEqual([0, -1, 0]);
  });

  it("addCharacter propagates a load failure and leaves the hook installed", async () => {
    const { stage, editor } = install("", true);
    editor.activeScene.loadObject.mockRejectedValueOnce(new Error("load failed"));
    await expect(
      stage!.addCharacter("missing", { x: 0, y: 0, z: 0, rotY: 0, scale: 1 }),
    ).rejects.toThrow("load failed");
    expect(window.__h0xStage).toBe(stage);
  });

  it("addClip at startSec 0 starts at 0, not the playhead", () => {
    const { stage, editor } = install("", true);
    stage!.addClip("c1", "clip", 0);
    expect(editor.timelineController.addClipLane).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ sourceMediaId: "clip", startTime: 0 }),
    );
    expect(editor.timelineController.recordEdit).toHaveBeenCalledTimes(1);
  });

  it("addClip with an empty media id returns null and records nothing", () => {
    const { stage, editor } = install("", true);
    expect(stage!.addClip("c1", "", 1)).toBeNull();
    expect(editor.timelineController.addClipLane).not.toHaveBeenCalled();
    expect(editor.timelineController.recordEdit).not.toHaveBeenCalled();
  });

  it("addClip returns null when the timeline has no free slot", () => {
    const { stage, editor } = install("", true);
    editor.timelineController.addClipLane.mockReturnValueOnce(null);
    expect(stage!.addClip("c1", "clip", 2)).toBeNull();
  });

  it("seek passes 0 and negative values through unchanged", () => {
    const { stage, editor } = install("", true);
    stage!.seek(0);
    stage!.seek(-1);
    expect(editor.timelineController.seekTo.mock.calls).toEqual([[0], [-1]]);
  });

  it("setCamera throws when the camera is not ready", () => {
    const { stage } = install("", true, { camera: undefined });
    expect(() =>
      stage!.setCamera({ x: 1, y: 1, z: 1 }, { lookAt: { x: 0, y: 0, z: 0 } }),
    ).toThrow(/camera not ready/i);
  });

  it("capture throws when the renderer is not ready", () => {
    const { stage } = install("", true, { snapshot: undefined });
    expect(() => stage!.capture()).toThrow(/renderer not ready/i);
  });

  it("capture returns an exact base64 PNG data URL", () => {
    const { stage } = install("", true);
    expect(stage!.capture()).toBe("data:image/png;base64,AAAA");
  });

  it("error messages carry no upstream branding", () => {
    const msgs: string[] = [];
    const { stage } = install("", true, { camera: undefined, snapshot: undefined });
    try { stage!.setCamera({ x: 0, y: 0, z: 0 }, { lookAt: { x: 0, y: 0, z: 0 } }); } catch (e) { msgs.push(String(e)); }
    try { stage!.capture(); } catch (e) { msgs.push(String(e)); }
    expect(msgs).toHaveLength(2);
    for (const m of msgs) expect(m).not.toMatch(/ltx|lightricks|artcraft|storyteller|fakeyou/i);
  });
});

describe("installStageAutomation gating (extra)", () => {
  it("DEV wins over ?automation=0 (gate is DEV OR automation=1)", () => {
    expect(install("?automation=0", true).stage).toBeDefined();
  });

  it("a flag only in the URL hash does not enable it outside DEV", () => {
    vi.stubEnv("DEV", false);
    window.history.replaceState(null, "", "/#automation=1");
    installStageAutomation(asEditor(mockEditor().editor));
    expect(window.__h0xStage).toBeUndefined();
  });

  it("installing calls no editor or timeline API", () => {
    const { editor } = install("?automation=1", false);
    expect(editor.activeScene.loadObject).not.toHaveBeenCalled();
    expect(editor.snapShotOfCurrentFrame).not.toHaveBeenCalled();
    expect(editor.timelineController.addClipLane).not.toHaveBeenCalled();
    expect(editor.timelineController.seekTo).not.toHaveBeenCalled();
  });

  it("uninstall leaves a hook that something else assigned afterwards", () => {
    const { uninstall } = install("", true);
    const foreign = { addCharacter: vi.fn() } as unknown as typeof window.__h0xStage;
    window.__h0xStage = foreign;
    uninstall();
    expect(window.__h0xStage).toBe(foreign);
  });
});

describe("__h0xStage edge cases (extra)", () => {
  it("addClip forwards the character id and fractional start unchanged", () => {
    const { stage, editor } = install("", true);
    expect(stage!.addClip("C:\odd id/with-slashes", "clip", 0.033)).toBe("lane-1");
    expect(editor.timelineController.addClipLane).toHaveBeenCalledWith(
      "C:\odd id/with-slashes",
      expect.objectContaining({ sourceMediaId: "clip", startTime: 0.033 }),
    );
  });

  it("each addCharacter call returns the uuid of its own loaded object", async () => {
    const { stage, editor } = install("", true);
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    editor.activeScene.loadObject.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const t = { x: 0, y: 0, z: 0, rotY: 0, scale: 1 };
    const [idA, idB] = await Promise.all([
      stage!.addCharacter("m1", t),
      stage!.addCharacter("m2", t),
    ]);
    expect([idA, idB]).toEqual([a.uuid, b.uuid]);
    expect(idA).not.toBe(idB);
  });

  it("capture with an empty snapshot still returns a PNG data URL prefix", () => {
    const { stage } = install("", true, { snapshot: { base64Snapshot: "" } });
    expect(stage!.capture()).toBe("data:image/png;base64,");
  });
});
