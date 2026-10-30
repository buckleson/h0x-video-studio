// R1 B3: the About pane shows the product name, version, credits and licenses.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutSettingsPane } from "./AboutSettingsPane";

vi.mock("@storyteller/tauri-api", () => ({
  GetAppInfo: async () => ({ payload: { artcraft_version: "0.1.0" } }),
}));

afterEach(cleanup);

describe("AboutSettingsPane", () => {
  it("shows the name, version, credits and licenses", async () => {
    const { container } = await act(async () => render(<AboutSettingsPane />));
    const text = container.textContent ?? "";
    expect(screen.getByRole("heading", { name: "H0x Video Studio" })).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    expect(text).toContain("Secured by HyperOx · Powered by Buckleson · Managed by Pavi");
    expect(text).toMatch(/MIT or Apache-2\.0/);
    expect(text).toContain("NOTICE");
    expect(text).not.toMatch(/artcraft/i);
  });

  it("links Buckleson and Pavi but not HyperOx", async () => {
    await act(async () => { render(<AboutSettingsPane />); });
    expect(screen.getByRole("link", { name: "Buckleson" }).getAttribute("href")).toBe("https://buckleson.com");
    expect(screen.getByRole("link", { name: "Pavi" }).getAttribute("href")).toBe("https://pavi.tech");
    expect(screen.queryByRole("link", { name: /HyperOx/ })).toBeNull();
  });
});
