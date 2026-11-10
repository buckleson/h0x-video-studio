import { cleanup, fireEvent, render } from "@testing-library/react";
import { useGalleryViewStore } from "@storyteller/ui-generation-list";

import { LocalMediaTile } from "./LocalMediaTile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn().mockResolvedValue({ thumb_path: "C:\\temp\\thumb.jpg" }),
}));

const VIDEO = { path: "C:\\clips\\one.mp4", kind: "video", size_bytes: 10, created_at: "" } as any;
const IMAGE = { path: "D:\\media\\still.webp", kind: "image", size_bytes: 5, created_at: "" } as any;

const loadMetadata = (video: HTMLVideoElement, duration: number) => {
  Object.defineProperty(video, "duration", { configurable: true, value: duration });
  fireEvent.loadedMetadata(video);
};

describe("LocalMediaTile polish", () => {
  beforeEach(() => {
    useGalleryViewStore.setState({ autoplayVideos: false });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders video tiles without native controls", () => {
    const { container } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    expect(container.querySelector("video")!.hasAttribute("controls")).toBe(false);
  });

  it("shows a click-through play badge on video tiles", () => {
    const { getByTestId } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    const badge = getByTestId("play-badge");
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(badge.className).toContain("pointer-events-none");
  });

  it("shows the duration as m:ss only after loadedmetadata", () => {
    const { container, queryByTestId } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    expect(queryByTestId("duration-chip")).toBeNull();

    loadMetadata(container.querySelector("video")!, 65.7);
    const chip = queryByTestId("duration-chip")!;
    expect(chip.textContent).toBe("1:05");
    expect(chip.className).toContain("pointer-events-none");
  });

  it("formats short and long durations", () => {
    const { container, getByTestId } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    const video = container.querySelector("video")!;
    loadMetadata(video, 7);
    expect(getByTestId("duration-chip").textContent).toBe("0:07");
    loadMetadata(video, 754);
    expect(getByTestId("duration-chip").textContent).toBe("12:34");
  });

  it("keeps the chip hidden when the duration is not finite", () => {
    const { container, queryByTestId } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    loadMetadata(container.querySelector("video")!, Infinity);
    expect(queryByTestId("duration-chip")).toBeNull();
  });

  it("opens the preview when the tile or the badge is clicked", () => {
    const onOpen = vi.fn();
    const { container, getByTestId } = render(
      <LocalMediaTile file={VIDEO} scrollRoot={null} onOpen={onOpen} />,
    );
    fireEvent.click(container.querySelector("video")!);
    fireEvent.click(getByTestId("play-badge"));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledWith(VIDEO);
  });

  it("toggles the heart without opening the preview", () => {
    const onOpen = vi.fn();
    const { getByRole } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} onOpen={onOpen} />);
    const heart = getByRole("button", { name: /favorites$/ });
    const before = heart.getAttribute("aria-pressed");
    fireEvent.click(heart);
    expect(getByRole("button", { name: /favorites$/ }).getAttribute("aria-pressed")).not.toBe(before);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: /favorites$/ }));
  });

  it("still plays on hover when autoplay is off", () => {
    const { container } = render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    fireEvent.mouseEnter(container.querySelector("video")!);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("renders no badge or chip on image tiles", () => {
    const { queryByTestId } = render(<LocalMediaTile file={IMAGE} scrollRoot={null} />);
    expect(queryByTestId("play-badge")).toBeNull();
    expect(queryByTestId("duration-chip")).toBeNull();
  });
});
