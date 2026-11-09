// B1 edge cases: the four Tauri confs agree on name, id and version, the dev
// overlays stay overlays, no CSP (in any form) allows Google Fonts, and the
// window title, crate description and HTML head carry no old brand. Files are
// read with CRLF normalised so a Windows checkout gives the same result.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.resolve(__dirname, '../../..');
const DESKTOP = 'crates/desktop/artcraft';
const INDEX_HTML = 'frontend/apps/artcraft/app/index.html';
const WINDOW_RS = `${DESKTOP}/src/core/lifecycle/startup/setup_main_window.rs`;
const BASE_CONFS = ['tauri.conf.json', 'tauri-mac.conf.json'];
const OVERLAY_CONFS = ['tauri-dev-hot-reload.conf.json', 'tauri-dev-static.conf.json'];
const ALL_CONFS = [...BASE_CONFS, ...OVERLAY_CONFS];
const NAME = 'H0x Video Studio';
const ID = 'com.buckleson.h0xvideostudio';
const VERSION = '0.4.1';
const BRAND_KEYS = ['productName', 'identifier', 'version'] as const;
const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/i;
// Old and third-party brands that must not show up in user-visible strings.
const OLD_BRANDS = /artcraft|getartcraft|storyteller\.ai|fakeyou|lightricks|\bltx\b/i;

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n');
}

function readConf(name: string): Record<string, any> {
  return JSON.parse(read(`${DESKTOP}/${name}`));
}

function headOf(html: string): string {
  const m = html.match(/<head>([\s\S]*?)<\/head>/i);
  expect(m, 'index.html has a <head>').not.toBeNull();
  return m![1];
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function rustStringLiterals(src: string): string[] {
  const noComments = src.replace(/^\s*\/\/.*$/gm, '');
  return [...noComments.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

function cargoPackageSection(toml: string): string {
  const m = toml.match(/^\[package\]\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m);
  expect(m, 'Cargo.toml has a [package] section').not.toBeNull();
  return m![1];
}

describe('B1 edge: base confs agree', () => {
  it('both base confs carry identical name, id and version', () => {
    const [a, b] = BASE_CONFS.map(readConf);
    for (const k of BRAND_KEYS) expect(a[k]).toBe(b[k]);
  });

  it.each(BASE_CONFS)('%s values are exact (no padding, no case drift)', (name) => {
    const conf = readConf(name);
    expect(conf.productName).toBe(NAME);
    expect(conf.identifier).toBe(ID);
    expect(conf.version).toBe(VERSION);
  });

  it.each(BASE_CONFS)('%s identifier is a valid Tauri bundle id', (name) => {
    const id: string = readConf(name).identifier;
    // Tauri: reverse-DNS, alphanumerics, hyphens and dots only; must not end in .app.
    expect(id).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    expect(id).not.toMatch(/\.app$/);
    expect(id).not.toMatch(/artcraft/i);
  });

  it.each(BASE_CONFS)('%s version is plain semver', (name) => {
    expect(readConf(name).version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(BASE_CONFS)('%s has no nested bundle or window override of the brand', (name) => {
    const conf = readConf(name);
    const bundle = conf.bundle ?? {};
    for (const k of ['productName', 'identifier', 'publisher', 'shortDescription', 'longDescription', 'copyright']) {
      if (typeof bundle[k] === 'string') expect(bundle[k]).not.toMatch(OLD_BRANDS);
    }
  });
});

describe('B1 edge: dev confs stay overlays', () => {
  it.each(OVERLAY_CONFS)('%s does not set productName, identifier or version at all', (name) => {
    const conf = readConf(name);
    for (const k of BRAND_KEYS) expect(Object.keys(conf)).not.toContain(k);
  });

  it.each(OVERLAY_CONFS)('%s does not set a bundle identifier either', (name) => {
    expect(readConf(name).bundle?.identifier).toBeUndefined();
  });
});

describe('B1 edge: window titles in confs', () => {
  it.each(ALL_CONFS)('%s windows carry no old-brand title', (name) => {
    const windows: any[] = readConf(name).app?.windows ?? [];
    expect(Array.isArray(windows)).toBe(true);
    for (const w of windows) {
      if (typeof w.title === 'string') expect(w.title).toBe(NAME);
    }
  });
});

describe('B1 edge: CSP has no Google Fonts host', () => {
  it.each(ALL_CONFS)('%s csp and devCsp do not allow Google Fonts (case-insensitive)', (name) => {
    const security = readConf(name).app?.security ?? {};
    for (const key of ['csp', 'devCsp']) {
      // A CSP may be a string or a directive map; serialise both forms.
      const raw = typeof security[key] === 'string' ? security[key] : JSON.stringify(security[key] ?? '');
      expect(raw).not.toMatch(GOOGLE_FONTS);
    }
  });

  it.each(ALL_CONFS)('%s mentions no Google Fonts host anywhere in the file', (name) => {
    expect(read(`${DESKTOP}/${name}`)).not.toMatch(GOOGLE_FONTS);
  });

  it.each(ALL_CONFS)('%s is still valid JSON with no BOM', (name) => {
    const raw = read(`${DESKTOP}/${name}`);
    expect(raw.charCodeAt(0)).not.toBe(0xfeff);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe('B1 edge: setup_main_window.rs', () => {
  const literals = () => rustStringLiterals(read(WINDOW_RS));

  it('names the product exactly twice: window title and macOS app menu', () => {
    expect(literals().filter((s) => s === NAME)).toHaveLength(2);
    const src = read(WINDOW_RS);
    expect(src).toContain(`.title("${NAME}")`);
    expect(src).toMatch(new RegExp(`Submenu::with_items\\(\\s*app,\\s*"${NAME}"`));
  });

  it('no string literal carries an old brand in any casing', () => {
    expect(literals().filter((s) => OLD_BRANDS.test(s))).toEqual([]);
  });
});

describe('B1 edge: Cargo.toml', () => {
  it('description is set once, in [package], and is exact', () => {
    const toml = read(`${DESKTOP}/Cargo.toml`);
    expect(toml.match(/^description\s*=/gm)).toHaveLength(1);
    const pkg = cargoPackageSection(toml);
    expect(pkg).toMatch(/^description = "H0x Video Studio desktop app"$/m);
    expect(pkg).toMatch(/^name = "artcraft"$/m);
  });

  it('description has no old brand', () => {
    const m = read(`${DESKTOP}/Cargo.toml`).match(/^description = "(.*)"$/m);
    expect(m?.[1]).not.toMatch(OLD_BRANDS);
  });
});

describe('B1 edge: index.html head', () => {
  it('has exactly one non-empty <title> and it is the product name', () => {
    const titles = [...stripHtmlComments(read(INDEX_HTML)).matchAll(/<title>([\s\S]*?)<\/title>/gi)];
    expect(titles).toHaveLength(1);
    expect(titles[0][1].trim()).toBe(NAME);
  });

  it('svg icon link points at /h0x-icon.svg and nothing points at the old icon', () => {
    const head = stripHtmlComments(headOf(read(INDEX_HTML)));
    const svgIcons = [...head.matchAll(/<link[^>]*rel="icon"[^>]*type="image\/svg\+xml"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(svgIcons).toEqual(['/h0x-icon.svg']);
    expect(read(INDEX_HTML)).not.toMatch(/artcraft-icon/i);
  });

  it('any meta description or og: tag names H0x Video Studio and no old brand', () => {
    const head = stripHtmlComments(headOf(read(INDEX_HTML)));
    const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
    const branded = metas.filter((t) => /name="(description|application-name|apple-mobile-web-app-title)"|property="og:/i.test(t));
    for (const tag of branded) {
      expect(tag).not.toMatch(OLD_BRANDS);
      if (/property="og:(title|site_name)"|name="(application-name|apple-mobile-web-app-title)"/i.test(tag)) {
        expect(tag).toContain(`content="${NAME}"`);
      }
    }
  });

  it('has no old brand in any casing, including inside comments', () => {
    expect(read(INDEX_HTML)).not.toMatch(OLD_BRANDS);
  });
});

describe('B1 edge: acceptance git grep', () => {
  it('git grep "ArtCraft" over the B1 paths finds nothing', () => {
    let out = '';
    try {
      out = execFileSync(
        'git',
        ['grep', '-n', '-F', 'ArtCraft', '--', `${DESKTOP}/tauri*.json`, `${DESKTOP}/src/core/lifecycle`, INDEX_HTML],
        { cwd: APP_ROOT, encoding: 'utf8' },
      );
    } catch (e: any) {
      // git grep exits 1 when nothing matches; anything else is a real failure.
      if (e.status !== 1) throw e;
    }
    expect(out).toBe('');
  });
});
