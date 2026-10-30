// A2: the scraper crates (grok/midjourney/sora/kinovi/worldlabs consumer
// clients, cloudflare mitigation, browser emulation), cookie_store_wrapper and
// wreq are gone from the Cargo workspace.
// Static checks only; cargo itself is run by the A2 developer/test-runner.
// No network, no build.
//
// The deleted names are assembled at runtime so this file never matches the
// repo-wide acceptance grep it implements.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');

const j = (...parts: string[]) => parts.join('');
const DELETED_CRATES: { name: string; dir: string }[] = [
  { name: j('grok', '_consumer_client'), dir: 'crates/api_clients' },
  { name: j('midjourney', '_client'), dir: 'crates/api_clients' },
  { name: j('openai_sora', '_client'), dir: 'crates/api_clients' },
  { name: j('kinovi', '_web_client'), dir: 'crates/api_clients' },
  { name: j('worldlabs', '_consumer_client'), dir: 'crates/api_clients' },
  { name: j('cloudflare', '_mitigation'), dir: 'crates/lib' },
  { name: j('browser', '_emulation'), dir: 'crates/lib' },
  { name: j('cookie_store', '_wrapper'), dir: 'crates/lib' },
];
const SCRAPER_NAMES = DELETED_CRATES.map((c) => c.name).filter((n) => !n.startsWith('cookie_store'));
const COOKIE_WRAPPER = j('cookie_store', '_wrapper');
const WREQ = j('w', 'req');
const WREQ_UTIL = j('w', 'req-util');

// Near-name crates that must survive (guards against over-eager deletion).
const KEPT_CRATES = [
  'crates/lib/cookie_store',
  'crates/lib/cloudflare_errors',
  'crates/api_clients/grok_api_client',
  'crates/api_clients/worldlabs_api_client',
  'crates/api_clients/artcraft/artcraft_router',
];

// Lock packages that only wreq pulled in (BoringSSL TLS stack).
const FORBIDDEN_LOCK_PACKAGE = (name: string): boolean =>
  name === WREQ || name === WREQ_UTIL || /^(boring|tokio-boring)/.test(name) || DELETED_CRATES.some((c) => c.name === name);

// Absence-assertion tests must name what they assert is absent.
const ABSENCE_TESTS = ['frontend/tools/brand-check', 'crates/api_clients/artcraft/artcraft_router/tests/removed_providers.rs'];

describe('A2: deleted crate directories', () => {
  for (const c of DELETED_CRATES) {
    const rel = `${c.dir}/${c.name}`;
    // Working tree only.
    it(`${rel} is gone from disk (no tracked file under it survives)`, () => {
      expect(existsSync(abs(rel))).toBe(false);
      expect(trackedFiles(rel)).toEqual([]);
    });
  }

  for (const rel of KEPT_CRATES) {
    it(`near-name crate ${rel} is kept`, () => {
      expect(existsSync(abs(`${rel}/Cargo.toml`))).toBe(true);
    });
  }
});

describe('A2: root Cargo.toml', () => {
  const toml = read('Cargo.toml');
  const members = workspaceMembers(toml);
  const deps = workspaceDeps(toml);

  it('lists no deleted crate as a workspace member', () => {
    const bad = members.filter((m) => DELETED_CRATES.some((c) => m === `${c.dir}/${c.name}` || m.endsWith(`/${c.name}`)));
    expect(bad).toEqual([]);
  });

  it('declares no deleted crate, wreq or wreq-util as a workspace dependency', () => {
    const forbidden = new Set([...DELETED_CRATES.map((c) => c.name), WREQ, WREQ_UTIL]);
    expect(Object.keys(deps).filter((d) => forbidden.has(d))).toEqual([]);
  });

  it('has no wreq mention left, including the native prerequisites comment', () => {
    expect(toml).not.toMatch(new RegExp(`\\b${WREQ}\\b`, 'i'));
    expect(toml).not.toMatch(/native prerequisites/i);
    expect(toml).not.toMatch(/strawberryperl|choco install|brew install/i);
  });

  it('every remaining member directory exists with a Cargo.toml', () => {
    expect(members.length).toBeGreaterThan(0);
    expect(members.filter((m) => !existsSync(abs(`${m}/Cargo.toml`)))).toEqual([]);
  });

  it('every remaining workspace path dependency points at an existing crate', () => {
    const dangling = Object.entries(deps)
      .filter(([, p]) => p !== undefined)
      .filter(([, p]) => !existsSync(abs(`${p}/Cargo.toml`)))
      .map(([n, p]) => `${n} -> ${p}`);
    expect(dangling).toEqual([]);
  });

  it('every default member is still a member', () => {
    const m = /^default-members\s*=\s*\[([^\]]*)\]/m.exec(toml);
    const defaults = m ? quoted(m[1]) : [];
    expect(defaults.filter((d) => !members.includes(d))).toEqual([]);
  });
});

describe('A2: crate manifests', () => {
  it('no Cargo.toml in the repo depends on a deleted crate, wreq or wreq-util', () => {
    const forbidden = new Set([...DELETED_CRATES.map((c) => c.name), WREQ, WREQ_UTIL]);
    const hits: string[] = [];
    for (const rel of trackedFiles('*Cargo.toml')) {
      for (const d of dependencyNames(read(rel))) if (forbidden.has(d)) hits.push(`${rel}: ${d}`);
    }
    expect(hits).toEqual([]);
  });
});

describe('A2: Cargo.lock', () => {
  const lock = read('Cargo.lock');
  const pkgs = lockPackages(lock);

  it('carries the cargo-generated header (not hand-written)', () => {
    expect(lock.startsWith('# This file is automatically @generated by Cargo.\n# It is not intended for manual editing.\n')).toBe(true);
    expect(lock).toMatch(/^version = \d+$/m);
  });

  it('has no package for a deleted crate, wreq, wreq-util or the boring TLS stack', () => {
    expect(pkgs.map((p) => p.name).filter(FORBIDDEN_LOCK_PACKAGE)).toEqual([]);
  });

  it('no locked package depends on a removed package', () => {
    const bad = pkgs.flatMap((p) => p.deps.filter(FORBIDDEN_LOCK_PACKAGE).map((d) => `${p.name} -> ${d}`));
    expect(bad).toEqual([]);
  });

  it('every local (source-less) package is a current workspace member', () => {
    const memberNames = new Set(workspaceMembers(read('Cargo.toml')).map((m) => packageName(read(`${m}/Cargo.toml`))));
    const strays = pkgs.filter((p) => !p.source && !memberNames.has(p.name)).map((p) => p.name);
    expect(strays).toEqual([]);
  });

  it('every workspace member has a locked package', () => {
    const locked = new Set(pkgs.map((p) => p.name));
    const missing = workspaceMembers(read('Cargo.toml'))
      .map((m) => packageName(read(`${m}/Cargo.toml`)))
      .filter((n) => !locked.has(n));
    expect(missing).toEqual([]);
  });

  it('every dependency entry resolves to a locked package (no orphaned edges)', () => {
    const locked = new Set(pkgs.map((p) => p.name));
    const orphans = pkgs.flatMap((p) => p.deps.filter((d) => !locked.has(d)).map((d) => `${p.name} -> ${d}`));
    expect(orphans).toEqual([]);
  });
});

describe('A2: AGENTS.md', () => {
  const docs = ['crates/AGENTS.md', 'crates/api_clients/artcraft/artcraft_router/src/generate/generate_video/AGENTS.md'];
  const names = [...DELETED_CRATES.map((c) => c.name), WREQ];

  for (const rel of docs) {
    it(`${rel} names no deleted crate`, () => {
      const text = read(rel);
      expect(names.filter((n) => new RegExp(`\\b${n}\\b`).test(text))).toEqual([]);
    });
  }

  it('crates/AGENTS.md no longer lists KinoviWeb as a router provider', () => {
    expect(read('crates/AGENTS.md')).not.toMatch(/KinoviWeb/);
  });

  it('generate_video/AGENTS.md tree only shows directories that exist', () => {
    const dirRel = 'crates/api_clients/artcraft/artcraft_router/src/generate/generate_video';
    const existing = new Set(subdirNames(abs(dirRel)));
    const shown = [...read(`${dirRel}/AGENTS.md`).matchAll(/──\s+([A-Za-z0-9_.-]+)\/\s/g)].map((m) => m[1]);
    expect(shown.length).toBeGreaterThan(0);
    expect([...new Set(shown.filter((d) => !existing.has(d)))]).toEqual([]);
  });
});

describe('A2: repo-wide acceptance greps', () => {
  it('scraper crate names appear nowhere outside absence-assertion tests', () => {
    const scope = ['.', ...ABSENCE_TESTS.map((p) => `:(exclude)${p}`)];
    expect(gitGrep(SCRAPER_NAMES.join('|'), ...scope)).toBe('');
  });

  it('the absence-test exclusion is narrow: only the two known locations match', () => {
    const files = new Set(
      gitGrep(SCRAPER_NAMES.join('|'), '.')
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split(':')[0]),
    );
    const outside = [...files].filter((f) => !ABSENCE_TESTS.some((p) => f === p || f.startsWith(`${p}/`)));
    expect(outside).toEqual([]);
  });

  it('no .rs or .toml file mentions wreq as a word or cookie_store_wrapper (strict, no exclusions)', () => {
    const word = new RegExp(`\\b${WREQ}\\b|${COOKIE_WRAPPER}`);
    const hits = gitGrep(`${WREQ}|${COOKIE_WRAPPER}`, '*.rs', '*.toml')
      .split('\n')
      .filter((l) => l && word.test(l.slice(l.indexOf(':', l.indexOf(':') + 1) + 1)));
    expect(hits).toEqual([]);
  });

  it('the word-boundary filter does not hide real hits (self-check)', () => {
    const word = new RegExp(`\\b${WREQ}\\b`);
    expect(word.test(`use ${WREQ}::Client;`)).toBe(true);
    expect(word.test(`${WREQ_UTIL} = "3"`)).toBe(true);
    expect(word.test(`unwreqd`)).toBe(false);
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
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n').trim();
}

// git grep exits 1 when nothing matches; treat that as "no output".
function gitGrep(pattern: string, ...scope: string[]): string {
  try {
    return git('grep', '--untracked', '-n', '-I', '-E', pattern, '--', ...scope);
  } catch (e) {
    if ((e as { status?: number }).status === 1) return '';
    throw e;
  }
}

function trackedFiles(glob: string): string[] {
  return git('ls-files', '--cached', '--others', '--exclude-standard', '--', glob)
    .split('\n')
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => existsSync(abs(f)));
}

function quoted(s: string): string[] {
  return [...s.replace(/#.*$/gm, '').matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/\\/g, '/'));
}

function section(src: string, header: string): string {
  const toml = `\n${src}`;
  const start = toml.indexOf(`\n[${header}]`);
  if (start < 0) return '';
  const rest = toml.slice(start + header.length + 3);
  const next = rest.search(/^\[/m);
  return next < 0 ? rest : rest.slice(0, next);
}

function workspaceMembers(toml: string): string[] {
  const m = /^members\s*=\s*\[([\s\S]*?)\]/m.exec(section(toml, 'workspace'));
  return m ? quoted(m[1]) : [];
}

// name -> path (undefined for registry deps).
function workspaceDeps(toml: string): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const line of section(toml, 'workspace.dependencies').split('\n')) {
    const m = /^([A-Za-z0-9_-]+)\s*=/.exec(line.trim());
    if (!m) continue;
    const p = /path\s*=\s*"([^"]+)"/.exec(line);
    out[m[1]] = p ? p[1].replace(/\\/g, '/') : undefined;
  }
  return out;
}

function packageName(toml: string): string {
  const m = /^name\s*=\s*"([^"]+)"/m.exec(section(`\n${toml}`, 'package'));
  if (!m) throw new Error('package without name');
  return m[1];
}

// Dependency keys from every *dependencies table, plus `package = "..."` renames.
function dependencyNames(toml: string): string[] {
  const names: string[] = [];
  let inDeps = false;
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const h = /^\[([^\]]+)\]$/.exec(line);
    if (h) {
      const t = h[1];
      inDeps = /(^|\.)(dev-|build-)?dependencies$/.test(t);
      const sub = /(?:^|\.)(?:dev-|build-)?dependencies\.([A-Za-z0-9_-]+)$/.exec(t);
      if (sub) names.push(sub[1]);
      continue;
    }
    if (!inDeps) continue;
    const m = /^([A-Za-z0-9_-]+)\s*=/.exec(line);
    if (m) names.push(m[1]);
    const r = /package\s*=\s*"([^"]+)"/.exec(line);
    if (r) names.push(r[1]);
  }
  return names;
}

type LockPkg = { name: string; source?: string; deps: string[] };
function lockPackages(lock: string): LockPkg[] {
  return lock
    .split('[[package]]')
    .slice(1)
    .map((block) => {
      const name = /^name = "([^"]+)"/m.exec(block)?.[1] ?? '';
      const source = /^source = "([^"]+)"/m.exec(block)?.[1];
      const d = /^dependencies = \[([\s\S]*?)\]/m.exec(block);
      // Entries look like "name", "name 1.2.3" or "name 1.2.3 (registry+...)".
      const deps = d ? quoted(d[1]).map((e) => e.split(' ')[0]) : [];
      return { name, source, deps };
    });
}

function subdirNames(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) {
        out.push(e);
        walk(p);
      }
    }
  };
  walk(root);
  return out;
}
