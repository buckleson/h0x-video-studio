// R1 B3 edge cases for the About pane: the product name and credits render
// before app info arrives (and when it never does), Windows paths render
// verbatim, credit links open safely in a new tab, and no vendor brand leaks.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutSettingsPane } from "./AboutSettingsPane";

// --- constants ---

const CREDITS = "Secured by HyperOx · Powered by Buckleson · Managed by Pavi";
const VENDOR = /artcraft|getartcraft|storyteller|fakeyou|lightricks|\bltx\b|discord/i;

const { getAppInfo } = vi.hoisted(() => ({ getAppInfo: vi.fn() }));
vi.mock("@storyteller/tauri-api", () => ({ GetAppInfo: getAppInfo }));

afterEach(() => {
  cleanup();
  getAppInfo.mockReset();
});

// --- cases ---

describe("AboutSettingsPane (B3 edge)", () => {
  it("shows name, credits and licenses while app info is still pending", () => {
    getAppInfo.mockReturnValue(new Promise(() => {}));
    const { container } = render(<AboutSettingsPane />);
    expect(screen.getByRole("heading", { name: "H0x Video Studio" })).toBeTruthy();
    expect(container.textContent).toContain(CREDITS);
    expect(container.textContent).toContain("NOTICE");
    expect(container.textContent).toMatch(/MIT or Apache-2\.0/);
  });

  it("an empty payload renders no 'undefined' text", async () => {
    getAppInfo.mockResolvedValue({ payload: undefined });
    const { container } = await act(async () => render(<AboutSettingsPane />));
    expect(container.textContent).not.toMatch(/undefined|null/);
    expect(container.textContent).toContain(CREDITS);
  });

  it("renders Windows data and download paths verbatim", async () => {
    getAppInfo.mockResolvedValue({
      payload: {
        artcraft_version: "0.1.0",
        artcraft_root_directory: "C:\\Users\\vijay\\AppData\\Roaming\\h0x",
        download_directory: "D:\\Videos\\H0x Exports",
        os_platform: "windows",
        os_version: "11",
      },
    });
    await act(async () => {
      render(<AboutSettingsPane />);
    });
    expect(screen.getByText("C:\\Users\\vijay\\AppData\\Roaming\\h0x")).toBeTruthy();
    expect(screen.getByText("D:\\Videos\\H0x Exports")).toBeTruthy();
  });

  it("credit links open in a new tab with rel=noreferrer", async () => {
    getAppInfo.mockResolvedValue({ payload: { artcraft_version: "0.1.0" } });
    await act(async () => {
      render(<AboutSettingsPane />);
    });
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://buckleson.com", "https://pavi.tech"]);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel") ?? "").toMatch(/noreferrer/);
    }
  });

  it("credits keep the order HyperOx, Buckleson, Pavi", async () => {
    getAppInfo.mockResolvedValue({ payload: {} });
    const { container } = await act(async () => render(<AboutSettingsPane />));
    const t = container.textContent ?? "";
    expect(t.indexOf("HyperOx")).toBeLessThan(t.indexOf("Buckleson"));
    expect(t.indexOf("Buckleson")).toBeLessThan(t.indexOf("Pavi"));
  });

  it("no vendor brand appears in the pane text or links", async () => {
    getAppInfo.mockResolvedValue({ payload: { artcraft_version: "0.1.0" } });
    const { container } = await act(async () => render(<AboutSettingsPane />));
    expect(container.textContent).not.toMatch(VENDOR);
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).not.toMatch(VENDOR);
    }
  });
});
