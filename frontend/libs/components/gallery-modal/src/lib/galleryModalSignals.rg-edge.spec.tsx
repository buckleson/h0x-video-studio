// RG-1 edge cases: libraryRefreshTick bumps exactly once per completed local
// (ListLocalMedia) load, never for a cancelled, failed, closed or Online load.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import {
  FoldersApi,
  GalleryModalApi,
  TagsApi,
  UsersApi,
} from "@storyteller/api";

import { favoritePaths, favoritesStore } from "./favoritesStore";
import GalleryModal from "./gallery-modal";
import { libraryRefreshTick } from "./galleryModalSignals";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

// --- constants ---

const WIN_VIDEO = "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4";
const WIN_IMAGE = "D:\\media\\still.webp";

const LOCAL_FILES = [
  { path: WIN_VIDEO, kind: "video", size_bytes: 10, created_at: "2026-11-01T00:00:00Z" },
  { path: WIN_IMAGE, kind: "image", size_bytes: 5, created_at: "2026-10-31T00:00:00Z" },
];

const EMPTY_LOCAL_TEXT = "No media on this computer yet";

// --- helpers ---

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

const localCalls = () =>
  vi.mocked(invoke).mock.calls.filter((c) => c[0] === "list_local_media_command").length;

const mockLocal = (list: (args?: any) => Promise<unknown>) =>
  vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "list_favorites") return [];
    if (cmd === "local_media_thumbnail_command") return { thumb_path: `${args.path}.thumb.jpg` };
    return list(args);
  });

const noSession = () =>
  vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({ success: false } as any);

const withSession = (username = "alice") =>
  vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
    success: true,
    data: { user: { username } },
  } as any);

// Let pending promise callbacks and React effects settle (no timers).
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};

describe("libraryRefreshTick edge cases", () => {
  beforeEach(() => {
    cleanup();
    document.body.innerHTML = "";
    libraryRefreshTick.value = 0;
    vi.mocked(invoke).mockReset();
    mockLocal(async () => LOCAL_FILES);
    favoritePaths.value = new Set();
    vi.spyOn(favoritesStore, "load").mockResolvedValue();
    vi.spyOn(FoldersApi.prototype, "ListAllFolders").mockResolvedValue({ success: true, data: [] } as any);
    vi.spyOn(TagsApi.prototype, "ListTags").mockResolvedValue({ success: true, data: [] } as any);
    vi.spyOn(GalleryModalApi.prototype, "listUserMediaFiles").mockResolvedValue({ success: true, data: [] } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    libraryRefreshTick.value = 0;
  });

  it("does not bump while the modal is closed", async () => {
    noSession();
    render(<GalleryModal mode="select" isOpen={false} />);
    await flush();
    expect(localCalls()).toBe(0);
    expect(libraryRefreshTick.value).toBe(0);
  });

  it("bumps exactly once for one load and not again once settled", async () => {
    noSession();
    render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(libraryRefreshTick.value).toBe(1));
    await flush();
    expect(localCalls()).toBe(1);
    expect(libraryRefreshTick.value).toBe(1);
  });

  it("adds 1 to the current value instead of resetting it", async () => {
    libraryRefreshTick.value = 41;
    noSession();
    render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(libraryRefreshTick.value).toBe(42));
    await flush();
    expect(libraryRefreshTick.value).toBe(42);
  });

  it("counts an empty local list as a completed load", async () => {
    mockLocal(async () => []);
    noSession();
    render(<GalleryModal mode="select" isOpen />);
    expect(await screen.findByText(EMPTY_LOCAL_TEXT)).toBeTruthy();
    await flush();
    expect(localCalls()).toBe(1);
    expect(libraryRefreshTick.value).toBe(1);
  });

  it("bumps after a load of Windows paths and keeps the paths unchanged", async () => {
    noSession();
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    expect(baseElement.querySelector("video")!.getAttribute("src")).toBe(converted(WIN_VIDEO));
    expect(libraryRefreshTick.value).toBe(1);
  });

  it("does not bump when the modal closes before the load finishes (cancelled)", async () => {
    let resolveList: (files: unknown) => void = () => {};
    mockLocal(() => new Promise((resolve) => (resolveList = resolve)));
    noSession();
    const { rerender } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(localCalls()).toBe(1));

    rerender(<GalleryModal mode="select" isOpen={false} />);
    await act(async () => resolveList(LOCAL_FILES));
    await flush();

    expect(libraryRefreshTick.value).toBe(0);
  });

  it("bumps on a successful reopen after a failed load", async () => {
    mockLocal(async () => {
      throw new Error("scan failed");
    });
    noSession();
    const { rerender } = render(<GalleryModal mode="select" isOpen />);
    expect(await screen.findByText(EMPTY_LOCAL_TEXT)).toBeTruthy();
    expect(libraryRefreshTick.value).toBe(0);

    mockLocal(async () => LOCAL_FILES);
    rerender(<GalleryModal mode="select" isOpen={false} />);
    rerender(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(libraryRefreshTick.value).toBe(1));
    await flush();
    expect(libraryRefreshTick.value).toBe(1);
  });

  it("does not bump for the Online source; bumps once per switch to On this computer", async () => {
    withSession();
    render(<GalleryModal mode="select" isOpen />);
    await waitFor(() =>
      expect(GalleryModalApi.prototype.listUserMediaFiles).toHaveBeenCalled(),
    );
    await flush();
    expect(localCalls()).toBe(0);
    expect(libraryRefreshTick.value).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "On this computer" }));
    await waitFor(() => expect(libraryRefreshTick.value).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Online" }));
    await flush();
    expect(libraryRefreshTick.value).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "On this computer" }));
    await waitFor(() => expect(libraryRefreshTick.value).toBe(2));
    await flush();
    expect(localCalls()).toBe(2);
    expect(libraryRefreshTick.value).toBe(2);
  });
});
