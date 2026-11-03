// R3-2: fetchAsset sends same-origin URLs (bundled Local:: resources) through
// window.fetch; every other URL keeps the FetchProxy -> LoadWithoutCors path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProxy: vi.fn(),
  loadWithoutCors: vi.fn(),
}));

// Only the network boundary matters; stub every heavy host import.
vi.mock("react", () => ({ useMemo: (factory: () => unknown) => factory() }));
vi.mock("@storyteller/tauri-utils", () => ({ FetchProxy: mocks.fetchProxy }));
vi.mock("@storyteller/tauri-api", () => ({
  GenerateImage: vi.fn(),
  LoadWithoutCors: mocks.loadWithoutCors,
}));
vi.mock("@storyteller/api", () => ({
  MediaFilesApi: class {},
  StorytellerApiHostStore: {
    getInstance: () => ({ getApiSchemeAndHost: () => "https://api.example" }),
  },
  UploadImageMedia: vi.fn(),
}));
vi.mock("@storyteller/ui-pagescene", () => ({ ToastTypes: {} }));
vi.mock("@storyteller/ui-upload-modal", () => ({
  UploadModal3D: () => null,
  UploadModalImage: () => null,
  UploadModalSplat: () => null,
}));
vi.mock("~/api/GetCdnOrigin", () => ({ GetCdnOrigin: () => "https://cdn.example" }));
vi.mock("~/api/BucketConfig", () => ({ BucketConfig: class {} }));
vi.mock("~/Classes/ApiManager", () => ({ MediaFilesApi: class {} }));
vi.mock("~/components/reusable/UploadModalMedia/uploadImage", () => ({ uploadImage: vi.fn() }));
vi.mock("~/components/reusable/UploadModalMedia/uploadPlane", () => ({
  uploadPlaneFromMediaToken: vi.fn(),
}));
vi.mock("~/pages/Stores/TabState", () => ({ useTabStore: { getState: vi.fn() } }));
vi.mock("~/signals/authentication/utilities", () => ({ setLogoutStates: vi.fn() }));
vi.mock("~/signals", () => ({
  addToast: vi.fn(),
  authentication: { userInfo: { value: undefined } },
  pageHeight: { value: 0 },
  pageWidth: { value: 0 },
  signalScene: vi.fn(),
}));
vi.mock("./sceneOutputAdapter", () => ({ sceneOutputAdapter: {} }));

import { useTauriPageSceneAdapter } from "./useTauriPageSceneAdapter";

const windowFetch = vi.fn();

beforeEach(() => {
  mocks.fetchProxy.mockReset();
  mocks.loadWithoutCors.mockReset();
  windowFetch.mockReset();
  vi.stubGlobal("fetch", windowFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fetchAsset = () => {
  const adapter = useTauriPageSceneAdapter();
  if (!adapter.fetchAsset) throw new Error("adapter has no fetchAsset");
  return adapter.fetchAsset;
};

describe("useTauriPageSceneAdapter.fetchAsset", () => {
  it("fetches an absolute same-origin URL with window.fetch", async () => {
    const url = `${location.origin}/resources/3d/x.glb`;
    const response = new Response("glb");
    windowFetch.mockResolvedValue(response);
    const controller = new AbortController();

    await expect(fetchAsset()(url, { signal: controller.signal })).resolves.toBe(response);

    expect(windowFetch).toHaveBeenCalledWith(url, { signal: controller.signal });
    expect(mocks.fetchProxy).not.toHaveBeenCalled();
    expect(mocks.loadWithoutCors).not.toHaveBeenCalled();
  });

  it("treats a root-relative path as same-origin", async () => {
    windowFetch.mockResolvedValue(new Response("glb"));

    await fetchAsset()("/resources/3d/x.glb");

    expect(windowFetch).toHaveBeenCalledWith("/resources/3d/x.glb", { signal: undefined });
    expect(mocks.fetchProxy).not.toHaveBeenCalled();
  });

  it("does not fall back to FetchProxy when a same-origin fetch fails", async () => {
    windowFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchAsset()(`${location.origin}/missing.glb`)).rejects.toThrow("Failed to fetch");

    expect(mocks.fetchProxy).not.toHaveBeenCalled();
    expect(mocks.loadWithoutCors).not.toHaveBeenCalled();
  });

  it("sends a cross-origin URL through FetchProxy", async () => {
    const response = new Response("cdn");
    mocks.fetchProxy.mockResolvedValue(response);

    await expect(fetchAsset()("https://cdn.example/m.glb")).resolves.toBe(response);

    expect(mocks.fetchProxy).toHaveBeenCalledWith("https://cdn.example/m.glb", { signal: undefined });
    expect(windowFetch).not.toHaveBeenCalled();
    expect(mocks.loadWithoutCors).not.toHaveBeenCalled();
  });

  it("falls back to LoadWithoutCors when FetchProxy throws", async () => {
    mocks.fetchProxy.mockRejectedValue(new Error("offline"));
    mocks.loadWithoutCors.mockResolvedValue(new TextEncoder().encode("abc").buffer);

    const response = await fetchAsset()("https://cdn.example/m.glb");

    expect(mocks.loadWithoutCors).toHaveBeenCalledWith("https://cdn.example/m.glb");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("abc");
    expect(windowFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["another port", () => `${location.protocol}//${location.hostname}:1/x.glb`],
    ["another scheme", () => `${location.protocol === "https:" ? "http:" : "https:"}//${location.host}/x.glb`],
    ["a protocol-relative host", () => "//cdn.example/x.glb"],
  ])("does not treat %s as same-origin", async (_label, makeUrl) => {
    mocks.fetchProxy.mockResolvedValue(new Response(""));

    await fetchAsset()(makeUrl());

    expect(mocks.fetchProxy).toHaveBeenCalledTimes(1);
    expect(windowFetch).not.toHaveBeenCalled();
  });

  it("rejects an already-aborted signal before any request", async () => {
    const controller = new AbortController();
    controller.abort();

    for (const url of [`${location.origin}/x.glb`, "https://cdn.example/x.glb"]) {
      await expect(fetchAsset()(url, { signal: controller.signal })).rejects.toMatchObject({
        name: "AbortError",
      });
    }

    expect(windowFetch).not.toHaveBeenCalled();
    expect(mocks.fetchProxy).not.toHaveBeenCalled();
    expect(mocks.loadWithoutCors).not.toHaveBeenCalled();
  });
});
