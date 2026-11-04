import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Editor from "../engine/editor";
import { installStageAutomation } from "./stageAutomation";

function mockEditor() {
  const obj = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  const editor = {
    activeScene: { loadObject: vi.fn().mockResolvedValue(obj) },
    cameraController: { camera },
    timelineController: {
      recordEdit: vi.fn((_label: string, fn: () => unknown) => fn()),
      addClipLane: vi.fn().mockReturnValue("lane-1"),
      getPlayhead: vi.fn().mockReturnValue(0),
      seekTo: vi.fn(),
    },
    snapShotOfCurrentFrame: vi.fn().mockReturnValue({ base64Snapshot: "AAAA" }),
  };
  return { editor, obj, camera };
}

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

describe("installStageAutomation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setSearch("");
    delete window.__h0xStage;
  });

  it("is not installed outside dev without ?automation=1", () => {
    vi.stubEnv("DEV", false);
    installStageAutomation(mockEditor().editor as unknown as Editor);
    expect(window.__h0xStage).toBeUndefined();
  });

  it("is installed with ?automation=1 and removed on teardown", () => {
    vi.stubEnv("DEV", false);
    setSearch("?automation=1");
    const uninstall = installStageAutomation(
      mockEditor().editor as unknown as Editor,
    );
    expect(window.__h0xStage).toBeDefined();
    expect(Object.keys(window.__h0xStage!).sort()).toEqual(
      ["addCharacter", "addClip", "capture", "seek", "setCamera"],
    );
    uninstall();
    expect(window.__h0xStage).toBeUndefined();
  });

  describe("methods", () => {
    it("forward to the editor and timeline APIs", async () => {
      vi.stubEnv("DEV", true);
      const { editor, obj, camera } = mockEditor();
      installStageAutomation(editor as unknown as Editor);
      const stage = window.__h0xStage!;

      const id = await stage.addCharacter("m_char", {
        x: 1, y: 2, z: 3, rotY: 0.5, scale: 2,
      });
      expect(id).toBe(obj.uuid);
      expect(editor.activeScene.loadObject).toHaveBeenCalledWith(
        "m_char", "m_char", true, new THREE.Vector3(1, 2, 3),
      );
      expect(obj.rotation.y).toBe(0.5);
      expect(obj.scale.toArray()).toEqual([2, 2, 2]);

      expect(stage.addClip(id, "m_clip", 1.5)).toBe("lane-1");
      expect(editor.timelineController.addClipLane).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ sourceMediaId: "m_clip", startTime: 1.5 }),
      );

      const lookAt = vi.spyOn(camera, "lookAt");
      stage.setCamera({ x: 4, y: 5, z: 6 }, { lookAt: { x: 0, y: 1, z: 0 } });
      expect(camera.position.toArray()).toEqual([4, 5, 6]);
      expect(lookAt).toHaveBeenCalledWith(0, 1, 0);

      stage.seek(2.25);
      expect(editor.timelineController.seekTo).toHaveBeenCalledWith(2.25);

      const png = stage.capture();
      expect(editor.snapShotOfCurrentFrame).toHaveBeenCalledWith(false);
      expect(png.startsWith("data:image/png")).toBe(true);
    });
  });
});
