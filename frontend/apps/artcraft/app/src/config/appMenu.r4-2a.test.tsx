// R4-2a edge cases for the app menu config: every app icon is a Phosphor icon
// that actually draws something (no blank icons), and no green/lime/emerald/teal
// tint is left next to the orange (dark) / violet (light) accent.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as Phosphor from "@phosphor-icons/react";

vi.mock("@storyteller/ui-settings-modal", () => ({
  useStoryboardPageEnabled: () => true,
  useExperimentalStore: { getState: () => ({ enabled: true, storyboardPageEnabled: true }) },
}));

import {
  ALL_APPS,
  APP_DESCRIPTORS,
  getAppCardPalette,
  getBadgeStyles,
} from "./appMenu";

// --- constants ---

const SRC = readFileSync(path.join(__dirname, "appMenu.tsx"), "utf8").replace(/\r\n/g, "\n");
const GREEN_TINT = /\b(?:emerald|lime|green|teal)-\d{2,3}\b/;
const PHOSPHOR_EXPORTS = new Set(
  Object.values(Phosphor).filter((v) => typeof v === "object" || typeof v === "function"),
);
const FALLBACK = getAppCardPalette("__no_such_app__");
const PRIMARY_TINTED = ["background-change", "angles"];

afterEach(cleanup);

// --- tests ---

describe("R4-2a appMenu: icons are Phosphor", () => {
  it("has no lucide-react import", () => {
    expect(SRC).not.toMatch(/from\s+["']lucide-react["']/);
    expect(SRC).not.toMatch(/DynamicIcon/);
  });

  it("imports every *Icon from @phosphor-icons/react and each one exists", () => {
    const m = SRC.match(/import\s*\{([^}]*)\}\s*from\s*["']@phosphor-icons\/react["']/);
    expect(m).not.toBeNull();
    const names = m![1].split(",").map((s) => s.trim()).filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect((Phosphor as Record<string, unknown>)[n], n).toBeTruthy();
    }
  });

  it.each(ALL_APPS.map((a) => [a.id, a] as const))(
    "app %s uses a Phosphor icon component",
    (_id, app) => {
      expect(app.icon).toBeTruthy();
      expect(PHOSPHOR_EXPORTS.has(app.icon)).toBe(true);
    },
  );

  it.each(APP_DESCRIPTORS.map((d) => [d.id, d] as const))(
    "top-bar descriptor %s uses a Phosphor icon component",
    (_id, d) => {
      expect(PHOSPHOR_EXPORTS.has(d.icon)).toBe(true);
    },
  );

  it.each(["duotone", "regular"] as const)(
    "every app icon renders a non-empty svg with weight=%s",
    (weight) => {
      for (const app of [...ALL_APPS, ...APP_DESCRIPTORS]) {
        const { container, unmount } = render(<app.icon weight={weight} />);
        const svg = container.querySelector("svg");
        expect(svg, app.id).not.toBeNull();
        expect(svg!.querySelectorAll("path").length, app.id).toBeGreaterThan(0);
        const d = Array.from(svg!.querySelectorAll("path"))
          .map((p) => p.getAttribute("d") ?? "")
          .join("");
        expect(d.length, app.id).toBeGreaterThan(10);
        unmount();
      }
    },
  );

  it("passes className through to the rendered icon", () => {
    const Icon = ALL_APPS[0].icon;
    const { container } = render(<Icon weight="duotone" className="text-xl" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("text-xl");
  });
});

describe("R4-2a appMenu: cohesive tints", () => {
  it("has no emerald/lime/green/teal class anywhere in the source", () => {
    expect(SRC).not.toMatch(GREEN_TINT);
  });

  it.each(ALL_APPS.map((a) => [a.id, a] as const))(
    "app %s has no green legacy colour or palette class",
    (id, app) => {
      const p = getAppCardPalette(id);
      const all = [app.color ?? "", p.accent, p.iconBg, p.iconColor, p.hoverStyle].join(" ");
      expect(all).not.toMatch(GREEN_TINT);
    },
  );

  it("gives every real app its own palette (none falls back to neutral)", () => {
    for (const app of ALL_APPS) {
      expect(getAppCardPalette(app.id), app.id).not.toBe(FALLBACK);
    }
  });

  it.each(PRIMARY_TINTED)("%s uses the theme primary tint, not a fixed hue", (id) => {
    const p = getAppCardPalette(id);
    expect(p.iconColor).toBe("text-primary");
    expect(p.iconBg).toMatch(/\bbg-primary\//);
    expect(p.iconBg).toMatch(/\bborder-primary\//);
    expect(p.hoverStyle).toMatch(/hover:border-primary\//);
  });

  it("every palette keeps all four fields filled", () => {
    for (const app of ALL_APPS) {
      const p = getAppCardPalette(app.id);
      for (const v of [p.accent, p.iconBg, p.iconColor, p.hoverStyle]) {
        expect(v.trim(), app.id).not.toBe("");
      }
    }
  });

  it("falls back to the neutral palette for unknown, empty and odd ids", () => {
    for (const id of ["", "unknown", "TEXT-TO-IMAGE", "C:\\apps\\angles", "__proto__x"]) {
      const p = getAppCardPalette(id);
      expect(p).toBe(FALLBACK);
    }
    expect(FALLBACK.iconColor).toBe("text-base-fg");
    expect(FALLBACK.iconBg).not.toMatch(GREEN_TINT);
  });

  it("badge styles carry no green and unknown badges are unstyled", () => {
    for (const b of ["NEW", "BEST", "SOON", "BETA"]) {
      expect(getBadgeStyles(b)).not.toMatch(GREEN_TINT);
      expect(getBadgeStyles(b)).not.toBe("");
    }
    expect(getBadgeStyles(undefined)).toBe("");
    expect(getBadgeStyles("")).toBe("");
    expect(getBadgeStyles("new")).toBe("");
  });
});

describe("R4-2a appMenu: branding", () => {
  it("no user-visible label or description leaks old brand names", () => {
    const text = [...ALL_APPS, ...APP_DESCRIPTORS]
      .map((a) => `${a.label} ${a.description ?? ""}`)
      .join(" ");
    expect(text).not.toMatch(/art\s*craft|getartcraft|storyteller|fakeyou|\bltx\b|lightricks/i);
  });
});
