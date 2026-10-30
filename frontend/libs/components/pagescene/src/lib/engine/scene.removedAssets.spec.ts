// A1: the gray/night skyboxes and the Lumine idle pose were removed. Scene
// must fall back to a plain colour and load MMD characters without a pose.
import * as THREE from "three";
import Scene from "./scene";

const { mmdLoad, mmdLoadWithAnimation } = vi.hoisted(() => ({
  mmdLoad: vi.fn(),
  mmdLoadWithAnimation: vi.fn(),
}));

vi.mock("three/addons/loaders/MMDLoader.js", () => ({
  MMDLoader: class {
    load = mmdLoad;
    loadWithAnimation = mmdLoadWithAnimation;
  },
}));

// Same stand-ins as scene.spec.ts: jsdom cannot run Spark or the Addons barrel.
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

const PLAIN = "#282828";

afterEach(() => {
  vi.restoreAllMocks();
  mmdLoad.mockReset();
  mmdLoadWithAnimation.mockReset();
  document.documentElement.classList.remove("theme-light");
});

describe("Scene skybox after A1", () => {
  it("defaults to the plain-colour skybox", () => {
    const scene = makeScene();
    expect(scene.skybox).toBe("m_1");

    scene._create_skybox();

    expectPlainBackground(scene);
  });

  it.each(["m_0", "m_3", "SKY::m_0", "", "unknown"])(
    "falls back to a plain colour for removed or unknown id %j without loading textures",
    (id) => {
      const cubeLoad = vi.spyOn(THREE.CubeTextureLoader.prototype, "load");
      const texLoad = vi.spyOn(THREE.TextureLoader.prototype, "load");
      const scene = makeScene();

      scene.updateSkybox(id);

      expectPlainBackground(scene);
      expect(cubeLoad).not.toHaveBeenCalled();
      expect(texLoad).not.toHaveBeenCalled();
    },
  );

  it("loads the Day skybox only from the remaining day folder", () => {
    const cubeLoad = vi
      .spyOn(THREE.CubeTextureLoader.prototype, "load")
      .mockReturnValue(new THREE.CubeTexture());
    const scene = makeScene();

    scene.updateSkybox("Default");

    expect(cubeLoad).toHaveBeenCalledTimes(1);
    const urls = cubeLoad.mock.calls[0][0] as string[];
    expect(urls).toHaveLength(6);
    for (const url of urls) {
      expect(url).toMatch(/^\/resources\/skybox\/day\//);
      expect(url).not.toMatch(/gray|night/i);
    }
  });

  it("keeps the black skybox as a plain colour", () => {
    const scene = makeScene();

    scene.updateSkybox("m_2");

    expect((scene.scene.background as THREE.Color).getHexString()).toBe("000000");
  });
});

describe("Scene MMD load after A1", () => {
  it("loads the character without any pose or animation file", async () => {
    const scene = makeScene();
    const mesh = new THREE.SkinnedMesh();
    const add = vi.fn();
    scene.helper = { add } as never;
    vi.spyOn(scene, "delay_mmd").mockResolvedValue();
    mmdLoad.mockImplementation((_url, onLoad) => onLoad(mesh));

    const result = await loadMmd(scene, "C:\\models\\char.pmx");

    expect(result).toBe(mesh);
    expect(mmdLoadWithAnimation).not.toHaveBeenCalled();
    expect(mmdLoad).toHaveBeenCalledTimes(1);
    expect(mmdLoad.mock.calls[0][0]).toBe("C:\\models\\char.pmx");
    expect(JSON.stringify(mmdLoad.mock.calls[0].filter((a) => typeof a === "string"))).not.toMatch(
      /\.vmd|Lumine|resources\/pose/i,
    );
    expect(add).toHaveBeenCalledWith(mesh, { physics: false });
  });

  it("rejects when the model fails to load (offline / missing file)", async () => {
    const scene = makeScene();
    scene.helper = { add: vi.fn() } as never;
    vi.spyOn(scene, "delay_mmd").mockResolvedValue();
    const err = new Error("network down");
    mmdLoad.mockImplementation((_url, _onLoad, _progress, onError) => onError(err));

    await expect(loadMmd(scene, "/missing.pmx")).rejects.toBe(err);
    expect(mmdLoadWithAnimation).not.toHaveBeenCalled();
  });
});

function makeScene(): Scene {
  return new Scene("test", "::CAM::", () => undefined, 1, {
    getCameras: () => [],
    getSelectedCameraId: () => "main",
    fetchAsset: () => Promise.reject(new Error("no network in tests")),
    getMediaUrlByToken: () => Promise.reject(new Error("no network in tests")),
  });
}

function loadMmd(scene: Scene, url: string): Promise<THREE.SkinnedMesh> {
  return (
    scene as unknown as {
      load_mmd_wrapped: (u: string, p: () => void) => Promise<THREE.SkinnedMesh>;
    }
  ).load_mmd_wrapped(url, () => undefined);
}

function expectPlainBackground(scene: Scene) {
  expect(scene.scene.background).toBeInstanceOf(THREE.Color);
  expect((scene.scene.background as THREE.Color).getHexString()).toBe(
    PLAIN.slice(1),
  );
}
