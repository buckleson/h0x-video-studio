// @vitest-environment jsdom
// R1 C1: two themes only (Violet Bloom light + dark "gray"), primary and
// tile-radius tokens, and every theme variable defined in every theme block.
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppearanceSettingsPane } from '../../libs/components/settings-modal/src/lib/panes/AppearanceSettingsPane';
import tailwindConfig from '../../apps/artcraft/tailwind.config';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const BASE_CSS = 'frontend/apps/artcraft/app/src/styles/base.css';
const TAILWIND = 'frontend/apps/artcraft/tailwind.config.ts';
const INDEX_TSX = 'frontend/apps/artcraft/app/src/index.tsx';
const LEGACY = ['black', 'aurora', 'sunset', 'gradient'];

const DARK: Record<string, string> = {
  '--st-bg': '#0a0a0a',
  '--st-panel': '#171717',
  '--st-modal': '#262626',
  '--st-controls': '#262626',
  '--st-controls-rgb': '38 38 38',
  '--st-sunken': '#262626',
  '--st-fg': '#fafafa',
  '--st-fg-rgb': '250 250 250',
  '--st-panel-border': '#282828',
  '--st-controls-border': '#282828',
  '--st-divider': '#282828',
  '--st-primary': '#00ff04',
  '--st-primary-rgb': '0 255 4',
  '--st-primary-fg': '#171717',
  '--radius-tile': '0.625rem',
  '--background': '330 0% 4%',
  '--foreground': '180 0% 98%',
  '--card': '0 0% 9%',
  '--card-foreground': '180 0% 98%',
  '--popover': '0 0% 15%',
  '--popover-foreground': '180 0% 98%',
  '--primary': '121 100% 50%',
  '--primary-foreground': '0 0% 9%',
  '--secondary': '0 0% 15%',
  '--secondary-foreground': '180 0% 98%',
  '--muted': '0 0% 15%',
  '--muted-foreground': '0 0% 63%',
  '--accent': '240 0% 25%',
  '--accent-foreground': '180 0% 98%',
  '--destructive': '359 100% 70%',
  '--destructive-foreground': '180 0% 98%',
  '--border': '0 0% 16%',
  '--input': '0 0% 20%',
  '--ring': '0 0% 45%',
};

const LIGHT: Record<string, string> = {
  '--st-bg': '#fdfdfd',
  '--st-panel': '#f5f8fb',
  '--st-modal': '#fcfcfc',
  '--st-controls': '#edf0f4',
  '--st-controls-rgb': '237 240 244',
  '--st-sunken': '#ebebeb',
  '--st-fg': '#000000',
  '--st-fg-rgb': '0 0 0',
  '--st-panel-border': '#e7e7ee',
  '--st-controls-border': '#e7e7ee',
  '--st-divider': '#e7e7ee',
  '--st-primary': '#7033ff',
  '--st-primary-rgb': '112 51 255',
  '--st-primary-fg': '#ffffff',
  '--radius-tile': '1.4rem',
  '--background': '180 0% 99%',
  '--foreground': '0 0% 0%',
  '--card': '180 0% 99%',
  '--card-foreground': '0 0% 0%',
  '--popover': '0 0% 99%',
  '--popover-foreground': '0 0% 0%',
  '--primary': '258 100% 60%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '214 24% 94%',
  '--secondary-foreground': '195 0% 3%',
  '--muted': '0 0% 96%',
  '--muted-foreground': '0 0% 32%',
  '--accent': '221 100% 94%',
  '--accent-foreground': '216 76% 49%',
  '--destructive': '358 75% 60%',
  '--destructive-foreground': '0 0% 100%',
  '--border': '240 17% 92%',
  '--input': '0 0% 92%',
  '--ring': '0 0% 0%',
};

const PRIMARY = 'rgb(var(--st-primary-rgb) / <alpha-value>)';
const SHADE = /^color-mix\(in srgb, rgb\(var\(--st-primary-rgb\)\) \d+%, (white|black)\)$/;
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = '';
});

// --- tests ---

describe('R1 C1 themes', () => {
  it('no legacy black/aurora/gradient/sunset theme class remains in frontend', () => {
    const hits = gitGrep(['-E', 'theme-(black|aurora|gradient|sunset)', '--', 'frontend', ':!frontend/tools/brand-check/r1-c1-themes.test.ts']);
    expect(hits).toEqual([]);
  });

  it('dark values sit in :root and .theme-gray, light values in .theme-light', () => {
    for (const sel of [':root', '.theme-gray']) expect(themeBlock(sel)).toMatchObject(DARK);
    expect(themeBlock('.theme-light')).toMatchObject(LIGHT);
  });

  it('motion tokens are kept', () => {
    expect(Object.keys(themeBlock(':root'))).toEqual(
      expect.arrayContaining(['--ease-out', '--ease-in-out', '--ease-spring', '--ease-emphasis', '--dur-fast', '--dur-base', '--dur-slow', '--dur-page']),
    );
  });

  it('every theme var used by base.css, tailwind and app classes is defined in each theme block', () => {
    const appVars = gitGrep(['-ohE', 'var\\(--(st-|radius-tile)[a-z0-9-]*', '--', 'frontend/apps', 'frontend/libs']);
    const used = new Set([...usedVars(read(BASE_CSS)), ...usedVars(read(TAILWIND)), ...usedVars(appVars.join('\n'))]);
    expect(used.size).toBeGreaterThan(20);
    for (const sel of [':root', '.theme-gray', '.theme-light']) {
      const defined = themeBlock(sel);
      const missing = [...used].filter((v) => !(v in defined));
      expect(missing, sel).toEqual([]);
    }
  });

  it('tailwind maps primary, brand-primary and blue to --st-primary-rgb and tile radius to --radius-tile', () => {
    const { colors, extend } = tailwindConfig.theme as any;
    for (const name of ['primary', 'brand-primary']) {
      expect(colors[name].DEFAULT).toBe(PRIMARY);
      for (const shade of SHADES) expect(colors[name][shade]).toMatch(SHADE);
    }
    expect(colors.blue.DEFAULT).toBe(PRIMARY);
    expect(extend.borderRadius.tile).toBe('var(--radius-tile)');
  });

  it('index.tsx allows only light and gray; legacy stored values fall back to gray', () => {
    const src = read(INDEX_TSX);
    expect(src).toMatch(/const allowed = \["light", "gray"\];/);
    expect(src).toMatch(/const theme = allowed\.includes\(value\) \? value : "gray";/);
    for (const legacy of LEGACY) expect(src).not.toContain(`"${legacy}"`);
  });

  it('Appearance pane offers exactly Light (light) and Dark (gray)', () => {
    render(createElement(AppearanceSettingsPane));
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Light', 'Dark']);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(localStorage.getItem('st-theme')).toBe('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(localStorage.getItem('st-theme')).toBe('gray');
    expect(document.documentElement.classList.contains('theme-gray')).toBe(true);
  });

  it.each(LEGACY)('Appearance pane normalises stored "%s" to gray', (legacy) => {
    localStorage.setItem('st-theme', legacy);
    render(createElement(AppearanceSettingsPane));
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('st-theme')).toBe('gray');
    expect(document.documentElement.className).toBe('theme-gray');
  });
});

// --- helpers ---

const read = (file: string) => readFileSync(path.join(APP_ROOT, file), 'utf8');

function gitGrep(args: string[]): string[] {
  try {
    return execFileSync('git', ['grep', '-n', ...args], { cwd: APP_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Declarations per selector, merged over every rule whose selector list names it.
function themeBlock(selector: string): Record<string, string> {
  const css = read(BASE_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

const usedVars = (text: string) => [...text.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
