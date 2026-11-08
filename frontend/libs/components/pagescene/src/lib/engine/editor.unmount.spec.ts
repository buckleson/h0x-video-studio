// R4-M3: leaving the 3D stage must release the renderer, GPU resources,
// loops and listeners. A real Editor needs WebGL, so unmountEngine runs on a
// stub that carries just the members it touches; the PointerLockControls and
// CharacterAnimationManager cases use the real classes.
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import Editor from "./editor";
import { CharacterAnimationManager } from "./animation/CharacterAnimationManager";

// Same jsdom-hostile modules scene.spec.ts mocks.
vi.mock("@sparkjsdev/spark", async () => {
  const { Object3D } = await import("three");
  return {
    SplatMesh: class extends Object3D {},
    SparkRenderer: class extends Object3D {},
  };
});
vi.mock("three/examples/jsm/Addons.js", async () => {
  const { Mesh } = await import("three");
  return { MMDAnimationHelper: class {}, Water: class extends Mesh {} };
});
vi.mock("./ammoLoader", () => ({ ensureAmmoLoaded: vi.fn() }));

type Calls = string[];

function fakeRenderer(calls: Calls, name: string, attached: boolean) {
  const canvas = document.createElement("canvas");
  if (attached) document.body.appendChild(canvas);
  return {
    domElement: canvas,
    dispose: vi.fn(() => calls.push(`${name}.dispose`)),
    forceContextLoss: vi.fn(() => calls.push(`${name}.forceContextLoss`)),
  };
}

function stubEditor(
  opts: {
    attached?: boolean;
    lockControls?: unknown;
    gizmoControl?: unknown;
    renderer?: unknown;
    rawRenderer?: unknown;
    characterAnimationManager?: unknown;
  } = {},
) {
  const calls: Calls = [];
  const rec = (n: string) => vi.fn(() => calls.push(n));
  const attached = opts.attached ?? false;
  const stub: Record<string, any> = {
    save_manager: { cancelCurrentLoad: rec("cancelCurrentLoad") },
    bus: { emit: vi.fn((e: unknown) => calls.push(`emit:${e?.constructor?.name}`)) },
    shouldRender: true,
    renderEventToken: 42,
    viewport: { dispose: rec("viewport.dispose") },
    entranceAnimator: { clear: rec("entranceAnimator.clear") },
    characterAnimationManager:
      "characterAnimationManager" in opts
        ? opts.characterAnimationManager
        : { clear: rec("characterAnimationManager.clear") },
    gizmo: {
      control:
        "gizmoControl" in opts
          ? opts.gizmoControl
          : { dispose: rec("gizmo.dispose") },
    },
    cameraController: {
      lockControls:
        "lockControls" in opts
          ? opts.lockControls
          : { dispose: rec("lockControls.dispose") },
    },
    activeScene: { dispose: rec("scene.dispose") },
    renderer:
      "renderer" in opts ? opts.renderer : fakeRenderer(calls, "renderer", attached),
    rawRenderer:
      "rawRenderer" in opts
        ? opts.rawRenderer
        : fakeRenderer(calls, "rawRenderer", attached),
    postProcessing: { dispose: rec("postProcessing.dispose") },
    isMounted: true,
    gridSubscription: rec("unsub.grid"),
    cameraViewSubscription: rec("unsub.cameraView"),
    skeletonSyncSubscription: rec("unsub.skeletonSync"),
    poseModeSubscription: rec("unsub.poseMode"),
    skeletonHelpers: { clear: rec("skeletonHelpers.clear") },
    storeBridge: { dispose: rec("storeBridge.dispose") },
  };
  // Real loop-stop logic, so the rAF cancel is exercised, not stubbed.
  stub.stopRenderLoop = function (this: unknown) {
    calls.push("stopRenderLoop");
    return (Editor.prototype as any).stopRenderLoop.call(this);
  };
  return { stub, calls };
}

const unmount = (stub: unknown) =>
  (Editor.prototype as any).unmountEngine.call(stub);

describe("Editor.unmountEngine teardown", () => {
  let cancelSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    cancelSpy = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("stops AnimationMixers and disposes PointerLockControls", () => {
    const { stub, calls } = stubEditor();
    unmount(stub);
    expect(calls).toContain("characterAnimationManager.clear");
    expect(calls).toContain("lockControls.dispose");
  });

  it("stops the render loop and cancels the pending frame", () => {
    const { stub } = stubEditor();
    unmount(stub);
    expect(stub.shouldRender).toBe(false);
    expect(cancelSpy).toHaveBeenCalledWith(42);
    expect(stub.renderEventToken).toBe(-1);
  });

  it("disposes scene, renderers, post-processing, gizmo and viewport", () => {
    const { stub, calls } = stubEditor();
    unmount(stub);
    for (const c of [
      "viewport.dispose",
      "entranceAnimator.clear",
      "gizmo.dispose",
      "scene.dispose",
      "renderer.dispose",
      "rawRenderer.dispose",
      "postProcessing.dispose",
      "skeletonHelpers.clear",
      "storeBridge.dispose",
    ]) {
      expect(calls, c).toContain(c);
    }
    expect(stub.isMounted).toBe(false);
  });

  it("releases every store subscription exactly once", () => {
    const { stub } = stubEditor();
    unmount(stub);
    for (const k of [
      "gridSubscription",
      "cameraViewSubscription",
      "skeletonSyncSubscription",
      "poseModeSubscription",
    ]) {
      expect(stub[k], k).toHaveBeenCalledTimes(1);
    }
  });

  it("cancels in-flight loads and stops the loop before freeing GPU resources", () => {
    const { stub, calls } = stubEditor();
    unmount(stub);
    const at = (n: string) => calls.indexOf(n);
    expect(at("cancelCurrentLoad")).toBe(0);
    expect(at("stopRenderLoop")).toBeLessThan(at("scene.dispose"));
    expect(at("stopRenderLoop")).toBeLessThan(at("renderer.dispose"));
    expect(at("characterAnimationManager.clear")).toBeLessThan(at("scene.dispose"));
    expect(at("renderer.dispose")).toBeLessThan(at("renderer.forceContextLoss"));
  });

  it("forces context loss when leaving the page (canvas detached)", () => {
    const { stub } = stubEditor({ attached: false });
    unmount(stub);
    expect(stub.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(stub.rawRenderer.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it("keeps the context on a scene change (canvas still mounted)", () => {
    const { stub } = stubEditor({ attached: true });
    unmount(stub);
    expect(stub.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(stub.renderer.forceContextLoss).not.toHaveBeenCalled();
    expect(stub.rawRenderer.forceContextLoss).not.toHaveBeenCalled();
  });

  it("tolerates a stage that never created lock controls, gizmo or renderers", () => {
    const { stub, calls } = stubEditor({
      lockControls: undefined,
      gizmoControl: undefined,
      renderer: undefined,
      rawRenderer: undefined,
    });
    expect(() => unmount(stub)).not.toThrow();
    expect(calls).toContain("scene.dispose");
    expect(calls).toContain("characterAnimationManager.clear");
    expect(stub.isMounted).toBe(false);
  });

  it("does not cancel a frame when no frame is pending", () => {
    const { stub } = stubEditor();
    stub.renderEventToken = 0;
    stub.shouldRender = false;
    unmount(stub);
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it("emits scene-unloaded and engine-uninitialized events", () => {
    const { stub, calls } = stubEditor();
    unmount(stub);
    expect(calls).toContain("emit:SceneLoadedEvent");
    expect(calls).toContain("emit:EngineInitializedEvent");
  });

  it("removes the real PointerLockControls document listeners", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const camera = new THREE.PerspectiveCamera();
    const lock = new PointerLockControls(camera, canvas);
    const removed = vi.spyOn(document, "removeEventListener");

    const { stub } = stubEditor({ lockControls: lock });
    unmount(stub);

    const types = removed.mock.calls.map((c) => c[0]);
    expect(types).toEqual(
      expect.arrayContaining(["mousemove", "pointerlockchange", "pointerlockerror"]),
    );
  });

  it("stops every AnimationMixer through the real CharacterAnimationManager", () => {
    const mgr = new CharacterAnimationManager({} as never);
    const mixerA = new THREE.AnimationMixer(new THREE.Object3D());
    const mixerB = new THREE.AnimationMixer(new THREE.Object3D());
    const stopA = vi.spyOn(mixerA, "stopAllAction");
    const stopB = vi.spyOn(mixerB, "stopAllAction");
    const mixers = (mgr as any).mixers as Map<string, THREE.AnimationMixer>;
    mixers.set("a", mixerA);
    mixers.set("b", mixerB);

    const { stub } = stubEditor({ characterAnimationManager: mgr });
    unmount(stub);

    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
    expect(mixers.size).toBe(0);
  });

  it("clears an empty CharacterAnimationManager without error", () => {
    const mgr = new CharacterAnimationManager({} as never);
    const { stub } = stubEditor({ characterAnimationManager: mgr });
    expect(() => unmount(stub)).not.toThrow();
  });
});
