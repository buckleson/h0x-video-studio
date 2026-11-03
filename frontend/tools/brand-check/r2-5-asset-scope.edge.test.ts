// R2-5b edge cases: the asset protocol scope matches the real downloads folder,
// is portable across OSes, agrees across the 4 Tauri confs, and the CSP lets
// images and media load from every asset origin the webview can use.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const TAURI_DIR = path.resolve(__dirname, '../../../crates/desktop/artcraft');
const DATA_DIR_RS = path.join(TAURI_DIR, 'src/core/state/data_dir');
const TAURI_CONFS = [
  'tauri.conf.json',
  'tauri-mac.conf.json',
  'tauri-dev-hot-reload.conf.json',
  'tauri-dev-static.conf.json',
];
const DOWNLOADS_SCOPE = '$HOME/Artcraft/downloads/**';
const ASSET_SOURCES = ['asset:', 'http://asset.localhost'];
// Hard-coded home folders that would only work on one machine or one OS.
const MACHINE_PATH = /^[A-Za-z]:|\\|\/Users\/|\/home\/|^~/;
const FOREIGN_BRANDS = /ltx|lightricks|fakeyou|storyteller/i;

type Csp = string | Record<string, string | string[]> | null | undefined;
type Conf = {
  app?: {
    windows?: Array<{ useHttpsScheme?: boolean }>;
    security?: {
      assetProtocol?: { enable?: boolean; scope?: string[] | { allow?: string[]; deny?: string[] } };
      csp?: Csp;
    };
  };
};

const confOf = (f: string): Conf => JSON.parse(readFileSync(path.join(TAURI_DIR, f), 'utf8'));
const assetOf = (f: string) => confOf(f).app?.security?.assetProtocol ?? {};

function allowOf(f: string): string[] {
  const scope = assetOf(f).scope;
  return Array.isArray(scope) ? scope : scope?.allow ?? [];
}

function denyOf(f: string): string[] {
  const scope = assetOf(f).scope;
  return Array.isArray(scope) ? [] : scope?.deny ?? [];
}

function rawDirective(csp: Csp, name: string): string[] | undefined {
  if (!csp) return undefined;
  if (typeof csp === 'string') {
    const entry = csp.split(';').map((d) => d.trim().split(/\s+/)).find(([n]) => n === name);
    return entry?.slice(1);
  }
  const value = csp[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : value.split(/\s+/);
}

// Browser rule: an explicit fetch directive shadows default-src entirely.
const effective = (csp: Csp, name: string): string[] =>
  rawDirective(csp, name) ?? rawDirective(csp, 'default-src') ?? [];

describe('R2-5b CSP fallback helper', () => {
  it('uses default-src when the directive is missing', () => {
    expect(effective({ 'default-src': ['asset:'] }, 'media-src')).toEqual(['asset:']);
  });

  it('does not merge default-src into an explicit directive', () => {
    expect(effective({ 'default-src': ['asset:'], 'media-src': ["'self'"] }, 'media-src')).toEqual(["'self'"]);
  });

  it('parses the string CSP form', () => {
    expect(effective("default-src 'self'; img-src asset: http://asset.localhost", 'img-src')).toEqual(ASSET_SOURCES);
  });

  it('returns nothing for an absent CSP', () => {
    expect(effective(null, 'img-src')).toEqual([]);
    expect(effective(undefined, 'media-src')).toEqual([]);
  });
});

describe('R2-5b asset scope edge cases', () => {
  it('the downloads scope matches the Rust data dir and downloads subdir names', () => {
    const root = readFileSync(path.join(DATA_DIR_RS, 'app_data_root.rs'), 'utf8');
    const downloads = readFileSync(path.join(DATA_DIR_RS, 'app_downloads_dir.rs'), 'utf8');
    const dataDir = root.match(/DEFAULT_DATA_DIR\s*:\s*&str\s*=\s*"([^"]+)"/)?.[1];
    const subDir = downloads.match(/DIRECTORY_NAME\s*:\s*&'static str\s*=\s*"([^"]+)"/)?.[1];
    expect(root).toMatch(/home_dir\(\)\s*\.join\(DEFAULT_DATA_DIR\)/);
    expect(`$HOME/${dataDir}/${subDir}/**`).toBe(DOWNLOADS_SCOPE);
  });

  it.each(TAURI_CONFS)('%s enable is the boolean true, not a truthy string', (f) => {
    expect(assetOf(f).enable).toStrictEqual(true);
  });

  it.each(TAURI_CONFS)('%s scope entries are non-empty, unique, portable strings', (f) => {
    const allow = allowOf(f);
    expect(allow.length).toBeGreaterThan(0);
    expect(new Set(allow).size).toBe(allow.length);
    for (const entry of allow) {
      expect(typeof entry).toBe('string');
      expect(entry.trim()).not.toBe('');
      expect(entry, `${f} scope ${entry}`).not.toMatch(MACHINE_PATH);
    }
  });

  it.each(TAURI_CONFS)('%s does not deny the downloads folder', (f) => {
    for (const d of denyOf(f)) {
      expect(d).not.toMatch(/downloads|^\*\*$|^\$HOME\/\*\*$|^\$HOME\/Artcraft/);
    }
  });

  it('all 4 confs agree on the asset protocol block', () => {
    const [first, ...rest] = TAURI_CONFS.map((f) => JSON.stringify(assetOf(f)));
    for (const other of rest) expect(other).toBe(first);
  });

  it.each(TAURI_CONFS)('%s asset protocol block has no foreign or legacy brand', (f) => {
    expect(JSON.stringify(assetOf(f))).not.toMatch(FOREIGN_BRANDS);
  });
});

describe('R2-5b CSP edge cases', () => {
  const withCsp = TAURI_CONFS.filter((f) => confOf(f).app?.security?.csp);

  it('tauri-dev-static.conf.json sets no CSP, so nothing blocks asset loads there', () => {
    expect(confOf('tauri-dev-static.conf.json').app?.security?.csp ?? null).toBeNull();
  });

  it.each(withCsp)('%s has no explicit media-src that shadows default-src without asset sources', (f) => {
    const csp = confOf(f).app!.security!.csp;
    const media = rawDirective(csp, 'media-src');
    if (media !== undefined) expect(media).toEqual(expect.arrayContaining(ASSET_SOURCES));
    expect(effective(csp, 'media-src')).toEqual(expect.arrayContaining(ASSET_SOURCES));
  });

  // A bare "*" never matches custom schemes like asset:, so img-src needs them by name.
  it.each(withCsp)('%s img-src names the asset sources even though it has "*"', (f) => {
    const img = rawDirective(confOf(f).app!.security!.csp, 'img-src') ?? [];
    expect(img).toEqual(expect.arrayContaining(ASSET_SOURCES));
  });

  // Windows serves convertFileSrc URLs from https://asset.localhost when a window uses the https scheme.
  it.each(withCsp)('%s allows https://asset.localhost for images and media if any window uses https', (f) => {
    const conf = confOf(f);
    const https = (conf.app?.windows ?? []).some((w) => w.useHttpsScheme === true);
    if (!https) return;
    for (const d of ['img-src', 'media-src']) {
      expect(effective(conf.app!.security!.csp, d)).toContain('https://asset.localhost');
    }
  });

  it.each(withCsp)('%s asset sources are spelled exactly (no trailing slash or wrong scheme)', (f) => {
    const csp = confOf(f).app!.security!.csp;
    for (const d of ['img-src', 'default-src']) {
      const sources = rawDirective(csp, d) ?? [];
      expect(sources).not.toContain('asset://');
      expect(sources).not.toContain('http://asset.localhost/');
      expect(sources).not.toContain('asset://localhost');
    }
  });
});
