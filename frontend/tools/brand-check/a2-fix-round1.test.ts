// A2 fix round 1 (docs/agents/A2-fix-round1.md): the native Midjourney
// provider is gone for good, its model ids route to ArtCraft only, the splat
// caller matches the enqueue signature, and the brand-check git grep helpers
// skip test/spec files without hiding real hits.
// Static checks only (cargo is run by A2 itself); no network, no build.
//
// Removed names are assembled at runtime so this file never matches the
// greps it implements.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const j = (...parts: string[]) => parts.join('');

const NATIVE = 'artcraft-native';
const PROVIDERS_MOD = `${NATIVE}/src/backend/providers/mod.rs`;
const STORE = `${NATIVE}/src/feed/store.rs`;
const SPLAT = 'crates/desktop/artcraft/src/core/commands/generate/generate_splat_command.rs';
const ENQUEUE = 'crates/desktop/artcraft/src/core/commands/enqueue/image_to_gaussian/enqueue_image_to_gaussian_command.rs';
const REMOVED_PROVIDERS_RS = 'crates/api_clients/artcraft/artcraft_router/tests/removed_providers.rs';
const BRAND_CHECK = 'frontend/tools/brand-check';

const MJ = j('mid', 'journey');
const MJ_RE = new RegExp(MJ, 'i');
// Midjourney stays only as a model name served by ArtCraft (catalog, icon) and
// in the routing test that proves it never goes to fal.
const MJ_ALLOWED_FILES = [`${NATIVE}/src/models.rs`, `${NATIVE}/src/ui/creator_icons.rs`, PROVIDERS_MOD];
const REMOVED_NATIVE_SYMBOLS = [
  j('Provider::', 'Midjourney'),
  j('MIDJOURNEY', '_MODELS'),
  j('MIDJOURNEY', '_BATCH'),
  j('is_', 'midjourney'),
  j('midjourney', '_login'),
  j('midjourney', '-login'),
  j('midjourney', '_account'),
  j('save_', 'midjourney', '_login'),
  j('disconnect_', 'midjourney'),
  j('Connect', 'Midjourney'),
  j('Disconnect', 'Midjourney'),
  j('Midjourney', 'Login'),
  j('Login', 'Event'),
];
const FAL_MODELS = ['flux_1_dev', 'flux_1_schnell', 'nano_banana_2', 'nano_banana_pro'];
const MJ_MODEL_IDS = [MJ, `${MJ}_7`, `${MJ}_7_niji`, `${MJ}_8`];

describe('A2 fix: native Provider enum', () => {
  const src = read(PROVIDERS_MOD);

  it('has exactly the Artcraft and Fal variants', () => {
    expect(enumVariants(src, 'Provider')).toEqual(['Artcraft', 'Fal']);
  });

  it('no source in artcraft-native names a Provider variant other than Artcraft or Fal', () => {
    const used = new Set<string>();
    for (const f of gitFiles(`${NATIVE}/src`, '*.rs')) {
      for (const m of read(f).matchAll(/(?:^|[^A-Za-z0-9_])Provider::([A-Z][A-Za-z0-9_]*)/g)) used.add(m[1]);
    }
    expect([...used].sort()).toEqual(['Artcraft', 'Fal']);
  });

  it('every match on Provider covers both variants (label and icon arms)', () => {
    for (const fn of ['label', 'icon']) {
      const body = fnBody(src, fn);
      expect(body, fn).toMatch(/Provider::Artcraft\s*=>/);
      expect(body, fn).toMatch(/Provider::Fal\s*=>/);
    }
  });
});

describe('A2 fix: model routing', () => {
  const src = read(PROVIDERS_MOD);
  const falArm = falModelIds(src);

  it('the fal arm lists exactly the four fal models (no Midjourney rerouted through fal)', () => {
    expect([...falArm].sort()).toEqual([...FAL_MODELS].sort());
  });

  it.each(MJ_MODEL_IDS)('%s is not in the fal arm', (id) => {
    expect(falArm).not.toContain(id);
  });

  it('the fallback arm routes everything else to ArtCraft only', () => {
    expect(fnBody(src, 'for_model')).toMatch(/_\s*=>\s*&\[\s*Provider::Artcraft\s*\]/);
  });

  it('the routing test pins a Midjourney id to ArtCraft only', () => {
    expect(src).toMatch(new RegExp(`for_model\\("${MJ}_\\d+"\\),\\s*\\[Provider::Artcraft\\]\\)`));
  });

  it('every Provider::Fal test fixture uses a model that fal can actually run', () => {
    const bad: string[] = [];
    for (const f of gitFiles(`${NATIVE}/src`, '*.rs')) {
      for (const line of read(f).split('\n')) {
        if (!/provider:\s*Provider::Fal\b/.test(line)) continue;
        const id = /model_id:\s*"([^"]+)"\.into\(\)/.exec(line)?.[1];
        if (id !== undefined && !falArm.includes(id)) bad.push(`${f}: ${id}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('A2 fix: Midjourney leftovers in artcraft-native', () => {
  it('only the model catalog, icon map and routing test still say Midjourney', () => {
    const files = [...new Set(grepLines(MJ, true, NATIVE).map((l) => l.split(':')[0]))];
    expect(files.filter((f) => !MJ_ALLOWED_FILES.includes(f))).toEqual([]);
  });

  it('in providers/mod.rs the only Midjourney line is the ArtCraft-only routing assertion', () => {
    const hits = read(PROVIDERS_MOD).split('\n').filter((l) => MJ_RE.test(l));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/assert_eq!\(Provider::for_model\(.*\[Provider::Artcraft\]\)/);
  });

  it('the README no longer mentions Midjourney', () => {
    expect(read(`${NATIVE}/README.md`)).not.toMatch(MJ_RE);
  });

  it.each(REMOVED_NATIVE_SYMBOLS)('no source names %s', (sym) => {
    expect(grepLines(escapeRe(sym), false, NATIVE)).toEqual([]);
  });

  it('feed comments describe local jobs as fal only', () => {
    for (const f of [STORE, `${NATIVE}/src/feed/types.rs`, `${NATIVE}/src/pages/create_image.rs`]) {
      expect(read(f), f).not.toMatch(MJ_RE);
    }
  });
});

describe('A2 fix: store test kept its assertions', () => {
  const FN = 'provider_jobs_outlive_polls_until_they_finish_or_fail';
  const now = fnBody(read(STORE), FN);

  it('uses Provider::Fal with a fal model', () => {
    expect(now).toMatch(/model_id:\s*"flux_1_dev"\.into\(\)/);
    expect(now).toMatch(/provider:\s*Provider::Fal\b/);
  });

  it('keeps the assertions it had before the fix, apart from string literals', () => {
    const shape = (body: string) =>
      body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^(assert|assert_eq|assert_ne)!/.test(l))
        .map((l) => l.replace(/"[^"]*"/g, '""'));
    expect(shape(now)).toEqual([
      'assert_eq!(store.pending.len(), 2, "");',
      'assert!(store.finish_local(""));',
      'assert!(store.fail_local("", ""));',
      'assert!(store.pending.is_empty());',
      'assert_eq!(store.failed[0].message.as_deref(), Some(""), "");',
      'assert!(store.failed.is_empty());',
    ]);
  });

  it('the failure message it stores is the one it reads back', () => {
    const failed = /fail_local\("local_b",\s*("[^"]+")\)/.exec(now)?.[1];
    expect(failed).toBeDefined();
    expect(now).toContain(`Some(${failed})`);
  });
});

describe('A2 fix: generate_splat_command caller', () => {
  const params = fnParams(read(ENQUEUE), 'enqueue_image_to_gaussian_command');

  it('the enqueue command takes 7 parameters, 5 of them State<...>', () => {
    expect(params).toHaveLength(7);
    expect(params.filter((p) => /:\s*State</.test(p))).toHaveLength(5);
  });

  it('dropped the WorldLabs credential parameter', () => {
    expect(params.join('\n')).not.toMatch(/Worldlabs|WorldLabs|worldlabs/);
  });

  it('every caller in crates/ passes as many arguments as the function takes', () => {
    const calls = grepFiles('enqueue_image_to_gaussian_command\\s*\\(', 'crates').flatMap((f) =>
      callArgs(read(f), 'enqueue_image_to_gaussian_command').map((args) => ({ f, args })),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.args.length !== params.length).map((c) => `${c.f}: ${c.args.length}`)).toEqual([]);
  });

  it('the splat caller passes app.state() once per State parameter, in place', () => {
    const [args] = callArgs(read(SPLAT), 'enqueue_image_to_gaussian_command');
    params.forEach((p, i) => {
      if (/:\s*State</.test(p)) expect(args[i], `arg ${i}`).toBe('app.state()');
    });
  });
});

describe('A2 fix: doc leftovers', () => {
  it('removed_providers.rs header names the old scraper HTTP client, not the crate', () => {
    const header = read(REMOVED_PROVIDERS_RS).split('\n').filter((l) => l.startsWith('//!')).join('\n');
    expect(header).toMatch(/old scraper HTTP client/);
    expect(header).not.toMatch(new RegExp(`\\b${j('w', 'req')}\\b`, 'i'));
  });
});

describe('Brand-check gitGrep skips test and spec files', () => {
  const NOT_TESTS = [':(exclude,glob)**/*.test.*', ':(exclude,glob)**/*.spec.*'];

  it.each(['a1-removed-assets.test.ts', 'a4a-analytics-removed.test.ts'])('%s passes both exclusions to git grep', (f) => {
    const src = read(`${BRAND_CHECK}/${f}`);
    for (const p of NOT_TESTS) expect(src).toContain(`'${p}'`);
    expect(src).toMatch(/git\('grep',[^)]*\.\.\.NOT_TESTS\)/);
  });

  it('the exclusion hides nested test files (the needle exists, then disappears)', () => {
    const needle = j('NOT', '_TESTS');
    expect(grepFiles(needle, BRAND_CHECK)).toEqual(
      expect.arrayContaining([`${BRAND_CHECK}/a1-removed-assets.test.ts`, `${BRAND_CHECK}/a4a-analytics-removed.test.ts`]),
    );
    expect(grepFiles(needle, BRAND_CHECK, ...NOT_TESTS)).toEqual([]);
  });

  it('does not over-exclude files under a tests/ directory or with "test" in the name', () => {
    expect(grepFiles('old scraper HTTP client', 'crates', ...NOT_TESTS)).toContain(REMOVED_PROVIDERS_RS);
  });

  it('does not over-exclude ordinary sources', () => {
    expect(grepFiles('fn enqueue_image_to_gaussian_command', 'crates', ...NOT_TESTS)).toContain(ENQUEUE);
  });
});

describe('A2 fix: no third-party brand leaks in touched files', () => {
  const TOUCHED = [STORE, `${NATIVE}/src/feed/types.rs`, `${NATIVE}/src/pages/create_image.rs`, PROVIDERS_MOD, SPLAT];
  it.each(TOUCHED)('%s has no LTX or Lightricks', (f) => {
    expect(read(f)).not.toMatch(/\bLTX\b|Lightricks/i);
  });
});

// ---------- helpers ----------

function abs(rel: string): string {
  return path.join(APP_ROOT, ...rel.split('/'));
}

function read(rel: string): string {
  return readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n');
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// git grep exits 1 when nothing matches; treat that as "no output".
function gitGrep(args: string[]): string[] {
  try {
    return git('grep', '--untracked', '-I', ...args).split('\n').filter(Boolean).map((l) => l.replace(/\\/g, '/'));
  } catch (e) {
    if ((e as { status?: number }).status === 1) return [];
    throw e;
  }
}

function grepLines(pattern: string, ignoreCase: boolean, ...scope: string[]): string[] {
  return gitGrep([...(ignoreCase ? ['-i'] : []), '-n', '-E', pattern, '--', ...scope]);
}

function grepFiles(pattern: string, ...scope: string[]): string[] {
  return gitGrep(['-l', '-E', pattern, '--', ...scope]);
}

function gitFiles(dir: string, glob: string): string[] {
  return git('ls-files', '--cached', '--others', '--exclude-standard', '--', `${dir}/**/${glob}`, `${dir}/${glob}`)
    .split('\n')
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'));
}

// Text between the braces that follow `start` (balanced, ignoring string contents).
function braced(src: string, start: number): string {
  const open = src.indexOf('{', start);
  if (open < 0) throw new Error('no body');
  let depth = 0;
  let inStr = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced');
}

function fnBody(src: string, name: string): string {
  const m = new RegExp(`\\bfn\\s+${name}\\b`).exec(src);
  if (!m) throw new Error(`fn ${name} not found`);
  return braced(src, m.index);
}

function enumVariants(src: string, name: string): string[] {
  const m = new RegExp(`\\benum\\s+${name}\\b`).exec(src);
  if (!m) throw new Error(`enum ${name} not found`);
  return braced(src, m.index)
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l && !l.startsWith('#['))
    .map((l) => /^([A-Z][A-Za-z0-9_]*)/.exec(l)?.[1])
    .filter((v): v is string => !!v);
}

function falModelIds(src: string): string[] {
  const arm = fnBody(src, 'for_model')
    .split('\n')
    .find((l) => /=>\s*&\[[^\]]*Provider::Fal/.test(l));
  if (!arm) throw new Error('no fal arm');
  return [...arm.split('=>')[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// Split a parenthesised list at top-level commas.
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if ('([{<'.includes(c)) depth++;
    if (')]}>'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parenContents(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced parens');
}

function fnParams(src: string, name: string): string[] {
  const m = new RegExp(`\\bfn\\s+${name}\\s*\\(`).exec(src);
  if (!m) throw new Error(`fn ${name} not found`);
  // Lifetimes ('_) contain no brackets; `State<'_, T>` keeps its comma inside <>.
  return splitTop(parenContents(src, m.index + m[0].length - 1));
}

// Argument lists of every call to `name` (definitions excluded).
function callArgs(src: string, name: string): string[][] {
  const out: string[][] = [];
  for (const m of src.matchAll(new RegExp(`(?<!fn\\s)(?<![A-Za-z0-9_])${name}\\s*\\(`, 'g'))) {
    const inner = parenContents(src, m.index! + m[0].length - 1);
    // The `<` / `>` depth trick must not trip on `?` or `.await`; strip turbofish-free noise.
    out.push(splitTop(inner.replace(/->/g, '')));
  }
  return out;
}
