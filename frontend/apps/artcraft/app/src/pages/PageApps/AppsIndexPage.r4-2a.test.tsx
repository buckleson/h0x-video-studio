// R4-2a edge cases for the Home bento: real Phosphor icons render in every
// tile, the radius scale is consistent (tiles are never less round than the
// rounded-xl chips/buttons inside them), and no lucide or green tint is left.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@storyteller/ui-settings-modal", () => ({
  useStoryboardPageEnabled: () => true,
  useExperimentalStore: { getState: () => ({ enabled: true, storyboardPageEnabled: true }) },
}));

import { AppsIndexPage } from "./AppsIndexPage";

// --- constants ---

const APP_SRC = path.resolve(__dirname, "../..");
const FILES = [
  "components/signaled/TopBar/TopBar.tsx",
  "components/signaled/TopBar/AppsQuickMenu.tsx",
  "pages/PageApps/AppsIndexPage.tsx",
  "config/appMenu.tsx",
];
const read = (rel: string) => readFileSync(path.join(APP_SRC, rel), "utf8").replace(/\r\n/g, "\n");
const BASE_CSS = read("styles/base.css");
const ROUNDED_XL_REM = 0.75; // Tailwind rounded-xl, used by tile chips and top-bar buttons
const classesOf = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

afterEach(cleanup);

// --- tests ---

describe("R4-2a no lucide in the touched files", () => {
  it.each(FILES)("%s imports nothing from lucide-react", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/from\s+["']lucide-react(?:\/[^"']*)?["']/);
    expect(src).not.toMatch(/require\(\s*["']lucide-react/);
    expect(src).not.toMatch(/DynamicIcon/);
  });

  it.each(FILES)("%s has no emerald/lime/green/teal tint", (rel) => {
    expect(read(rel)).not.toMatch(/\b(?:emerald|lime|green|teal)-\d{2,3}\b/);
  });
});

describe("R4-2a Home bento with the real app config", () => {
  it("every tile renders a non-empty duotone Phosphor svg", () => {
    render(<AppsIndexPage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(4);
    for (const b of buttons) {
      const svgs = b.querySelectorAll("svg");
      expect(svgs.length, b.textContent ?? "").toBeGreaterThan(0);
      const appIcon = svgs[0];
      expect(appIcon.querySelectorAll("path").length).toBeGreaterThan(0);
      expect(appIcon.querySelector("[opacity]"), b.textContent ?? "").not.toBeNull();
    }
  });

  it("only enabled tiles show the arrow, and it is a Phosphor svg", () => {
    render(<AppsIndexPage />);
    for (const b of screen.getAllByRole("button") as HTMLButtonElement[]) {
      expect(b.querySelectorAll("svg").length, b.textContent ?? "").toBe(b.disabled ? 1 : 2);
    }
  });

  it("icon chips are rounded-xl and badges are rounded-full", () => {
    render(<AppsIndexPage />);
    for (const b of screen.getAllByRole("button")) {
      const chip = b.querySelector("svg")!.parentElement!;
      expect(classesOf(chip)).toEqual(expect.arrayContaining(["rounded-xl", "border", "h-10", "w-10"]));
    }
    for (const badge of screen.getAllByText(/^(NEW|BETA|SOON|BEST)$/)) {
      expect(classesOf(badge)).toContain("rounded-full");
    }
  });

  it("tiles have a subtle primary hover border, but disabled tiles reset it", () => {
    render(<AppsIndexPage />);
    for (const b of screen.getAllByRole("button") as HTMLButtonElement[]) {
      const c = classesOf(b);
      if (b.disabled) {
        expect(c).toContain("hover:border-ui-border");
        expect(c).not.toContain("hover:border-primary/30");
      } else {
        expect(c).toContain("hover:border-primary/30");
      }
    }
  });

  it("hides Background Change from the desktop Home", () => {
    render(<AppsIndexPage />);
    expect(screen.queryByText("Background Change")).toBeNull();
  });
});

describe("R4-2a radius tokens", () => {
  const radiusIn = (selector: string) => {
    // A selector can open several blocks; use the one that sets the token.
    const re = new RegExp(`^${selector.replace(".", "\\.")}\\s*[,{]`, "gm");
    const blocks = Array.from(BASE_CSS.matchAll(re), (h) =>
      BASE_CSS.slice(h.index!, BASE_CSS.indexOf("}", h.index!)),
    );
    expect(blocks.length, selector).toBeGreaterThan(0);
    const m = blocks
      .map((b) => b.match(/--radius-tile:\s*([\d.]+)rem/))
      .find(Boolean) ?? null;
    expect(m, `${selector} defines --radius-tile in rem`).not.toBeNull();
    return parseFloat(m![1]);
  };

  it.each([":root", ".theme-light"])(
    "%s tiles are at least as round as the rounded-xl chips inside them",
    (selector) => {
      expect(radiusIn(selector)).toBeGreaterThanOrEqual(ROUNDED_XL_REM);
    },
  );
});
