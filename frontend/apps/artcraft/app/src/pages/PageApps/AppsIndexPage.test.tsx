import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { FullAppItem } from "~/config/appMenu";

const { generateApps, editApps } = vi.hoisted(() => {
  const app = (id: string, action?: string, badge?: string) =>
    ({
      id,
      label: `${id} label`,
      description: `${id} description`,
      icon: () => null,
      action,
      badge,
    }) as unknown as FullAppItem;
  return {
    generateApps: [
      app("image", "IMAGE", "NEW"),
      app("video", "VIDEO"),
      app("audio", "AUDIO"),
      app("soon"),
    ],
    editApps: [app("edit-2d", "2D"), app("edit-3d", undefined, "SOON")],
  };
});

vi.mock("./RecentGenerations", () => ({ RecentGenerations: () => null }));
vi.mock("~/config/appMenu", () => ({
  useGenerateApps: () => generateApps,
  useEditApps: () => editApps,
  getBadgeStyles: () => "",
  goToApp: vi.fn(),
}));


import { AppsIndexPage } from "./AppsIndexPage";

afterEach(cleanup);

describe("AppsIndexPage bento", () => {
  it("renders the hero with heading, subline and mark", () => {
    const { container } = render(<AppsIndexPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "What will you create today?" }),
    ).toBeTruthy();
    expect(screen.getByText(/Choose a tool to bring it to life/)).toBeTruthy();
    expect(
      container.querySelector('img[src="/resources/logo/h0x-icon.png"]'),
    ).not.toBeNull();
  });

  it("renders every app as a rounded-tile button", () => {
    render(<AppsIndexPage />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(generateApps.length + editApps.length + 1); // +1 = Favorites tile
    for (const app of [...generateApps, ...editApps]) {
      const button = screen.getByRole("button", { name: new RegExp(app.label) });
      expect(button.className).toContain("rounded-tile");
    }
  });

  it("makes the first two Create apps wide tiles", () => {
    render(<AppsIndexPage />);
    const spans = generateApps.map((app) =>
      screen
        .getByRole("button", { name: new RegExp(app.label) })
        .className.includes("col-span-2"),
    );
    expect(spans).toEqual([true, true, false, false]);
  });

  it("disables apps without an action", () => {
    render(<AppsIndexPage />);
    for (const app of [...generateApps, ...editApps]) {
      const button = screen.getByRole("button", {
        name: new RegExp(app.label),
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(!app.action);
    }
  });
});
