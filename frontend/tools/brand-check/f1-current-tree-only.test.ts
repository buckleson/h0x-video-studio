// F1: the brand-check suite checks only the current working tree. No test may
// read a ref, a commit or a diff (they vanish after the publish squash), and
// repo-wide greps must skip test/spec files and brand-check itself.
// Static checks plus local `git grep` / `git ls-files`; no network.
//
// History tokens are assembled at runtime so this file never matches itself.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const BRAND_CHECK = 'frontend/tools/brand-check';
const SELF = path.basename(__filename);
const j = (...parts: string[]) => parts.join('');

const SUITE = [
  'a1-removed-assets.test.ts',
  'a2-fix-round1.test.ts',
  'a2-scraper-crates-removed.test.ts',
  'a2c-native-midjourney-removed.test.ts',
  'a2d-desktop-providers-removed.test.ts',
  'a3b-consumer-login-ui-removed.test.ts',
  'a3d-provider-logos-removed.test.ts',
  'a4a-analytics-removed.test.ts',
  'a4b-artcraft-posthog-ga-removed.test.ts',
  'a4c-google-analytics-lib-removed.test.ts',
];

// git subcommands that only look at the working tree / index.
const TREE_ONLY_SUBCOMMANDS = ['grep', 'ls-files'];

const HISTORY_TOKENS: [string, RegExp][] = [
  ['a HEAD ref', new RegExp(`\\b(ORIG_|FETCH_)?${j('HE', 'AD')}\\b`)],
  ['a reflog / upstream ref', new RegExp(`@\\{|\\b${j('orig', 'in')}/`)],
  ['the WIP commit', new RegExp(j('W', 'IP'), 'i')],
  ['the upstream baseline commit', new RegExp(j('Upstream', ' baseline'), 'i')],
  ['the old baseline hash', new RegExp(j('e797', '69e'))],
  // Quoted subcommands are covered by the git-call allowlist ('log' is also a crate name).
  ['git diff', new RegExp(`git\\s+${j('di', 'ff')}\\b`)],
  ['git show', new RegExp(`git\\s+${j('sh', 'ow')}\\b`)],
  ['git log', new RegExp(`git\\s+${j('lo', 'g')}\\b`)],
  ['a tree-ish flag', new RegExp(`--${j('with', '-tree')}|--${j('cached', '=')}`)],
];

const NOT_TESTS = [':(exclude,glob)**/*.test.*', ':(exclude,glob)**/*.spec.*'];
const NOT_BRAND_CHECK = `:(exclude)${BRAND_CHECK}`;

// Unique to this file; also present in its own name so the canary is real.
const CANARY = j('f1-canary-', 'q7Zx3v');
// f1-canary-q7Zx3v

describe('F1: suite files are present and still test something', () => {
  it.each(SUITE)('%s exists and has at least one test', (f) => {
    const src = readLocal(f);
    expect(src).toMatch(/\b(it|it\.each\([^)]*\))\s*\(/);
  });

  it('brand-check folder holds no stray non-test sources that read git', () => {
    const others = listLocal().filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(others).toEqual(['vitest.config.ts']);
    expect(readLocal('vitest.config.ts')).not.toMatch(/child_process|execFileSync|execSync/);
  });
});

describe('F1: no test reads git history', () => {
  const files = listLocal().filter((f) => f.endsWith('.ts') && f !== SELF);

  it('scans every suite file', () => {
    expect(files).toEqual(expect.arrayContaining(SUITE));
  });

  for (const [what, re] of HISTORY_TOKENS) {
    it.each(files)(`%s does not mention ${what}`, (f) => {
      const hits = readLocal(f)
        .split('\n')
        .map((l, i) => `${i + 1}: ${l.trim()}`)
        .filter((l) => re.test(l.replace(/^\d+: /, '')));
      expect(hits).toEqual([]);
    });
  }

  it.each(files)('%s has no quoted commit-hash literal', (f) => {
    const hashes = [...readLocal(f).matchAll(/['"`]([0-9a-f]{7,40})['"`]/g)]
      .map((m) => m[1])
      .filter((h) => /[0-9]/.test(h) && /[a-f]/.test(h));
    expect(hashes).toEqual([]);
  });

  it.each(files)('%s only runs tree-only git subcommands', (f) => {
    const subs = gitSubcommands(readLocal(f));
    for (const s of subs) expect(TREE_ONLY_SUBCOMMANDS).toContain(s);
  });

  it('the subcommand extractor sees every git call style used in the suite', () => {
    const all = files.flatMap((f) => gitSubcommands(readLocal(f)));
    expect(new Set(all)).toEqual(new Set(TREE_ONLY_SUBCOMMANDS));
  });

  it('the subcommand extractor flags history commands (self-check)', () => {
    const q = "'";
    const bad = [
      `git(${q}${j('sh', 'ow')}${q}, 'x:y')`,
      `execFileSync('git', [${q}${j('di', 'ff')}${q}, '--stat'])`,
      `const flags = [${q}${j('lo', 'g')}${q}, '-1'];`,
    ];
    for (const src of bad) expect(gitSubcommands(src).some((s) => !TREE_ONLY_SUBCOMMANDS.includes(s))).toBe(true);
  });

  it('the history-token scan flags a ref and a hash (self-check)', () => {
    const sample = `git('grep', '-e', 'x', '${j('HE', 'AD')}'); const base = '${j('e797', '69e')}';`;
    expect(HISTORY_TOKENS.filter(([, re]) => re.test(sample)).map(([w]) => w)).toEqual(
      expect.arrayContaining(['a HEAD ref', 'the old baseline hash']),
    );
  });
});

describe('F1: repo-wide greps skip tests, specs and brand-check', () => {
  it('a3d grep helper excludes test, spec and brand-check', () => {
    const src = readLocal('a3d-provider-logos-removed.test.ts');
    for (const p of [...NOT_TESTS, NOT_BRAND_CHECK]) expect(src).toContain(`'${p}'`);
    expect(src).toMatch(/git\('grep',[^)]*\.\.\.NOT_TESTS\)/);
  });

  it('a4c repo-wide grep excludes test, spec and brand-check', () => {
    const src = readLocal('a4c-google-analytics-lib-removed.test.ts');
    const block = src.slice(src.indexOf('repo-wide acceptance grep'));
    for (const p of NOT_TESTS) expect(block).toContain(`'${p}'`);
    expect(block).toMatch(/`:\(exclude\)\$\{FE\}\/tools\/brand-check`/);
  });

  it('a3b production greps exclude brand-check', () => {
    expect(readLocal('a3b-consumer-login-ui-removed.test.ts')).toContain(':!${FE}/tools/brand-check/**');
  });

  // Each grep scoped to the whole repo ('.') and the mechanism that keeps it off test files.
  it.each([
    ['a2-scraper-crates-removed.test.ts', /ABSENCE_TESTS = \['frontend\/tools\/brand-check'/],
    ['a3d-provider-logos-removed.test.ts', /git\('grep',[^)]*\.\.\.NOT_TESTS\)/],
    ['a4a-analytics-removed.test.ts', /git\('grep',[^)]*\.\.\.NOT_TESTS\)/],
    ['a4c-google-analytics-lib-removed.test.ts', /'\.',[\s\S]*?'\:\(exclude,glob\)\*\*\/\*\.test\.\*'/],
  ])('%s keeps its whole-repo grep off test files', (f, re) => {
    const src = readLocal(f);
    expect(src).toMatch(/gitGrep\([^;]*'\.'/);
    expect(src).toMatch(re);
  });

  it('exclusion pathspecs use forward slashes (Windows-safe)', () => {
    for (const f of SUITE) {
      const specs = [...readLocal(f).matchAll(/['`](:\([^'`]*|:![^'`]*)['`]/g)].map((m) => m[1]);
      for (const s of specs) expect(s).not.toContain('\\');
    }
  });

  it('the brand-check exclusion resolves from the app root', () => {
    const tracked = gitLines('ls-files', '--cached', '--others', '--exclude-standard', '--', BRAND_CHECK);
    expect(tracked).toEqual(expect.arrayContaining(SUITE.map((f) => `${BRAND_CHECK}/${f}`)));
  });

  it('canary: an unexcluded grep finds this file, the test exclusion hides it', () => {
    expect(grepFiles(CANARY, '.')).toEqual([`${BRAND_CHECK}/${SELF}`]);
    expect(grepFiles(CANARY, '.', ...NOT_TESTS)).toEqual([]);
    expect(grepFiles(CANARY, '.', NOT_BRAND_CHECK)).toEqual([]);
  });

  it('the brand-check exclusion also hides non-test files there (vitest.config.ts)', () => {
    const needle = 'Repo-wide brand, asset and config checks';
    expect(grepFiles(needle, '.', ...NOT_TESTS)).toContain(`${BRAND_CHECK}/vitest.config.ts`);
    expect(grepFiles(needle, '.', ...NOT_TESTS, NOT_BRAND_CHECK)).toEqual([]);
  });

  it('the spec exclusion covers .tsx specs too', () => {
    const spec = 'frontend/libs/components/model-selector/src/lib/classy-model-selector.spec.tsx';
    expect(grepFiles('from "vitest"', spec)).toEqual([spec]);
    expect(grepFiles('from "vitest"', spec, ...NOT_TESTS)).toEqual([]);
  });

  it('the exclusions do not hide ordinary sources', () => {
    const hits = grepFiles('defineConfig', 'frontend', ...NOT_TESTS, NOT_BRAND_CHECK);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h).not.toMatch(/\.(test|spec)\./);
      expect(h.startsWith(`${BRAND_CHECK}/`)).toBe(false);
    }
  });
});

// ---------- helpers ----------

function listLocal(): string[] {
  return readdirSync(__dirname).filter((f) => !f.startsWith('.') && f !== 'node_modules').sort();
}

function readLocal(f: string): string {
  return readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
}

// First literal argument of every git invocation style used in the suite.
function gitSubcommands(src: string): string[] {
  const out: string[] = [];
  const styles = [
    /\bgit\(\s*'([a-z-]+)'/g,
    /execFileSync\(\s*'git'\s*,\s*\[\s*'([a-z-]+)'/g,
    /\b(?:flags|args)\s*=\s*\[\s*'([a-z-]+)'/g,
  ];
  for (const re of styles) for (const m of src.matchAll(re)) out.push(m[1]);
  return out;
}

function gitLines(...args: string[]): string[] {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.replace(/\\/g, '/'));
}

// --untracked so new (not yet added) files are covered; exit 1 = no match.
function grepFiles(pattern: string, ...scope: string[]): string[] {
  try {
    return gitLines('grep', '--untracked', '-I', '-l', '-E', pattern, '--', ...scope);
  } catch (e) {
    if ((e as { status?: number }).status === 1) return [];
    throw e;
  }
}
