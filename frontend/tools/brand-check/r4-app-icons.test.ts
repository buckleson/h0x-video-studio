import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// One icon everywhere: white H0x mark on a blue tile, with a hand-tuned image per
// Windows size so the taskbar, title bar and Desktop shortcut stay crisp.
const ROOT = path.resolve(__dirname, "../../..");
const ICONS = path.join(ROOT, "crates/desktop/artcraft/icons");
const PUBLIC = path.join(ROOT, "frontend/apps/artcraft/app/public");

function icoSizes(file: string): number[] {
  const b = readFileSync(file);
  expect(b.readUInt16LE(0)).toBe(0);
  expect(b.readUInt16LE(2)).toBe(1); // type 1 = icon
  const n = b.readUInt16LE(4);
  return Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c);
}

function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}


describe("app icons", () => {
  it("icon.ico carries every Windows shell size", () => {
    const sizes = icoSizes(path.join(ICONS, "icon.ico"));
    for (const s of [16, 20, 24, 32, 40, 48, 64, 256]) expect(sizes).toContain(s);
  });

  it("favicon.ico carries the browser tab sizes", () => {
    const sizes = icoSizes(path.join(PUBLIC, "favicon.ico"));
    for (const s of [16, 32, 48]) expect(sizes).toContain(s);
  });

  it.each([
    ["crates/desktop/artcraft/icons/32x32.png", 32],
    ["crates/desktop/artcraft/icons/128x128.png", 128],
    ["crates/desktop/artcraft/icons/icon.png", 512],
    ["frontend/apps/artcraft/app/public/resources/logo/h0x-icon.png", 512],
    ["frontend/apps/artcraft/app/public/apple-touch-icon.png", 180],
    ["frontend/apps/artcraft/app/public/android-chrome-192x192.png", 192],
  ])("%s is a square %ipx PNG", (rel, size) => {

    expect(pngSize(path.join(ROOT, rel))).toEqual([size, size]);
  });

  it("the favicon SVG embeds the same tile image", () => {
    const svg = readFileSync(path.join(PUBLIC, "h0x-icon.svg"), "utf8");
    expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 256 256"/);
    expect(svg).toContain("data:image/png;base64,");
  });
});
