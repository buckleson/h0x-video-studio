// FAV-7: the Favorites page lists favorites newest first, hides missing files,
// and "Add videos" imports the picked files then refreshes the store.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const dialog = vi.hoisted(() => ({ open: vi.fn() }));
const tauri = vi.hoisted(() => ({ listFavorites: vi.fn(), importFavoriteFiles: vi.fn() }));
const store = vi.hoisted(() => ({
  favoritesStore: { load: vi.fn(), refresh: vi.fn() },
  favoritePaths: { value: new Set<string>() },
}));

vi.mock("@tauri-apps/plugin-dialog", () => dialog);
vi.mock("@storyteller/tauri-api", () => tauri);
vi.mock("@storyteller/ui-gallery-modal", () => ({
  ...store,
  LocalMediaTile: ({ file }: { file: { path: string } }) => (
    <div data-testid="tile">{file.path}</div>
  ),
}));

import { PageFavorites } from "./PageFavorites";

// --- constants ---

const ENTRIES = [
  { path: "C:/m/old.png", added_at: "2026-01-01T00:00:00Z", kind: "image", missing: false },
  { path: "C:/m/gone.mp4", added_at: "2026-03-01T00:00:00Z", kind: "video", missing: true },
  { path: "C:/m/new.mp4", added_at: "2026-02-01T00:00:00Z", kind: "video", missing: false },
];
const PICKED = ["C:/in/a.mp4", "C:/in/b.png"];

// --- helpers ---

const tilePaths = () => screen.queryAllByTestId("tile").map((t) => t.textContent);
const clickAdd = () => fireEvent.click(screen.getByRole("button", { name: /add videos/i }));

beforeEach(() => {
  vi.clearAllMocks();
  tauri.listFavorites.mockResolvedValue(ENTRIES);
  tauri.importFavoriteFiles.mockResolvedValue([]);
  store.favoritesStore.refresh.mockResolvedValue(undefined);
});
afterEach(cleanup);

// --- tests ---

describe("FAV-7 PageFavorites grid", () => {
  it("loads the store and orders tiles newest first, hiding missing files", async () => {
    render(<PageFavorites />);
    await waitFor(() => expect(tilePaths()).toEqual(["C:/m/new.mp4", "C:/m/old.png"]));
    expect(store.favoritesStore.load).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("C:/m/gone.mp4")).toBeNull();
  });

  it("shows the empty state when every entry is missing", async () => {
    tauri.listFavorites.mockResolvedValue([ENTRIES[1]]);
    render(<PageFavorites />);
    await waitFor(() => expect(tauri.listFavorites).toHaveBeenCalled());
    expect(await screen.findByText("No favorites yet.")).toBeTruthy();
    expect(tilePaths()).toEqual([]);
  });
});

describe("FAV-7 Add videos", () => {
  it("opens a multi-select image/video picker, imports the picks, then refreshes", async () => {
    dialog.open.mockResolvedValue(PICKED);
    render(<PageFavorites />);
    clickAdd();
    await waitFor(() => expect(store.favoritesStore.refresh).toHaveBeenCalledTimes(1));

    const opts = dialog.open.mock.calls[0][0];
    expect(opts.multiple).toBe(true);
    const exts = opts.filters.flatMap((f: { extensions: string[] }) => f.extensions);
    expect(exts).toEqual(expect.arrayContaining(["png", "jpg", "mp4", "mov", "webm"]));
    expect(tauri.importFavoriteFiles).toHaveBeenCalledWith(PICKED);
    expect(tauri.importFavoriteFiles.mock.invocationCallOrder[0]).toBeLessThan(
      store.favoritesStore.refresh.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["null", null],
    ["an empty list", []],
  ])("does nothing when the picker returns %s", async (_label, result) => {
    dialog.open.mockResolvedValue(result);
    render(<PageFavorites />);
    clickAdd();
    await waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(tauri.importFavoriteFiles).not.toHaveBeenCalled();
    expect(store.favoritesStore.refresh).not.toHaveBeenCalled();
  });
});
