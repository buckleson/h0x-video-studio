import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FullAppItem } from "~/config/appMenu";

// Edge cases for C3 (bento start screen). Mock data is mutable per test.
const state = vi.hoisted(() => ({
  generate: [] as unknown[],
  edit: [] as unknown[],
  goToApp: null as unknown as (action?: string) => void,
}));

vi.mock("./RecentGenerations", () => ({ RecentGenerations: () => null }));
vi.mock("~/config/appMenu", async () => {
  const { vi: v } = await import("vitest");
  state.goToApp = v.fn();
  return {
    useGenerateApps: () => state.generate,
    useEditApps: () => state.edit,
    getBadgeStyles: (badge?: string) => (badge === "SOON" ? "badge-soon" : ""),
    goToApp: (action?: string) => state.goToApp(action),
  };
});

// Tiles render the app's Phosphor icon component directly.
const TestIcon = () => <i data-testid="icon" />;

import { AppsIndexPage } from "./AppsIndexPage";

const app = (
  id: string,
  action?: string,
  badge?: string,
): FullAppItem =>
  ({
    id,
    label: `${id} label`,
    description: `${id} description`,
    icon: TestIcon,
    action,
    badge,
  }) as unknown as FullAppItem;

const tile = (label: string) =>
  screen.getByRole("button", { name: new RegExp(label) }) as HTMLButtonElement;

const TILE_CLASSES = [
  "rounded-tile",
  "border",
  "border-ui-border",
  "bg-ui-panel",
  "shadow-sm",
  "hover:-translate-y-0.5",
  "hover:shadow-md",
  "transition",
];

const GRID_CLASSES = [
  "grid",
  "grid-cols-2",
  "md:grid-cols-4",
  "auto-rows-[minmax(140px,auto)]",
  "grid-flow-dense",
  "gap-3",
];

const classesOf = (el: Element) => el.className.split(/\s+/);

beforeEach(() => {
  state.generate = [
    app("image", "IMAGE", "NEW"),
    app("video", "VIDEO"),
    app("audio", "AUDIO"),
    app("soon", undefined, "SOON"),
  ];
  state.edit = [app("edit-2d", "2D"), app("edit-3d", undefined, "SOON")];
  (state.goToApp as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(cleanup);

describe("AppsIndexPage bento: grid layout", () => {
  it("uses one main grid with every required grid class", () => {
    const { container } = render(<AppsIndexPage />);
    const main = container.querySelector("main")!;
    expect(main).not.toBeNull();
    expect(classesOf(main)).toEqual(expect.arrayContaining(GRID_CLASSES));
  });

  it("puts the hero as the first grid child with col-span-2 row-span-2", () => {
    const { container } = render(<AppsIndexPage />);
    const hero = container.querySelector("main")!.firstElementChild!;
    expect(classesOf(hero)).toEqual(
      expect.arrayContaining(["col-span-2", "row-span-2", "rounded-tile"]),
    );
    expect(within(hero as HTMLElement).getByRole("heading", { level: 1 }).textContent)
      .toMatch(/What will you\s+create\s+today\?/);
    const img = hero.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/resources/logo/h0x-icon.png");
    expect(img.getAttribute("alt")).toBeTruthy();
  });

  it("places the Edit group after all Create tiles, in the same grid style", () => {
    render(<AppsIndexPage />);
    const editHeading = screen.getByRole("heading", { level: 2, name: "Edit" });
    const lastCreate = tile("soon label");
    const firstEdit = tile("edit-2d label");
    // Edit heading follows the last Create tile in document order.
    expect(
      lastCreate.compareDocumentPosition(editHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(classesOf(firstEdit.parentElement!)).toEqual(
      expect.arrayContaining(GRID_CLASSES),
    );
    expect(classesOf(editHeading.closest("section")!)).toContain("col-span-full");
  });

  it("never makes Edit tiles wide", () => {
    render(<AppsIndexPage />);
    for (const a of state.edit as FullAppItem[]) {
      expect(classesOf(tile(a.label))).not.toContain("col-span-2");
    }
  });

  it("with a single Create app, only that one is wide and nothing crashes", () => {
    state.generate = [app("solo", "IMAGE")];
    render(<AppsIndexPage />);
    expect(classesOf(tile("solo label"))).toContain("col-span-2");
  });
});

describe("AppsIndexPage bento: tile styling", () => {
  it("gives every enabled tile the full tile class set", () => {
    render(<AppsIndexPage />);
    for (const button of screen.getAllByRole("button") as HTMLButtonElement[]) {
      if (button.disabled) continue;
      expect(classesOf(button)).toEqual(expect.arrayContaining(TILE_CLASSES));
    }
  });

  it("keeps the base tile look on disabled tiles but drops the hover lift", () => {
    render(<AppsIndexPage />);
    const base = TILE_CLASSES.filter((c) => !c.startsWith("hover:"));
    for (const label of ["soon label", "edit-3d label"]) {
      const classes = classesOf(tile(label));
      expect(classes).toEqual(expect.arrayContaining(base));
      expect(classes).not.toContain("hover:-translate-y-0.5");
      expect(classes).not.toContain("hover:shadow-md");
    }
  });

  it("renders a primary-tinted icon chip in every tile", () => {
    render(<AppsIndexPage />);
    const configTiles = screen
      .getAllByRole("button")
      .filter((b) => !/Favorites/.test(b.textContent ?? ""));
    for (const button of configTiles) {
      const icon = within(button).getByTestId("icon");
      const chip = icon.parentElement!;
      expect(chip.className).toMatch(/\bbg-primary\//);
      expect(chip.className).toMatch(/\btext-primary\b/);
    }
  });
});

describe("AppsIndexPage bento: behaviour kept from the old page", () => {
  it("calls goToApp with the app action on click", () => {
    render(<AppsIndexPage />);
    fireEvent.click(tile("video label"));
    fireEvent.click(tile("edit-2d label"));
    expect(state.goToApp).toHaveBeenCalledTimes(2);
    expect(state.goToApp).toHaveBeenNthCalledWith(1, "VIDEO");
    expect(state.goToApp).toHaveBeenNthCalledWith(2, "2D");
  });

  it("does not call goToApp when a disabled tile is clicked", () => {
    render(<AppsIndexPage />);
    const soon = tile("soon label");
    expect(soon.disabled).toBe(true);
    fireEvent.click(soon);
    fireEvent.click(tile("edit-3d label"));
    expect(state.goToApp).not.toHaveBeenCalled();
  });

  it("treats an empty-string action as disabled", () => {
    state.generate = [app("blank", "")];
    render(<AppsIndexPage />);
    expect(tile("blank label").disabled).toBe(true);
  });

  it("renders badges, using getBadgeStyles for SOON", () => {
    render(<AppsIndexPage />);
    expect(within(tile("image label")).getByText("NEW")).toBeTruthy();
    const soonBadges = screen.getAllByText("SOON");
    expect(soonBadges).toHaveLength(2);
    for (const badge of soonBadges) expect(badge.className).toContain("badge-soon");
    expect(within(tile("video label")).queryByText(/NEW|SOON/)).toBeNull();
  });

  it("shows each app's label and description", () => {
    render(<AppsIndexPage />);
    for (const a of [...state.generate, ...state.edit] as FullAppItem[]) {
      const button = tile(a.label);
      expect(within(button).getByText(a.description as string)).toBeTruthy();
    }
  });
});

describe("AppsIndexPage bento: empty config", () => {
  it("still renders the hero and only the Favorites tile with no apps", () => {
    state.generate = [];
    state.edit = [];
    render(<AppsIndexPage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    const buttons = screen.queryAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toMatch(/Favorites/);
  });
});

describe("AppsIndexPage bento: branding", () => {
  it("shows no ArtCraft/Storyteller/FakeYou/LTX/Lightricks strings", () => {
    const { container } = render(<AppsIndexPage />);
    const visible = [
      container.textContent ?? "",
      ...Array.from(container.querySelectorAll("img")).map(
        (i) => `${i.getAttribute("alt")} ${i.getAttribute("src")}`,
      ),
    ].join(" ");
    expect(visible).not.toMatch(
      /art\s*craft|getartcraft|storyteller|fakeyou|\bltx\b|lightricks/i,
    );
  });
});
