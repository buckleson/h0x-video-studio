// R1 C2 edge cases: the bundled font files are real, byte-identical copies of
// the local assets, every @font-face URL resolves, every font-family names a
// bundled face or a system fallback, and no external font host or old family
// sneaks back in.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import tailwindConfig from '../../apps/artcraft/tailwind.config';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const PUBLIC_DIR = 'frontend/apps/artcraft/app/public';
const FONTS_DIR = `${PUBLIC_DIR}/resources/fonts`;
const BASE_CSS = 'frontend/apps/artcraft/app/src/styles/base.css';
const INDEX_HTML = 'frontend/apps/artcraft/app/index.html';
const ROOT_TSX = 'frontend/apps/artcraft/app/src/root.tsx';
const LOGIN_MODAL = 'frontend/libs/components/login-modal/src/lib/login-modal.tsx';
const LOGIN_SUCCESS_CSS = 'frontend/libs/components/login-modal/src/lib/LoginSuccess.module.css';
const NOTICE_LINE = 'Plus Jakarta Sans and Geist Mono — SIL Open Font License 1.1';
const BUNDLED = ['Plus Jakarta Sans', 'Geist Mono'];
const OLD_FAMILIES = ['Archivo', 'Instrument Serif', 'Fira Sans', 'Inter'];
// Where each bundled file was copied from. docs/agents sits beside app/.
const SOURCES: Array<[string, string]> = [
  ['PlusJakartaSans-Variable.ttf', '../docs/agents/assets'],
  ['PlusJakartaSans-Italic-Variable.ttf', '../docs/agents/assets'],
  ['OFL-PlusJakartaSans.txt', '../docs/agents/assets'],
  ['GeistMono-Variable.ttf', 'artcraft-native/assets/fonts'],
  ['OFL-GeistMono.txt', 'artcraft-native/assets/fonts'],
];
const LICENSES: Array<[string, string]> = [
  ['OFL-PlusJakartaSans.txt', 'Plus Jakarta Sans'],
  ['OFL-GeistMono.txt', 'Geist'],
];
const SYSTEM_FAMILIES = new Set(
  [
    'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial',
    'sans-serif', 'ui-sans-serif', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace',
    'inherit', 'initial', 'unset', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji',
  ].map((f) => f.toLowerCase()),
);
const BRAND_LEAKS = /artcraft|getartcraft|storyteller\.ai|fakeyou|\bLTX\b|lightricks/i;

// --- tests ---

describe('R1 C2 bundled font files', () => {
  it.each(SOURCES)('%s is a byte-identical copy of %s', (file, srcDir) => {
    const src = path.join(APP_ROOT, srcDir, file);
    const dst = path.join(APP_ROOT, FONTS_DIR, file);
    expect(existsSync(dst), dst).toBe(true);
    if (!existsSync(src)) return; // Source tree not checked out here: nothing to compare.
    expect(readFileSync(dst).equals(readFileSync(src)), file).toBe(true);
  });

  it.each(SOURCES.filter(([f]) => f.endsWith('.ttf')).map(([f]) => f))('%s is a real TrueType file', (file) => {
    const buf = readFileSync(path.join(APP_ROOT, FONTS_DIR, file));
    expect(buf.length).toBeGreaterThan(10_000);
    // sfnt version 0x00010000 = TrueType outlines; not an HTML error page or LFS pointer.
    expect(buf.readUInt32BE(0)).toBe(0x00010000);
    expect(buf.subarray(0, 64).toString('latin1')).not.toMatch(/<html|version https:\/\/git-lfs/i);
  });

  it.each(LICENSES)('%s is the OFL 1.1 text for %s', (file, family) => {
    const text = readFileSync(path.join(APP_ROOT, FONTS_DIR, file), 'utf8');
    expect(text).toContain('SIL Open Font License, Version 1.1');
    expect(text).toContain(family);
    expect(text).not.toMatch(BRAND_LEAKS);
  });

  it('ships no old-family font files next to the new ones', () => {
    const tracked = gitLsFiles(FONTS_DIR);
    for (const old of ['Archivo', 'Inter-', 'InstrumentSerif', 'FiraSans']) {
      expect(tracked.filter((f) => f.includes(old)), old).toEqual([]);
    }
  });
});

describe('R1 C2 @font-face rules', () => {
  const faces = fontFaces(read(BASE_CSS));

  it('declares exactly three faces, all for bundled families', () => {
    expect(faces).toHaveLength(3);
    for (const face of faces) expect(BUNDLED).toContain(faceFamily(face));
  });

  it('every face URL is a root-absolute /resources/fonts/ path that exists in public/', () => {
    for (const face of faces) {
      const urls = [...face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
      expect(urls.length, face).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url).toMatch(/^\/resources\/fonts\/[\w.-]+\.ttf$/);
        expect(url).not.toContain('\\');
        expect(existsSync(path.join(APP_ROOT, PUBLIC_DIR, url)), url).toBe(true);
      }
    }
  });

  it('every face is a variable font with swap display and a truetype hint', () => {
    for (const face of faces) {
      expect(face).toMatch(/font-display:\s*swap/);
      expect(face).toMatch(/format\(["']truetype["']\)/);
      expect(face).toMatch(/font-weight:\s*\d{3}\s+\d{3}\s*;/);
    }
  });

  it('declares no duplicate family/style pair', () => {
    const keys = faces.map((f) => `${faceFamily(f)}|${/font-style:\s*(\w+)/.exec(f)?.[1] ?? 'normal'}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('font weights used by headings and .font-display fall inside Plus Jakarta Sans 200..800', () => {
    const css = stripComments(read(BASE_CSS)).replace(/@font-face\s*\{[^}]*\}/g, '');
    const weights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThan(0);
    for (const w of weights) {
      expect(w).toBeGreaterThanOrEqual(200);
      expect(w).toBeLessThanOrEqual(800);
    }
  });

  it('base.css no longer stretches the width axis (Plus Jakarta Sans has none)', () => {
    expect(stripComments(read(BASE_CSS))).not.toMatch(/font-stretch\s*:\s*(1[0-9]{2}|[2-9]\d{2})%/);
  });
});

describe('R1 C2 font-family references', () => {
  it.each([BASE_CSS, LOGIN_SUCCESS_CSS])('%s names only bundled faces or system fallbacks', (file) => {
    const css = stripComments(read(file)).replace(/@font-face\s*\{[^}]*\}/g, '');
    const decls = [...css.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1]);
    expect(decls.length).toBeGreaterThan(0);
    for (const decl of decls) {
      for (const fam of splitFamilies(decl)) {
        const ok = BUNDLED.includes(fam) || SYSTEM_FAMILIES.has(fam.toLowerCase());
        expect(ok, `${file}: ${fam}`).toBe(true);
      }
    }
  });

  it('tailwind families all start with a bundled face and contain no old families', () => {
    const fontFamily = (tailwindConfig.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;
    expect(Object.keys(fontFamily).sort()).toEqual(['display', 'mono', 'sans']);
    for (const [key, stack] of Object.entries(fontFamily)) {
      expect(BUNDLED, key).toContain(stack[0]);
      expect(new Set(stack).size, `${key} has duplicates`).toBe(stack.length);
      for (const old of OLD_FAMILIES) expect(stack, key).not.toContain(old);
      // The last entry is a generic family so text never falls back to the browser serif.
      expect(['sans-serif', 'monospace'], key).toContain(stack[stack.length - 1]);
    }
  });

  it('no source still uses the deleted utility classes', () => {
    expect(gitGrep(['-E', 'font-serif-italic|font-custom-font|\\bfont-serif\\b', '--', 'frontend', ':!**/node_modules/**'])).toEqual([]);
  });
});

describe('R1 C2 no external font loading', () => {
  it.each([INDEX_HTML, ROOT_TSX])('%s links no external host at all', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/rel=["']?preconnect|rel:\s*["']preconnect/);
    expect(src).not.toMatch(/googleapis|gstatic|fonts\.bunny|typekit|use\.fontawesome/i);
    const hrefs = [...src.matchAll(/href\s*[:=]\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const href of hrefs) expect(href, file).not.toMatch(/^(https?:)?\/\//);
  });

  it('root.tsx links() still returns the base stylesheet', () => {
    const src = read(ROOT_TSX);
    expect(src).toMatch(/rel:\s*["']stylesheet["'],\s*href:\s*baseCss/);
  });

  it('no stylesheet @imports a remote font', () => {
    expect(gitGrep(['-E', '@import\\s+url\\(\\s*["\']?https?:', '--', 'frontend/**/*.css', ':!**/node_modules/**'])).toEqual([]);
  });
});

describe('R1 C2 login modal copy', () => {
  it('keeps the emphasised words and adds no italic or serif styling', () => {
    const tsx = read(LOGIN_MODAL);
    expect(tsx).toMatch(/<span className="font-display">community\.<\/span>/);
    expect(tsx).toMatch(/<span className="font-display">back\.<\/span>/);
    expect(tsx).not.toMatch(/Instrument|Georgia|Times New Roman/);
  });

  it('LoginSuccess.module.css has no old family left in any declaration', () => {
    const css = read(LOGIN_SUCCESS_CSS);
    for (const old of OLD_FAMILIES) expect(css).not.toMatch(new RegExp(`["']?${old}["']?\\s*[,;]`));
  });
});

describe('R1 C2 NOTICE', () => {
  it('credits the fonts exactly once, with a path that exists', () => {
    const lines = read('NOTICE').split(/\r?\n/);
    expect(lines.filter((l) => l === NOTICE_LINE)).toHaveLength(1);
    const next = lines[lines.indexOf(NOTICE_LINE) + 1] ?? '';
    const cited = /\(([^)]*resources\/fonts\/?)/.exec(next)?.[1];
    expect(cited, next).toBeDefined();
    expect(existsSync(path.join(APP_ROOT, cited!))).toBe(true);
  });

  it('the new credit lines carry no brand leaks', () => {
    const lines = read('NOTICE').split(/\r?\n/);
    const i = lines.indexOf(NOTICE_LINE);
    // Repo paths (frontend/apps/artcraft/...) are internal names, allow-listed until R2.
    const prose = lines.slice(i, i + 2).join('\n').replace(/[\w.-]+(\/[\w.-]*)+/g, '');
    expect(prose).not.toMatch(BRAND_LEAKS);
  });
});

// --- helpers ---

function read(file: string): string {
  return readFileSync(path.join(APP_ROOT, file), 'utf8');
}

function gitGrep(args: string[]): string[] {
  try {
    return execFileSync('git', ['grep', '-n', ...args, ':!**/*.spec.*', ':!**/*.test.*'], { cwd: APP_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function gitLsFiles(dir: string): string[] {
  // Includes untracked files so a fresh copy is still checked.
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', dir], {
    cwd: APP_ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter((f) => f && statSync(path.join(APP_ROOT, f)).isFile());
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function fontFaces(css: string): string[] {
  return stripComments(css).match(/@font-face\s*\{[^}]*\}/g) ?? [];
}

function faceFamily(face: string): string {
  return /font-family:\s*["']?([^"';]+)["']?\s*;/.exec(face)?.[1] ?? '';
}

function splitFamilies(decl: string): string[] {
  return decl
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}
