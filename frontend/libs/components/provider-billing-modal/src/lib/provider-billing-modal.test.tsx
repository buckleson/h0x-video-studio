// A3b edge cases: the billing modal shows the generic block for API providers,
// the ArtCraft block for ArtCraft, and nothing for a removed consumer provider.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationProvider } from "@storyteller/common";
import ProviderBillingModal from "./provider-billing-modal";

const CONSUMER_TEXT = /midjourney|\bsora\b|chatgpt|openai|grok|world\s*labs/i;
const GENERIC = Object.values(GenerationProvider).filter((p) => p !== GenerationProvider.Artcraft);

const mocks = vi.hoisted(() => ({
  onBilling: (_event: { provider: unknown }) => {},
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@storyteller/tauri-events", () => ({
  useShowProviderBillingModalEvent: (callback: typeof mocks.onBilling) => {
    mocks.onBilling = callback;
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@storyteller/ui-modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock("./artcraft/ArtcraftBillingBlock", () => ({
  ArtcraftBillingBlock: () => <div data-testid="artcraft-billing" />,
}));

afterEach(() => {
  cleanup();
  mocks.invoke.mockClear();
});

describe("provider billing modal", () => {
  it("is closed until an event arrives", () => {
    render(<ProviderBillingModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Artcraft shows the ArtCraft billing block", async () => {
    await openWith(GenerationProvider.Artcraft);
    expect(screen.getByTestId("artcraft-billing")).toBeTruthy();
  });

  it.each(GENERIC)("%s shows the generic block with no consumer text", async (provider) => {
    await openWith(provider);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^Set up \w+/);
    expect(screen.queryByTestId("artcraft-billing")).toBeNull();
    expect(dialog.textContent).not.toMatch(CONSUMER_TEXT);
  });

  it.each(["midjourney", "sora", "grok", "worldlabs", ""])(
    "removed value %j renders no billing block and no consumer text",
    async (value) => {
      await openWith(value);
      const dialog = screen.getByRole("dialog");
      expect(screen.queryByRole("heading")).toBeNull();
      expect(screen.queryByTestId("artcraft-billing")).toBeNull();
      expect(dialog.textContent).not.toMatch(CONSUMER_TEXT);
      expect(mocks.invoke).not.toHaveBeenCalled();
    },
  );
});

async function openWith(provider: string) {
  render(<ProviderBillingModal />);
  await act(async () => mocks.onBilling({ provider }));
}
