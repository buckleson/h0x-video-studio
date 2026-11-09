// FAV-7: the Home bento has a Favorites tile that opens the lazy Favorites page.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("./RecentGenerations", () => ({ RecentGenerations: () => null }));
vi.mock("@storyteller/ui-settings-modal", () => ({
  useStoryboardPageEnabled: () => true,
  useExperimentalStore: { getState: () => ({ enabled: true, storyboardPageEnabled: true }) },
}));

import { AppsIndexPage } from "./AppsIndexPage";
import { useTabStore } from "~/pages/Stores/TabState";

// --- constants ---

const MAIN_APP = readFileSync(path.resolve(__dirname, "../MainApp.tsx"), "utf8");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- tests ---

describe("FAV-7 Home Favorites tile", () => {
  it("renders one enabled Favorites tile", () => {
    render(<AppsIndexPage />);
    const tiles = screen.getAllByRole("button", { name: /favorites/i });
    expect(tiles).toHaveLength(1);
    expect((tiles[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens the FAVORITES tab on click", () => {
    const setActiveTab = vi.fn();
    vi.spyOn(useTabStore, "getState").mockReturnValue({
      ...useTabStore.getState(),
      setActiveTab,
    });
    render(<AppsIndexPage />);
    fireEvent.click(screen.getByRole("button", { name: /favorites/i }));
    expect(setActiveTab).toHaveBeenCalledWith("FAVORITES");
  });
});

describe("FAV-7 Favorites page is lazy-loaded", () => {
  it("MainApp lazy-imports PageFavorites and routes the FAVORITES tab to it", () => {
    expect(MAIN_APP).toContain('lazy(() => import("./PageFavorites/PageFavorites"))');
    expect(MAIN_APP).toMatch(/case "FAVORITES":/);
    expect(MAIN_APP).not.toMatch(/^import .*PageFavorites/m);
  });
});
