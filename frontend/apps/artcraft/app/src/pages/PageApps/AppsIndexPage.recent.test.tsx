// RG-3: the Home bento mounts "Recent generations" below the app tiles without
// changing any tile (Create, Favorites, Edit).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FullAppItem } from "~/config/appMenu";

const state = vi.hoisted(() => ({
  generate: [] as unknown[],
  edit: [] as unknown[],
  goToApp: null as unknown as (action?: string) => void,
}));
const tauri = vi.hoisted(() => ({ ListLocalMedia: vi.fn() }));
const events = vi.hoisted(() => ({ listen: vi.fn(), unlisten: vi.fn() }));

vi.mock("~/config/appMenu", async () => {
  const { vi: v } = await import("vitest");
  state.goToApp = v.fn();
  return {
    useGenerateApps: () => state.generate,
    useEditApps: () => state.edit,
    getBadgeStyles: () => "",
    goToApp: (action?: string) => state.goToApp(action),
  };
});
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => `asset://${p}` }));
vi.mock("@tauri-apps/api/event", () => ({ listen: events.listen }));
vi.mock("@storyteller/tauri-api", () => tauri);
vi.mock("@storyteller/ui-gallery-modal", async () => {
  const { signal } = await import("@preact/signals-react");
  return {
    favoritesStore: { load: () => undefined, toggle: () => undefined },
    galleryModalLightboxImage: signal<any>(null),
    galleryModalLightboxMediaId: signal<string | null>(null),
    galleryModalLightboxNavNext: signal<any>(null),
    galleryModalLightboxNavPrev: signal<any>(null),
    galleryModalLightboxVisible: signal(false),
    galleryModalVisibleDuringDrag: signal(false),
    galleryModalVisibleViewMode: signal(false),
    libraryRefreshTick: signal(0),
    LocalMediaTile: ({ file }: { file: { path: string } }) => (
      <div data-testid="recent-tile">{file.path}</div>
    ),
  };
});

import * as gallery from "@storyteller/ui-gallery-modal";
import { useTabStore } from "~/pages/Stores/TabState";
import { AppsIndexPage } from "./AppsIndexPage";

// --- constants ---

const HEADING = "Recent generations";
const BRAND_LEAK = /artcraft|getartcraft|storyteller\.ai|fakeyou|\bLTX\b|lightricks/i;
const media = (i: number) => ({
  path: `C:\\Users\\me\\H0x\\out ${i}.png`,
  kind: "image",
  size_bytes: 1,
  created_at: "2026-11-01T00:00:00Z",
});

// --- helpers ---

const app = (id: string, action?: string): FullAppItem =>
  ({
    id,
    label: `${id} label`,
    description: `${id} description`,
    icon: () => null,
    action,
  }) as unknown as FullAppItem;

const recentSection = () =>
  screen.getByRole("heading", { level: 2, name: HEADING }).closest("section") as HTMLElement;

/** App tiles = every button outside the Recent generations section. */
const tileButtons = () => {
  const recent = recentSection();
  return screen.getAllByRole("button").filter((b) => !recent.contains(b));
};

const g = gallery as any;

beforeEach(() => {
  state.generate = [app("image", "IMAGE"), app("video", "VIDEO"), app("soon")];
  state.edit = [app("edit-2d", "2D")];
  events.listen.mockResolvedValue(events.unlisten);
  tauri.ListLocalMedia.mockReset().mockResolvedValue([]);
  g.galleryModalVisibleViewMode.value = false;
  g.galleryModalVisibleDuringDrag.value = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- tests ---

describe("RG-3 Home mounts Recent generations", () => {
  it("shows exactly one Recent generations heading", () => {
    render(<AppsIndexPage />);
    expect(screen.getAllByRole("heading", { name: HEADING })).toHaveLength(1);
  });

  it("places the section inside main, after the Edit tiles, full width", () => {
    render(<AppsIndexPage />);
    const main = screen.getByRole("main");
    const section = recentSection();
    expect(main.contains(section)).toBe(true);
    const edit = screen.getByRole("heading", { level: 2, name: "Edit" });
    // Recent generations follows the Edit section in document order.
    expect(edit.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.className).toContain("col-span-full");
  });

  it("keeps the hero as the only h1", () => {
    render(<AppsIndexPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows the empty state when the library is empty", async () => {
    render(<AppsIndexPage />);
    expect(await within(recentSection()).findByText(/Nothing here yet/)).toBeTruthy();
  });

  it("still renders the tiles and empty state when listing media fails (offline)", async () => {
    tauri.ListLocalMedia.mockRejectedValue(new Error("offline"));
    render(<AppsIndexPage />);
    expect(await within(recentSection()).findByText(/Nothing here yet/)).toBeTruthy();
    expect(tileButtons()).toHaveLength(state.generate.length + state.edit.length + 1);
  });

  it("lists recent media with Windows paths inside the section only", async () => {
    tauri.ListLocalMedia.mockResolvedValue([media(1), media(2)]);
    render(<AppsIndexPage />);
    await waitFor(() => expect(screen.getAllByTestId("recent-tile")).toHaveLength(2));
    for (const t of screen.getAllByTestId("recent-tile")) {
      expect(recentSection().contains(t)).toBe(true);
    }
    expect(screen.getByText("C:\\Users\\me\\H0x\\out 1.png")).toBeTruthy();
  });

  it("View all opens the library, not an app or tab", () => {
    const setActiveTab = vi.fn();
    vi.spyOn(useTabStore, "getState").mockReturnValue({
      ...useTabStore.getState(),
      setActiveTab,
    });
    render(<AppsIndexPage />);
    fireEvent.click(within(recentSection()).getByRole("button", { name: /view all/i }));
    expect(g.galleryModalVisibleViewMode.value).toBe(true);
    expect(state.goToApp).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});

describe("RG-3 existing Home tiles are unchanged", () => {
  it("renders every app tile plus Favorites, none inside the Recent section", () => {
    render(<AppsIndexPage />);
    const tiles = tileButtons();
    expect(tiles).toHaveLength(state.generate.length + state.edit.length + 1);
    for (const t of tiles) expect(t.className).toContain("rounded-tile");
    for (const a of [...state.generate, ...state.edit] as FullAppItem[]) {
      expect(screen.getByRole("button", { name: new RegExp(a.label) })).toBeTruthy();
    }
  });

  it("app tiles still navigate via goToApp", () => {
    render(<AppsIndexPage />);
    fireEvent.click(screen.getByRole("button", { name: /image label/ }));
    fireEvent.click(screen.getByRole("button", { name: /edit-2d label/ }));
    expect(state.goToApp).toHaveBeenCalledWith("IMAGE");
    expect(state.goToApp).toHaveBeenCalledWith("2D");
  });

  it("tiles without an action stay disabled", () => {
    render(<AppsIndexPage />);
    const soon = screen.getByRole("button", { name: /soon label/ }) as HTMLButtonElement;
    expect(soon.disabled).toBe(true);
  });

  it("Favorites tile still opens the FAVORITES tab", () => {
    const setActiveTab = vi.fn();
    vi.spyOn(useTabStore, "getState").mockReturnValue({
      ...useTabStore.getState(),
      setActiveTab,
    });
    render(<AppsIndexPage />);
    const fav = screen.getAllByRole("button", { name: /favorites/i });
    expect(fav).toHaveLength(1);
    fireEvent.click(fav[0]);
    expect(setActiveTab).toHaveBeenCalledWith("FAVORITES");
  });

  it("with no apps configured shows only Favorites and Recent generations", () => {
    state.generate = [];
    state.edit = [];
    render(<AppsIndexPage />);
    expect(tileButtons()).toHaveLength(1);
    expect(screen.getByRole("heading", { name: HEADING })).toBeTruthy();
  });
});

describe("RG-3 branding", () => {
  it("Home text has no upstream brand names", async () => {
    const { container } = render(<AppsIndexPage />);
    await within(recentSection()).findByText(/Nothing here yet/);
    expect(container.textContent ?? "").not.toMatch(BRAND_LEAK);
  });
});
