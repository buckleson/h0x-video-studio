// R4-2a edge cases for the Home hover menu: Phosphor icons render in rounded
// chips, items and badges use the shared radius scale, handlers still work.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FullAppItem } from "~/config/appMenu";

const state = vi.hoisted(() => ({
  generate: null as unknown as unknown[] | null,
  edit: null as unknown as unknown[] | null,
  goToApp: null as unknown as (action?: string) => void,
}));

vi.mock("@storyteller/ui-settings-modal", () => ({
  useStoryboardPageEnabled: () => true,
  useExperimentalStore: { getState: () => ({ enabled: true, storyboardPageEnabled: true }) },
}));

// Real config (real Phosphor icons and palettes); only the app lists and the
// navigation side effect can be swapped per test.
vi.mock("~/config/appMenu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/config/appMenu")>();
  const { vi: v } = await import("vitest");
  state.goToApp = v.fn();
  return {
    ...actual,
    useGenerateApps: () => state.generate ?? actual.GENERATE_APPS,
    useEditApps: () => state.edit ?? actual.EDIT_APPS,
    goToApp: (action?: string) => state.goToApp(action),
  };
});

import { ALL_APPS, getAppCardPalette } from "~/config/appMenu";
import { AppsQuickMenu } from "./AppsQuickMenu";

// --- constants ---

const SRC = readFileSync(path.join(__dirname, "AppsQuickMenu.tsx"), "utf8");
const classesOf = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
const item = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}`) }) as HTMLButtonElement;
const chipOf = (button: Element) => button.querySelector("svg")!.parentElement!;

beforeEach(() => {
  state.generate = null;
  state.edit = null;
  (state.goToApp as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(cleanup);

// --- tests ---

describe("R4-2a AppsQuickMenu: source", () => {
  it("has no lucide-react import or DynamicIcon", () => {
    expect(SRC).not.toMatch(/lucide-react/);
    expect(SRC).not.toMatch(/DynamicIcon/);
  });

  it("has no green/lime/emerald/teal tint", () => {
    expect(SRC).not.toMatch(/\b(?:emerald|lime|green|teal)-\d{2,3}\b/);
  });
});

describe("R4-2a AppsQuickMenu: icons render", () => {
  it("renders a non-empty duotone svg for every real app", () => {
    render(<AppsQuickMenu />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const svg = b.querySelector("svg");
      expect(svg, b.textContent ?? "").not.toBeNull();
      expect(svg!.querySelectorAll("path").length).toBeGreaterThan(0);
      // Duotone draws a translucent back layer.
      expect(svg!.querySelector("[opacity]"), b.textContent ?? "").not.toBeNull();
    }
  });

  it("puts each icon in a rounded-lg 36px chip with that app's palette", () => {
    render(<AppsQuickMenu />);
    const shown = [...(ALL_APPS as FullAppItem[])].filter((a) => {
      return screen.queryAllByRole("button", { name: new RegExp(`^${a.label}`) }).length;
    });
    expect(shown.length).toBeGreaterThan(0);
    for (const a of shown) {
      const button = screen
        .getAllByRole("button", { name: new RegExp(`^${a.label}`) })
        .find((b) => b.textContent?.includes(a.description))!;
      const chip = classesOf(chipOf(button));
      expect(chip).toEqual(expect.arrayContaining(["rounded-lg", "h-9", "w-9", "shrink-0"]));
      const p = getAppCardPalette(a.id);
      for (const c of `${p.iconBg} ${p.iconColor}`.split(/\s+/)) {
        expect(chip, `${a.id}: ${c}`).toContain(c);
      }
    }
  });
});

describe("R4-2a AppsQuickMenu: rounded corners and spacing", () => {
  it("every item is rounded-xl with a 1px border that only shows on hover", () => {
    render(<AppsQuickMenu />);
    for (const b of screen.getAllByRole("button")) {
      const c = classesOf(b);
      expect(c).toEqual(expect.arrayContaining(["rounded-xl", "border", "border-transparent"]));
      expect(c).not.toContain("rounded");
      expect(c).not.toContain("rounded-md");
    }
  });

  it("enabled items get the hover border; disabled items do not", () => {
    render(<AppsQuickMenu />);
    for (const b of screen.getAllByRole("button") as HTMLButtonElement[]) {
      const c = classesOf(b);
      if (b.disabled) {
        expect(c).not.toContain("hover:border-white/10");
        expect(c).toContain("opacity-60");
      } else {
        expect(c).toContain("hover:border-white/10");
        expect(c).toContain("cursor-pointer");
      }
    }
  });

  it("badges are rounded-full pills", () => {
    render(<AppsQuickMenu />);
    const badged = (ALL_APPS as FullAppItem[]).filter(
      (a) => a.badge && screen.queryAllByText(a.label).length,
    );
    expect(badged.length).toBeGreaterThan(0);
    for (const a of badged) {
      const badge = within(item(a.label)).getByText(a.badge!);
      expect(classesOf(badge)).toContain("rounded-full");
    }
  });

  it("lays out Create and Edit side by side with equal gaps", () => {
    const { container } = render(<AppsQuickMenu />);
    const root = container.firstElementChild!;
    expect(classesOf(root)).toEqual(expect.arrayContaining(["grid", "grid-cols-2", "gap-3"]));
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Create", "Edit"]);
  });
});

describe("R4-2a AppsQuickMenu: behaviour kept", () => {
  it("calls goToApp with the action on click", () => {
    render(<AppsQuickMenu />);
    fireEvent.click(item("Create Image"));
    expect(state.goToApp).toHaveBeenCalledWith("IMAGE");
  });

  it("disables SOON apps without an action and does not navigate", () => {
    render(<AppsQuickMenu />);
    const b = item("Video Watermark Remover");
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(state.goToApp).not.toHaveBeenCalled();
  });

  it("renders with empty lists without crashing", () => {
    state.generate = [];
    state.edit = [];
    render(<AppsQuickMenu />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Create")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("uses the neutral fallback chip for an unknown app id", () => {
    const Icon = (ALL_APPS[0] as FullAppItem).icon;
    state.generate = [
      { id: "mystery", label: "Mystery", description: "d", icon: Icon, category: "generate", action: "IMAGE" },
    ];
    state.edit = [];
    render(<AppsQuickMenu />);
    const chip = classesOf(chipOf(item("Mystery")));
    expect(chip).toEqual(expect.arrayContaining(["bg-ui-controls", "text-base-fg", "rounded-lg"]));
  });

  it("shows no old brand names", () => {
    const { container } = render(<AppsQuickMenu />);
    expect(container.textContent).not.toMatch(
      /art\s*craft|getartcraft|storyteller|fakeyou|\bltx\b|lightricks/i,
    );
  });
});
