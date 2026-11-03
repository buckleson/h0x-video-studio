// B1: product name, bundle id and version are H0x Video Studio across the
// Tauri configs, the CSP no longer allows Google Fonts hosts, and the window
// titles, crate description and HTML head carry the new name.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const DESKTOP = 'crates/desktop/artcraft';
const BASE_CONFS = ['tauri.conf.json', 'tauri-mac.conf.json'];
const OVERLAY_CONFS = ['tauri-dev-hot-reload.conf.json', 'tauri-dev-static.conf.json'];
const EXPECTED = {
  productName: 'H0x Video Studio',
  identifier: 'com.buckleson.h0xvideostudio',
  version: '0.2.0',
};

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, ...rel.split('/')), 'utf8');
}

function readConf(name: string): Record<string, unknown> {
  return JSON.parse(read(`${DESKTOP}/${name}`));
}

describe('B1 names, ids, version', () => {
  it.each(BASE_CONFS)('%s has the H0x name, id and version', (name) => {
    expect(readConf(name)).toMatchObject(EXPECTED);
  });

  it.each(OVERLAY_CONFS)('%s does not override name, id or version', (name) => {
    const conf = readConf(name);
    for (const [key, value] of Object.entries(EXPECTED)) {
      if (key in conf) expect(conf[key]).toBe(value);
    }
  });

  it.each([...BASE_CONFS, ...OVERLAY_CONFS])('%s CSP has no Google Fonts host', (name) => {
    const csp = JSON.stringify((readConf(name).app as any)?.security?.csp ?? {});
    expect(csp).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('main window title and macOS menu say H0x Video Studio', () => {
    const src = read(`${DESKTOP}/src/core/lifecycle/startup/setup_main_window.rs`);
    expect(src).toContain('.title("H0x Video Studio")');
    expect(src).not.toContain('ArtCraft');
  });

  it('Cargo.toml keeps crate name and has the H0x description', () => {
    const toml = read(`${DESKTOP}/Cargo.toml`);
    expect(toml).toMatch(/^name = "artcraft"$/m);
    expect(toml).toMatch(/^description = "H0x Video Studio desktop app"$/m);
  });

  it('index.html head names H0x Video Studio', () => {
    const html = read('frontend/apps/artcraft/app/index.html');
    expect(html).toContain('<title>H0x Video Studio</title>');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/h0x-icon.svg" />');
    expect(html).not.toContain('ArtCraft');
  });
});
