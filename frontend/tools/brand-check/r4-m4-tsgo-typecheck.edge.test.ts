// R4-M4: optional fast type-check with tsgo. Either `typecheck:fast` exists
// with an exact-pinned @typescript/native-preview, or (fallback) the doc says
// why not and the package files carry no trace of it. In both cases builds and
// CI keep tsc. Text checks only: no tsc/tsgo run, no network.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const FRONTEND = path.resolve(__dirname, '../..');
const APP_ROOT = path.resolve(FRONTEND, '..');
const DOC = 'README-typecheck.md';
const PKG_NAME = '@typescript/native-preview';
const SCRIPT = 'typecheck:fast';
const TARGET_TSCONFIG = 'apps/artcraft/tsconfig.json';
const BASEURL_FILES = [
  'tsconfig.base.json',
  'libs/api/tsconfig.lib.json',
  'libs/api-enums/tsconfig.lib.json',
  'libs/model-list/tsconfig.lib.json',
];
const CI_FILES = ['.github/workflows/ci.yml', '.github/workflows/release.yml'];
const BRAND_PATTERN = /artcraft|getartcraft|storyteller\.ai|fakeyou|\bltx\b|lightricks/i;
const TSGO_PATTERN = /tsgo|native-preview|typecheck:fast/;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const read = (rel: string, base = FRONTEND) => readFileSync(path.join(base, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const doc = existsSync(path.join(FRONTEND, DOC)) ? read(DOC) : '';
const enabled = Boolean(pkg.scripts?.[SCRIPT]);
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };

describe('R4-M4 doc exists and is honest', () => {
  it('README-typecheck.md exists and is not empty', () => {
    expect(doc.trim().length).toBeGreaterThan(200);
  });

  it('starts with a level-1 heading', () => {
    expect(doc.split(/\r?\n/)[0]).toMatch(/^# \S/);
  });

  it('measures tsc --noEmit on the same project', () => {
    expect(doc).toMatch(/tsc --noEmit/);
    expect(doc).toContain(TARGET_TSCONFIG);
  });

  it('gives a time in seconds and a peak memory in MB for both tsc and tsgo', () => {
    const rows = tableRows(doc);
    const tscRows = rows.filter((r) => /`tsc\b/.test(r[0]));
    const tsgoRows = rows.filter((r) => /tsgo/.test(r[0]) && r.some((c) => /\d+(\.\d+)?\s*s\b/.test(c)));
    for (const set of [tscRows, tsgoRows]) {
      expect(set.length).toBeGreaterThan(0);
      expect(set.some((r) => r.some((c) => /\d+(\.\d+)?\s*s\b/.test(c)))).toBe(true);
      expect(set.some((r) => r.some((c) => /\d+\s*MB\b/.test(c)))).toBe(true);
    }
  });

  it('every timing and memory figure is a plausible positive number', () => {
    const secs = [...doc.matchAll(/(\d+(?:\.\d+)?)\s*s\b/g)].map((m) => Number(m[1]));
    const mbs = [...doc.matchAll(/(\d+)\s*MB\b/g)].map((m) => Number(m[1]));
    expect(secs.length).toBeGreaterThan(0);
    expect(mbs.length).toBeGreaterThan(0);
    for (const s of secs) { expect(s).toBeGreaterThan(0); expect(s).toBeLessThan(3600); }
    for (const mb of mbs) { expect(mb).toBeGreaterThan(0); expect(mb).toBeLessThan(8 * 1024); }
  });

  it('says builds and CI still use tsc', () => {
    expect(doc).toMatch(/CI/);
    expect(doc).toMatch(/still use `?tsc`?|keep `?tsc`?/i);
  });

  it('names the tsgo version it measured, as an exact version', () => {
    const v = doc.match(/@typescript\/native-preview@(\S+?)`/)?.[1];
    expect(v).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('the measured preview build is at least two weeks old', () => {
    const v = doc.match(/@typescript\/native-preview@[\d.]+-dev\.(\d{8})/)?.[1];
    expect(v).toBeDefined();
    const built = Date.UTC(+v!.slice(0, 4), +v!.slice(4, 6) - 1, +v!.slice(6, 8));
    expect(Number.isNaN(built)).toBe(false);
    expect(Date.now() - built).toBeGreaterThanOrEqual(TWO_WEEKS_MS);
  });

  it('the tsc version named in the doc matches package.json', () => {
    const named = doc.match(/`tsc` (\d+\.\d+\.\d+)/)?.[1];
    if (named) expect(pkg.devDependencies.typescript).toBe(named);
  });

  it('every repo path the doc names in backticks exists', () => {
    const paths = [...doc.matchAll(/`((?:apps|libs)\/[\w./-]+\.json|tsconfig\.base\.json)`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(existsSync(path.join(FRONTEND, p)), p).toBe(true);
  });
});

describe('R4-M4 doc hygiene', () => {
  it('has no brand names outside code spans and code blocks', () => {
    const prose = doc.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    expect(prose).not.toMatch(BRAND_PATTERN);
  });

  it('has no Windows backslash repo paths', () => {
    expect(doc).not.toMatch(/\b(?:apps|libs|node_modules)\\[\w]/);
  });

  it('leaks no local absolute paths or user names', () => {
    expect(doc).not.toMatch(/[A-Za-z]:[\\/](?:Users|research-clones|cargo-target|temp)/i);
    expect(doc).not.toMatch(/\/home\/|\/Users\//);
  });

  it('has no unclosed code fence', () => {
    expect((doc.match(/^```/gm) ?? []).length % 2).toBe(0);
  });
});

describe('R4-M4 package state matches the doc', () => {
  it('a typecheck:fast script, if present, runs tsgo --noEmit on the desktop tsconfig', () => {
    if (!enabled) return;
    expect(pkg.scripts[SCRIPT]).toMatch(/^tsgo --noEmit -p apps\/artcraft\/tsconfig\.json\b/);
  });

  it('with the script, the preview package is an exact-pinned devDependency in package.json and lock', () => {
    if (!enabled) return;
    const v = pkg.devDependencies?.[PKG_NAME];
    expect(v).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(pkg.dependencies?.[PKG_NAME]).toBeUndefined();
    expect(lock.packages?.[`node_modules/${PKG_NAME}`]?.version).toBe(v);
    expect(lock.packages?.['']?.devDependencies?.[PKG_NAME]).toBe(v);
  });

  it('without the script, the preview package is in neither package.json nor the lock root', () => {
    if (enabled) return;
    expect(allDeps[PKG_NAME]).toBeUndefined();
    const root = lock.packages?.[''] ?? {};
    expect({ ...root.dependencies, ...root.devDependencies }[PKG_NAME]).toBeUndefined();
    expect(lock.packages?.[`node_modules/${PKG_NAME}`]).toBeUndefined();
  });

  it('without the script, the doc says it is not enabled and explains why', () => {
    if (enabled) return;
    expect(doc).toMatch(/not enabled|does not work|no script/i);
    expect(doc).toMatch(/baseUrl/);
    expect(doc).toMatch(/TS5090|TS5102/);
  });

  it('without the script, the blocker the doc names (baseUrl) is still present in every file it lists', () => {
    if (enabled) return;
    for (const f of BASEURL_FILES) {
      expect(doc, `doc names ${f}`).toContain(f.startsWith('libs/') ? f.split('/').slice(0, 2).join('/') : f);
      expect(read(f), f).toMatch(/"baseUrl"\s*:/);
    }
  });

  it('no other script calls tsgo', () => {
    const others = Object.entries(pkg.scripts ?? {}).filter(([k]) => k !== SCRIPT);
    for (const [k, cmd] of others) expect(String(cmd), k).not.toMatch(/\btsgo\b/);
  });
});

describe('R4-M4 builds and CI unchanged', () => {
  it('typescript (tsc) stays an exact-pinned devDependency', () => {
    expect(pkg.devDependencies.typescript).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('the preview package is not a runtime dependency', () => {
    expect(pkg.dependencies?.[PKG_NAME]).toBeUndefined();
  });

  it.each(CI_FILES)('%s does not use tsgo or typecheck:fast', (f) => {
    if (!existsSync(path.join(APP_ROOT, f))) return;
    expect(read(f, APP_ROOT)).not.toMatch(TSGO_PATTERN);
  });

  it.each(['nx.json', 'apps/artcraft/project.json', 'apps/artcraft/vite.config.ts', 'apps/artcraft/tsconfig.json'])(
    '%s does not reference tsgo',
    (f) => {
      if (!existsSync(path.join(FRONTEND, f))) return;
      expect(read(f)).not.toMatch(TSGO_PATTERN);
    },
  );
});

function tableRows(md: string): string[][] {
  return md
    .split(/\r?\n/)
    .filter((l) => /^\|.*\|\s*$/.test(l) && !/^\|\s*-/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}
