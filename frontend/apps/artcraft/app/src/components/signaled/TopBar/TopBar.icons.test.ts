// R4-2a: the top bar uses only Phosphor icons (all of which exist), keeps its
// window controls and handlers, and uses the shared rounded-xl button radius.
// TopBar pulls in Tauri, modals and stores, so these checks read the source.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as Phosphor from "@phosphor-icons/react";

// --- constants ---

const SRC = readFileSync(path.join(__dirname, "TopBar.tsx"), "utf8").replace(/\r\n/g, "\n");
const PHOSPHOR_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']@phosphor-icons\/react["']/;
const phosphorNames = () =>
  (SRC.match(PHOSPHOR_IMPORT)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// The <button>/<Button> element whose JSX contains `marker`.
function buttonAround(marker: string): string {
  const at = SRC.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const open = Math.max(SRC.lastIndexOf("<button", at), SRC.lastIndexOf("<Button", at));
  const closeA = SRC.indexOf("</button>", at);
  const closeB = SRC.indexOf("</Button>", at);
  const close = [closeA, closeB].filter((i) => i > -1).sort((a, b) => a - b)[0];
  return SRC.slice(open, close);
}

// --- tests ---

describe("R4-2a TopBar icons", () => {
  it("has no lucide-react import, DynamicIcon or lucide icon prop", () => {
    expect(SRC).not.toMatch(/lucide/i);
    expect(SRC).not.toMatch(/DynamicIcon/);
    expect(SRC).not.toMatch(/\bicon=\{(?:Settings|Images|Minus|X|Square|ChevronRight)\b/);
  });

  it("imports icons from @phosphor-icons/react only once and every name exists", () => {
    expect(SRC.match(new RegExp(PHOSPHOR_IMPORT.source, "g"))).toHaveLength(1);
    const names = phosphorNames();
    expect(names.length).toBeGreaterThanOrEqual(7);
    for (const n of names) {
      expect(n).toMatch(/Icon$/);
      expect((Phosphor as Record<string, unknown>)[n], n).toBeTruthy();
    }
  });

  it("every *Icon JSX tag is imported from Phosphor (none renders blank)", () => {
    const imported = new Set(phosphorNames());
    const used = new Set(
      Array.from(SRC.matchAll(/<([A-Z][A-Za-z]*Icon)\b/g), (m) => m[1]),
    );
    expect(used.size).toBeGreaterThan(0);
    for (const tag of used) expect(imported.has(tag), tag).toBe(true);
  });

  it("every imported Phosphor icon is actually used", () => {
    for (const n of phosphorNames()) {
      expect(SRC, n).toMatch(new RegExp(`<${n}\\b`));
    }
  });

  it.each([
    ["CaretRightIcon", "breadcrumb separator"],
    ["ImagesIcon", "My Library"],
    ["GearSixIcon", "settings"],
    ["MinusIcon", "minimise"],
    ["SquareIcon", "maximise"],
    ["XIcon", "close"],
    ["HouseIcon", "Home tab"],
  ])("uses %s for the %s", (name) => {
    expect(phosphorNames()).toContain(name);
  });
});

describe("R4-2a TopBar handlers kept", () => {
  it("minimise button calls minimize and shows MinusIcon", () => {
    const b = buttonAround("<MinusIcon");
    expect(b).toMatch(/onClick=\{minimize\}/);
  });

  it("maximise button toggles and swaps Copy/Square on isMaximized", () => {
    const b = buttonAround("<SquareIcon");
    expect(b).toMatch(/onClick=\{toggleMaximize\}/);
    expect(b).toMatch(/isMaximized\s*\?\s*\(?\s*<CopyIcon[\s\S]*:\s*\(?\s*<SquareIcon/);
  });

  it("close button calls close and shows XIcon", () => {
    const b = buttonAround("<XIcon");
    expect(b).toMatch(/onClick=\{close\}/);
  });

  it("window controls stay hidden on macOS and on the web", () => {
    expect(SRC).toMatch(/\{isDesktop && platform !== "macos" && \(/);
  });

  it("My Library opens the gallery and Settings opens the general section", () => {
    expect(buttonAround("<ImagesIcon")).toMatch(/onClick=\{handleOpenGalleryModal\}/);
    const settings = buttonAround("<GearSixIcon");
    expect(settings).toMatch(/aria-label="Settings"/);
    expect(settings).toMatch(/setSettingsSection\("general"\)/);
    expect(settings).toMatch(/setIsSettingsModalOpen\(true\)/);
  });

  it("the breadcrumb separator is decorative and the last crumb is marked current", () => {
    const sep = SRC.slice(SRC.indexOf("<CaretRightIcon"), SRC.indexOf("/>", SRC.indexOf("<CaretRightIcon")));
    expect(sep).toMatch(/aria-hidden="true"/);
    expect(SRC).toMatch(/aria-current=\{isLast \? "page" : undefined\}/);
  });
});

describe("R4-2a TopBar radius", () => {
  it("My Library and Settings both use rounded-xl with a 1px subtle border", () => {
    for (const marker of ["<ImagesIcon", "<GearSixIcon"]) {
      const cls = buttonAround(marker).match(/className="([^"]*)"/)![1].split(/\s+/);
      expect(cls, marker).toContain("rounded-xl");
      expect(cls.some((c) => /^border-white\/\d+$/.test(c)), marker).toBe(true);
      expect(cls, marker).toContain("h-8");
    }
  });

  it("the active breadcrumb pill is rounded-md", () => {
    expect(SRC).toMatch(/"truncate rounded-md bg-ui-ink/);
  });
});

describe("R4-2a TopBar branding", () => {
  it("visible strings carry no old brand or vendor names", () => {
    const body = SRC.split("\n")
      .filter((l) => !/^\s*(import|from|\}\s*from)\b/.test(l) && !/["']@storyteller\//.test(l))
      .join("\n");
    const strings = Array.from(body.matchAll(/"([^"\n]*)"|>([^<>{}\n]+)</g), (m) => m[1] ?? m[2]);
    expect(strings.join(" ")).not.toMatch(
      /art\s*craft|getartcraft|storyteller\.ai|fakeyou|\bltx\b|lightricks/i,
    );
    expect(SRC).toMatch(/H0x Video Studio/);
  });
});
