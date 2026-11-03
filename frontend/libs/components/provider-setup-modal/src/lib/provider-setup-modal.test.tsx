// A3b edge cases: the setup modal offers only supported providers, never a
// consumer login (Midjourney, Sora/ChatGPT, Grok consumer, WorldLabs consumer).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationProvider } from "@storyteller/common";
import ProviderSetupModal from "./provider-setup-modal";

const CONSUMER_TEXT = /midjourney|\bsora\b|chatgpt|openai|grok|world\s*labs/i;
const REMOVED_VALUES = ["midjourney", "sora", "grok", "worldlabs", "", "unknown"];
const EXPECTED_NAMES: Record<GenerationProvider, string> = {
  [GenerationProvider.Artcraft]: "H0x Video Studio",
  [GenerationProvider.BytePlus]: "BytePlus",
  [GenerationProvider.Fal]: "Fal",
  [GenerationProvider.Higgsfield]: "Higgsfield",
  [GenerationProvider.Krea]: "Krea",
  [GenerationProvider.Leonardo]: "Leonardo",
  [GenerationProvider.Magnific]: "Magnific",
  [GenerationProvider.Openart]: "OpenArt",
  [GenerationProvider.Picsart]: "Picsart",
  [GenerationProvider.Pixverse]: "PixVerse",
  [GenerationProvider.Runway]: "Runway",
};

const mocks = vi.hoisted(() => ({
  onLogin: (_event: { provider: unknown }) => {},
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@storyteller/tauri-events", () => ({
  useShowProviderLoginModalEvent: (callback: typeof mocks.onLogin) => {
    mocks.onLogin = callback;
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@storyteller/ui-modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));

afterEach(() => {
  cleanup();
  mocks.invoke.mockClear();
});

describe("provider setup modal", () => {
  it("is closed until an event arrives", () => {
    render(<ProviderSetupModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names every GenerationProvider value (no value left without a case)", () => {
    expect(Object.values(GenerationProvider).sort()).toEqual(Object.keys(EXPECTED_NAMES).sort());
  });

  it.each(Object.entries(EXPECTED_NAMES))("%s opens with title 'Set up %s' and no consumer login text", async (provider, name) => {
    await openWith(provider);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { name: `Set up ${name}` })).toBeTruthy();
    expect(dialog.textContent).not.toMatch(CONSUMER_TEXT);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it.each(REMOVED_VALUES)("removed or unknown value %j falls back to the default name", async (value) => {
    await openWith(value);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { name: "Set up H0x Video Studio" })).toBeTruthy();
    expect(dialog.textContent).not.toMatch(CONSUMER_TEXT);
  });

  it("the button closes the modal without invoking any login command", async () => {
    await openWith("midjourney");
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("a second event replaces the provider shown", async () => {
    await openWith(GenerationProvider.Fal);
    await openWith(GenerationProvider.Runway);
    expect(screen.getByRole("heading", { name: "Set up Runway" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Set up Fal" })).toBeNull();
  });
});

async function openWith(provider: string) {
  if (!screen.queryByRole("dialog")) render(<ProviderSetupModal />);
  await act(async () => mocks.onLogin({ provider }));
}
