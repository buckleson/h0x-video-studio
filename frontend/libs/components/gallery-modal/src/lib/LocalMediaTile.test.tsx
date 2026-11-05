import { act, render } from "@testing-library/react";

import { LocalMediaTile } from "./LocalMediaTile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

const VIDEO = { path: "C:\\clips\\one.mp4", kind: "video", size_bytes: 10, created_at: "" } as any;
const IMAGE = { path: "D:\\media\\still.webp", kind: "image", size_bytes: 5, created_at: "" } as any;
const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

let callbacks: IntersectionObserverCallback[] = [];
const observe = vi.fn();
const disconnect = vi.fn();

const intersect = (isIntersecting: boolean) =>
  act(() => {
    callbacks.forEach((cb) => cb([{ isIntersecting } as IntersectionObserverEntry], {} as any));
  });

describe("LocalMediaTile", () => {
  beforeEach(() => {
    callbacks = [];
    observe.mockReset();
    disconnect.mockReset();
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((cb: IntersectionObserverCallback) => {
        callbacks.push(cb);
        return { observe, disconnect, unobserve: vi.fn() };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders no media src before the tile nears the viewport", () => {
    const { container } = render(
      <>
        <LocalMediaTile file={VIDEO} scrollRoot={null} />
        <LocalMediaTile file={IMAGE} scrollRoot={null} />
      </>,
    );

    const video = container.querySelector("video")!;
    const img = container.querySelector("img")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.getAttribute("preload")).toBe("none");
    expect(img.getAttribute("src")).toBeNull();
    expect(observe).toHaveBeenCalledTimes(2);
    expect(vi.mocked(IntersectionObserver).mock.calls[0][1]).toMatchObject({
      rootMargin: "400px 0px",
    });
  });

  it("ignores non-intersecting entries", () => {
    const { container } = render(<LocalMediaTile file={IMAGE} scrollRoot={null} />);
    intersect(false);
    expect(container.querySelector("img")!.getAttribute("src")).toBeNull();
  });

  it("loads a visible image lazily and asynchronously", () => {
    const { container } = render(<LocalMediaTile file={IMAGE} scrollRoot={null} />);
    intersect(true);

    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(converted(IMAGE.path));
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(container.querySelector("video")).toBeNull();
  });

  it("loads a visible video with preload=metadata and keeps it after leaving view", () => {
    const { container } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    intersect(true);
    expect(disconnect).toHaveBeenCalled();
    intersect(false);

    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe(converted(VIDEO.path));
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(container.querySelector("img")).toBeNull();
  });

  it("uses the scroll container as the observer root", () => {
    const root = document.createElement("div");
    render(<LocalMediaTile file={IMAGE} scrollRoot={root} />);
    expect(vi.mocked(IntersectionObserver).mock.calls[0][1]).toMatchObject({ root });
  });
});
