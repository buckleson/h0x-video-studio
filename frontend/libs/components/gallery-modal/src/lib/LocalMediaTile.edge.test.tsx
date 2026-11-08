// R4-4 edge cases for LocalMediaTile (lazy My Library tiles).
import { act, render } from "@testing-library/react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { LocalMediaTile } from "./LocalMediaTile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
}));

// --- constants ---

const TILE_CLASS = "aspect-square w-full bg-black/30 object-cover";
const WIN_VIDEO = "C:\\Users\\Jane Doe\\Vidéos\\h0x\\clip one (1).mp4";
const UNC_IMAGE = "\\\\nas\\share\\still #2.png";
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

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

describe("LocalMediaTile edge cases", () => {
  beforeEach(() => {
    observers = [];
    vi.mocked(convertFileSrc).mockClear();
    installObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call convertFileSrc at all before the tile is visible", () => {
    render(<LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />);
    expect(convertFileSrc).not.toHaveBeenCalled();
  });

  it("observes the rendered media element itself", () => {
    const { container } = render(
      <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />,
    );
    expect(observers).toHaveLength(1);
    expect(observers[0].targets).toEqual([container.querySelector("video")]);
  });

  it("passes Windows and UNC paths to convertFileSrc unchanged once visible", () => {
    const { container } = render(
      <>
        <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />
        <LocalMediaTile file={file(UNC_IMAGE, "image")} scrollRoot={null} />
      </>,
    );
    observers.forEach((o) => fire(o, true));

    expect(vi.mocked(convertFileSrc).mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([WIN_VIDEO, UNC_IMAGE]),
    );
    expect(container.querySelector("video")!.getAttribute("src")).toBe(converted(WIN_VIDEO));
    expect(container.querySelector("img")!.getAttribute("src")).toBe(converted(UNC_IMAGE));
  });

  it("only loads the tile whose observer fired", () => {
    const { container } = render(
      <>
        <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />
        <LocalMediaTile file={file("C:\\b.png", "image")} scrollRoot={null} />
      </>,
    );
    fire(observers[1], true);

    const [a, b] = Array.from(container.querySelectorAll("img"));
    expect(a.getAttribute("src")).toBeNull();
    expect(b.getAttribute("src")).toBe(converted("C:\\b.png"));
  });

  it("stops observing after the first view and never re-creates an observer", () => {
    const f = file("C:\\a.mp4", "video");
    const { rerender } = render(<LocalMediaTile file={f} scrollRoot={null} />);
    fire(observers[0], true);
    expect(observers[0].disconnect).toHaveBeenCalled();

    rerender(<LocalMediaTile file={f} scrollRoot={document.createElement("div")} />);
    expect(observers).toHaveLength(1);
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

  it("loads immediately without an observer when IntersectionObserver is missing", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(
      <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />,
    );
    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBe(converted(WIN_VIDEO));
    expect(video.getAttribute("preload")).toBe("metadata");
  });

  it("keeps the original tile classes and media attributes before and after view", () => {
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
    check();
  });

  it("renders non-video kinds as an image, as before", () => {
    const { container } = render(
      <LocalMediaTile file={file("C:\\a.bin", "other")} scrollRoot={null} />,
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("adds no user-visible text or brand names", () => {
    const { container } = render(
      <LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />,
    );
    fire(observers[0], true);
    expect(container.textContent).toBe("");
    expect(container.innerHTML.replace(/src="[^"]*"/g, "")).not.toMatch(BRAND_LEAKS);
  });
});
