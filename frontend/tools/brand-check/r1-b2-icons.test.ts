// R1 B2: the Tauri and web icons are regenerated from the h0x mark, the
// ArtCraft logo, loader gif and demo videos are gone, and the media
// placeholders point at the h0x icon.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const PUBLIC = 'frontend/apps/artcraft/app/public';
const TAURI_ICONS = 'crates/desktop/artcraft/icons';
const THUMBNAIL_UTILS = 'frontend/libs/common/src/lib/utils/thumbnail-utils.ts';

const TAURI_PNGS: [string, number][] = [
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
];
const WEB_PNGS: [string, number][] = [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
];
const DELETED = [
  `${PUBLIC}/artcraft-icon.svg`,
  `${PUBLIC}/resources/logo/artcraft-icon.png`,
  `${PUBLIC}/resources/logo/artcraft-logo-color-black.svg`,
  `${PUBLIC}/resources/logo/artcraft-logo-color-white.svg`,
  `${PUBLIC}/resources/gifs/artcraft-logo-load.gif`,
  `${PUBLIC}/resources/videos/artcraft-3d-demo.mp4`,
  `${PUBLIC}/resources/videos/artcraft-canvas-demo.mp4`,
];

// --- tests ---

describe('R1 B2 Tauri icons', () => {
  it.each(TAURI_PNGS)('%s is %ipx square', (f, size) => {
    expect(pngSize(`${TAURI_ICONS}/${f}`)).toEqual([size, size]);
  });

  it.each(['icon.icns', 'icon.ico'])('%s exists', (f) => {
    expect(existsSync(abs(`${TAURI_ICONS}/${f}`))).toBe(true);
  });
});

describe('R1 B2 web icons', () => {
  it.each(WEB_PNGS)('%s is %ipx square', (f, size) => {
    expect(pngSize(`${PUBLIC}/${f}`)).toEqual([size, size]);
  });

  it('favicon.ico is an icon file', () => {
    expect([...readFileSync(abs(`${PUBLIC}/favicon.ico`)).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  });

  it('h0x-icon.svg is an SVG with an image or path', () => {
    const svg = readFileSync(abs(`${PUBLIC}/h0x-icon.svg`), 'utf8');
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg).toMatch(/<(image|path)[\s>]/);
  });

  it('resources/logo/h0x-icon.png is a PNG', () => {
    expect(pngSize(`${PUBLIC}/resources/logo/h0x-icon.png`)[0]).toBeGreaterThan(0);
  });
});

describe('R1 B2 removed ArtCraft media', () => {
  it.each(DELETED)('%s is not on disk', (f) => {
    expect(existsSync(abs(f))).toBe(false);
  });

  it.each([PUBLIC, TAURI_ICONS])('no artcraft-* file remains under %s', (dir) => {
    expect(walk(abs(dir)).filter((f) => path.basename(f).toLowerCase().startsWith('artcraft-'))).toEqual([]);
  });

  it('media placeholders point at the h0x icon', () => {
    const src = readFileSync(abs(THUMBNAIL_UTILS), 'utf8');
    expect(src).not.toMatch(/artcraft-logo-load/);
    expect(src.match(/"\/resources\/logo\/h0x-icon\.png"/g)).toHaveLength(2);
  });
});

// --- helpers ---

function abs(rel: string): string {
  return path.join(APP_ROOT, ...rel.split('/'));
}

// Width and height from the PNG IHDR chunk.
function pngSize(rel: string): [number, number] {
  const buf = readFileSync(abs(rel));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
