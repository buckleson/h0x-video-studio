// A3d: the provider priority list shows neutral inline icons (no logo files)
// and tolerates stale or empty backend orderings.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERIC_ICON_PATH } from "@storyteller/model-list";
import { ProviderPrioritySettingsPane } from "./ProviderPrioritySettingsPane";

const api = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock("@storyteller/tauri-api", () => ({
  GetProviderOrder: api.get,
  SetProviderOrder: api.set,
  Provider: { ArtCraft: "artcraft", Fal: "fal" },
}));

// --- helpers ---

const FORBIDDEN_SRC = /images[\\/]services|images%2Fservices|\.svg$|\.png$/i;

const order = (providers: string[]) =>
  api.get.mockResolvedValue({ payload: { providers } });

const rowNames = () =>
  screen.getAllByText(/^(H0x Video Studio|Fal)$/).map((el) => el.textContent);

const icons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("img"));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  api.get.mockReset();
  api.set.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProviderPrioritySettingsPane icons", () => {
  it("renders one inline data: icon per provider, none from images/services", async () => {
    order(["fal", "artcraft"]);
    const { container } = render(<ProviderPrioritySettingsPane />);
    await waitFor(() => expect(icons(container)).toHaveLength(2));
    for (const img of icons(container)) {
      const src = img.getAttribute("src")!;
      expect(src.startsWith("data:image/svg+xml,")).toBe(true);
      expect(src).not.toMatch(FORBIDDEN_SRC);
      expect(src).not.toBe(GENERIC_ICON_PATH);
    }
    expect(rowNames()).toEqual(["Fal", "H0x Video Studio"]);
  });

  it("an empty backend order still lists every provider with an icon", async () => {
    order([]);
    const { container } = render(<ProviderPrioritySettingsPane />);
    await waitFor(() => expect(icons(container)).toHaveLength(2));
    expect(rowNames()).toEqual(["H0x Video Studio", "Fal"]);
  });

  it("gives the two providers different badges", async () => {
    order([]);
    const { container } = render(<ProviderPrioritySettingsPane />);
    await waitFor(() => expect(icons(container)).toHaveLength(2));
    const [a, b] = icons(container).map((i) => i.getAttribute("src"));
    expect(a).not.toBe(b);
  });

  it("no visible text or icon mentions LTX or Lightricks", async () => {
    order([]);
    const { container } = render(<ProviderPrioritySettingsPane />);
    await waitFor(() => expect(icons(container)).toHaveLength(2));
    const srcs = icons(container).map((i) => decodeURIComponent(i.getAttribute("src")!));
    const alts = icons(container).map((i) => i.getAttribute("alt"));
    expect([container.textContent, ...srcs, ...alts].join(" ")).not.toMatch(/LTX|Lightricks/i);
  });
});
