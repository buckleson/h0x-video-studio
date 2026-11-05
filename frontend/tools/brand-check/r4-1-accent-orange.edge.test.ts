// R4-1 edge cases: the shadcn HSL primary really is the orange, its
// foreground passes AA, the orange stands out on dark surfaces, Tailwind
// still routes the accent through the token, success greens are untouched,
// the light theme keeps violet, and no neon green is left in the app source.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import tailwindConfig from '../../apps/artcraft/tailwind.config';

// --- constants ---

const APP_SRC = path.resolve(__dirname, '../../apps/artcraft/app/src');
const BASE_CSS = path.join(APP_SRC, 'styles/base.css');
const ORANGE = [255, 107, 26];
const NEON_GREEN = [/#00ff04\b/i, /#0f4\b/i, /\b0\s+255\s+4\b/, /rgba?\(\s*0\s*,\s*255\s*,\s*4\s*[,)]/];
const DARK_SELECTORS = [':root', '.theme-gray'];
const DARK_SURFACES = ['--st-bg', '--st-panel', '--st-modal', '--st-controls'];

const css = readFileSync(BASE_CSS, 'utf8').replace(/\r\n/g, '\n');
const colors = (tailwindConfig as any).theme.colors;

// --- tests ---

describe('R4-1 shadcn primary (HSL) matches the orange', () => {
  it.each(DARK_SELECTORS)('%s --primary converts to ~#FF6B1A', (sel) => {
    const rgb = hslRgb(block(sel)['--primary']);
    rgb.forEach((c, i) => expect(Math.abs(c - ORANGE[i])).toBeLessThanOrEqual(6));
  });

  it.each(DARK_SELECTORS)('%s --primary hue is orange, not green', (sel) => {
    const h = parseFloat(block(sel)['--primary']);
    expect(h).toBeGreaterThanOrEqual(15);
    expect(h).toBeLessThanOrEqual(30);
  });

  it.each(DARK_SELECTORS)('%s --primary-foreground on --primary passes AA', (sel) => {
    const t = block(sel);
    expect(contrast(hslRgb(t['--primary']), hslRgb(t['--primary-foreground']))).toBeGreaterThanOrEqual(4.5);
  });

  it('both dark selectors share the same accent tokens', () => {
    const keys = ['--st-primary', '--st-primary-rgb', '--st-primary-fg', '--primary', '--primary-foreground'];
    const [a, b] = DARK_SELECTORS.map(block);
    for (const k of keys) expect(b[k], k).toBe(a[k]);
  });
});

describe('R4-1 hex and rgb tokens agree', () => {
  it('--st-primary hex equals --st-primary-rgb triplet', () => {
    const t = block(':root');
    expect(hexRgb(t['--st-primary'])).toEqual(t['--st-primary-rgb'].split(/\s+/).map(Number));
  });

  it('--st-primary-fg is a dark 6-digit hex, not white', () => {
    const fg = block(':root')['--st-primary-fg'];
    expect(fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(luminance(hexRgb(fg))).toBeLessThan(0.05);
  });

  it.each(DARK_SURFACES)('orange accent is visible on %s (>= 3:1 non-text contrast)', (tok) => {
    const t = block(':root');
    expect(contrast(hexRgb(t['--st-primary']), hexRgb(t[tok]))).toBeGreaterThanOrEqual(3);
  });

  it('AA would fail with white text on the orange (guards a fg regression)', () => {
    expect(contrast(ORANGE, [255, 255, 255])).toBeLessThan(4.5);
  });
});

describe('R4-1 untouched neighbours', () => {
  it('light theme still uses the violet accent with white fg', () => {
    const t = block('.theme-light');
    expect(t['--st-primary'].toLowerCase()).toBe('#7033ff');
    expect(t['--st-primary-rgb']).toBe('112 51 255');
    expect(t['--st-primary-fg'].toLowerCase()).toBe('#ffffff');
    expect(t['--primary']).toBe('258 100% 60%');
  });

  it('success greens in Tailwind are unchanged', () => {
    expect(colors.green.DEFAULT).toBe('#308752');
    expect(colors['axis-y']).toBe('#308752');
  });

  it('accent utilities still resolve through --st-primary-rgb', () => {
    const viaToken = 'rgb(var(--st-primary-rgb) / <alpha-value>)';
    expect(colors.blue.DEFAULT).toBe(viaToken);
    expect(colors.primary.DEFAULT).toBe(viaToken);
    expect(colors['brand-primary'].DEFAULT).toBe(viaToken);
    expect(colors.ui['accent-ink']).toBe(viaToken);
  });

  it('no hard-coded neon green anywhere in the artcraft app source', () => {
    const hits: string[] = [];
    for (const f of walk(APP_SRC)) {
      const text = readFileSync(f, 'utf8');
      if (NEON_GREEN.some((re) => re.test(text))) hits.push(path.relative(APP_SRC, f));
    }
    expect(hits).toEqual([]);
  });

  it('theme comments carry no third-party brand names', () => {
    expect(css).not.toMatch(/\bLTX\b|Lightricks/i);
  });
});

// --- helpers ---

function block(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : walk(p);
    return /\.(css|scss|ts|tsx|html)$/.test(n) ? [p] : [];
  });
}

function hexRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function hslRgb(hsl: string): number[] {
  const [h, s, l] = hsl.split(/\s+/).map((v) => parseFloat(v));
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
