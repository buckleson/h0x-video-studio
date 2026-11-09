// RG-2: Home shows the newest 8 local images/videos, opens them in the My
// Library preview, and refreshes on generation-complete and libraryRefreshTick.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({ ListLocalMedia: vi.fn() }));
const events = vi.hoisted(() => ({
  handlers: [] as (() => void)[],
  unlisten: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => `asset://${p}` }));
vi.mock("@tauri-apps/api/event", () => ({ listen: events.listen }));
vi.mock("@storyteller/tauri-api", () => tauri);
vi.mock("@storyteller/ui-gallery-modal", async () => {
  const { signal } = await import("@preact/signals-react");
  const toggle = vi.fn();
  return {
    favoritesStore: { load: vi.fn(), toggle },
    galleryModalLightboxImage: signal<any>(null),
    galleryModalLightboxMediaId: signal<string | null>(null),
    galleryModalLightboxNavNext: signal<any>(null),
    galleryModalLightboxNavPrev: signal<any>(null),
    galleryModalLightboxVisible: signal(false),
    galleryModalVisibleDuringDrag: signal(false),
    galleryModalVisibleViewMode: signal(false),
    libraryRefreshTick: signal(0),
    LocalMediaTile: ({ file, onOpen }: { file: { path: string }; onOpen?: (f: unknown) => void }) => (
      <div data-testid="tile" onClick={() => onOpen?.(file)}>
        {file.path}
        <button
          type="button"
          aria-label="Add to favorites"
          onClick={(e) => {
            e.stopPropagation();
            toggle(file.path);
          }}
        />
      </div>
    ),
  };
});

import * as gallery from "@storyteller/ui-gallery-modal";
import { RecentGenerations } from "./RecentGenerations";

// --- constants ---

const file = (i: number, kind = i % 2 ? "video" : "image") => ({
  path: `C:/m/${i}.${kind === "video" ? "mp4" : "png"}`,
  kind,
  size_bytes: 1,
  created_at: `2026-11-0${(i % 9) + 1}T00:00:00Z`,
});
const TEN = Array.from({ length: 10 }, (_, i) => file(i));

// --- helpers ---

const tilePaths = () => screen.queryAllByTestId("tile").map((t) => t.firstChild?.textContent);
const g = gallery as any;

beforeEach(() => {
  vi.clearAllMocks();
  events.handlers = [];
  events.listen.mockImplementation((_name: string, cb: () => void) => {
    events.handlers.push(cb);
    return Promise.resolve(events.unlisten);
  });
  tauri.ListLocalMedia.mockResolvedValue(TEN);
  g.galleryModalLightboxVisible.value = false;
  g.galleryModalLightboxImage.value = null;
  g.galleryModalVisibleViewMode.value = false;
});
afterEach(cleanup);

// --- tests ---

describe("RG-2 RecentGenerations", () => {
  it("shows the first 8 items in list order", async () => {
    render(<RecentGenerations />);
    await waitFor(() => expect(tilePaths()).toEqual(TEN.slice(0, 8).map((f) => f.path)));
  });

  it("drops non image/video kinds", async () => {
    tauri.ListLocalMedia.mockResolvedValue([file(0), file(1, "audio"), file(2)]);
    render(<RecentGenerations />);
    await waitFor(() => expect(tilePaths()).toEqual([file(0).path, file(2).path]));
  });

  it("toggling the heart does not open the preview", async () => {
    render(<RecentGenerations />);
    const hearts = await screen.findAllByRole("button", { name: /favorites/i });
    fireEvent.click(hearts[0]);
    expect(g.favoritesStore.toggle).toHaveBeenCalledWith(TEN[0].path);
    expect(g.galleryModalLightboxVisible.value).toBe(false);
  });

  it("clicking a tile opens the My Library preview for it", async () => {
    render(<RecentGenerations />);
    const tiles = await screen.findAllByTestId("tile");
    fireEvent.click(tiles[1]);
    expect(g.galleryModalLightboxVisible.value).toBe(true);
    expect(g.galleryModalLightboxMediaId.value).toBe(TEN[1].path);
    expect(g.galleryModalLightboxImage.value).toMatchObject({
      id: TEN[1].path,
      fullImage: `asset://${TEN[1].path}`,
      mediaClass: "video",
    });
  });

  it("View all opens My Library", async () => {
    render(<RecentGenerations />);
    fireEvent.click(screen.getByRole("button", { name: /view all/i }));
    expect(g.galleryModalVisibleViewMode.value).toBe(true);
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalled());
  });

  it("shows the empty state with no media", async () => {
    tauri.ListLocalMedia.mockResolvedValue([]);
    render(<RecentGenerations />);
    expect(await screen.findByText(/generate an image or video/i)).toBeTruthy();
  });

  it("shows the empty state when ListLocalMedia fails", async () => {
    tauri.ListLocalMedia.mockRejectedValue(new Error("boom"));
    render(<RecentGenerations />);
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalled());
    expect(await screen.findByText(/generate an image or video/i)).toBeTruthy();
    expect(tilePaths()).toEqual([]);
  });

  it("reloads on generation-complete-event and libraryRefreshTick", async () => {
    render(<RecentGenerations />);
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalledTimes(1));
    expect(events.listen).toHaveBeenCalledWith("generation-complete-event", expect.any(Function));
    act(() => events.handlers[0]());
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalledTimes(2));
    act(() => {
      g.libraryRefreshTick.value++;
    });
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalledTimes(3));
  });

  it("unlistens on unmount", async () => {
    const { unmount } = render(<RecentGenerations />);
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(events.unlisten).toHaveBeenCalledTimes(1));
  });
});

// --- edge cases ---

describe("RG-2 RecentGenerations edge cases", () => {
  it("filters before capping: 8 media items survive even after leading audio", async () => {
    const audio = Array.from({ length: 5 }, (_, i) => file(100 + i, "audio"));
    tauri.ListLocalMedia.mockResolvedValue([...audio, ...TEN]);
    render(<RecentGenerations />);
    await waitFor(() => expect(tilePaths()).toEqual(TEN.slice(0, 8).map((f) => f.path)));
  });

  it("shows exactly 8 when given exactly 8, and all when fewer", async () => {
    tauri.ListLocalMedia.mockResolvedValue(TEN.slice(0, 8));
    const { unmount } = render(<RecentGenerations />);
    await waitFor(() => expect(tilePaths()).toHaveLength(8));
    unmount();
    tauri.ListLocalMedia.mockResolvedValue(TEN.slice(0, 3));
    render(<RecentGenerations />);
    await waitFor(() => expect(tilePaths()).toEqual(TEN.slice(0, 3).map((f) => f.path)));
  });

  it("only audio/other kinds shows the empty state", async () => {
    tauri.ListLocalMedia.mockResolvedValue([file(0, "audio"), file(1, "model")]);
    render(<RecentGenerations />);
    expect(await screen.findByText(/generate an image or video/i)).toBeTruthy();
    expect(tilePaths()).toEqual([]);
  });

  it("does not show the empty state once items are loaded", async () => {
    render(<RecentGenerations />);
    await screen.findAllByTestId("tile");
    expect(screen.queryByText(/generate an image or video/i)).toBeNull();
  });

  it("a failing reload after a good load falls back to the empty state", async () => {
    render(<RecentGenerations />);
    await waitFor(() => expect(tilePaths()).toHaveLength(8));
    tauri.ListLocalMedia.mockRejectedValueOnce(new Error("offline"));
    act(() => events.handlers[0]());
    expect(await screen.findByText(/generate an image or video/i)).toBeTruthy();
    expect(tilePaths()).toEqual([]);
  });

  it("Windows backslash paths give a file-name label and clear lightbox nav", async () => {
    const win = {
      path: "C:\\Users\\me\\Videos\\clip 1.mp4",
      kind: "video",
      size_bytes: 1,
      created_at: "2026-11-01T00:00:00Z",
    };
    tauri.ListLocalMedia.mockResolvedValue([win]);
    g.galleryModalLightboxNavPrev.value = () => undefined;
    g.galleryModalLightboxNavNext.value = () => undefined;
    render(<RecentGenerations />);
    fireEvent.click(await screen.findByTestId("tile"));
    expect(g.galleryModalLightboxImage.value).toMatchObject({
      id: win.path,
      label: "clip 1.mp4",
      thumbnail: `asset://${win.path}`,
      fullImage: `asset://${win.path}`,
      createdAt: win.created_at,
      mediaClass: "video",
    });
    expect(g.galleryModalLightboxMediaId.value).toBe(win.path);
    expect(g.galleryModalLightboxNavPrev.value).toBeNull();
    expect(g.galleryModalLightboxNavNext.value).toBeNull();
  });

  it("image tiles open with mediaClass image", async () => {
    render(<RecentGenerations />);
    const tiles = await screen.findAllByTestId("tile");
    fireEvent.click(tiles[0]);
    expect(g.galleryModalLightboxImage.value.mediaClass).toBe("image");
  });

  it("View all sets the drag-visible flag like the TopBar and does not open the lightbox", async () => {
    g.galleryModalVisibleDuringDrag.value = false;
    render(<RecentGenerations />);
    fireEvent.click(screen.getByRole("button", { name: /view all/i }));
    expect(g.galleryModalVisibleDuringDrag.value).toBe(true);
    expect(g.galleryModalLightboxVisible.value).toBe(false);
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalled());
  });

  it("View all is still offered in the empty state", async () => {
    tauri.ListLocalMedia.mockResolvedValue([]);
    render(<RecentGenerations />);
    await screen.findByText(/generate an image or video/i);
    expect(screen.getByRole("button", { name: /view all/i })).toBeTruthy();
  });

  it("loads favorites once and subscribes once across reloads", async () => {
    render(<RecentGenerations />);
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalledTimes(1));
    act(() => {
      g.libraryRefreshTick.value++;
    });
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalledTimes(2));
    act(() => events.handlers[0]());
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalledTimes(3));
    expect(events.listen).toHaveBeenCalledTimes(1);
    expect(g.favoritesStore.load).toHaveBeenCalledTimes(1);
    expect(events.unlisten).not.toHaveBeenCalled();
  });

  it("unmount is safe when listen rejects (no Tauri runtime)", async () => {
    events.listen.mockImplementation(() => Promise.reject(new Error("no tauri")));
    const { unmount } = render(<RecentGenerations />);
    await waitFor(() => expect(tauri.ListLocalMedia).toHaveBeenCalled());
    expect(() => unmount()).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("a ListLocalMedia result arriving after unmount is ignored without errors", async () => {
    let resolve!: (v: unknown) => void;
    tauri.ListLocalMedia.mockReturnValue(new Promise((r) => (resolve = r)));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = render(<RecentGenerations />);
    unmount();
    await act(async () => {
      resolve(TEN);
    });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("an outdated slow load does not overwrite a newer one", async () => {
    let slow!: (v: unknown) => void;
    tauri.ListLocalMedia.mockReturnValueOnce(new Promise((r) => (slow = r)));
    tauri.ListLocalMedia.mockResolvedValueOnce([file(7)]);
    render(<RecentGenerations />);
    act(() => events.handlers[0]());
    await waitFor(() => expect(tilePaths()).toEqual([file(7).path]));
    await act(async () => {
      slow(TEN);
    });
    expect(tilePaths()).toEqual([file(7).path]);
  });

  it("has no upstream brand leaks in visible text", async () => {
    tauri.ListLocalMedia.mockResolvedValue([]);
    const { container } = render(<RecentGenerations />);
    await screen.findByText(/generate an image or video/i);
    expect(container.textContent).not.toMatch(
      /artcraft|getartcraft|storyteller\.ai|fakeyou|ltx|lightricks/i,
    );
  });
});
