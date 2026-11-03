// R2-5b: every Tauri config lets the asset protocol serve local downloads, and
// any CSP lets images and media load from the asset protocol.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const TAURI_DIR = path.resolve(__dirname, '../../../crates/desktop/artcraft');
const TAURI_CONFS = [
  'tauri.conf.json',
  'tauri-mac.conf.json',
  'tauri-dev-hot-reload.conf.json',
  'tauri-dev-static.conf.json',
];
const DOWNLOADS_SCOPE = '$HOME/Artcraft/downloads/**';
const ASSET_SOURCES = ['asset:', 'http://asset.localhost'];

type Security = {
  assetProtocol?: { enable?: boolean; scope?: string[] | { allow?: string[] } };
  csp?: string | Record<string, string | string[]> | null;
};

const securityOf = (f: string): Security =>
  JSON.parse(readFileSync(path.join(TAURI_DIR, f), 'utf8')).app?.security ?? {};

function scopeOf(security: Security): string[] {
  const scope = security.assetProtocol?.scope;
  return Array.isArray(scope) ? scope : scope?.allow ?? [];
}

// A missing fetch directive falls back to default-src, as browsers do.
function directiveSources(csp: NonNullable<Security['csp']>, directive: string): string[] {
  const lookup = (name: string): string[] | undefined => {
    if (typeof csp === 'string') {
      const entry = csp.split(';').map((d) => d.trim().split(/\s+/)).find(([n]) => n === name);
      return entry?.slice(1);
    }
    const value = csp[name];
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value : value.split(/\s+/);
  };
  return lookup(directive) ?? lookup('default-src') ?? [];
}

describe('R2-5b Tauri asset protocol', () => {
  it.each(TAURI_CONFS)('%s enables the asset protocol', (f) => {
    expect(securityOf(f).assetProtocol?.enable).toBe(true);
  });

  it.each(TAURI_CONFS)('%s scope covers the local downloads folder', (f) => {
    expect(scopeOf(securityOf(f))).toContain(DOWNLOADS_SCOPE);
  });

  const withCsp = TAURI_CONFS.filter((f) => securityOf(f).csp);

  it('the main configs define a CSP', () => {
    expect(withCsp).toEqual(expect.arrayContaining(['tauri.conf.json', 'tauri-mac.conf.json']));
  });

  it.each(withCsp.flatMap((f) => ['img-src', 'media-src'].map((d) => [f, d])))(
    '%s %s allows the asset protocol',
    (f, directive) => {
      const sources = directiveSources(securityOf(f).csp!, directive);
      expect(sources).toEqual(expect.arrayContaining(ASSET_SOURCES));
    },
  );
});
