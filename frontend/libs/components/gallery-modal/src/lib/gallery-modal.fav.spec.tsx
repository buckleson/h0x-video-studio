// FAV-4: heart toggle on My Library tiles and in the local item preview.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { FoldersApi, GalleryModalApi, TagsApi, UsersApi } from "@storyteller/api";

import { favoritePaths, favoritesStore } from "./favoritesStore";
import GalleryModal from "./gallery-modal";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

const WIN_VIDEO = "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4";
const WIN_IMAGE = "D:\\media\\still.webp";
const LOCAL_FILES = [
  { path: WIN_VIDEO, kind: "video", size_bytes: 10, created_at: "2026-11-01T00:00:00Z" },
  { path: WIN_IMAGE, kind: "image", size_bytes: 5, created_at: "2026-10-31T00:00:00Z" },
];
const BRAND_LEAKS = /artcraft|getartcraft|storyteller|fakeyou|ltx|lightricks/i;

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

const renderLocal = async () => {
  const utils = render(<GalleryModal mode="select" isOpen />);
  await waitFor(() => expect(utils.baseElement.querySelector("video")).not.toBeNull());
  return utils;
};

const hearts = () => screen.getAllByRole("button", { name: /favorites$/ });
const closeButton = () => screen.queryByRole("button", { name: "Close preview" });
const preview = () => closeButton()!.parentElement!;

describe("GalleryModal favorites", () => {
  beforeEach(() => {
    // Files share one fork; start from an empty body so stray portals from other files never match.
    cleanup();
    document.body.innerHTML = "";
    favoritePaths.value = new Set();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "list_local_media_command") return LOCAL_FILES;
      if (cmd === "local_media_thumbnail_command") return { thumb_path: `${args.path}.thumb.jpg` };
      if (cmd === "list_favorites") return [];
      return undefined;
    });
    vi.spyOn(favoritesStore, "load").mockResolvedValue();
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({ success: false } as any);
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

  it("shows one unpressed heart per local tile", async () => {
    await renderLocal();
    expect(hearts()).toHaveLength(2);
    for (const h of hearts()) {
      expect(h.getAttribute("aria-pressed")).toBe("false");
      expect(h.getAttribute("aria-label")).toBe("Add to favorites");
    }
  });

  it("favorites a video and an image from their tiles without opening a preview", async () => {
    await renderLocal();
    const [videoHeart, imageHeart] = hearts();

    fireEvent.click(videoHeart);
    fireEvent.click(imageHeart);

    await waitFor(() =>
      expect(hearts().every((h) => h.getAttribute("aria-pressed") === "true")).toBe(true),
    );
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: WIN_VIDEO });
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: WIN_IMAGE });
    expect(closeButton()).toBeNull();
  });

  it("opens an image preview and toggles the favorite there", async () => {
    const { baseElement } = await renderLocal();
    await waitFor(() =>
      expect(baseElement.querySelector(`img[src="${converted(WIN_IMAGE + ".thumb.jpg")}"]`)).not.toBeNull(),
    );
    fireEvent.click(baseElement.querySelector(`img[src="${converted(WIN_IMAGE + ".thumb.jpg")}"]`)!);

    const box = preview();
    expect(box.querySelector(`img[src="${converted(WIN_IMAGE)}"]`)).not.toBeNull();
    const heart = within(box).getByRole("button", { name: "Add to favorites" });

    fireEvent.click(heart);
    await waitFor(() => expect(heart.getAttribute("aria-pressed")).toBe("true"));
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: WIN_IMAGE });
    expect(heart.getAttribute("aria-label")).toBe("Remove from favorites");
    // The heart click does not close the preview.
    expect(closeButton()).not.toBeNull();

    fireEvent.click(heart);
    await waitFor(() => expect(heart.getAttribute("aria-pressed")).toBe("false"));
    expect(invoke).toHaveBeenCalledWith("remove_favorite", { path: WIN_IMAGE });
  });

  it("opens a video preview whose heart stays in sync with the tile", async () => {
    const { baseElement } = await renderLocal();
    fireEvent.click(baseElement.querySelector(`video[src="${converted(WIN_VIDEO)}"]`)!);

    const box = (await screen.findByRole("button", { name: "Close preview" })).parentElement!;
    expect(box.querySelector(`video[src="${converted(WIN_VIDEO)}"]`)).not.toBeNull();
    fireEvent.click(within(box).getByRole("button", { name: "Add to favorites" }));

    await waitFor(() =>
      expect(within(box).getByRole("button", { name: "Remove from favorites" })).toBeTruthy(),
    );
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: WIN_VIDEO });
    expect(hearts().filter((h) => h.getAttribute("aria-pressed") === "true")).toHaveLength(2);

    fireEvent.click(closeButton()!);
    expect(closeButton()).toBeNull();
  });

  it("uses no brand names in the heart labels", async () => {
    await renderLocal();
    for (const h of hearts()) expect(h.getAttribute("aria-label")).not.toMatch(BRAND_LEAKS);
  });
});
