// A4c: the @storyteller/google-analytics lib is deleted, every alias and
// project reference to it is gone, and settings-modal / promptbox /
// lightbox-modal have no gtagEvent calls (handlers keep working).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const FE = 'frontend';
const LIB_DIR = `${FE}/libs/analytics/google-analytics`;
const COMPONENTS = `${FE}/libs/components`;
const LIBS = ['settings-modal', 'promptbox', 'lightbox-modal'] as const;
const LIB_TSCONFIGS = LIBS.flatMap((l) => [
  `${COMPONENTS}/${l}/tsconfig.json`,
  `${COMPONENTS}/${l}/tsconfig.lib.json`,
]);
const SETTINGS = `${COMPONENTS}/settings-modal/src/lib/settings-modal.tsx`;
const ABOUT = `${COMPONENTS}/settings-modal/src/lib/panes/AboutSettingsPane.tsx`;
const EXPERIMENTAL = `${COMPONENTS}/settings-modal/src/lib/panes/ExperimentalSettingsPane.tsx`;
const PROMPTBOXES = ['Image', 'Video', '3D', 'Audio'].map(
  (k) => `${COMPONENTS}/promptbox/src/lib/PromptBox${k}.tsx`,
);
const LIGHTBOX = `${COMPONENTS}/lightbox-modal/src/lib/lightbox-modal.tsx`;
const SOURCES = [SETTINGS, ABOUT, EXPERIMENTAL, ...PROMPTBOXES, LIGHTBOX];
const CONFIGS = [`${FE}/tsconfig.base.json`, `${FE}/tsconfig.json`, `${FE}/clean_modules.sh`, ...LIB_TSCONFIGS];
const TOUCHED = [...SOURCES, ...CONFIGS];
// Same pattern as the repo-wide A4 acceptance grep.
const ACCEPTANCE = 'google-analytics|googletagmanager|G-Y4Y8KMLPQ7|clarity\\.ms|sixp9uu263|posthog';
const GTAG = /\bgtag[A-Za-z]*\b|fireToggleEvent|dataLayer/;

describe('A4c google-analytics lib is deleted', () => {
  it('the lib directory is gone from disk (src, dist, configs)', () => {
    expect(existsSync(abs(LIB_DIR))).toBe(false);
    for (const f of ['src/index.ts', 'package.json', 'tsconfig.lib.json', 'dist']) {
      expect(existsSync(abs(`${LIB_DIR}/${f}`)), f).toBe(false);
    }
  });

  it('git lists no tracked or untracked file under the lib', () => {
    expect(git('ls-files', '--cached', '--others', '--exclude-standard', '--', LIB_DIR)).toBe('');
  });

  it('no other workspace package is named @storyteller/google-analytics', () => {
    const pkgs = git('ls-files', '--', `${FE}/libs/**/package.json`, `${FE}/apps/**/package.json`)
      .split('\n')
      .filter((f) => f && existsSync(abs(f)));
    expect(pkgs.length).toBeGreaterThan(0);
    for (const f of pkgs) {
      expect(JSON.parse(read(f)).name, f).not.toBe('@storyteller/google-analytics');
    }
  });
});

describe('A4c tsconfig aliases and references', () => {
  const base = readJsonc(`${FE}/tsconfig.base.json`) as { compilerOptions: { paths: Record<string, string[]> } };
  const paths = base.compilerOptions.paths;

  it('tsconfig.base.json has no @storyteller/google-analytics path alias', () => {
    expect(Object.keys(paths).filter((k) => /analytics/i.test(k))).toEqual([]);
  });

  it('every remaining path alias points at a file that exists', () => {
    const missing = Object.entries(paths).flatMap(([k, targets]) =>
      targets.filter((t) => !t.includes('*') && !existsSync(abs(`${FE}/${t}`))).map((t) => `${k} -> ${t}`),
    );
    expect(missing).toEqual([]);
  });

  it.each([`${FE}/tsconfig.json`, ...LIB_TSCONFIGS])('%s has no analytics reference', (f) => {
    const refs = refsOf(f);
    expect(refs.filter((p) => /analytics/i.test(p))).toEqual([]);
  });

  it.each([`${FE}/tsconfig.json`, ...LIB_TSCONFIGS])('%s references only paths that exist (Windows-safe)', (f) => {
    const dir = path.dirname(abs(f));
    for (const r of refsOf(f)) {
      expect(existsSync(path.resolve(dir, ...r.split(/[\\/]/))), r).toBe(true);
    }
  });

  // Dropping only the google-analytics reference keeps each lib's two
  // tsconfigs naming the same projects, and the root still references each lib.
  it.each(LIBS)('%s tsconfig.json and tsconfig.lib.json reference the same libs', (l) => {
    const dir = `${COMPONENTS}/${l}`;
    const json = refsOf(`${dir}/tsconfig.json`).filter((r) => !r.startsWith('./tsconfig.'));
    const lib = refsOf(`${dir}/tsconfig.lib.json`).map((r) => r.replace(/\/tsconfig\.lib\.json$/, ''));
    expect(json.length).toBeGreaterThan(5);
    expect(lib).toEqual(json);
  });

  it.each(LIBS)('frontend/tsconfig.json still references %s', (l) => {
    expect(refsOf(`${FE}/tsconfig.json`)).toContain(`./libs/components/${l}`);
  });

  it('clean_modules.sh has no google-analytics line and still cleans the three libs', () => {
    const sh = read(`${FE}/clean_modules.sh`);
    expect(sh).not.toMatch(/analytics/);
    for (const l of LIBS) expect(sh).toContain(`rm -rf ./libs/components/${l}/dist/`);
  });
});

describe('A4c analytics calls removed from shared libs', () => {
  it.each(SOURCES)('%s has no google-analytics import or gtag call', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/@storyteller\/google-analytics/);
    expect(src).not.toMatch(GTAG);
  });

  it('no file under libs/ imports @storyteller/google-analytics or calls gtagEvent', () => {
    expect(gitGrep('@storyteller/google-analytics|gtagEvent|gtagLogin|gtagLogout', `${FE}/libs`)).toBe('');
  });

  it('lightbox handlers still stop propagation and call their callbacks', () => {
    const src = read(LIGHTBOX);
    for (const cb of [
      'onRecreateClicked',
      'onEditClicked',
      'onTurnIntoVideoClicked',
      'onRemoveBackgroundClicked',
      'onMake3DObjectClicked',
      'onMake3DWorldClicked',
      'onDownloadClicked',
      'onAddToSceneClicked',
      'onDeleteClicked',
    ]) {
      expect(src, cb).toMatch(new RegExp(`e\\.stopPropagation\\(\\);\\s*(await\\s+)?${cb}\\(`));
    }
    expect(src).not.toMatch(/getartcraft\.com\/media|const shareUrl = /);
  });

  it('settings-modal reset and section switch keep their state updates', () => {
    const src = read(SETTINGS);
    expect(src).toMatch(/disableExperimental\(\);\s*setIsResetConfirmOpen\(false\);/);
    expect(src).toMatch(/onClick=\{\(\) => \{\s*setSelectedSection\(section\.id\);/);
  });

  it('AboutSettingsPane still enables and toasts after the unlock clicks', () => {
    expect(read(ABOUT)).toMatch(/enable\(\);\s*toast\.success\("Experimental features unlocked"\);/);
  });

  it.each(PROMPTBOXES)('%s still has an enqueue handler body after the removal', (f) => {
    expect(read(f)).toMatch(/setIsEnqueueing\(true\)|crypto\.randomUUID|effectiveGenerationCount|IsDesktopApp\(\)/);
  });
});

describe('A4c acceptance grep and branding', () => {
  it('repo-wide acceptance grep is empty outside lockfiles and brand-check tests', () => {
    expect(
      gitGrep(
        ACCEPTANCE,
        '.',
        ':(exclude)*.lock',
        ':(exclude)*package-lock.json',
        ':(exclude,glob)**/*.test.*',
        ':(exclude,glob)**/*.spec.*',
        `:(exclude)${FE}/tools/brand-check`,
      ),
    ).toBe('');
  });

  it.each(TOUCHED)('%s has no analytics id/host (case-insensitive)', (f) => {
    expect(read(f)).not.toMatch(new RegExp(ACCEPTANCE, 'i'));
  });

  it.each(TOUCHED)('%s has no LTX / Lightricks branding', (f) => {
    expect(read(f)).not.toMatch(/\bLTX\b|Lightricks/i);
  });
});

function abs(rel: string): string {
  return path.join(APP_ROOT, ...rel.split('/'));
}

function read(rel: string): string {
  return readFileSync(abs(rel), 'utf8');
}

// tsconfig files may carry comments / trailing commas.
function parseJsonc(s: string): unknown {
  return JSON.parse(
    s
      .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str) => str ?? '')
      .replace(/,(\s*[}\]])/g, '$1'),
  );
}

function readJsonc(rel: string): unknown {
  return parseJsonc(read(rel));
}

function refsOf(rel: string): string[] {
  return ((readJsonc(rel) as { references?: { path: string }[] }).references ?? []).map((r) => r.path);
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

// git grep exits 1 when nothing matches; treat that as "no output".
function gitGrep(pattern: string, ...scope: string[]): string {
  try {
    return git('grep', '-n', '-I', '-E', pattern, '--', ...scope);
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 1) return '';
    throw e;
  }
}
