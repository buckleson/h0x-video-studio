// R4-2b: prompt bars, My Library and the task queue use Phosphor icons only.
// Reads the sources (these components pull in Tauri and stores), and checks the
// Phosphor names against the package's export list without loading 1500 icons.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// --- constants ---

const FRONTEND = path.resolve(__dirname, "../..");
const FILES = {
  promptImage: "libs/components/promptbox/src/lib/PromptBoxImage.tsx",
  promptVideo: "libs/components/promptbox/src/lib/PromptBoxVideo.tsx",
  gallery: "libs/components/gallery-modal/src/lib/gallery-modal.tsx",
  taskQueue: "apps/artcraft/app/src/components/signaled/TopBar/TaskQueue.tsx",
} as const;
const DYNAMIC_ICON = "libs/icons/src/lib/dynamic-icon.tsx";
const ICONS_INDEX = "libs/icons/src/index.ts";
const PHOSPHOR_INDEX = path.join(
  FRONTEND,
  "node_modules/@phosphor-icons/react/dist/index.es.js",
);

// onClick / aria-label counts before R4-2b; an icon swap must not drop any.
const HANDLER_BASELINE: Record<keyof typeof FILES, { onClick: number; aria: number }> = {
  promptImage: { onClick: 5, aria: 0 },
  promptVideo: { onClick: 7, aria: 0 },
  gallery: { onClick: 42, aria: 5 },
  taskQueue: { onClick: 15, aria: 4 },
};

const PHOSPHOR_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']@phosphor-icons\/react["']/g;
const NAMED_IMPORT = /import\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
const DEFAULT_IMPORT = /import\s+([A-Za-z_$][\w$]*)\s*(?:,|\s+from)/g;
// Size classes that already fix an icon's box, so no `size` prop is needed.
const SIZE_CLASS = /\b(?:h|w|size)-(?:\d|\[)/;
const BRAND_LEAK = /ArtCraft|Artcraft|ARTCRAFT|getartcraft|storyteller\.ai|fakeyou|\bLTX\b|Lightricks/;

// --- helpers ---

const read = (rel: string) =>
  readFileSync(path.join(FRONTEND, rel), "utf8").replace(/\r\n/g, "\n");

const splitNames = (list: string) =>
  list
    .split(",")
    .map((s) => s.trim().replace(/^type\s+/, ""))
    .map((s) => s.split(/\s+as\s+/).pop()!.trim())
    .filter(Boolean);

function phosphorNames(src: string): string[] {
  return Array.from(src.matchAll(PHOSPHOR_IMPORT)).flatMap((m) => splitNames(m[1]));
}

function allImportedNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(NAMED_IMPORT)) splitNames(m[1]).forEach((n) => names.add(n));
  for (const m of src.matchAll(DEFAULT_IMPORT)) names.add(m[1]);
  return names;
}

// Locally declared components (`const FooIcon =`, `function FooIcon`).
function localNames(src: string): Set<string> {
  return new Set(
    Array.from(
      src.matchAll(/(?:const|let|function)\s+([A-Z][\w$]*Icon)\b/g),
      (m) => m[1],
    ),
  );
}

// The opening JSX tag starting at `at` (`<Name ... >`), braces respected.
function openingTag(src: string, at: number): string {
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unterminated tag at ${at}`);
}

function jsxTags(src: string, name: string): string[] {
  return Array.from(src.matchAll(new RegExp(`<${name}\\b`, "g")), (m) =>
    openingTag(src, m.index!),
  );
}

let phosphorExports: Set<string> | undefined;
function phosphorExportNames(): Set<string> {
  if (!phosphorExports) {
    const idx = readFileSync(PHOSPHOR_INDEX, "utf8");
    phosphorExports = new Set(
      Array.from(idx.matchAll(/\b([A-Z][\w$]*)\s+as\s+[\w$]+\s*[,}]/g), (m) => m[1]),
    );
  }
  return phosphorExports;
}

// --- tests ---

describe.each(Object.entries(FILES))("R4-2b %s", (key, rel) => {
  const src = read(rel);

  it("has no lucide-react import or lucide reference", () => {
    expect(src).not.toMatch(/lucide/i);
  });

  it("imports from @phosphor-icons/react exactly once", () => {
    expect(Array.from(src.matchAll(PHOSPHOR_IMPORT))).toHaveLength(1);
  });

  it("every Phosphor name is a real *Icon export (none renders blank)", () => {
    const names = phosphorNames(src);
    expect(names.length).toBeGreaterThan(0);
    const exported = phosphorExportNames();
    expect(exported.size).toBeGreaterThan(1000);
    for (const n of names) {
      expect(n, n).toMatch(/Icon$/);
      expect(exported.has(n), `${n} is not exported by @phosphor-icons/react`).toBe(true);
    }
  });

  it("every imported Phosphor icon is used", () => {
    for (const n of phosphorNames(src)) {
      const uses = src.match(new RegExp(`\\b${n}\\b`, "g")) ?? [];
      expect(uses.length, n).toBeGreaterThan(1);
    }
  });

  it("every *Icon used as a JSX tag or icon value is imported or declared", () => {
    const known = new Set([...allImportedNames(src), ...localNames(src)]);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const usedAsTag = Array.from(code.matchAll(/<([A-Z][\w$]*Icon)\b/g), (m) => m[1]);
    const usedAsValue = Array.from(
      code.matchAll(/(?:\bicon\s*[:=]\s*\{?|\bactiveIcon\s*=\s*\{|\bprimaryActionIcon\s*:\s*|\?\s*|:\s*)([A-Z][\w$]*Icon)\b(?!\s*[=(])/g),
      (m) => m[1],
    );
    const missing = [...new Set([...usedAsTag, ...usedAsValue])].filter((n) => !known.has(n));
    expect(missing, `used but never imported in ${rel}`).toEqual([]);
  });

  it("every Phosphor JSX icon keeps the lucide box: size prop or h-/w- class", () => {
    const unsized: string[] = [];
    for (const n of phosphorNames(src)) {
      for (const tag of jsxTags(src, n)) {
        if (!/\bsize=/.test(tag) && !SIZE_CLASS.test(tag)) unsized.push(tag.replace(/\s+/g, " "));
      }
    }
    expect(unsized).toEqual([]);
  });

  it("uses no lucide-only size keywords (size=\"lg\" etc.)", () => {
    expect(src).not.toMatch(/\bsize="(?:xs|sm|md|lg|xl)"\s*\/?>/);
  });

  it("every DynamicIcon call passes an icon", () => {
    for (const tag of jsxTags(src, "DynamicIcon")) {
      expect(tag, tag).toMatch(/\bicon=\{/);
    }
  });

  it("keeps every onClick handler and aria-label", () => {
    const base = HANDLER_BASELINE[key as keyof typeof FILES];
    expect((src.match(/onClick=/g) ?? []).length).toBeGreaterThanOrEqual(base.onClick);
    expect((src.match(/aria-label=/g) ?? []).length).toBeGreaterThanOrEqual(base.aria);
  });

  it("aria-labels, titles and tooltips carry no old brand", () => {
    const visible = Array.from(
      src.matchAll(/(?:aria-label|title|content|label|placeholder)\s*[=:]\s*["'`]([^"'`]*)["'`]/g),
      (m) => m[1],
    );
    for (const v of visible) expect(v).not.toMatch(BRAND_LEAK);
  });
});

describe("R4-2b icon meanings", () => {
  it.each([
    ["promptImage", ["CaretDownIcon", "CaretUpIcon", "CornersOutIcon"]],
    ["promptVideo", ["CaretDownIcon", "CaretUpIcon", "ClockIcon", "InfoIcon", "WaveformIcon"]],
    ["taskQueue", ["CircleNotchIcon", "WarningIcon", "WarningCircleIcon", "XIcon", "TrashIcon", "PaintBrushIcon", "BombIcon", "ListChecksIcon", "CopyIcon", "CheckIcon"]],
    ["gallery", ["GridNineIcon", "ImageIcon", "VideoCameraIcon", "MusicNoteIcon", "CubeIcon", "GlobeIcon", "UploadSimpleIcon", "ArrowClockwiseIcon", "CornersOutIcon", "CornersInIcon", "XIcon", "TrashIcon"]],
  ] as const)("%s imports the mapped Phosphor icons", (key, names) => {
    const imported = phosphorNames(read(FILES[key]));
    for (const n of names) expect(imported, n).toContain(n);
  });

  it("prompt bars toggle CaretUp/CaretDown through DynamicIcon at 1.2em", () => {
    for (const key of ["promptImage", "promptVideo"] as const) {
      const src = read(FILES[key]);
      const caret = jsxTags(src, "DynamicIcon").find((t) => /CaretUpIcon/.test(t));
      expect(caret, key).toBeDefined();
      expect(caret).toMatch(/isExpanded\s*\?\s*CaretUpIcon\s*:\s*CaretDownIcon/);
      expect(caret).toMatch(/size="1\.2em"/);
    }
  });

  it("video prompt bar audio toggle uses Waveform for both states", () => {
    const src = read(FILES.promptVideo);
    expect(src).toMatch(/\bicon=\{WaveformIcon\}/);
    expect(src).toMatch(/\bactiveIcon=\{WaveformIcon\}/);
  });

  it("gallery sidebar filters map one icon per filter, in order", () => {
    const src = read(FILES.gallery);
    const block = src.slice(src.indexOf("const SIDEBAR_FILTERS"), src.indexOf("];", src.indexOf("const SIDEBAR_FILTERS")));
    const rows = Array.from(
      block.matchAll(/id:\s*"(\w+)",\s*label:\s*"([^"]+)",\s*icon:\s*(\w+)/g),
      (m) => [m[1], m[2], m[3]],
    );
    expect(rows).toEqual([
      ["all", "All Assets", "GridNineIcon"],
      ["image", "Image", "ImageIcon"],
      ["video", "Video", "VideoCameraIcon"],
      ["audio", "Audio", "MusicNoteIcon"],
      ["mesh", "Mesh", "CubeIcon"],
      ["splat", "Splat", "GlobeIcon"],
      ["uploaded", "Uploaded", "UploadSimpleIcon"],
    ]);
  });

  it("gallery refresh button keeps its handler, label and spin state", () => {
    const src = read(FILES.gallery);
    const at = src.indexOf('aria-label="Refresh list"');
    expect(at).toBeGreaterThan(-1);
    const btn = src.slice(src.lastIndexOf("<Button", at), src.indexOf("</Button>", at));
    expect(btn).toMatch(/onClick=\{refreshGallery\}/);
    expect(btn).toMatch(/<ArrowClockwiseIcon\b/);
    expect(btn).toMatch(/animate-spin/);
  });

  it("task queue spinners keep animate-spin on CircleNotchIcon", () => {
    const src = read(FILES.taskQueue);
    const spinners = jsxTags(src, "CircleNotchIcon");
    expect(spinners.length).toBeGreaterThan(0);
    expect(spinners.some((t) => /animate-spin/.test(t))).toBe(true);
  });

  it("task queue primary actions still point at Phosphor components", () => {
    const src = read(FILES.taskQueue);
    const actions = Array.from(src.matchAll(/primaryActionIcon:\s*([A-Z]\w*Icon)\b/g), (m) => m[1]);
    expect(actions.length).toBeGreaterThan(0);
    const imported = phosphorNames(src);
    for (const a of actions) expect(imported, a).toContain(a);
  });
});

describe("R4-2b DynamicIcon source", () => {
  const src = read(DYNAMIC_ICON);

  it("keeps the DynamicIcon export name and the icon prop", () => {
    expect(src).toMatch(/export const DynamicIcon\b/);
    expect(src).toMatch(/export interface DynamicIconProps\b/);
    expect(src).toMatch(/\bicon:\s*DynamicIconComponent\b/);
  });

  it("widens icon to ComponentType<{ className?, size? }> (not LucideIcon)", () => {
    expect(src).not.toMatch(/\bLucideIcon\b/);
    expect(src).toMatch(/export type DynamicIconComponent\s*=\s*ComponentType<\{[^}]*className\?:\s*string;[^}]*size\?:\s*number\s*\|\s*string;?[^}]*\}>/);
  });

  it("imports lucide only as a type (no lucide runtime in the icons lib)", () => {
    const lucideImports = src.split("\n").filter((l) => /from\s+["']lucide-react["']/.test(l));
    for (const l of lucideImports) expect(l).toMatch(/^import\s+type\b/);
  });

  it("defaults size to 1.2em so Phosphor matches the .lucide box", () => {
    expect(src).toMatch(/size\s*=\s*['"]1\.2em['"]/);
  });

  it("forwards refs", () => {
    expect(src).toMatch(/forwardRef</);
  });

  it("is still exported from the icons lib entry", () => {
    expect(read(ICONS_INDEX)).toMatch(/dynamic-icon/);
  });
});
