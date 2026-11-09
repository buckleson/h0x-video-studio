// FAV-5: heart toggle on the generation result (image and video create pages).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DownloadUrl } from "@storyteller/tauri-api";
import { favoritePaths, favoritesStore } from "@storyteller/ui-gallery-modal";
import type { GalleryItem } from "@storyteller/ui-generation-list";

vi.mock("@storyteller/tauri-api", () => ({ DownloadUrl: vi.fn() }));

// Real signal so the heart re-renders; toggle flips membership like the store.
vi.mock("@storyteller/ui-gallery-modal", async () => {
  const { signal } = await import("@preact/signals-react");
  const { vi: v } = await import("vitest");
  const favoritePaths = signal<ReadonlySet<string>>(new Set());
  return {
    favoritePaths,
    favoritesStore: {
      load: v.fn(async () => {}),
      toggle: v.fn(async (path: string) => {
        const next = new Set(favoritePaths.value);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        favoritePaths.value = next;
      }),
    },
  };
});

// Minimal grid: each item is a clickable card that hosts its quick actions.
vi.mock("@storyteller/ui-generation-list", () => {
  const View = ({ galleryItems, onGalleryItemClick, renderGalleryActions }: any) => (
    <div>
      {galleryItems.map((item: any) => (
        <div key={item.id} data-testid="card" onClick={() => onGalleryItemClick(item)}>
          {renderGalleryActions(item, {})}
        </div>
      ))}
    </div>
  );
  const store = (state: any) => {
    const hook = (sel: (s: any) => unknown) => sel(state);
    hook.getState = () => state;
    return hook;
  };
  return {
    GenerationGridView: View,
    GenerationListView: View,
    SelectionActionBar: ({ children }: any) => <div>{children}</div>,
    useGalleryViewStore: store({ viewMode: "grid" }),
    useGallerySelectionStore: store({ active: false, ids: new Set(), setActive: () => {}, toggle: () => {} }),
  };
});

vi.mock("@storyteller/ui-tooltip", () => ({ Tooltip: ({ children }: any) => <>{children}</> }));
vi.mock("@storyteller/ui-toaster", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./desktopMediaActions", () => ({
  applyMakeVideoFromImage: vi.fn(),
  applyRecreateFromPromptToken: vi.fn(),
  downloadMediaFileToDisk: vi.fn(),
  downloadMediaFilesToFolder: vi.fn(),
}));

import { DesktopGenerationGallery } from "./DesktopGenerationGallery";

// --- cases ---

// favoritedLocalPaths is module state, so every test uses its own item id.
let seq = 0;
const makeItem = (mediaClass: "image" | "video"): GalleryItem =>
  ({
    id: `m_${mediaClass}_${++seq}`,
    mediaClass,
    fullImage: `https://cdn.example/${mediaClass}_${seq}.${mediaClass === "video" ? "mp4" : "png"}`,
    thumbnail: "",
    modelId: "model_x",
  }) as unknown as GalleryItem;

// Where the desktop download command saves a URL (the space is on purpose).
const pathFor = (url: string) => `C:\\Users\\Jane Doe\\Downloads\\${url.split("/").pop()}`;
const savedPath = (item: GalleryItem) => pathFor(item.fullImage!);

// --- helpers ---

const renderGallery = (item: GalleryItem, onGalleryItemClick = vi.fn()) => {
  render(
    <DesktopGenerationGallery
      inProgressJobs={[]}
      failedJobs={[]}
      onDismissFailed={() => {}}
      newlyCompletedItems={[]}
      galleryItems={[item]}
      newlyCompletedTokens={new Set()}
      hasMore={false}
      isInitialLoading={false}
      onLoadMore={() => {}}
      onGalleryItemClick={onGalleryItemClick}
    />,
  );
  return onGalleryItemClick;
};

const heart = () => screen.getByRole("button", { name: /favorites/ });

describe("DesktopGenerationGallery favorites", () => {
  beforeEach(() => {
    favoritePaths.value = new Set();
    vi.mocked(favoritesStore.toggle).mockClear();
    vi.mocked(DownloadUrl).mockReset();
    vi.mocked(DownloadUrl).mockImplementation(async (url: string) => ({ payload: { path: pathFor(url) } }) as any);
  });

  afterEach(() => cleanup());

  it.each(["image", "video"] as const)(
    "saves the %s, favorites the saved path, then unfavorites with the stored path",
    async (kind) => {
      const item = makeItem(kind);
      renderGallery(item);
      expect(heart().getAttribute("aria-pressed")).toBe("false");
      expect(heart().getAttribute("aria-label")).toBe("Add to favorites");

      fireEvent.click(heart());
      await waitFor(() => expect(heart().getAttribute("aria-pressed")).toBe("true"));
      expect(heart().getAttribute("aria-label")).toBe("Remove from favorites");
      expect(DownloadUrl).toHaveBeenCalledWith(item.fullImage, { model: "model_x" });
      expect(favoritesStore.toggle).toHaveBeenCalledWith(savedPath(item));
      // My Library reads the same store, so the saved path is now a favorite there.
      expect(favoritePaths.value.has(savedPath(item))).toBe(true);

      fireEvent.click(heart());
      await waitFor(() => expect(heart().getAttribute("aria-pressed")).toBe("false"));
      expect(DownloadUrl).toHaveBeenCalledTimes(1);
      expect(favoritesStore.toggle).toHaveBeenCalledTimes(2);
      expect(favoritesStore.toggle).toHaveBeenLastCalledWith(savedPath(item));
    },
  );

  it("does not open the item when the heart is clicked", async () => {
    const item = makeItem("image");
    const onClick = renderGallery(item);
    fireEvent.click(heart());
    await waitFor(() => expect(favoritesStore.toggle).toHaveBeenCalled());
    expect(onClick).not.toHaveBeenCalled();
  });

  it("opens the item when the card itself is clicked", () => {
    const item = makeItem("image");
    const onClick = renderGallery(item);
    fireEvent.click(screen.getByTestId("card"));
    expect(onClick).toHaveBeenCalledWith(item);
  });

  it("does not toggle anything when saving the file fails", async () => {
    vi.mocked(DownloadUrl).mockRejectedValue(new Error("network down"));
    const item = makeItem("video");
    renderGallery(item);
    fireEvent.click(heart());
    await waitFor(() => expect(heart().hasAttribute("disabled")).toBe(false));
    expect(DownloadUrl).toHaveBeenCalledTimes(1);
    expect(favoritesStore.toggle).not.toHaveBeenCalled();
    expect(heart().getAttribute("aria-pressed")).toBe("false");
  });
});
