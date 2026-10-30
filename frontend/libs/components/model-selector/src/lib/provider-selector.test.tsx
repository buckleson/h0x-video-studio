// F2: ProviderSelector after removing the Sora / WorldLabs providers. Removed
// ids (stale model listings or persisted state) never reach the menu or the
// store, every remaining enum value renders, and no source file in the lib
// still names a removed provider.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import type { Model } from "@storyteller/model-list";
import { ModelPage } from "./model-pages";
import { ProviderSelector } from "./provider-selector";
import {
  isRetiredProvider,
  RETIRED_PROVIDER_IDS,
  useClassyModelSelectorStore,
} from "./classy-model-selector-store";

// PopoverMenu is replaced by a plain list so the test only exercises
// ProviderSelector's own mapping and selection logic.
vi.mock("@storyteller/ui-popover", () => ({
  PopoverMenu: ({ items, onSelect }: { items: any[]; onSelect: (i: any) => void }) => (
    <ul>
      {items.map((item) => (
        <li key={item.label}>
          <button type="button" aria-pressed={item.selected} onClick={() => onSelect(item)}>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

// --- constants ---

const PAGE = ModelPage.TextToImage;
const MODEL_ID = "flux_1_dev";
const ALL_PROVIDERS = Object.values(GenerationProvider);
const REMOVED_IDS = ["sora", "world_labs"] as unknown as GenerationProvider[];
const REMOVED_NAMES = /\b(Sora|WorldLabs|World_Labs|Midjourney|Grok)\b/;
const SRC_DIR = join(__dirname, "..");

// --- helpers ---

const fakeModel = (providers: GenerationProvider[], id = MODEL_ID) =>
  ({ id, getProviders: () => providers }) as unknown as Model;

const renderSelector = (props: Partial<Parameters<typeof ProviderSelector>[0]> = {}) =>
  render(<ProviderSelector page={PAGE} model={fakeModel([GenerationProvider.Fal])} {...props} />);

const labels = () => screen.queryAllByRole("button").map((b) => b.textContent);
const stored = (modelId = MODEL_ID) =>
  useClassyModelSelectorStore.getState().selectedProviders[PAGE]?.[modelId];

const listSources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [full] : [];
  });

afterEach(() => {
  cleanup();
  useClassyModelSelectorStore.setState({ selectedModels: {}, selectedProviders: {} });
});

describe("ProviderSelector", () => {
  it("lists the model's providers and auto-selects the first", () => {
    renderSelector({ model: fakeModel([GenerationProvider.Fal, GenerationProvider.Artcraft]) });
    expect(labels()).toEqual(["FAL", "H0x Video Studio"]);
    expect(stored()).toBe(GenerationProvider.Fal);
    expect(screen.getByRole("button", { name: "FAL" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("drops removed providers coming from a stale model listing", () => {
    renderSelector({ model: fakeModel([...REMOVED_IDS, GenerationProvider.Krea]) });
    expect(labels()).toEqual(["Krea"]);
    expect(stored()).toBe(GenerationProvider.Krea);
  });

  it("drops removed providers from providersByModel, which wins over the model", () => {
    renderSelector({
      model: fakeModel([GenerationProvider.Fal]),
      providersByModel: { [MODEL_ID]: [REMOVED_IDS[1], GenerationProvider.Runway] },
    });
    expect(labels()).toEqual(["Runway"]);
  });

  it("falls back to ArtCraft when only removed providers remain", () => {
    renderSelector({ model: fakeModel(REMOVED_IDS) });
    expect(labels()).toEqual(["H0x Video Studio"]);
    expect(stored()).toBe(GenerationProvider.Artcraft);
  });

  it("falls back to ArtCraft for an empty provider list", () => {
    renderSelector({ providersByModel: { [MODEL_ID]: [] } });
    expect(labels()).toEqual(["H0x Video Studio"]);
  });

  it("shows the defaults and writes nothing when there is no model", () => {
    renderSelector({ model: undefined });
    expect(labels()).toEqual(["H0x Video Studio", "FAL"]);
    fireEvent.click(screen.getByRole("button", { name: "FAL" }));
    expect(useClassyModelSelectorStore.getState().selectedProviders).toEqual({});
  });

  it("replaces a persisted removed provider with an allowed one", () => {
    useClassyModelSelectorStore.setState({
      selectedProviders: { [PAGE]: { [MODEL_ID]: REMOVED_IDS[0] } },
    });
    renderSelector({ model: fakeModel([GenerationProvider.Fal]) });
    expect(stored()).toBe(GenerationProvider.Fal);
  });

  it("keeps a still-allowed persisted selection", () => {
    useClassyModelSelectorStore.setState({
      selectedProviders: { [PAGE]: { [MODEL_ID]: GenerationProvider.Artcraft } },
    });
    renderSelector({ model: fakeModel([GenerationProvider.Fal, GenerationProvider.Artcraft]) });
    expect(stored()).toBe(GenerationProvider.Artcraft);
  });

  it("stores the clicked provider", () => {
    renderSelector({ model: fakeModel([GenerationProvider.Fal, GenerationProvider.Krea]) });
    act(() => fireEvent.click(screen.getByRole("button", { name: "Krea" })));
    expect(stored()).toBe(GenerationProvider.Krea);
    expect(screen.getByRole("button", { name: "Krea" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders every remaining enum value with a real, unbranded name", () => {
    renderSelector({ model: fakeModel(ALL_PROVIDERS) });
    const shown = labels();
    expect(shown).toHaveLength(ALL_PROVIDERS.length);
    for (const label of shown) {
      expect(label).not.toBe("Unknown Provider");
      expect(label).not.toMatch(REMOVED_NAMES);
      expect(label).not.toMatch(/LTX|Lightricks/i);
    }
  });
});

describe("removed providers", () => {
  it("the enum no longer has Sora or WorldLabs", () => {
    const keys = Object.keys(GenerationProvider);
    for (const name of ["Sora", "WorldLabs", "Midjourney", "Grok"]) expect(keys).not.toContain(name);
    for (const id of REMOVED_IDS) expect(ALL_PROVIDERS).not.toContain(id);
  });

  it.each([
    ["sora", true],
    ["world_labs", true],
    [GenerationProvider.Artcraft, false],
    [GenerationProvider.Fal, false],
    [undefined, false],
    ["", false],
    ["SORA", false],
  ] as const)("isRetiredProvider(%j) is %s", (value, expected) => {
    expect(isRetiredProvider(value)).toBe(expected);
  });

  it("no retired id is still a live enum value", () => {
    for (const id of RETIRED_PROVIDER_IDS) expect(ALL_PROVIDERS).not.toContain(id);
  });

  it("no non-test source file in the lib names a removed provider", () => {
    const files = listSources(SRC_DIR);
    expect(files.length).toBeGreaterThan(5);
    const hits = files.filter((f) => REMOVED_NAMES.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("no source file references GenerationProvider.Sora or .WorldLabs", () => {
    const all = readdirSync(join(SRC_DIR, "lib"))
      .filter((n) => n !== "provider-selector.test.tsx") // this file names them in its regex
      .map((n) => join(SRC_DIR, "lib", n));
    const hits = all.filter((f) => /GenerationProvider\.(Sora|WorldLabs)\b/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
