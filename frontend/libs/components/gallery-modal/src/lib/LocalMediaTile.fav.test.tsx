// FAV-4: heart toggle on My Library tiles.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

import { favoritePaths } from "./favoritesStore";
import { LocalMediaTile } from "./LocalMediaTile";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(),
}));

const VIDEO = { path: "C:\\Users\\Jane Doe\\Videos\\clip one.mp4", kind: "video", size_bytes: 10, created_at: "" } as any;
const IMAGE = { path: "D:\\media\\still.webp", kind: "image", size_bytes: 5, created_at: "" } as any;

const heart = () => screen.getByRole("button");
const favCalls = () =>
  vi.mocked(invoke).mock.calls.filter((c) => c[0] === "add_favorite" || c[0] === "remove_favorite");

describe("LocalMediaTile favorites", () => {
  beforeEach(() => {
    favoritePaths.value = new Set();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it.each([
    ["image", IMAGE],
    ["video", VIDEO],
  ])("favorites and unfavorites a %s from the tile", async (_kind, file) => {
    render(<LocalMediaTile file={file} scrollRoot={null} />);
    expect(heart().getAttribute("aria-pressed")).toBe("false");
    expect(heart().getAttribute("aria-label")).toBe("Add to favorites");

    fireEvent.click(heart());
    await waitFor(() => expect(heart().getAttribute("aria-pressed")).toBe("true"));
    expect(heart().getAttribute("aria-label")).toBe("Remove from favorites");
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: file.path });

    fireEvent.click(heart());
    await waitFor(() => expect(heart().getAttribute("aria-pressed")).toBe("false"));
    expect(invoke).toHaveBeenCalledWith("remove_favorite", { path: file.path });
    expect(favCalls()).toHaveLength(2);
  });

  it("shows an already favorited file as pressed", () => {
    favoritePaths.value = new Set([IMAGE.path]);
    render(<LocalMediaTile file={IMAGE} scrollRoot={null} />);
    expect(heart().getAttribute("aria-pressed")).toBe("true");
    expect(heart().getAttribute("aria-label")).toBe("Remove from favorites");
  });

  it("does not open the item when the heart is clicked", () => {
    const onOpen = vi.fn();
    render(<LocalMediaTile file={IMAGE} scrollRoot={null} onOpen={onOpen} />);
    fireEvent.click(heart());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("opens the item when the tile itself is clicked", () => {
    const onOpen = vi.fn();
    const { container } = render(<LocalMediaTile file={IMAGE} scrollRoot={null} onOpen={onOpen} />);
    fireEvent.click(container.querySelector("img")!);
    expect(onOpen).toHaveBeenCalledWith(IMAGE);
  });

  it("rolls back the heart when the command fails", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("disk full"));
    render(<LocalMediaTile file={VIDEO} scrollRoot={null} />);
    fireEvent.click(heart());
    await waitFor(() => expect(heart().getAttribute("aria-pressed")).toBe("false"));
  });
});
