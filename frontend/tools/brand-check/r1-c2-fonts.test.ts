// R1 C2: Plus Jakarta Sans + Geist Mono are bundled locally; Google Fonts and
// the old families (Archivo, Instrument Serif, Fira Sans) are gone.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import tailwindConfig from '../../apps/artcraft/tailwind.config';

const APP_ROOT = path.resolve(__dirname, '../../..');
const FONTS_DIR = 'frontend/apps/artcraft/app/public/resources/fonts';
const BASE_CSS = 'frontend/apps/artcraft/app/src/styles/base.css';
const INDEX_HTML = 'frontend/apps/artcraft/app/index.html';
const ROOT_TSX = 'frontend/apps/artcraft/app/src/root.tsx';
const LOGIN_MODAL = 'frontend/libs/components/login-modal/src/lib/login-modal.tsx';
const LOGIN_SUCCESS_CSS = 'frontend/libs/components/login-modal/src/lib/LoginSuccess.module.css';
const FONT_FILES = [
  'PlusJakartaSans-Variable.ttf',
  'PlusJakartaSans-Italic-Variable.ttf',
  'OFL-PlusJakartaSans.txt',
  'GeistMono-Variable.ttf',
  'OFL-GeistMono.txt',
];
const SYSTEM_FALLBACKS = ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'];

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

function fontFaces(css: string): string[] {
  return css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
}

const fontFamily = (tailwindConfig.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;

describe('R1 C2 bundled fonts', () => {
  it.each(FONT_FILES)('ships %s in public/resources/fonts', (file) => {
    expect(existsSync(path.join(APP_ROOT, FONTS_DIR, file))).toBe(true);
  });

  it('declares Plus Jakarta Sans normal and italic (200 800) from /resources/fonts/', () => {
    const faces = fontFaces(read(BASE_CSS)).filter((f) => f.includes('"Plus Jakarta Sans"'));
    for (const [style, file] of [
      ['normal', 'PlusJakartaSans-Variable.ttf'],
      ['italic', 'PlusJakartaSans-Italic-Variable.ttf'],
    ]) {
      const face = faces.find((f) => new RegExp(`font-style:\\s*${style}`).test(f));
      expect(face, style).toBeDefined();
      expect(face).toContain(`/resources/fonts/${file}`);
      expect(face).toMatch(/font-weight:\s*200 800/);
    }
  });

  it('declares Geist Mono (100 900) from /resources/fonts/', () => {
    const face = fontFaces(read(BASE_CSS)).find((f) => f.includes('"Geist Mono"'));
    expect(face).toBeDefined();
    expect(face).toContain('/resources/fonts/GeistMono-Variable.ttf');
    expect(face).toMatch(/font-weight:\s*100 900/);
  });

  it.each(['sans', 'display'])('tailwind %s starts with Plus Jakarta Sans and keeps system fallbacks', (key) => {
    expect(fontFamily[key][0]).toBe('Plus Jakarta Sans');
    for (const fallback of SYSTEM_FALLBACKS) expect(fontFamily[key]).toContain(fallback);
  });

  it('tailwind mono starts with Geist Mono and custom-font is gone', () => {
    expect(fontFamily['mono'][0]).toBe('Geist Mono');
    expect(fontFamily).not.toHaveProperty('custom-font');
    expect(gitGrep(['custom-font', '--', 'frontend', ':!**/node_modules/**'])).toEqual([]);
  });

  it('index.html and root.tsx load no Google Fonts', () => {
    for (const file of [INDEX_HTML, ROOT_TSX]) expect(read(file), file).not.toMatch(/fonts\.(googleapis|gstatic)/);
  });

  it('login modal uses font-display instead of the serif classes', () => {
    const tsx = read(LOGIN_MODAL);
    expect(tsx).not.toMatch(/font-serif/);
    expect(tsx.match(/<span className="font-display">/g)).toHaveLength(2);
    expect(read(BASE_CSS)).not.toMatch(/font-serif/);
    expect(read(LOGIN_SUCCESS_CSS)).toMatch(/font-family:\s*"Plus Jakarta Sans"/);
  });

  it('no Google Fonts or old families remain in frontend or tauri configs', () => {
    expect(
      gitGrep([
        'fonts.googleapis\\|fonts.gstatic\\|Instrument Serif\\|Archivo\\|Fira Sans',
        '--',
        'frontend',
        'crates/desktop/artcraft/tauri*.json',
        ':!**/node_modules/**',
        // video-editor text-overlay font catalog: Open (needs user), see HANDOFF
        ':!frontend/libs/components/video-editor/src/lib/fonts/google-fonts.ts',
      ]),
    ).toEqual([]);
  });

  it('NOTICE credits the bundled fonts', () => {
    expect(read('NOTICE').split(/\r?\n/)).toContain('Plus Jakarta Sans and Geist Mono — SIL Open Font License 1.1');
  });
});
