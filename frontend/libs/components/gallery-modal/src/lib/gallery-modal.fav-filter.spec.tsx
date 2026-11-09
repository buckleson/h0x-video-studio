// FAV-6: the "Favorites" filter in My Library.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { FoldersApi, GalleryModalApi, TagsApi, UsersApi } from "@storyteller/api";

import { favoritePaths, favoritesStore } from "./favoritesStore";
import GalleryModal from "./gallery-modal";

// --- mocks ---

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

// --- constants ---

const WIN_VIDEO = "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4";
const WIN_IMAGE = "D:\\Médias\\über still.webp";
const MISSING = "E:\\gone\\deleted clip.mp4";
const LOCAL_FILES = [
  { path: WIN_VIDEO, kind: "video", size_bytes: 10, created_at: "2026-11-01T00:00:00Z" },
  { path: WIN_IMAGE, kind: "image", size_bytes: 5, created_at: "2026-10-31T00:00:00Z" },
];
const FAV_EMPTY = "No favorites yet. Tap the heart on any image or video.";
const LOCAL_EMPTY = "No media on this computer yet";
const BRAND_LEAKS = /artcraft|getartcraft|storyteller|fakeyou|ltx|lightricks/i;

// --- helpers ---

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

let localFiles: unknown[] = LOCAL_FILES;

const noSession = () =>
  vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({ success: false } as any);

const withSession = (username = "alice") =>
  vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
    success: true,
    data: { user: { username } },
  } as any);

// The Online header also has an "All Assets" tab; sidebar filter rows are the px-2.5 buttons.
const filterButton = (name: string) => {
  const rows = screen.getAllByRole("button", { name }).filter((b) => b.className.includes("px-2.5"));
  expect(rows).toHaveLength(1);
  return rows[0];
};
const isActiveFilter = (name: string) => filterButton(name).className.includes("bg-ui-controls/60");
const isSelectedSource = (name: string) =>
  screen.getByRole("button", { name }).className.includes("bg-ui-controls ");
const tileHearts = () => screen.queryAllByRole("button", { name: /to favorites$|from favorites$/ });

const videoTile = (root: HTMLElement) => root.querySelector(`video[src="${converted(WIN_VIDEO)}"]`);
const imageTile = (root: HTMLElement) =>
  root.querySelector(`img[src="${converted(WIN_IMAGE + ".thumb.jpg")}"]`);

const renderLocal = async () => {
  noSession();
  const utils = render(<GalleryModal mode="select" isOpen />);
  await waitFor(() => expect(videoTile(utils.baseElement)).not.toBeNull());
  return utils;
};

describe("GalleryModal Favorites filter", () => {
  beforeEach(() => {
    // Files share one fork; start from an empty body so stray portals from other files never match.
    cleanup();
    document.body.innerHTML = "";
    localFiles = LOCAL_FILES;
    favoritePaths.value = new Set();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "list_local_media_command") return localFiles;
      if (cmd === "local_media_thumbnail_command") return { thumb_path: `${args.path}.thumb.jpg` };
      if (cmd === "list_favorites") return [];
      return undefined;
    });
    vi.spyOn(favoritesStore, "load").mockResolvedValue();
    vi.spyOn(FoldersApi.prototype, "ListAllFolders").mockResolvedValue({ success: true, data: [] } as any);
    vi.spyOn(TagsApi.prototype, "ListTags").mockResolvedValue({ success: true, data: [] } as any);
    vi.spyOn(GalleryModalApi.prototype, "listUserMediaFiles").mockResolvedValue({
      success: true,
      data: [],
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("adds a Favorites entry to the filter sidebar", async () => {
    await renderLocal();
    expect(filterButton("Favorites")).toBeTruthy();
    expect(isActiveFilter("Favorites")).toBe(false);
  });

  it("shows only favorited local files (Windows paths match exactly)", async () => {
    favoritePaths.value = new Set([WIN_IMAGE]);
    const { baseElement } = await renderLocal();

    fireEvent.click(filterButton("Favorites"));

    await waitFor(() => expect(videoTile(baseElement)).toBeNull());
    await waitFor(() => expect(imageTile(baseElement)).not.toBeNull());
    expect(isActiveFilter("Favorites")).toBe(true);
    expect(tileHearts()).toHaveLength(1);
    expect(tileHearts()[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("does not match paths that differ only by case or slash direction", async () => {
    favoritePaths.value = new Set([WIN_VIDEO.toLowerCase(), WIN_IMAGE.replace(/\\/g, "/")]);
    const { baseElement } = await renderLocal();

    fireEvent.click(filterButton("Favorites"));

    expect(await screen.findByText(FAV_EMPTY)).toBeTruthy();
    expect(videoTile(baseElement)).toBeNull();
    expect(imageTile(baseElement)).toBeNull();
  });

  it("hides favorites whose file is missing from disk", async () => {
    favoritePaths.value = new Set([MISSING, WIN_VIDEO]);
    const { baseElement } = await renderLocal();

    fireEvent.click(filterButton("Favorites"));

    await waitFor(() => expect(tileHearts()).toHaveLength(1));
    expect(videoTile(baseElement)).not.toBeNull();
    expect(baseElement.querySelector(`[src*="${encodeURIComponent(MISSING)}"]`)).toBeNull();
    expect(screen.queryByText(FAV_EMPTY)).toBeNull();
  });

  it("shows the favorites hint when every favorite is missing", async () => {
    favoritePaths.value = new Set([MISSING]);
    const { baseElement } = await renderLocal();

    fireEvent.click(filterButton("Favorites"));

    expect(await screen.findByText(FAV_EMPTY)).toBeTruthy();
    expect(baseElement.querySelector("video")).toBeNull();
    expect(screen.queryByText(LOCAL_EMPTY)).toBeNull();
  });

  it("shows a short one-line hint when there are no favorites", async () => {
    await renderLocal();

    fireEvent.click(filterButton("Favorites"));

    const hint = await screen.findByText(FAV_EMPTY);
    const text = hint.textContent ?? "";
    expect(text).not.toContain("\n");
    expect(text.length).toBeLessThanOrEqual(80);
    expect(text).toMatch(/heart/i);
    expect(screen.queryByText(LOCAL_EMPTY)).toBeNull();
  });

  it("shows the favorites hint, not the local one, when the disk has no media", async () => {
    localFiles = [];
    noSession();
    render(<GalleryModal mode="select" isOpen />);
    expect(await screen.findByText(LOCAL_EMPTY)).toBeTruthy();

    fireEvent.click(filterButton("Favorites"));

    expect(await screen.findByText(FAV_EMPTY)).toBeTruthy();
    expect(screen.queryByText(LOCAL_EMPTY)).toBeNull();
  });

  it("drops a tile and shows the hint after unfavoriting it in the filter", async () => {
    favoritePaths.value = new Set([WIN_VIDEO]);
    const { baseElement } = await renderLocal();
    fireEvent.click(filterButton("Favorites"));
    await waitFor(() => expect(tileHearts()).toHaveLength(1));

    fireEvent.click(tileHearts()[0]);

    expect(await screen.findByText(FAV_EMPTY)).toBeTruthy();
    expect(videoTile(baseElement)).toBeNull();
    expect(invoke).toHaveBeenCalledWith("remove_favorite", { path: WIN_VIDEO });
  });

  it("restores every local file when switching back to All Assets", async () => {
    favoritePaths.value = new Set([WIN_IMAGE]);
    const { baseElement } = await renderLocal();
    fireEvent.click(filterButton("Favorites"));
    await waitFor(() => expect(videoTile(baseElement)).toBeNull());

    fireEvent.click(filterButton("All Assets"));

    await waitFor(() => expect(videoTile(baseElement)).not.toBeNull());
    expect(imageTile(baseElement)).not.toBeNull();
    expect(isActiveFilter("All Assets")).toBe(true);
  });

  it("switches a signed-in user from Online to On this computer without reloading Online", async () => {
    withSession();
    favoritePaths.value = new Set([WIN_VIDEO]);
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(GalleryModalApi.prototype.listUserMediaFiles).toHaveBeenCalled());
    expect(isSelectedSource("Online")).toBe(true);
    const onlineCalls = vi.mocked(GalleryModalApi.prototype.listUserMediaFiles).mock.calls.length;

    fireEvent.click(filterButton("Favorites"));

    await waitFor(() => expect(videoTile(baseElement)).not.toBeNull());
    expect(isSelectedSource("On this computer")).toBe(true);
    expect(imageTile(baseElement)).toBeNull();
    expect(vi.mocked(GalleryModalApi.prototype.listUserMediaFiles).mock.calls.length).toBe(onlineCalls);
  });

  it("resets the filter to All Assets when switching to Online", async () => {
    favoritePaths.value = new Set([WIN_VIDEO]);
    const { baseElement } = await renderLocal();
    fireEvent.click(filterButton("Favorites"));
    await waitFor(() => expect(isActiveFilter("Favorites")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Online" }));

    await waitFor(() => expect(isActiveFilter("All Assets")).toBe(true));
    expect(isActiveFilter("Favorites")).toBe(false);
    expect(baseElement.querySelector("video")).toBeNull();
    expect(screen.queryByText(FAV_EMPTY)).toBeNull();
  });

  it("keeps the filter when switching to On this computer while already there", async () => {
    favoritePaths.value = new Set([WIN_VIDEO]);
    const { baseElement } = await renderLocal();
    fireEvent.click(filterButton("Favorites"));
    await waitFor(() => expect(imageTile(baseElement)).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "On this computer" }));

    expect(isActiveFilter("Favorites")).toBe(true);
    expect(videoTile(baseElement)).not.toBeNull();
    expect(imageTile(baseElement)).toBeNull();
  });

  it("does not switch filters when the modal forces another filter", async () => {
    noSession();
    favoritePaths.value = new Set([WIN_VIDEO]);
    const { baseElement } = render(<GalleryModal mode="select" isOpen forceFilter="image" />);
    await waitFor(() => expect(imageTile(baseElement)).not.toBeNull());

    fireEvent.click(filterButton("Favorites"));

    expect(isActiveFilter("Favorites")).toBe(false);
    expect(imageTile(baseElement)).not.toBeNull();
    expect(screen.queryByText(FAV_EMPTY)).toBeNull();
  });

  it("uses no brand names in the filter label or the empty hint", async () => {
    await renderLocal();
    fireEvent.click(filterButton("Favorites"));
    const hint = await screen.findByText(FAV_EMPTY);

    expect(filterButton("Favorites").textContent).not.toMatch(BRAND_LEAKS);
    expect(hint.textContent).not.toMatch(BRAND_LEAKS);
  });
});
