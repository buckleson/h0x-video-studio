// @vitest-environment jsdom
// R1 C1 edge cases: runs the index.tsx theme bootstrap for real, and checks
// theme-block parity, hex/rgb agreement, color-scheme and shade ordering.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import tailwindConfig from '../../apps/artcraft/tailwind.config';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const BASE_CSS = 'frontend/apps/artcraft/app/src/styles/base.css';
const INDEX_TSX = 'frontend/apps/artcraft/app/src/index.tsx';
const KEY = 'st-theme';
const MOTION = ['--ease-out', '--ease-in-out', '--ease-spring', '--ease-emphasis', '--dur-fast', '--dur-base', '--dur-slow', '--dur-page'];
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const PAIRS = [
  ['--st-primary', '--st-primary-rgb'],
  ['--st-controls', '--st-controls-rgb'],
  ['--st-fg', '--st-fg-rgb'],
];

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

// --- tests ---

describe('R1 C1 index.tsx theme bootstrap (executed)', () => {
  it.each([
    [null, 'gray'],
    ['', 'gray'],
    ['gray', 'gray'],
    ['light', 'light'],
    [' light ', 'light'],
    ['black', 'gray'],
    ['aurora', 'gray'],
    ['sunset', 'gray'],
    ['gradient', 'gray'],
    ['LIGHT', 'gray'],
    ['dark', 'gray'],
  ])('stored %j -> theme-%s', (stored, expected) => {
    if (stored !== null) localStorage.setItem(KEY, stored);
    runBootstrap();
    expect(themeClasses()).toEqual([`theme-${expected}`]);
  });

  it('removes stale theme classes but keeps unrelated ones', () => {
    document.documentElement.classList.add('keep-me', 'theme-black', 'theme-sunset');
    localStorage.setItem(KEY, 'aurora');
    runBootstrap();
    expect(themeClasses()).toEqual(['theme-gray']);
    expect(document.documentElement.classList.contains('keep-me')).toBe(true);
  });

  it('does not rewrite the stored value (the Appearance pane owns that)', () => {
    localStorage.setItem(KEY, 'sunset');
    runBootstrap();
    expect(localStorage.getItem(KEY)).toBe('sunset');
  });
});

describe('R1 C1 base.css theme blocks', () => {
  it(':root and .theme-gray share one rule, so dark values cannot drift apart', () => {
    const css = stripComments(read(BASE_CSS));
    expect(css).toMatch(/:root,\s*\.theme-gray\s*\{/);
    const grayRules = [...css.matchAll(/([^{}]+)\{/g)].filter((m) => m[1].split(',').map((s) => s.trim()).includes('.theme-gray'));
    expect(grayRules).toHaveLength(1);
  });

  it('light and dark define the same token set (motion tokens live only in :root)', () => {
    const dark = Object.keys(themeBlock('.theme-gray')).sort();
    const light = Object.keys(themeBlock('.theme-light')).filter((k) => !MOTION.includes(k)).sort();
    expect(light).toEqual(dark);
    for (const m of MOTION) expect(Object.keys(themeBlock('.theme-light'))).not.toContain(m);
  });

  it.each([':root', '.theme-gray', '.theme-light'])('%s: every hex token agrees with its -rgb twin', (sel) => {
    const block = themeBlock(sel);
    for (const [hex, rgb] of PAIRS) expect(hexToRgb(block[hex]), `${sel} ${hex}`).toBe(block[rgb]);
  });

  it('color-scheme is dark for :root/.theme-gray and light for .theme-light', () => {
    expect(themeBlock(':root')['--st-color-scheme']).toBe('dark');
    expect(themeBlock('.theme-gray')['--st-color-scheme']).toBe('dark');
    expect(themeBlock('.theme-light')['--st-color-scheme']).toBe('light');
  });

  it('light and dark primaries differ and primary-fg differs from primary', () => {
    const dark = themeBlock('.theme-gray');
    const light = themeBlock('.theme-light');
    expect(dark['--st-primary']).not.toBe(light['--st-primary']);
    for (const b of [dark, light]) expect(b['--st-primary-fg']).not.toBe(b['--st-primary']);
  });

  it('every hex value is a valid 3/6-digit colour and every HSL token is "H S% L%"', () => {
    for (const sel of [':root', '.theme-gray', '.theme-light']) {
      for (const [k, v] of Object.entries(themeBlock(sel))) {
        if (v.startsWith('#')) expect(v, `${sel} ${k}`).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (k.endsWith('-rgb')) expect(v, `${sel} ${k}`).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
        if (!k.startsWith('--st-') && !k.startsWith('--radius') && !MOTION.includes(k))
          expect(v, `${sel} ${k}`).toMatch(/^\d{1,3}(\.\d+)? \d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/);
      }
    }
  });

  it('no legacy theme selector in any form (class, attribute, or comment-free id)', () => {
    const css = stripComments(read(BASE_CSS));
    expect(css).not.toMatch(/theme-(black|aurora|gradient|sunset)/);
    expect(css).not.toMatch(/data-theme=["']?(black|aurora|gradient|sunset)/);
  });
});

describe('R1 C1 tailwind primary shades', () => {
  it.each(['primary', 'brand-primary'])('%s: 50-500 mix with white rising, 600-950 mix with black falling', (name) => {
    const scale = (tailwindConfig.theme as any).colors[name];
    const parsed = SHADES.map((s) => {
      const m = /(\d+)%, (white|black)\)$/.exec(scale[s]);
      expect(m, `${name}.${s}`).not.toBeNull();
      return { pct: Number(m![1]), mix: m![2] };
    });
    const light = parsed.slice(0, 6);
    const dark = parsed.slice(6);
    expect(light.every((p) => p.mix === 'white')).toBe(true);
    expect(dark.every((p) => p.mix === 'black')).toBe(true);
    for (let i = 1; i < light.length; i++) expect(light[i].pct).toBeGreaterThan(light[i - 1].pct);
    for (let i = 1; i < dark.length; i++) expect(dark[i].pct).toBeLessThan(dark[i - 1].pct);
    for (const p of parsed) expect(p.pct).toBeGreaterThan(0), expect(p.pct).toBeLessThanOrEqual(100);
  });

  it('primary and brand-primary scales are identical', () => {
    const { colors } = tailwindConfig.theme as any;
    expect(colors['brand-primary']).toEqual(colors.primary);
  });

  it('no hard-coded legacy accent hex left in primary/brand-primary/blue DEFAULT', () => {
    const { colors } = tailwindConfig.theme as any;
    for (const name of ['primary', 'brand-primary', 'blue']) expect(colors[name].DEFAULT).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

// --- helpers ---

const read = (file: string) => readFileSync(path.join(APP_ROOT, file), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const themeClasses = () => [...document.documentElement.classList].filter((c) => c.startsWith('theme-'));

// Pulls the "Apply stored theme early on mount" effect body out of index.tsx,
// drops TS annotations, and runs it against jsdom's document/localStorage.
function runBootstrap() {
  const src = read(INDEX_TSX);
  const m = /\/\/ Apply stored theme early on mount\s*useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(src);
  expect(m, 'theme bootstrap effect not found in index.tsx').not.toBeNull();
  const body = m![1].replace(/:\s*string\[\]/g, '');
  new Function('document', 'localStorage', body)(document, localStorage);
}

function themeBlock(selector: string): Record<string, string> {
  const css = stripComments(read(BASE_CSS)).replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

function hexToRgb(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}
