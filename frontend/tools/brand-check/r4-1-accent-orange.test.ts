// R4-1: dark theme accent is bright orange (#FF6B1A), text on it passes WCAG AA,
// no neon-green accent remains, and the light theme block is byte-identical.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

// --- constants ---

const BASE_CSS = path.resolve(__dirname, '../../apps/artcraft/app/src/styles/base.css');
// sha256 of the `.theme-light { ... }` block (LF endings) before R4-1.
const LIGHT_BLOCK_SHA256 = '27311bd26db93faebd89fa05fe4e4b2ba9f720181bf144c746ec5d486c0f6f4e';

const css = readFileSync(BASE_CSS, 'utf8').replace(/\r\n/g, '\n');

// --- tests ---

describe('R4-1 dark accent orange', () => {
  it.each([':root', '.theme-gray'])('%s carries the orange primary tokens', (sel) => {
    const t = darkBlock(sel);
    expect(t['--st-primary'].toLowerCase()).toBe('#ff6b1a');
    expect(t['--st-primary-rgb']).toBe('255 107 26');
    expect(['#1a0e06', '#171717']).toContain(t['--st-primary-fg'].toLowerCase());
    const [h, s, l] = t['--primary'].split(/\s+/).map((v) => parseFloat(v));
    expect(Math.abs(h - 21.5)).toBeLessThanOrEqual(1);
    expect(s).toBe(100);
    expect(Math.abs(l - 55)).toBeLessThanOrEqual(1);
  });

  it('primary-fg on primary passes WCAG AA (>= 4.5:1)', () => {
    const t = darkBlock(':root');
    expect(contrast(hexRgb(t['--st-primary']), hexRgb(t['--st-primary-fg']))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--st-primary-rgb'].split(' ').map(Number), hexRgb(t['--st-primary-fg']))).toBeGreaterThanOrEqual(4.5);
  });

  it('no neon-green accent remains in base.css', () => {
    expect(css).not.toMatch(/#00ff0?4?\b/i);
    expect(css).not.toMatch(/\b0\s+255\s+4\b/);
    expect(css).not.toMatch(/rgba?\(\s*0\s*,\s*255\s*,\s*4\b/);
    expect(css).not.toMatch(/--primary:\s*12[01]\s/);
  });

  it('light theme block is byte-identical', () => {
    const blocks = [...css.matchAll(/\n\.theme-light \{[^}]*\}/g)].map((m) => m[0]).filter((b) => b.includes('--st-primary'));
    expect(blocks).toHaveLength(1);
    expect(createHash('sha256').update(blocks[0]).digest('hex')).toBe(LIGHT_BLOCK_SHA256);
  });
});

// --- helpers ---

function darkBlock(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

function hexRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
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
