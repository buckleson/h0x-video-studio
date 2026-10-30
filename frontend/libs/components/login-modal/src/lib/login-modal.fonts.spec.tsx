// R1 C2: the login modal's emphasised words render in the display face, not
// the removed Instrument Serif italic classes.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginModal } from "./login-modal";
import { useLoginModalStore } from "./useLoginModalStore";

const { native, forbiddenFetch } = vi.hoisted(() => ({ native: vi.fn(), forbiddenFetch: vi.fn(() => { throw new Error("no network in tests"); }) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native }));
vi.mock("@storyteller/api", () => { throw new Error("Authentication UI must not import API clients"); });
vi.mock("@storyteller/tauri-utils", () => ({ FetchProxy: forbiddenFetch }));
vi.mock("@headlessui/react", () => ({ Transition: ({ show, children }: any) => show ? children : null, TransitionChild: ({ children }: any) => children }));
vi.mock("@storyteller/icons", () => ({ DynamicIcon: () => null, DiscordIcon: () => null }));
vi.mock("@storyteller/ui-button", () => ({ Button: ({ children, variant, icon, iconFlip, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock("@storyteller/ui-input", () => ({ Input: ({ inputClassName, ...props }: any) => <input {...props} /> }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => <svg role="img" aria-label="Login QR" /> }));

const OLD_CLASSES = /font-serif|font-custom-font|italic/;
const BRAND_LEAKS = /artcraft|getartcraft|storyteller\.ai|fakeyou|\bLTX\b|lightricks/i;

beforeEach(() => {
  vi.stubGlobal("fetch", forbiddenFetch);
  useLoginModalStore.setState({ isOpen: true, recheckTrigger: 0 });
  native.mockReset().mockImplementation(async (command: string) => {
    if (command === "storyteller_get_login_session_command") return null;
    return undefined;
  });
});
afterEach(() => {
  cleanup();
  expect(forbiddenFetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("login modal typography", () => {
  it("renders 'back.' in a font-display span on the login screen", async () => {
    await act(async () => { render(<LoginModal isSignUp={false} />); });
    const back = screen.getByText("back.");
    expect(back.tagName).toBe("SPAN");
    expect(back.className).toBe("font-display");
    expect(back.closest("h1")?.textContent?.replace(/\s+/g, " ").trim()).toBe("Welcome back.");
  });

  it("the sign-up heading has no leftover serif or italic span", async () => {
    await act(async () => { render(<LoginModal isSignUp={true} />); });
    const heading = screen.getByText("Create your account");
    expect(heading.className).toContain("font-display");
    expect(heading.querySelector("span")).toBeNull();
  });

  it.each([false, true])("isSignUp=%s renders no removed font classes or brand leaks in headings", async (isSignUp) => {
    let container!: HTMLElement;
    await act(async () => { ({ container } = render(<LoginModal isSignUp={isSignUp} />)); });
    for (const el of Array.from(container.querySelectorAll("[class]"))) {
      expect(el.getAttribute("class") ?? "", el.outerHTML.slice(0, 120)).not.toMatch(OLD_CLASSES);
    }
    for (const h of Array.from(container.querySelectorAll("h1, h2"))) {
      expect(h.textContent ?? "").not.toMatch(BRAND_LEAKS);
    }
    expect(container.querySelector("[style*='font-family']")).toBeNull();
  });
});
