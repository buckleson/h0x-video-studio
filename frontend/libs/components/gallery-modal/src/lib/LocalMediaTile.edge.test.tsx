// R4-4 / R4-M2 edge cases for LocalMediaTile (lazy My Library tiles,
// cached image thumbnails, capped video previews).
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useGalleryViewStore } from "@storyteller/ui-generation-list";

import { LocalMediaTile } from "./LocalMediaTile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
  invoke: vi.fn(),
}));

// --- constants ---

const TILE_CLASS = "aspect-square w-full bg-black/30 object-cover";
const COMMAND = "local_media_thumbnail_command";
const WIN_VIDEO = "C:\\Users\\Jane Doe\\Vidéos\\h0x\\clip one (1).mp4";
const UNC_IMAGE = "\\\\nas\\share\\still #2.png";
const THUMB = "C:\\Users\\Jane Doe\\AppData\\Local\\h0x\\temp\\thumbs\\0123456789abcdef.jpg";
const BRAND_LEAKS = /artcraft|getartcraft|storyteller\.ai|fakeyou|ltx|lightricks/i;

const file = (path: string, kind: string) =>
  ({ path, kind, size_bytes: 1, created_at: "" }) as any;

// --- helpers ---

type FakeObserver = {
  cb: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  targets: Element[];
  disconnect: ReturnType<typeof vi.fn>;
};
let observers: FakeObserver[] = [];
const playing = new Set<HTMLMediaElement>();

const installObserver = () =>
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((cb: IntersectionObserverCallback, options?: IntersectionObserverInit) => {
      const o: FakeObserver = { cb, options, targets: [], disconnect: vi.fn() };
      observers.push(o);
      return {
        observe: (el: Element) => o.targets.push(el),
        disconnect: o.disconnect,
        unobserve: vi.fn(),
      };
    }),
  );

const fire = (o: FakeObserver, isIntersecting: boolean) =>
  act(() => o.cb([{ isIntersecting, target: o.targets[0] } as any], {} as any));

// Latest observer watching an element (a tile re-creates its observer on re-render).
const observerOf = (el: Element) => [...observers].reverse().find((o) => o.targets[0] === el)!;

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

const videos = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <LocalMediaTile key={i} file={file(`C:\\clips\\${i}.mp4`, "video")} scrollRoot={null} />
  ));

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("LocalMediaTile edge cases", () => {
  beforeEach(() => {
    observers = [];
    playing.clear();
    vi.mocked(convertFileSrc).mockClear();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue({ thumb_path: THUMB });
    useGalleryViewStore.setState({ autoplayVideos: true });
    installObserver();
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
    // Unmount first so the module-level preview queue empties while the media spies are live.
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // --- lazy loading (R4-4) ---

  it("does not call convertFileSrc or the thumbnail command before the tile is visible", () => {
    render(
      <>
        <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />
        <LocalMediaTile file={file(UNC_IMAGE, "image")} scrollRoot={null} />
      </>,
    );
    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("observes the rendered media element itself", () => {
    const { container } = render(
      <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />,
    );
    expect(observers).toHaveLength(1);
    expect(observers[0].targets).toEqual([container.querySelector("video")]);
  });

  it("passes Windows and UNC paths through unchanged once visible", async () => {
    const { container } = render(
      <>
        <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />
        <LocalMediaTile file={file(UNC_IMAGE, "image")} scrollRoot={null} />
      </>,
    );
    observers.forEach((o) => fire(o, true));

    expect(container.querySelector("video")!.getAttribute("src")).toBe(converted(WIN_VIDEO));
    expect(invoke).toHaveBeenCalledWith(COMMAND, { path: UNC_IMAGE });
    await waitFor(() =>
      expect(container.querySelector("img")!.getAttribute("src")).toBe(converted(THUMB)),
    );
  });

  it("only loads the tile whose observer fired", async () => {
    const { container } = render(
      <>
        <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />
        <LocalMediaTile file={file("C:\\b.png", "image")} scrollRoot={null} />
      </>,
    );
    fire(observers[1], true);

    const [a, b] = Array.from(container.querySelectorAll("img"));
    await waitFor(() => expect(b.getAttribute("src")).toBe(converted(THUMB)));
    expect(a.getAttribute("src")).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(COMMAND, { path: "C:\\b.png" });
  });

  it("stops observing an image after the first view and never re-creates an observer", async () => {
    const f = file("C:\\a.png", "image");
    const { rerender } = render(<LocalMediaTile file={f} scrollRoot={null} />);
    fire(observers[0], true);
    expect(observers[0].disconnect).toHaveBeenCalled();

    rerender(<LocalMediaTile file={f} scrollRoot={document.createElement("div")} />);
    expect(observers).toHaveLength(1);
    await waitFor(() => expect(convertFileSrc).toHaveBeenCalledWith(THUMB));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("disconnects the observer when unmounted before it becomes visible", () => {
    const { unmount } = render(
      <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />,
    );
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("re-observes with the new root when the scroll container changes before view", () => {
    const f = file("C:\\a.png", "image");
    const first = document.createElement("div");
    const second = document.createElement("div");
    const { rerender } = render(<LocalMediaTile file={f} scrollRoot={first} />);
    rerender(<LocalMediaTile file={f} scrollRoot={second} />);

    expect(observers).toHaveLength(2);
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(observers[1].options).toMatchObject({ root: second, rootMargin: "400px 0px" });
  });

  it("loads immediately without an observer when IntersectionObserver is missing", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(
      <>
        <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />
        <LocalMediaTile file={file(UNC_IMAGE, "image")} scrollRoot={null} />
      </>,
    );
    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe(converted(WIN_VIDEO));
    expect(video.getAttribute("preload")).toBe("metadata");
    await waitFor(() =>
      expect(container.querySelector("img")!.getAttribute("src")).toBe(converted(THUMB)),
    );
  });

  it("keeps the original tile classes and media attributes before and after view", async () => {
    const { container } = render(
      <>
        <LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />
        <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />
      </>,
    );
    const check = () => {
      const video = container.querySelector("video")!;
      const img = container.querySelector("img")!;
      expect(video.className).toBe(TILE_CLASS);
      expect(img.className).toBe(TILE_CLASS);
      expect(video.hasAttribute("controls")).toBe(true);
      expect(video.muted).toBe(true);
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("decoding")).toBe("async");
    };
    check();
    observers.forEach((o) => fire(o, true));
    await waitFor(() => expect(container.querySelector("img")!.getAttribute("src")).toBeTruthy());
    check();
  });

  it("renders non-video kinds as an image, as before", () => {
    const { container } = render(
      <LocalMediaTile file={file("C:\\a.bin", "other")} scrollRoot={null} />,
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("adds no user-visible text or brand names", async () => {
    const { container } = render(
      <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />,
    );
    fire(observers[0], true);
    await waitFor(() => expect(container.querySelector("img")!.getAttribute("src")).toBeTruthy());
    expect(container.textContent).toBe("");
    expect(container.innerHTML.replace(/src="[^"]*"/g, "")).not.toMatch(BRAND_LEAKS);
  });

  // --- thumbnails (R4-M2) ---

  it("never loads the full-size original into a grid tile when the thumbnail succeeds", async () => {
    const { container } = render(
      <LocalMediaTile file={file(UNC_IMAGE, "image")} scrollRoot={null} />,
    );
    fire(observers[0], true);
    await waitFor(() =>
      expect(container.querySelector("img")!.getAttribute("src")).toBe(converted(THUMB)),
    );
    expect(convertFileSrc).not.toHaveBeenCalledWith(UNC_IMAGE);
  });

  it("falls back to the original when the command rejects with an Error object", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("decoder missing"));
    const { container } = render(
      <LocalMediaTile file={file(UNC_IMAGE, "image")} scrollRoot={null} />,
    );
    fire(observers[0], true);
    await waitFor(() =>
      expect(container.querySelector("img")!.getAttribute("src")).toBe(converted(UNC_IMAGE)),
    );
  });

  it("ignores a thumbnail that arrives after the tile was unmounted", async () => {
    const pending = deferred<{ thumb_path: string }>();
    vi.mocked(invoke).mockReturnValue(pending.promise as any);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = render(
      <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />,
    );
    fire(observers[0], true);
    unmount();

    await act(async () => pending.resolve({ thumb_path: THUMB }));
    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it("asks for a new thumbnail when a visible tile is reused for another file", async () => {
    const { container, rerender } = render(
      <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />,
    );
    fire(observers[0], true);
    const img = container.querySelector("img")!;
    await waitFor(() => expect(img.getAttribute("src")).toBe(converted(THUMB)));

    vi.mocked(invoke).mockResolvedValue({ thumb_path: "C:\\thumbs\\b.jpg" });
    rerender(<LocalMediaTile file={file("C:\\b.png", "image")} scrollRoot={null} />);
    await waitFor(() => expect(img.getAttribute("src")).toBe(converted("C:\\thumbs\\b.jpg")));
    expect(invoke).toHaveBeenLastCalledWith(COMMAND, { path: "C:\\b.png" });
  });

  it("never requests a thumbnail for a video tile", () => {
    render(<LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />);
    fire(observers[0], true);
    fire(observers[0], false);
    fire(observers[0], true);
    expect(invoke).not.toHaveBeenCalled();
  });

  // --- video previews (R4-M2) ---

  it("keeps a video tile observed after it has been seen, so it can release its source", () => {
    render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    fire(observers[0], true);
    fire(observers[0], false);
    expect(observers[0].disconnect).not.toHaveBeenCalled();
  });

  it("plays only the visible videos, never off-screen ones", () => {
    const { container } = render(<>{videos(6)}</>);
    const els = Array.from(container.querySelectorAll("video"));
    fire(observerOf(els[1]), true);
    fire(observerOf(els[3]), true);

    expect(playing.size).toBe(2);
    expect(playing.has(els[1]) && playing.has(els[3])).toBe(true);
    [0, 2, 4, 5].forEach((i) => expect(els[i].getAttribute("src")).toBeNull());
  });

  it("hands a slot on when a playing tile is unmounted and frees its decoder", () => {
    const { container, rerender } = render(<>{videos(5)}</>);
    const els = Array.from(container.querySelectorAll("video"));
    els.forEach((el) => fire(observerOf(el), true));
    expect(playing.has(els[4])).toBe(false);

    const loadsBefore = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
    rerender(<>{videos(5).slice(1)}</>);
    expect(playing.has(els[0])).toBe(false);
    expect(playing.has(els[4])).toBe(true);
    expect(playing.size).toBe(4);
    expect(vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it("sends a tile that comes back into view to the back of the queue", () => {
    const { container } = render(<>{videos(5)}</>);
    const els = Array.from(container.querySelectorAll("video"));
    els.forEach((el) => fire(observerOf(el), true));

    fire(observerOf(els[0]), false);
    expect(playing.has(els[4])).toBe(true);

    fire(observerOf(els[0]), true);
    expect(els[0].getAttribute("src")).toBe(converted("C:\\clips\\0.mp4"));
    expect(playing.has(els[0])).toBe(false);
    expect(playing.size).toBe(4);
  });

  it("starts at most 4 previews when the setting is turned on with many tiles visible", () => {
    useGalleryViewStore.setState({ autoplayVideos: false });
    const { container } = render(<>{videos(8)}</>);
    const els = Array.from(container.querySelectorAll("video"));
    els.forEach((el) => fire(observerOf(el), true));
    expect(playing.size).toBe(0);

    act(() => useGalleryViewStore.setState({ autoplayVideos: true }));
    expect(playing.size).toBe(4);
    expect(els.slice(0, 4).every((v) => playing.has(v))).toBe(true);
  });

  it("never exceeds 4 playing previews, or plays a sourceless tile, while scrolling", () => {
    const { container } = render(<>{videos(10)}</>);
    const els = Array.from(container.querySelectorAll("video"));
    const steps: Array<[number, boolean]> = [
      [0, true], [1, true], [2, true], [3, true], [4, true], [5, true],
      [1, false], [6, true], [0, false], [2, false], [1, true], [7, true], [8, true], [9, true],
    ];
    for (const [i, visible] of steps) {
      fire(observerOf(els[i]), visible);
      expect(playing.size).toBeLessThanOrEqual(4);
      els.forEach((el) => {
        if (!el.getAttribute("src")) expect(playing.has(el)).toBe(false);
      });
    }
    expect(playing.size).toBe(4);
  });

  it("does not throw when the WebView blocks or lacks play()", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() =>
      Promise.reject(new DOMException("blocked", "NotAllowedError")),
    );
    const { container } = render(<>{videos(2)}</>);
    expect(() => observers.forEach((o) => fire(o, true))).not.toThrow();

    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => undefined as any);
    act(() => useGalleryViewStore.setState({ autoplayVideos: false }));
    expect(() => fireEvent.mouseEnter(container.querySelector("video")!)).not.toThrow();
    await act(async () => undefined);
  });

  it("does not pause a playing preview on hover-out when previews are on", () => {
    const { container } = render(
      <LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />,
    );
    const el = container.querySelector("video")!;
    fire(observers[0], true);
    expect(playing.has(el)).toBe(true);

    fireEvent.mouseEnter(el);
    fireEvent.mouseLeave(el);
    expect(playing.has(el)).toBe(true);
  });

  // --- no behaviour change for interactions ---

  it("adds no drag or click behaviour, and clicking a tile does not load the original", async () => {
    const { container } = render(
      <>
        <LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />
        <LocalMediaTile file={file(UNC_IMAGE, "image")} scrollRoot={null} />
      </>,
    );
    observers.forEach((o) => fire(o, true));
    const img = container.querySelector("img")!;
    await waitFor(() => expect(img.getAttribute("src")).toBe(converted(THUMB)));

    fireEvent.click(img);
    fireEvent.contextMenu(img);
    expect(img.hasAttribute("draggable")).toBe(false);
    expect(container.querySelector("video")!.hasAttribute("draggable")).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(convertFileSrc).not.toHaveBeenCalledWith(UNC_IMAGE);
  });
});
