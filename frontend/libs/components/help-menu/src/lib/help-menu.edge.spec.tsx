// R1 B3 edge cases: the help menu offers only Tutorials and GitHub. News,
// Discord, YouTube channel and vendor links are hidden, nothing is fetched
// from getartcraft.com on mount, and GitHub opens the H0x repo.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HelpMenuButton from "./help-menu";

// --- constants ---

const VENDOR_TEXT = /news|discord|youtube|twitter|\bX\b|artcraft|storyteller|lightricks|\bltx\b/i;
const VENDOR_URL = /getartcraft|discord|youtube\.com\/@|twitter\.com|\/\/x\.com|storytold|storyteller\.ai/i;

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));

vi.mock("@storyteller/tauri-api", () => ({ OpenUrl: openUrl }));
vi.mock("@storyteller/icons", () => ({ GithubIcon: () => null }));
vi.mock("@storyteller/markdown-content", () => ({
  getNewsPosts: () => [],
  markdownToHtml: (s: string) => s,
}));
vi.mock("@storyteller/ui-modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
// Flatten the popover: every item becomes a button that calls onSelect.
vi.mock("@storyteller/ui-popover", () => ({
  PopoverMenu: ({
    items,
    onSelect,
  }: {
    items: { label: string; action?: string }[];
    onSelect: (i: { label: string; action?: string }) => void;
  }) => (
    <ul>
      {items.map((i) => (
        <li key={i.label}>
          <button onClick={() => onSelect(i)}>{i.label}</button>
        </li>
      ))}
    </ul>
  ),
}));

beforeEach(() => {
  openUrl.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// --- cases ---

describe("help menu (B3 edge)", () => {
  it("lists exactly Tutorials and GitHub", () => {
    render(<HelpMenuButton />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Tutorials", "GitHub"]);
  });

  it("has no News, Discord, YouTube, X or vendor entries", () => {
    const { container } = render(<HelpMenuButton />);
    expect(container.textContent).not.toMatch(VENDOR_TEXT);
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toMatch(VENDOR_URL);
    }
  });

  it("GitHub opens the H0x repo, not the upstream one", () => {
    render(<HelpMenuButton />);
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith("https://github.com/buckleson/h0x-video-studio");
  });

  it("Tutorials opens the in-app panel without opening any external URL", () => {
    render(<HelpMenuButton />);
    fireEvent.click(screen.getByRole("button", { name: "Tutorials" }));
    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not fetch remote news when mounted (offline-safe)", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    render(<HelpMenuButton />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
