// A3b edge cases: the account pane renders only the main account block,
// with no Sora, Midjourney, Grok-consumer or WorldLabs-consumer block.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSettingsPane } from "./AccountSettingsPane";

const CONSUMER_TEXT = /midjourney|\bsora\b|chatgpt|openai|grok|world\s*labs/i;

const mocks = vi.hoisted(() => ({ blockProps: [] as unknown[] }));

vi.mock("./ArtcraftAccountBlock", () => ({
  ArtcraftAccountBlock: (props: { globalAccountLogoutCallback: () => void }) => {
    mocks.blockProps.push(props);
    return <section data-testid="account-block" />;
  },
}));

afterEach(() => {
  cleanup();
  mocks.blockProps = [];
});

describe("AccountSettingsPane", () => {
  it("renders exactly one account block and no consumer text", () => {
    const { container } = render(<AccountSettingsPane globalAccountLogoutCallback={() => {}} />);
    expect(screen.getAllByTestId("account-block")).toHaveLength(1);
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(container.textContent).not.toMatch(CONSUMER_TEXT);
  });

  it("passes the logout callback through unchanged", () => {
    const logout = vi.fn();
    render(<AccountSettingsPane globalAccountLogoutCallback={logout} />);
    expect(mocks.blockProps).toHaveLength(1);
    expect(mocks.blockProps[0]).toEqual({ globalAccountLogoutCallback: logout });
  });

  it("the deleted block modules cannot be imported", async () => {
    // Variable paths keep the bundler from resolving them at transform time.
    const paths = ["./GrokAccountBlock", "./MidjourneyAccountBlock"];
    for (const p of paths) {
      await expect(import(/* @vite-ignore */ p)).rejects.toThrow();
    }
  });
});
