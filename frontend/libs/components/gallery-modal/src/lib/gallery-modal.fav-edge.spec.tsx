// FAV-4 edge cases: the heart in the My Library local preview and favorites loading.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { FoldersApi, GalleryModalApi, TagsApi, UsersApi } from "@storyteller/api";

import { favoritePaths, favoritesStore } from "./favoritesStore";
import GalleryModal from "./gallery-modal";

// --- mocks ---

const toastError = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@storyteller/ui-toaster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@storyteller/ui-toaster")>()),
  toast: { error: toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// --- constants ---

const WIN_VIDEO = "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4";
const WIN_IMAGE = "D:\\Médias\\über still.webp";
const LOCAL_FILES = [
  { path: WIN_VIDEO, kind: "video", size_bytes: 10, created_at: "2026-11-01T00:00:00Z" },
  { path: WIN_IMAGE, kind: "image", size_bytes: 5, created_at: "2026-10-31T00:00:00Z" },
];
const BRAND_LEAKS = /artcraft|getartcraft|storyteller|fakeyou|ltx|lightricks/i;

// --- helpers ---

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

let favoritesResult: () => Promise<unknown> = async () => [];
let favoriteCommand: (cmd: string) => Promise<unknown> = async () => undefined;

const renderLocal = async () => {
  const utils = render(<GalleryModal mode="select" isOpen />);
  await waitFor(() => expect(utils.baseElement.querySelector("video")).not.toBeNull());
  return utils;
};

const closeButton = () => screen.queryByRole("button", { name: "Close preview" });
const backdrop = () => closeButton()!.parentElement!;
const previewBox = () => backdrop().firstElementChild as HTMLElement;
const tileHearts = () => screen.getAllByRole("button", { name: /favorites$/ });

const openVideoPreview = (baseElement: HTMLElement) => {
  fireEvent.click(baseElement.querySelector(`video[src="${converted(WIN_VIDEO)}"]`)!);
  return within(previewBox()).getByRole("button", { name: /favorites$/ });
};

describe("GalleryModal favorites edge cases", () => {
  beforeEach(() => {
    // Files share one fork; start from an empty body so stray portals from other files never match.
    cleanup();
    document.body.innerHTML = "";
    favoritePaths.value = new Set();
    toastError.mockReset();
    favoritesResult = async () => [];
    favoriteCommand = async () => undefined;
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "list_local_media_command") return LOCAL_FILES;
      if (cmd === "local_media_thumbnail_command") return { thumb_path: `${args.path}.thumb.jpg` };
      if (cmd === "list_favorites") return favoritesResult();
      if (cmd === "add_favorite" || cmd === "remove_favorite") return favoriteCommand(cmd);
      return undefined;
    });
    // load() is cached per module; route it through refresh() so each test sees its own list.
    vi.spyOn(favoritesStore, "load").mockImplementation(() => favoritesStore.refresh());
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

  it("loads favorites when the local library opens and presses saved ones", async () => {
    favoritesResult = async () => [
      { path: WIN_IMAGE, added_at: "2026-11-01T00:00:00Z", kind: "image", missing: false },
    ];
    await renderLocal();
    expect(favoritesStore.load).toHaveBeenCalled();
    await waitFor(() =>
      expect(tileHearts().map((h) => h.getAttribute("aria-pressed"))).toEqual(["false", "true"]),
    );
  });

  it("still shows working, unpressed hearts when favorites fail to load", async () => {
    favoritesResult = async () => {
      throw new Error("favorites db locked");
    };
    await renderLocal();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [videoHeart] = tileHearts();
    expect(tileHearts().every((h) => h.getAttribute("aria-pressed") === "false")).toBe(true);

    fireEvent.click(videoHeart);
    await waitFor(() => expect(videoHeart.getAttribute("aria-pressed")).toBe("true"));
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: WIN_VIDEO });
  });

  it("shows a pressed heart in the preview for an already favorited item", async () => {
    favoritesResult = async () => [
      { path: WIN_VIDEO, added_at: "2026-11-01T00:00:00Z", kind: "video", missing: false },
    ];
    const { baseElement } = await renderLocal();
    await waitFor(() => expect(tileHearts()[0].getAttribute("aria-pressed")).toBe("true"));

    const heart = openVideoPreview(baseElement);
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    expect(heart.getAttribute("aria-label")).toBe("Remove from favorites");

    fireEvent.click(heart);
    await waitFor(() => expect(heart.getAttribute("aria-pressed")).toBe("false"));
    expect(invoke).toHaveBeenCalledWith("remove_favorite", { path: WIN_VIDEO });
    expect(closeButton()).not.toBeNull();
  });

  it("rolls back the preview heart and keeps the preview open when the command fails", async () => {
    favoriteCommand = async () => {
      throw new Error("disk full");
    };
    const { baseElement } = await renderLocal();
    const heart = openVideoPreview(baseElement);

    fireEvent.click(heart);
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(heart.getAttribute("aria-pressed")).toBe("false");
    expect(heart.getAttribute("aria-label")).toBe("Add to favorites");
    expect(closeButton()).not.toBeNull();
  });

  it("closes the preview on a backdrop click but not on a click on the media", async () => {
    const { baseElement } = await renderLocal();
    openVideoPreview(baseElement);

    fireEvent.click(previewBox().querySelector("video")!);
    expect(closeButton()).not.toBeNull();

    fireEvent.click(backdrop());
    expect(closeButton()).toBeNull();
  });

  it("toggles a tile heart under an open preview without changing the previewed item", async () => {
    const { baseElement } = await renderLocal();
    openVideoPreview(baseElement);
    const imageTileHeart = tileHearts().find(
      (h) => !previewBox().contains(h) && h.closest("div")?.querySelector("img"),
    )!;

    fireEvent.click(imageTileHeart);
    await waitFor(() => expect(imageTileHeart.getAttribute("aria-pressed")).toBe("true"));
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: WIN_IMAGE });
    expect(previewBox().querySelector(`video[src="${converted(WIN_VIDEO)}"]`)).not.toBeNull();
    expect(within(previewBox()).getByRole("button", { name: /favorites$/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("uses no brand names in the preview controls", async () => {
    const { baseElement } = await renderLocal();
    const heart = openVideoPreview(baseElement);
    expect(heart.getAttribute("aria-label")).not.toMatch(BRAND_LEAKS);
    expect(closeButton()!.getAttribute("aria-label")).not.toMatch(BRAND_LEAKS);
    expect(backdrop().textContent ?? "").not.toMatch(BRAND_LEAKS);
  });
});
