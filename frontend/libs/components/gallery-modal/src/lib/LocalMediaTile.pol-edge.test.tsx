// POL-1 edge cases: video tiles show a click-through play badge and an m:ss
// duration chip instead of native controls; previews and the cap are unchanged.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useGalleryViewStore } from "@storyteller/ui-generation-list";

import { LocalMediaTile } from "./LocalMediaTile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn().mockResolvedValue({ thumb_path: "C:\\temp\\thumb.jpg" }),
}));

// --- constants ---

const WIN_VIDEO = "C:\\Users\\Jane Doe\\Vidéos\\h0x\\clip one (1).mp4";
const BRAND_LEAKS = /artcraft|getartcraft|storyteller\.ai|fakeyou|ltx|lightricks/i;

const file = (path: string, kind: string) =>
  ({ path, kind, size_bytes: 1, created_at: "" }) as any;

// --- helpers ---

type FakeObserver = { cb: IntersectionObserverCallback; targets: Element[] };
let observers: FakeObserver[] = [];
const playing = new Set<HTMLMediaElement>();

const installObserver = () =>
  vi.stubGlobal(
    "IntersectionObserver",
    vi.fn((cb: IntersectionObserverCallback) => {
      const o: FakeObserver = { cb, targets: [] };
      observers.push(o);
      return { observe: (el: Element) => o.targets.push(el), disconnect: vi.fn(), unobserve: vi.fn() };
    }),
  );

const observerOf = (el: Element) => [...observers].reverse().find((o) => o.targets[0] === el)!;
const fire = (el: Element, isIntersecting: boolean) =>
  act(() => observerOf(el).cb([{ isIntersecting, target: el } as any], {} as any));

const loadMetadata = (video: HTMLVideoElement, duration: number) => {
  Object.defineProperty(video, "duration", { configurable: true, value: duration });
  fireEvent.loadedMetadata(video);
};

const chipText = (container: HTMLElement) =>
  container.querySelector('[data-testid="duration-chip"]')?.textContent ?? null;

describe("LocalMediaTile POL-1 edge cases", () => {
  beforeEach(() => {
    observers = [];
    playing.clear();
    useGalleryViewStore.setState({ autoplayVideos: false });
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

  it.each([
    [0, "0:00"],
    [0.4, "0:00"],
    [59.999, "0:59"],
    [60, "1:00"],
    [3599, "59:59"],
    [3600, "60:00"],
  ])("formats a duration of %s seconds as %s", (seconds, expected) => {
    const { container } = render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    loadMetadata(container.querySelector("video")!, seconds);
    expect(chipText(container)).toBe(expected);
  });

  it.each([NaN, Infinity])("keeps the chip hidden for a %s duration", (seconds) => {
    const { container } = render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    loadMetadata(container.querySelector("video")!, seconds);
    expect(chipText(container)).toBeNull();
  });

  it("keeps a known duration when a later loadedmetadata reports a non-finite one", () => {
    const { container } = render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    const video = container.querySelector("video")!;
    loadMetadata(video, 42);
    loadMetadata(video, NaN);
    expect(chipText(container)).toBe("0:42");
  });

  it("shows the badge but no chip on an off-screen tile, and no controls before or after view", () => {
    installObserver();
    const { container, getByTestId } = render(
      <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />,
    );
    const video = container.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(getByTestId("play-badge")).toBeTruthy();
    expect(chipText(container)).toBeNull();
    expect(video.hasAttribute("controls")).toBe(false);

    fire(video, true);
    expect(video.getAttribute("src")).toBe(`asset://localhost/${encodeURIComponent(WIN_VIDEO)}`);
    expect(video.hasAttribute("controls")).toBe(false);
    expect(chipText(container)).toBeNull();

    loadMetadata(video, 90);
    expect(chipText(container)).toBe("1:30");
    fire(video, false);
    expect(video.hasAttribute("controls")).toBe(false);
  });

  it("never adds controls with autoplay previews on", () => {
    useGalleryViewStore.setState({ autoplayVideos: true });
    const { container } = render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    expect(container.querySelector("video")!.hasAttribute("controls")).toBe(false);
  });

  it("renders exactly one badge per video tile, above the media, and both overlays ignore the pointer", () => {
    const { container, getAllByTestId } = render(
      <>
        <LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />
        <LocalMediaTile file={file("C:\\b.mp4", "video")} scrollRoot={null} />
        <LocalMediaTile file={file("C:\\c.png", "image")} scrollRoot={null} />
      </>,
    );
    expect(getAllByTestId("play-badge")).toHaveLength(2);
    container.querySelectorAll("video").forEach((v) => loadMetadata(v, 5));
    const overlays = [...getAllByTestId("play-badge"), ...getAllByTestId("duration-chip")];
    expect(overlays).toHaveLength(4);
    overlays.forEach((el) => {
      expect(el.className).toContain("pointer-events-none");
      expect(el.className).toContain("absolute");
    });
  });

  it("opens the preview once per click on the chip, and never from the heart", () => {
    const onOpen = vi.fn();
    const f = file("C:\\a.mp4", "video");
    const { container, getByTestId, getByRole } = render(
      <LocalMediaTile file={f} scrollRoot={null} onOpen={onOpen} />,
    );
    loadMetadata(container.querySelector("video")!, 12);
    fireEvent.click(getByTestId("duration-chip"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(f);

    const heart = getByRole("button", { name: /favorites$/ });
    fireEvent.click(heart);
    fireEvent.click(getByRole("button", { name: /favorites$/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not throw when a badge is clicked without an onOpen handler", () => {
    const { getByTestId } = render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    expect(() => fireEvent.click(getByTestId("play-badge"))).not.toThrow();
  });

  it("does not start or stop playback when the badge itself is hovered", () => {
    const { getByTestId } = render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    fireEvent.mouseEnter(getByTestId("play-badge"));
    expect(playing.size).toBe(0);
  });

  it("still pauses on hover-out when previews are off", () => {
    const { container } = render(<LocalMediaTile file={file("C:\\a.mp4", "video")} scrollRoot={null} />);
    const video = container.querySelector("video")!;
    fireEvent.mouseEnter(video);
    expect(playing.has(video)).toBe(true);
    fireEvent.mouseLeave(video);
    expect(playing.has(video)).toBe(false);
  });

  it("keeps the 4-preview cap with badges and chips present", () => {
    useGalleryViewStore.setState({ autoplayVideos: true });
    installObserver();
    const { container } = render(
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <LocalMediaTile key={i} file={file(`C:\\clips\\${i}.mp4`, "video")} scrollRoot={null} />
        ))}
      </>,
    );
    const els = Array.from(container.querySelectorAll("video"));
    els.forEach((el) => {
      fire(el, true);
      loadMetadata(el, 3);
    });
    expect(playing.size).toBe(4);
    expect(els.slice(0, 4).every((v) => playing.has(v))).toBe(true);
  });

  it("adds no image-tile overlay: the only svg on an image tile is the heart", () => {
    const { container } = render(<LocalMediaTile file={file("C:\\a.png", "image")} scrollRoot={null} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector("button svg")).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("shows only the duration as visible text and leaks no brand names", () => {
    const { container } = render(<LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />);
    expect(container.textContent).toBe("");
    loadMetadata(container.querySelector("video")!, 125);
    expect(container.textContent).toBe("2:05");
    expect(container.innerHTML.replace(/src="[^"]*"/g, "")).not.toMatch(BRAND_LEAKS);
  });
});
