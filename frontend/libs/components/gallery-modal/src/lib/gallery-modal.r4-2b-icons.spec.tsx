// R4-2b: the My Library sidebar filters and toolbar render Phosphor icons
// (no Lucide svg), at the 1.2em box, and keep their labels and handlers.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { FoldersApi, TagsApi, UsersApi } from "@storyteller/api";

import { favoritePaths, favoritesStore } from "./favoritesStore";
import GalleryModal from "./gallery-modal";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

// --- constants ---

const FILTER_LABELS = [
  "All Assets",
  "Image",
  "Video",
  "Audio",
  "Mesh",
  "Splat",
  "Uploaded",
];

// --- helpers ---

// The sidebar filter button whose text is exactly `label`.
function filterButton(label: string): HTMLButtonElement {
  const matches = screen
    .getAllByRole("button")
    .filter((b) => b.textContent?.trim() === label && b.querySelector("svg"));
  expect(matches.length, label).toBeGreaterThan(0);
  return matches[0] as HTMLButtonElement;
}

function expectPhosphorSvg(el: Element, what: string) {
  const svg = el.querySelector("svg");
  expect(svg, what).not.toBeNull();
  expect(svg!.getAttribute("class") ?? "", what).not.toMatch(/\blucide\b/);
  expect(svg!.getAttribute("width"), what).toBe("1.2em");
}

// --- tests ---

describe("R4-2b My Library icons", () => {
  beforeEach(() => {
    // Files share one fork; start from an empty body so stray portals from other files never match.
    cleanup();
    document.body.innerHTML = "";
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue([]);
    favoritePaths.value = new Set();
    vi.spyOn(favoritesStore, "load").mockResolvedValue();
    vi.spyOn(FoldersApi.prototype, "ListAllFolders").mockResolvedValue({
      success: true,
      data: [],
    } as any);
    vi.spyOn(TagsApi.prototype, "ListTags").mockResolvedValue({
      success: true,
      data: [],
    } as any);
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
      success: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("every sidebar filter shows one Phosphor icon at 1.2em", async () => {
    render(<GalleryModal mode="select" isOpen />);
    await screen.findAllByText("All Assets");
    for (const label of FILTER_LABELS) {
      const b = filterButton(label);
      expect(b.querySelectorAll("svg"), label).toHaveLength(1);
      expectPhosphorSvg(b, label);
    }
  });

  it("each sidebar filter uses a different glyph (meaning kept per filter)", async () => {
    render(<GalleryModal mode="select" isOpen />);
    await screen.findAllByText("All Assets");
    const glyphs = FILTER_LABELS.map(
      (l) => filterButton(l).querySelector("svg")!.innerHTML,
    );
    expect(new Set(glyphs).size).toBe(FILTER_LABELS.length);
  });

  // The onClick={refreshGallery} wiring is checked in brand-check/r4-2b.
  it("refresh button keeps its aria-label and Phosphor icon through a click", async () => {
    render(<GalleryModal mode="select" isOpen />);
    const refresh = await screen.findByRole("button", { name: "Refresh list" });
    expectPhosphorSvg(refresh, "refresh");
    await waitFor(() => expect((refresh as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(refresh);
    const after = await screen.findByRole("button", { name: "Refresh list" });
    expectPhosphorSvg(after, "refresh after click");
  });

  it("image-fit toggle swaps between two Phosphor glyphs", async () => {
    render(<GalleryModal mode="select" isOpen />);
    const refresh = await screen.findByRole("button", { name: "Refresh list" });
    // The fit toggle is the toolbar button right after refresh.
    const buttons = screen.getAllByRole("button");
    const fit = buttons[buttons.indexOf(refresh as HTMLButtonElement) + 1];
    expectPhosphorSvg(fit, "fit toggle");
    const before = fit.querySelector("svg")!.innerHTML;
    fireEvent.click(fit);
    await waitFor(() =>
      expect(fit.querySelector("svg")!.innerHTML).not.toBe(before),
    );
    expectPhosphorSvg(fit, "fit toggle after click");
    fireEvent.click(fit);
    await waitFor(() => expect(fit.querySelector("svg")!.innerHTML).toBe(before));
  });

  it("clicking a filter still switches the active filter", async () => {
    render(<GalleryModal mode="select" isOpen />);
    await screen.findAllByText("All Assets");
    const audio = filterButton("Audio");
    expect(audio.className).not.toContain("font-medium");
    fireEvent.click(audio);
    await waitFor(() => expect(filterButton("Audio").className).toContain("font-medium"));
  });
});
