import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { buildImageModelsFromListing, IMAGE_MODELS } from "@storyteller/model-list";
import { useModelPickerStyleStore } from "@storyteller/ui-popover";
import { ClassyModelSelector } from "./classy-model-selector";
import { useClassyModelSelectorStore } from "./classy-model-selector-store";
import { ModelPage } from "./model-pages";

const PAGE = ModelPage.TextToImage;
const MODELS = buildImageModelsFromListing(IMAGE_MODELS.filter((model) => model.id === "flux_1_dev"), [
  { model: "nano_banana_pro" },
  { model: "gpt_image_1p5" },
  { model: "flux_dev" },
  { model: "seedream_4" },
  { model: "recraft_3" },
  { model: "imagen_4" },
  { model: "flux_1_schnell" },
  { model: "flux_1_dev" },
]);
const INITIAL_MODEL = MODELS.find((model) => model.id === "nano_banana_pro")!;
const TARGET_MODEL = MODELS.find((model) => model.id === "flux_1_dev")!;
const ITEMS = MODELS.map((model) => ({ label: model.selectorName, model }));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  // jsdom has no layout; give the menu a visible rect so its viewport clamp
  // and Headless UI visibility checks behave as they do in the app.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 100, 280, 40),
  );
  useClassyModelSelectorStore.setState({
    selectedModels: { [PAGE]: INITIAL_MODEL },
    selectedProviders: { [PAGE]: { [TARGET_MODEL.id]: GenerationProvider.Artcraft } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useClassyModelSelectorStore.setState({ selectedModels: {}, selectedProviders: {} });
  useModelPickerStyleStore.getState().setStyle("grouped");
});

it.each([
  { style: "grouped", provider: GenerationProvider.Fal, label: "FAL" },
  { style: "flat", provider: GenerationProvider.Fal, label: "FAL" },
  { style: "grouped", provider: GenerationProvider.Artcraft, label: "H0x Video Studio" },
] as const)(
  "selects both Flux 1 Dev and $label from the $style picker",
  async ({ style, provider, label }) => {
    if (provider === GenerationProvider.Artcraft) {
      useClassyModelSelectorStore.getState().setSelectedProvider(PAGE, TARGET_MODEL.id, GenerationProvider.Fal);
    }
    const user = await openProviderPicker(style);

    // A real click includes the press and focus events that used to dismiss
    // the grouped submenu before the provider's click handler could run.
    await user.click(screen.getByRole("button", { name: new RegExp(label) }));

    expect(useClassyModelSelectorStore.getState().selectedModels[PAGE]).toBe(TARGET_MODEL);
    expect(useClassyModelSelectorStore.getState().selectedProviders[PAGE]?.[TARGET_MODEL.id])
      .toBe(provider);
    await waitFor(() => expect(screen.queryByText("Select Model")).toBeNull());
    expect(screen.getByRole("button", { name: new RegExp(TARGET_MODEL.selectorName) })).toBeTruthy();
  },
);

it("still dismisses the grouped picker on an outside press without changing selection", async () => {
  const user = await openProviderPicker("grouped");

  await user.click(screen.getByRole("button", { name: "Outside" }));

  await waitFor(() => expect(screen.queryByText("Select Model")).toBeNull());
  expect(screen.queryByText("Select Provider")).toBeNull();
  expect(useClassyModelSelectorStore.getState().selectedModels[PAGE]).toBe(INITIAL_MODEL);
  expect(useClassyModelSelectorStore.getState().selectedProviders[PAGE]?.[TARGET_MODEL.id])
    .toBe(GenerationProvider.Artcraft);
});

async function openProviderPicker(style: "grouped" | "flat") {
  const user = userEvent.setup();
  useModelPickerStyleStore.getState().setStyle(style);
  render(
    <>
      <ClassyModelSelector items={ITEMS} page={PAGE} variant="embedded" />
      <button type="button">Outside</button>
    </>,
  );

  await user.click(screen.getByRole("button", { name: new RegExp(INITIAL_MODEL.selectorName) }));
  if (style === "grouped") {
    await user.click(screen.getByText("Flux", { exact: true }));
  }
  await user.hover(await screen.findByText(TARGET_MODEL.selectorName, { exact: true }));
  await screen.findByRole("button", { name: /FAL/ });
  return user;
}
