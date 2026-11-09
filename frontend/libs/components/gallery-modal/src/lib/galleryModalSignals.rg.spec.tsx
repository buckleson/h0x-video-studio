// RG-1: libraryRefreshTick bumps once per completed local list load.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import {
  FoldersApi,
  GalleryModalApi,
  TagsApi,
  UsersApi,
} from "@storyteller/api";

import { libraryRefreshTick as fromIndex } from "../index";
import { favoritePaths, favoritesStore } from "./favoritesStore";
import GalleryModal from "./gallery-modal";
import { libraryRefreshTick } from "./galleryModalSignals";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

const LOCAL_FILES = [
  { path: "D:\media\still.webp", kind: "image", size_bytes: 5, created_at: "2026-10-31T00:00:00Z" },
];

const localCalls = () =>
  vi.mocked(invoke).mock.calls.filter((c) => c[0] === "list_local_media_command").length;

describe("libraryRefreshTick", () => {
  beforeEach(() => {
    cleanup();
    document.body.innerHTML = "";
    libraryRefreshTick.value = 0;
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "list_favorites") return [];
      return cmd === "local_media_thumbnail_command" ? { thumb_path: `${args.path}.thumb.jpg` } : LOCAL_FILES;
    });
    favoritePaths.value = new Set();
    vi.spyOn(favoritesStore, "load").mockResolvedValue();
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({ success: false } as any);
    vi.spyOn(FoldersApi.prototype, "ListAllFolders").mockResolvedValue({ success: true, data: [] } as any);
    vi.spyOn(TagsApi.prototype, "ListTags").mockResolvedValue({ success: true, data: [] } as any);
    vi.spyOn(GalleryModalApi.prototype, "listUserMediaFiles").mockResolvedValue({ success: true, data: [] } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("is exported from the lib index and starts at 0", () => {
    expect(fromIndex).toBe(libraryRefreshTick);
    expect(libraryRefreshTick.value).toBe(0);
  });

  it("increases by exactly 1 per completed local load", async () => {
    const { rerender } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(libraryRefreshTick.value).toBe(1));
    expect(localCalls()).toBe(1);

    rerender(<GalleryModal mode="select" isOpen={false} />);
    rerender(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(libraryRefreshTick.value).toBe(2));
    expect(localCalls()).toBe(2);
  });

  it("does not bump on a failed load", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_favorites") return [];
      throw new Error("scan failed");
    });
    render(<GalleryModal mode="select" isOpen />);

    expect(await screen.findByText("No media on this computer yet")).toBeTruthy();
    expect(localCalls()).toBeGreaterThan(0);
    expect(libraryRefreshTick.value).toBe(0);
  });
});
