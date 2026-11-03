// R3-2: `Local::<path>` media ids are bundled app resources. Scene resolves
// them against the app origin without asking the host for a CDN URL.
import Scene, { type SceneDeps } from "./scene";

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

const LOCAL_ID = "Local::/resources/3d/x.glb";
const LOCAL_URL = `${location.origin}/resources/3d/x.glb`;

describe("Scene Local:: media ids", () => {
  it("resolves to the app origin without a host lookup", async () => {
    const { scene, deps } = makeScene();

    await expect(scene.getMediaURL(LOCAL_ID)).resolves.toBe(LOCAL_URL);

    expect(deps.getMediaUrlByToken).not.toHaveBeenCalled();
    expect(deps.fetchAsset).not.toHaveBeenCalled();
  });

  it("still resolves vendor tokens through the host", async () => {
    const { scene, deps } = makeScene();
    vi.mocked(deps.getMediaUrlByToken).mockResolvedValue(
      "https://cdn.example/m.glb",
    );

    await expect(scene.getMediaURL("m_abc123")).resolves.toBe(
      "https://cdn.example/m.glb",
    );

    expect(deps.getMediaUrlByToken).toHaveBeenCalledWith("m_abc123");
  });

  it("loadRawGlb fetches the same-origin URL", async () => {
    const { scene, deps } = makeScene();

    await expect(scene.loadRawGlb(LOCAL_ID)).resolves.toBeNull();

    expect(deps.fetchAsset).toHaveBeenCalledWith(LOCAL_URL, {
      signal: undefined,
    });
    expect(deps.getMediaUrlByToken).not.toHaveBeenCalled();
  });

  it("loadObject fetches the same-origin URL", async () => {
    const { scene, deps } = makeScene();
    scene.placeholder_manager = {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    } as never;

    await expect(scene.loadObject(LOCAL_ID, "x")).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(deps.fetchAsset).toHaveBeenCalledWith(LOCAL_URL, {
      signal: undefined,
    });
    expect(deps.getMediaUrlByToken).not.toHaveBeenCalled();
  });
});

describe("Scene Local:: media id edge cases", () => {
  it.each([
    ["a relative path", "Local::resources/3d/x.glb", `${location.origin}/resources/3d/x.glb`],
    ["a Windows-style path", "Local::\\resources\\3d\\x.glb", `${location.origin}/resources/3d/x.glb`],
    ["a path with spaces", "Local::/resources/3d/my model.glb", `${location.origin}/resources/3d/my%20model.glb`],
    ["an empty path", "Local::", `${location.origin}/`],
  ])("resolves %s against the app origin", async (_label, id, expected) => {
    const { scene, deps } = makeScene();

    await expect(scene.getMediaURL(id)).resolves.toBe(expected);

    expect(deps.getMediaUrlByToken).not.toHaveBeenCalled();
  });

  it("ignores a warm-cache entry for a Local:: id", async () => {
    const { scene, deps } = makeScene();
    deps.getMediaUrlsByTokens = vi.fn().mockResolvedValue({
      [LOCAL_ID]: "https://cdn.example/stale.glb",
    });

    await scene.warmMediaURLs([LOCAL_ID]);

    await expect(scene.getMediaURL(LOCAL_ID)).resolves.toBe(LOCAL_URL);
  });

  it("serves a vendor token from the warm cache without a per-token call", async () => {
    const { scene, deps } = makeScene();
    deps.getMediaUrlsByTokens = vi.fn().mockResolvedValue({
      m_abc123: "https://cdn.example/m.glb",
    });

    await scene.warmMediaURLs(["m_abc123"]);

    await expect(scene.getMediaURL("m_abc123")).resolves.toBe("https://cdn.example/m.glb");
    expect(deps.getMediaUrlByToken).not.toHaveBeenCalled();
  });

  it.each(["local::/resources/3d/x.glb", " Local::/resources/3d/x.glb", "m_Local::x"])(
    "treats %j as a vendor token (prefix is exact and case-sensitive)",
    async (id) => {
      const { scene, deps } = makeScene();
      vi.mocked(deps.getMediaUrlByToken).mockResolvedValue("https://cdn.example/v.glb");

      await expect(scene.getMediaURL(id)).resolves.toBe("https://cdn.example/v.glb");

      expect(deps.getMediaUrlByToken).toHaveBeenCalledWith(id);
    },
  );

  it("propagates a vendor lookup failure (offline)", async () => {
    const { scene } = makeScene();

    await expect(scene.getMediaURL("m_abc123")).rejects.toThrow("no network");
  });

  it("resolves a Local:: id even when the vendor lookup is offline", async () => {
    const { scene } = makeScene();

    await expect(scene.getMediaURL(LOCAL_ID)).resolves.toBe(LOCAL_URL);
  });

  it("forwards the abort signal to fetchAsset for a Local:: id", async () => {
    const { scene, deps } = makeScene();
    const controller = new AbortController();

    await expect(scene.loadRawGlb(LOCAL_ID, controller.signal)).resolves.toBeNull();

    expect(deps.fetchAsset).toHaveBeenCalledWith(LOCAL_URL, {
      signal: controller.signal,
    });
  });
});

function makeScene() {
  // AbortError keeps the loaders quiet (no console error, no toast).
  const deps: SceneDeps = {
    getCameras: () => [],
    getSelectedCameraId: () => "main",
    fetchAsset: vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError")),
    getMediaUrlByToken: vi.fn().mockRejectedValue(new Error("no network")),
  };
  return { scene: new Scene("test", "::CAM::", () => undefined, 1, deps), deps };
}
