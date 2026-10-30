// R1 B2 edge cases: every generated Tauri/iOS/Android icon has the size its
// name promises, the .ico/.icns containers are well formed, the web icons are
// real PNGs, h0x-icon.svg is self-contained (no external fetch, no old brand),
// the logo is a byte copy of the h0x mark, no tracked file still points at a
// removed ArtCraft asset, and the placeholder helper falls back correctly.
// Paths are split on "/" and joined with node:path so a Windows checkout works.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getPlaceholderForMediaClass,
  PLACEHOLDER_IMAGES,
} from '../../libs/common/src/lib/utils/thumbnail-utils';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const PUBLIC = 'frontend/apps/artcraft/app/public';
const TAURI_ICONS = 'crates/desktop/artcraft/icons';
const TAURI_CONFS = ['crates/desktop/artcraft/tauri.conf.json', 'crates/desktop/artcraft/tauri-mac.conf.json'];
const MARK_SRC = '../docs/agents/assets/h0x-mark-blue.png';
const LOGO = `${PUBLIC}/resources/logo/h0x-icon.png`;
const OLD_BRANDS = /artcraft|getartcraft|storyteller\.ai|fakeyou|lightricks|\bltx\b/i;
// Asset basenames B2 removed; no tracked source may still reference them.
const REMOVED_NAMES = [
  'artcraft-icon.svg',
  'artcraft-icon.png',
  'artcraft-logo-color-black.svg',
  'artcraft-logo-color-white.svg',
  'artcraft-logo-load.gif',
  'artcraft-3d-demo.mp4',
  'artcraft-canvas-demo.mp4',
];
// Test files and records legitimately name the removed assets.
const REF_EXCLUDES = [':!frontend/tools/brand-check', ':!graphify-out', ':!**/graphify-out/**', ':!docs'];

// --- cases ---

describe('B2 edge: every generated Tauri PNG matches its name', () => {
  const pngs = walk(abs(TAURI_ICONS)).filter((f) => f.endsWith('.png'));

  it('the generator wrote the desktop, ios and android sets', () => {
    const rels = pngs.map((f) => path.relative(abs(TAURI_ICONS), f).split(path.sep).join('/'));
    expect(rels).toContain('64x64.png');
    expect(rels).toContain('icon.png');
    expect(rels).toContain('StoreLogo.png');
    expect(rels.filter((r) => r.startsWith('ios/')).length).toBeGreaterThan(0);
    expect(rels.filter((r) => r.startsWith('android/')).length).toBeGreaterThan(0);
  });

  it.each(['android/mipmap-anydpi-v26/ic_launcher.xml', 'android/values/ic_launcher_background.xml'])(
    'kept generator file %s',
    (rel) => {
      expect(existsSync(abs(`${TAURI_ICONS}/${rel}`))).toBe(true);
    },
  );

  it('every PNG is square and a valid PNG', () => {
    const bad = pngs.filter((f) => {
      const [w, h] = pngSizeAbs(f);
      return w !== h || w === 0;
    });
    expect(bad).toEqual([]);
  });

  it('NxN.png and SquareNxNLogo.png are exactly N px', () => {
    const wrong: string[] = [];
    for (const f of pngs) {
      const m = path.basename(f).match(/^(?:Square)?(\d+)x\1(?:@(\d)x)?(?:Logo)?\.png$/);
      if (!m) continue;
      const want = Number(m[1]) * (m[2] ? Number(m[2]) : 1);
      const [w] = pngSizeAbs(f);
      if (w !== want) wrong.push(`${path.basename(f)}=${w} want ${want}`);
    }
    expect(wrong).toEqual([]);
  });

  it('iOS AppIcon-NxN@Kx.png is N*K px (fractional sizes too)', () => {
    const wrong: string[] = [];
    for (const f of pngs) {
      const m = path.basename(f).match(/^AppIcon-([\d.]+)x\1@(\d)x(?:-\d)?\.png$/);
      if (!m) continue;
      const want = Math.round(Number(m[1]) * Number(m[2]));
      const [w] = pngSizeAbs(f);
      if (w !== want) wrong.push(`${path.basename(f)}=${w} want ${want}`);
    }
    expect(wrong).toEqual([]);
  });

  it('icon.png is the large source size (>= 512)', () => {
    expect(pngSize(`${TAURI_ICONS}/icon.png`)[0]).toBeGreaterThanOrEqual(512);
  });
});

describe('B2 edge: icon containers are well formed', () => {
  it('icon.icns has the icns magic and its declared length matches the file', () => {
    const buf = readFileSync(abs(`${TAURI_ICONS}/icon.icns`));
    expect(buf.subarray(0, 4).toString('ascii')).toBe('icns');
    expect(buf.readUInt32BE(4)).toBe(buf.length);
  });

  it('Tauri icon.ico holds a 32px entry and entries stay inside the file', () => {
    const entries = icoEntries(`${TAURI_ICONS}/icon.ico`);
    expect(entries.map((e) => e.size)).toContain(32);
  });

  it('public favicon.ico holds 16px and 32px entries', () => {
    const sizes = icoEntries(`${PUBLIC}/favicon.ico`).map((e) => e.size);
    expect(sizes).toEqual(expect.arrayContaining([16, 32]));
  });

  it.each(TAURI_CONFS)('%s bundle.icon entries all exist on disk', (conf) => {
    const icons: string[] = JSON.parse(readFileSync(abs(conf), 'utf8')).bundle.icon;
    expect(icons.length).toBeGreaterThan(0);
    const missing = icons.filter((i) => !existsSync(abs(`crates/desktop/artcraft/${i}`)));
    expect(missing).toEqual([]);
  });
});

describe('B2 edge: h0x-icon.svg is self-contained', () => {
  const svg = readFileSync(abs(`${PUBLIC}/h0x-icon.svg`), 'utf8');

  it('has exactly one <svg> root that closes', () => {
    expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it('declares a viewBox so it scales as a favicon', () => {
    expect(svg).toMatch(/viewBox="[\d.\s-]+"/);
  });

  it('loads nothing from the network', () => {
    expect(svg).not.toMatch(/(?:href|src)=["']\s*(?:https?:)?\/\//i);
  });

  it('any embedded data: image decodes to a real PNG', () => {
    const data = [...svg.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)].map((m) => m[1]);
    for (const b64 of data) {
      const buf = Buffer.from(b64, 'base64');
      expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(buf.readUInt32BE(16)).toBeGreaterThan(0);
    }
  });

  it('carries no old brand text', () => {
    const text = svg.replace(/data:[^"']+/g, '');
    expect(text).not.toMatch(OLD_BRANDS);
  });
});

describe('B2 edge: logo and web icons', () => {
  it('resources/logo/h0x-icon.png is a byte copy of h0x-mark-blue.png', () => {
    expect(readFileSync(abs(LOGO)).equals(readFileSync(abs(MARK_SRC)))).toBe(true);
  });

  it('web PNGs are distinct renders, not one file copied under every name', () => {
    const names = ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png',
      'android-chrome-192x192.png', 'android-chrome-512x512.png'];
    const blobs = new Set(names.map((n) => readFileSync(abs(`${PUBLIC}/${n}`)).toString('base64')));
    expect(blobs.size).toBe(names.length);
  });

  it('no file or folder under public/ or icons/ contains "artcraft" in any case', () => {
    const hits = [PUBLIC, TAURI_ICONS]
      .flatMap((d) => walkAll(abs(d)))
      .filter((f) => /artcraft/i.test(path.basename(f)));
    expect(hits).toEqual([]);
  });

  it.each(REMOVED_NAMES)('git no longer tracks %s', (name) => {
    const tracked = git(['ls-files', '--', `*${name}`]).trim();
    expect(tracked).toBe('');
  });

  it.each(REMOVED_NAMES)('no tracked source references %s', (name) => {
    expect(gitGrep(name)).toEqual([]);
  });
});

describe('B2 edge: placeholder helper', () => {
  it('both placeholders resolve to a file that exists in public/', () => {
    for (const p of Object.values(PLACEHOLDER_IMAGES)) {
      expect(p.startsWith('/')).toBe(true);
      expect(existsSync(abs(`${PUBLIC}${p}`))).toBe(true);
    }
  });

  it.each([
    ['video', PLACEHOLDER_IMAGES.VIDEO],
    [undefined, PLACEHOLDER_IMAGES.DEFAULT],
    ['', PLACEHOLDER_IMAGES.DEFAULT],
    ['image', PLACEHOLDER_IMAGES.DEFAULT],
    ['VIDEO', PLACEHOLDER_IMAGES.DEFAULT],
    ['dimensional', PLACEHOLDER_IMAGES.DEFAULT],
  ])('getPlaceholderForMediaClass(%j) -> %s', (cls, want) => {
    expect(getPlaceholderForMediaClass(cls as string | undefined)).toBe(want);
  });

  it('no placeholder path names the old brand', () => {
    for (const p of Object.values(PLACEHOLDER_IMAGES)) expect(p).not.toMatch(OLD_BRANDS);
  });
});

// --- helpers ---

function abs(rel: string): string {
  return path.join(APP_ROOT, ...rel.split('/'));
}

function pngSize(rel: string): [number, number] {
  return pngSizeAbs(abs(rel));
}

// Width and height from the PNG IHDR chunk.
function pngSizeAbs(file: string): [number, number] {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), file).toBe(true);
  expect(buf.subarray(12, 16).toString('ascii'), file).toBe('IHDR');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

// ICONDIR entries; width byte 0 means 256. Each image must lie inside the file.
function icoEntries(rel: string): { size: number }[] {
  const buf = readFileSync(abs(rel));
  expect([...buf.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
  const count = buf.readUInt16LE(4);
  expect(count).toBeGreaterThan(0);
  const out: { size: number }[] = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const w = buf[o] || 256;
    const h = buf[o + 1] || 256;
    expect(w).toBe(h);
    const len = buf.readUInt32LE(o + 8);
    const off = buf.readUInt32LE(o + 12);
    expect(off + len).toBeLessThanOrEqual(buf.length);
    out.push({ size: w });
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Files and directories.
function walkAll(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? [full, ...walkAll(full)] : [full];
  });
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function gitGrep(literal: string): string[] {
  try {
    return git(['grep', '-n', '-F', '-I', literal, '--', '.', ...REF_EXCLUDES]).split('\n').filter(Boolean);
  } catch (e: any) {
    if (e.status === 1) return []; // no match
    throw e;
  }
}
