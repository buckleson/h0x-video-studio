// Dev/test-only scripting hook for driving the stage from Playwright or the
// devtools console. Installed only in dev builds or with ?automation=1.
import * as THREE from "three";
import type Editor from "../engine/editor";
import { addClipToCharacter, seekTimeline } from "../actions/timeline";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface StageAutomation {
  addCharacter(
    mediaId: string,
    transform: Vec3 & { rotY: number; scale: number },
  ): Promise<string>;
  addClip(id: string, clipMediaId: string, startSec: number): string | null;
  setCamera(position: Vec3, target: { lookAt: Vec3 }): void;
  seek(sec: number): void;
  capture(): string;
}

declare global {
  interface Window {
    __h0xStage?: StageAutomation;
  }
}

export function installStageAutomation(editor: Editor): () => void {
  const enabled =
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get("automation") === "1";
  if (!enabled) return () => undefined;

  const stage: StageAutomation = {
    async addCharacter(mediaId, { x, y, z, rotY, scale }) {
      const obj = await editor.activeScene.loadObject(
        mediaId,
        mediaId,
        true,
        new THREE.Vector3(x, y, z),
      );
      obj.rotation.y = rotY;
      obj.scale.setScalar(scale);
      obj.userData["isCharacter"] = true;
      return obj.uuid;
    },
    addClip(id, clipMediaId, startSec) {
      return addClipToCharacter(editor, id, { media_id: clipMediaId }, startSec);
    },
    setCamera({ x, y, z }, { lookAt }) {
      const camera = editor.cameraController.camera;
      if (!camera) throw new Error("Stage camera not ready");
      camera.position.set(x, y, z);
      camera.lookAt(lookAt.x, lookAt.y, lookAt.z);
    },
    seek(sec) {
      seekTimeline(editor, sec);
    },
    capture() {
      const snap = editor.snapShotOfCurrentFrame(false);
      if (!snap) throw new Error("Stage renderer not ready");
      return `data:image/png;base64,${snap.base64Snapshot}`;
    },
  };

  window.__h0xStage = stage;
  return () => {
    if (window.__h0xStage === stage) delete window.__h0xStage;
  };
}
