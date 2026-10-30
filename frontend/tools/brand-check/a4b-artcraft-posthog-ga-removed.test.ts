// A4b: PostHog and app-level google-analytics are gone from the artcraft app.
// The feature-flag hook keeps its signature and falls back to "on in
// development, off otherwise"; the touched files keep their non-analytics
// content; the lockfile has no posthog package and every dependency resolves.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import environmentVariables from '~/Classes/EnvironmentVariables';
import { FeatureFlags } from '~/enums/FeatureFlags';
import * as hookIndex from '~/hooks/usePosthogFeatureFlag';
import { usePosthogFeatureFlag } from '~/hooks/usePosthogFeatureFlag/usePosthogFeatureFlag';

const APP_ROOT = path.resolve(__dirname, '../../..');
const ARTCRAFT = 'frontend/apps/artcraft';
const SRC = `${ARTCRAFT}/app/src`;
const HOOK = `${SRC}/hooks/usePosthogFeatureFlag/usePosthogFeatureFlag.tsx`;
const ROOT_TSX = `${SRC}/root.tsx`;
const INDEX_TSX = `${SRC}/index.tsx`;
const TOPBAR = `${SRC}/components/signaled/TopBar/TopBar.tsx`;
const FETCHERS = `${SRC}/signals/authentication/fetchers.ts`;
const ENV_FILES = [`${ARTCRAFT}/.env-local-proxy`, `${ARTCRAFT}/.env-no-proxy`];
const PKG_FILES = ['frontend/package.json', `${ARTCRAFT}/package.json`];
const TOUCHED = [
  ROOT_TSX, INDEX_TSX, HOOK, TOPBAR, FETCHERS,
  `${ARTCRAFT}/tsconfig.json`, `${ARTCRAFT}/README.md`, ...ENV_FILES, ...PKG_FILES,
];
const ALL_FLAGS = Object.values(FeatureFlags);
// Case-sensitive like the acceptance grep: the hook's own name
// "usePosthogFeatureFlag" is allowed to stay.
const ACCEPTANCE = 'posthog|google-analytics|G-Y4Y8KMLPQ7';
// Stricter, case-insensitive, but tolerant of the kept hook identifier.
const ANALYTICS_CI = /posthog|google-analytics|gtag|G-Y4Y8KMLPQ7|phc_[A-Za-z0-9]+/i;
const POSTHOG_PKGS = [
  'node_modules/posthog-js',
  'node_modules/posthog-js/node_modules/fflate',
  'node_modules/@posthog/core',
  'node_modules/@posthog/types',
];

describe('A4b usePosthogFeatureFlag', () => {
  const saved = environmentVariables.values;
  afterEach(() => {
    environmentVariables.values = saved;
    vi.restoreAllMocks();
  });

  it.each(ALL_FLAGS)('%s is enabled when DEPLOY_CONTEXT is DEVELOPMENT', (flag) => {
    environmentVariables.initialize({ DEPLOY_CONTEXT: 'DEVELOPMENT' });
    expect(usePosthogFeatureFlag(flag)).toBe(true);
  });

  it.each(ALL_FLAGS)('%s is disabled when DEPLOY_CONTEXT is PRODUCTION', (flag) => {
    environmentVariables.initialize({ DEPLOY_CONTEXT: 'PRODUCTION' });
    expect(usePosthogFeatureFlag(flag)).toBe(false);
  });

  // Old code: no posthog client -> useFeatureFlagEnabled() undefined -> false.
  it.each([
    ['empty env', {}],
    ['empty string', { DEPLOY_CONTEXT: '' }],
    ['lowercase', { DEPLOY_CONTEXT: 'development' }],
    ['padded', { DEPLOY_CONTEXT: ' DEVELOPMENT ' }],
    ['boolean true', { DEPLOY_CONTEXT: true }],
    ['CONTEXT key only (as in the .env files)', { CONTEXT: 'DEVELOPMENT' }],
  ] as const)('defaults to false for %s', (_name, env) => {
    environmentVariables.initialize({ ...env });
    for (const flag of ALL_FLAGS) expect(usePosthogFeatureFlag(flag)).toBe(false);
  });

  it('defaults to false before EnvironmentVariables is initialized', () => {
    environmentVariables.values = {};
    expect(usePosthogFeatureFlag(FeatureFlags.DEV_ONLY)).toBe(false);
  });

  it('tracks env changes between calls (no cached client state)', () => {
    environmentVariables.initialize({ DEPLOY_CONTEXT: 'DEVELOPMENT' });
    expect(usePosthogFeatureFlag(FeatureFlags.SHOW_STYLE_PAGE)).toBe(true);
    environmentVariables.initialize({ DEPLOY_CONTEXT: 'STAGING' });
    expect(usePosthogFeatureFlag(FeatureFlags.SHOW_STYLE_PAGE)).toBe(false);
  });

  it('works outside a React tree and makes no network call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    environmentVariables.initialize({ DEPLOY_CONTEXT: 'DEVELOPMENT' });
    expect(() => usePosthogFeatureFlag(FeatureFlags.DEV_ONLY)).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is still re-exported from the hook folder index', () => {
    expect(hookIndex.usePosthogFeatureFlag).toBe(usePosthogFeatureFlag);
  });

  it('keeps the (flag: FeatureFlags) => boolean signature with no posthog import', () => {
    const src = read(HOOK);
    expect(src).toMatch(/export const usePosthogFeatureFlag\s*=\s*\(\s*_?flag\s*:\s*FeatureFlags\s*\)\s*:\s*boolean/);
    expect(src).not.toMatch(/from\s+["'][^"']*posthog/i);
    expect(src).not.toMatch(/\brequire\(|import\(/);
  });
});

describe('A4b root.tsx / index.tsx', () => {
  it('root.tsx has no PostHogProvider and renders <Outlet /> exactly once', () => {
    const src = read(ROOT_TSX);
    expect(src).not.toMatch(/PostHog|posthog/);
    expect(count(src, /<Outlet\s*\/>/g)).toBe(1);
    expect(src).toMatch(/<ScrollRestoration\s*\/>/);
    expect(src).toMatch(/<Scripts\s*\/>/);
  });

  it('index.tsx has no posthog.init / PostHogInit / POSTHOG env read', () => {
    const src = read(INDEX_TSX);
    expect(src).not.toMatch(/posthog|PostHog|POSTHOG/);
  });

  // The DEV early-return used to skip PostHog only; env init must still run.
  it('index.tsx still initializes EnvironmentVariables from env', () => {
    expect(read(INDEX_TSX)).toMatch(/EnvironmentVariables\.initialize\(env\)/);
  });
});

describe('A4b google-analytics usage in artcraft', () => {
  it.each([ROOT_TSX, TOPBAR, FETCHERS])('%s has no google-analytics import or gtag call', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/@storyteller\/google-analytics/);
    expect(src).not.toMatch(/\bgtag[A-Za-z]*\s*\(/);
  });

  it('no file under apps/artcraft imports @storyteller/google-analytics', () => {
    expect(gitGrep('@storyteller/google-analytics', `${ARTCRAFT}`)).toBe('');
  });

  it('artcraft tsconfig.json has no google-analytics project reference', () => {
    const conf = readJsonc(`${ARTCRAFT}/tsconfig.json`) as { references?: { path: string }[] };
    const refs = (conf.references ?? []).map((r) => r.path);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((p) => /analytics/i.test(p))).toEqual([]);
  });

  it('artcraft tsconfig.json references only libs that exist on disk', () => {
    const conf = readJsonc(`${ARTCRAFT}/tsconfig.json`) as { references?: { path: string }[] };
    for (const r of conf.references ?? []) {
      const p = path.resolve(APP_ROOT, ARTCRAFT, ...r.path.split('/'));
      expect(existsSync(p), r.path).toBe(true);
    }
  });

  it('logout still clears local state', () => {
    const src = read(FETCHERS);
    const logout = src.slice(src.indexOf('export const logout'), src.indexOf('export const login'));
    expect(logout).toMatch(/setLogoutStates\(\);/);
  });

  it('user info fetch still loads active subscriptions', () => {
    expect(read(FETCHERS)).toMatch(/ListActiveSubscriptions\(\)/);
  });
});

describe('A4b package.json / lockfile', () => {
  it.each(PKG_FILES)('%s has no posthog or google-analytics dependency', (f) => {
    const pkg = JSON.parse(read(f)) as Record<string, Record<string, string> | undefined>;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const names = Object.keys(pkg[field] ?? {});
      expect(names.filter((n) => /posthog|google-analytics/i.test(n)), `${f} ${field}`).toEqual([]);
    }
  });

  it.each([
    ['frontend/package.json', ['name', 'version', 'license', 'scripts', 'private', 'dependencies', 'devDependencies', 'workspaces']],
    [
      `${ARTCRAFT}/package.json`,
      ['name', 'private', 'sideEffects', 'type', 'nx', 'scripts', 'dependencies', 'devDependencies', 'engines', 'version', 'lint-staged'],
    ],
  ])('%s keeps its fields and react-resizable-panels', (f, fields) => {
    const pkg = JSON.parse(read(f as string));
    expect(Object.keys(pkg)).toEqual(fields);
    expect(pkg.dependencies['react-resizable-panels']).toBeDefined();
  });

  it('frontend/package.json keeps its dependencies sorted (react-resizable-panels back in place)', () => {
    const names = Object.keys(JSON.parse(read('frontend/package.json')).dependencies);
    expect(names).toEqual([...names].sort());
  });

  const lock = JSON.parse(read('frontend/package-lock.json')) as {
    packages: Record<string, LockPkg>;
  };

  it.each(POSTHOG_PKGS)('lockfile no longer contains %s', (k) => {
    expect(lock.packages[k]).toBeUndefined();
  });

  it('no lock entry depends on posthog-js', () => {
    for (const [k, p] of Object.entries(lock.packages)) {
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const) {
        expect(Object.keys(p[field] ?? {}).filter((d) => /posthog/i.test(d)), `${k} ${field}`).toEqual([]);
      }
    }
  });

  it('lock root and artcraft workspace entries mirror their package.json deps', () => {
    const rootPkg = JSON.parse(read('frontend/package.json'));
    const appPkg = JSON.parse(read(`${ARTCRAFT}/package.json`));
    expect(lock.packages[''].dependencies).toEqual(rootPkg.dependencies);
    expect(lock.packages['apps/artcraft'].dependencies).toEqual(appPkg.dependencies);
  });

  it('every remaining required dependency still resolves in the lockfile', () => {
    const missing: string[] = [];
    for (const [k, p] of Object.entries(lock.packages)) {
      if (p.link) continue;
      for (const d of Object.keys(p.dependencies ?? {})) {
        if (!resolve(lock.packages, k, d)) missing.push(`${k || '<root>'} -> ${d}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('A4b .env files and README', () => {
  it.each(ENV_FILES)('%s has no POSTHOG key, phc_ key or posthog host', (f) => {
    expect(read(f)).not.toMatch(/POSTHOG|posthog|phc_/i);
  });

  it.each(ENV_FILES)('%s keeps every non-posthog key', (f) => {
    const keys = (s: string) =>
      s.split(/\r?\n/).map((l) => l.split('=')[0].trim()).filter((k) => k && !k.startsWith('#'));
    expect(keys(read(f))).toEqual(['BASE_API', 'GOOGLE_API', 'FUNNEL_API', 'CDN_API', 'GRAVATAR_API', 'DEPLOY_PRIME_URL', 'CONTEXT']);
  });

  it('README has no PostHog section, link or hook usage sample', () => {
    const md = read(`${ARTCRAFT}/README.md`);
    expect(md).not.toMatch(/^#+\s*PostHog/im);
    expect(md).not.toMatch(/posthog\.com|usePosthogFeatureFlag/i);
  });

  it('README keeps the section after the removed one', () => {
    expect(read(`${ARTCRAFT}/README.md`)).toMatch(/^## Other Documentation/m);
  });
});

describe('A4b touched files keep their non-analytics code', () => {
  it('TopBar handlers keep their non-analytics behaviour', () => {
    const src = read(TOPBAR);
    expect(src).toMatch(/galleryModalVisibleViewMode\.value = true;/);
    expect(src).toMatch(/setSettingsSection\("general"\);/);
    expect(src).toMatch(/switcherThrottle\.current/);
  });
});

describe('A4b acceptance grep and branding', () => {
  it('acceptance git grep over frontend/apps and frontend/package.json is empty', () => {
    expect(gitGrep(ACCEPTANCE, 'frontend/apps', 'frontend/package.json', { ci: false })).toBe('');
  });

  it.each(TOUCHED)('%s has no analytics id/host/token (case-insensitive)', (f) => {
    const hits = read(f)
      .split(/\r?\n/)
      .filter((l) => ANALYTICS_CI.test(l.replace(/usePosthogFeatureFlag/g, '')));
    expect(hits).toEqual([]);
  });

  it.each(TOUCHED)('%s has no LTX / Lightricks branding', (f) => {
    expect(read(f)).not.toMatch(/\bLTX\b|Lightricks/i);
  });
});

type LockPkg = {
  link?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, ...rel.split('/')), 'utf8');
}

// tsconfig.json may carry comments / trailing commas.
function readJsonc(rel: string): unknown {
  const s = read(rel)
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str) => str ?? '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(s);
}

function count(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

// npm-style lookup: walk up the nested node_modules chain from `from`, then
// the root node_modules. Workspace dirs ("apps/x", "libs/y") look in their own
// node_modules first.
function resolve(pkgs: Record<string, LockPkg>, from: string, dep: string): string | undefined {
  let base = from;
  for (;;) {
    const cand = base ? `${base}/node_modules/${dep}` : `node_modules/${dep}`;
    if (cand in pkgs) return cand;
    if (!base) return undefined;
    const i = base.lastIndexOf('/node_modules/');
    base = i >= 0 ? base.slice(0, i) : base.startsWith('node_modules/') ? '' : '';
  }
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
}

// git grep exits 1 when nothing matches; treat that as "no output".
function gitGrep(pattern: string, ...rest: (string | { ci: boolean })[]): string {
  const opts = (typeof rest[rest.length - 1] === 'object' ? rest.pop() : { ci: false }) as { ci: boolean };
  const scope = rest as string[];
  try {
    return git('grep', '-n', '-I', ...(opts.ci ? ['-i'] : []), '-E', pattern, '--', ...scope);
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 1) return '';
    throw e;
  }
}
