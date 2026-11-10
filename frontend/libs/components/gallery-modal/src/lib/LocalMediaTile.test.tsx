import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useGalleryViewStore } from "@storyteller/ui-generation-list";

import { LocalMediaTile } from "./LocalMediaTile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(),
}));

const VIDEO = { path: "C:\\clips\\one.mp4", kind: "video", size_bytes: 10, created_at: "" } as any;
const IMAGE = { path: "D:\\media\\still.webp", kind: "image", size_bytes: 5, created_at: "" } as any;
const THUMB = "C:\\temp\\thumbs\\still-384.jpg";
const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;
const video = (path: string) => ({ ...VIDEO, path });

type FakeObserver = { cb: IntersectionObserverCallback };
let observers: FakeObserver[] = [];
const observe = vi.fn();
const disconnect = vi.fn();
const playing = new Set<HTMLMediaElement>();

const fire = (o: FakeObserver, isIntersecting: boolean) =>
  act(() => o.cb([{ isIntersecting } as IntersectionObserverEntry], {} as any));
const intersect = (isIntersecting: boolean) => observers.forEach((o) => fire(o, isIntersecting));

describe("LocalMediaTile", () => {
  beforeEach(() => {
    observers = [];
    playing.clear();
    observe.mockReset();
    disconnect.mockReset();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue({ thumb_path: THUMB });
    useGalleryViewStore.setState({ autoplayVideos: true });
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((cb: IntersectionObserverCallback) => {
        observers.push({ cb });
        return { observe, disconnect, unobserve: vi.fn() };
      }),
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      playing.add(this);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
      playing.delete(this);
    });
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    expect(invoke).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledTimes(2);
    expect(vi.mocked(IntersectionObserver).mock.calls[0][1]).toMatchObject({
      rootMargin: "400px 0px",
    });
  });

  it("ignores non-intersecting entries", () => {
    const { container } = render(<LocalMediaTile file={IMAGE} scrollRoot={null} />);
    intersect(false);
    expect(container.querySelector("img")!.getAttribute("src")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("shows the cached thumbnail for a visible image, not the original", async () => {
    const { container } = render(<LocalMediaTile file={IMAGE} scrollRoot={null} />);
    intersect(true);

    const img = container.querySelector("img")!;
    await waitFor(() => expect(img.getAttribute("src")).toBe(converted(THUMB)));
    expect(invoke).toHaveBeenCalledWith("local_media_thumbnail_command", { path: IMAGE.path });
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(disconnect).toHaveBeenCalled();
  });

  it("falls back to the original image when the thumbnail command fails", async () => {
    vi.mocked(invoke).mockRejectedValue("thumbnail failed");
    const { container } = render(<LocalMediaTile file={IMAGE} scrollRoot={null} />);
    intersect(true);

    await waitFor(() =>
      expect(container.querySelector("img")!.getAttribute("src")).toBe(converted(IMAGE.path)),
    );
  });

  it("loads a visible video and frees its source when it leaves view", () => {
    const { container } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    const el = container.querySelector("video")!;

    intersect(true);
    expect(el.getAttribute("src")).toBe(converted(VIDEO.path));
    expect(el.getAttribute("preload")).toBe("metadata");
    expect(el.hasAttribute("controls")).toBe(false); // POL-1: no native controls
    expect(playing.has(el)).toBe(true);

    intersect(false);
    expect(el.getAttribute("src")).toBeNull();
    expect(el.getAttribute("preload")).toBe("none");
    expect(playing.has(el)).toBe(false);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();

    intersect(true);
    expect(el.getAttribute("src")).toBe(converted(VIDEO.path));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("plays at most 4 video previews at once and hands a slot on when one leaves", () => {
    const { container } = render(
      <>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <LocalMediaTile key={n} file={video(`C:\\clips\\${n}.mp4`)} scrollRoot={null} />
        ))}
      </>,
    );
    const videos = Array.from(container.querySelectorAll("video"));

    intersect(true);
    expect(playing.size).toBe(4);
    expect(videos.slice(0, 4).every((v) => playing.has(v))).toBe(true);

    fire(observers[0], false);
    expect(playing.size).toBe(4);
    expect(playing.has(videos[0])).toBe(false);
    expect(playing.has(videos[4])).toBe(true);
  });

  it("does not autoplay with previews off and plays on hover only", () => {
    useGalleryViewStore.setState({ autoplayVideos: false });
    const { container } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    const el = container.querySelector("video")!;

    intersect(true);
    expect(playing.size).toBe(0);

    fireEvent.mouseEnter(el);
    expect(playing.has(el)).toBe(true);
    fireEvent.mouseLeave(el);
    expect(playing.has(el)).toBe(false);
  });

  it("stops previews but keeps the source when previews are switched off", () => {
    const { container } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    intersect(true);
    expect(playing.size).toBe(1);

    act(() => useGalleryViewStore.setState({ autoplayVideos: false }));
    expect(playing.size).toBe(0);
    expect(container.querySelector("video")!.getAttribute("src")).toBe(converted(VIDEO.path));
  });

  it("uses the scroll container as the observer root", () => {
    const root = document.createElement("div");
    render(<LocalMediaTile file={IMAGE} scrollRoot={root} />);
    expect(vi.mocked(IntersectionObserver).mock.calls[0][1]).toMatchObject({ root });
  });
});
