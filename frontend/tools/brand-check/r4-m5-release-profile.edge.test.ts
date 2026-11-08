// R4-M5: the release profile lives at the workspace root (Cargo ignores
// profiles in member crates), strips symbols with thin LTO, keeps unwinding
// panics, and leaves the dev profile at Cargo's defaults. The thumbnail cache
// prune is spawned at startup, not awaited. Text checks only: no cargo build.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const ROOT_CARGO = 'Cargo.toml';
const DESKTOP_CARGO = 'crates/desktop/artcraft/Cargo.toml';
const STARTUP_DIR = 'crates/desktop/artcraft/src/core/lifecycle/startup';
const PRUNE_FILE = `${STARTUP_DIR}/tasks/spawn_thumbnail_cache_prune.rs`;
const STARTUP_FILE = `${STARTUP_DIR}/handle_tauri_startup.rs`;
const THUMBNAIL_WRITER = 'crates/desktop/artcraft/src/core/commands/media_files/local_media_thumbnail_command.rs';
const BRAND_PATTERN = /artcraft|getartcraft|storyteller\.ai|fakeyou/i;

describe('R4-M5 workspace release profile', () => {
  const release = section(read(ROOT_CARGO), 'profile.release');

  it('root Cargo.toml has exactly one [profile.release]', () => {
    expect(headers(read(ROOT_CARGO)).filter((h) => h === 'profile.release')).toHaveLength(1);
  });

  it('strips symbols', () => {
    expect(release.strip).toBe('true');
  });

  it('uses thin LTO, not fat LTO', () => {
    expect(release.lto).toBe('"thin"');
  });

  it('keeps opt-level 3', () => {
    expect(release['opt-level']).toBe('3');
  });

  it('does not enable panic = "abort"', () => {
    expect(release.panic).toBeUndefined();
  });

  it('does not force codegen-units = 1', () => {
    expect(release['codegen-units'] ?? '16').not.toBe('1');
  });

  it('does not turn off release optimisations or keep debug info', () => {
    expect(release.debug ?? 'false').toMatch(/^(false|0|"none")$/);
    expect(release['debug-assertions']).toBeUndefined();
  });

  it('leaves the dev profile at Cargo defaults (no root [profile.dev])', () => {
    expect(headers(read(ROOT_CARGO))).not.toContain('profile.dev');
  });
});

describe('R4-M5 no ignored member profiles', () => {
  it('the desktop crate has no [profile.*] blocks', () => {
    expect(headers(read(DESKTOP_CARGO)).filter((h) => h.startsWith('profile.'))).toEqual([]);
  });

  it('no non-root Cargo.toml in the repo declares a profile', () => {
    const offenders = trackedCargoTomls()
      .filter((f) => f !== ROOT_CARGO)
      .filter((f) => headers(read(f)).some((h) => h.startsWith('profile.')));
    expect(offenders).toEqual([]);
  });
});

describe('R4-M5 thumbnail cache prune at startup', () => {
  const prune = read(PRUNE_FILE);
  const startup = read(STARTUP_FILE);

  it('limits are 200 MB and 2000 files', () => {
    expect(prune).toMatch(/const MAX_CACHE_BYTES: u64 = 200 \* 1024 \* 1024;/);
    expect(prune).toMatch(/const MAX_CACHE_FILES: usize = 2000;/);
  });

  it('prunes the same thumbs folder the thumbnail command writes to', () => {
    const dirExpr = /temp_dir\(\)\.path\(\)\.join\("thumbs"\)/;
    expect(prune).toMatch(dirExpr);
    expect(read(THUMBNAIL_WRITER)).toMatch(dirExpr);
  });

  it('runs on a spawned blocking task, not inline', () => {
    const body = fnBody(prune, 'spawn_thumbnail_cache_prune');
    expect(body).toMatch(/spawn_blocking\s*\(\s*move\s*\|\|/);
    expect(body).not.toMatch(/\.await|block_on/);
  });

  it('startup calls the spawner without awaiting or unwrapping it', () => {
    const call = startup.match(/^.*spawn_thumbnail_cache_prune\(&root\).*$/m)?.[0] ?? '';
    expect(call.trim()).toBe('spawn_thumbnail_cache_prune(&root);');
  });

  it('startup calls it exactly once', () => {
    expect(startup.match(/spawn_thumbnail_cache_prune\(/g) ?? []).toHaveLength(1);
  });

  it('prune failures are logged, never panic startup', () => {
    const fnSrc = productionCode(prune);
    expect(fnSrc).not.toMatch(/\.unwrap\(\)|\.expect\(|panic!/);
  });

  it('log messages carry no old brand names', () => {
    const logs = productionCode(prune).match(/(info|warn|error)!\([^;]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) expect(line).not.toMatch(BRAND_PATTERN);
  });

  it('the prune unit tests exist for CI', () => {
    expect(prune).toMatch(/#\[cfg\(test\)\]\s*mod tests/);
    expect(prune.match(/#\[test\]/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
  });
});

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n');
}

function headers(toml: string): string[] {
  return [...toml.matchAll(/^\s*\[([^\]\n]+)\]\s*(#.*)?$/gm)].map((m) => m[1].trim());
}

// Key/value pairs of one [table], comments stripped, values kept as raw TOML text.
function section(toml: string, name: string): Record<string, string> {
  const out: Record<string, string> = {};
  let inside = false;
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      inside = header[1].trim() === name;
      continue;
    }
    const kv = inside && line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function trackedCargoTomls(): string[] {
  return execFileSync('git', ['ls-files', '--', '*Cargo.toml'], { cwd: APP_ROOT, encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function productionCode(rust: string): string {
  const i = rust.indexOf('#[cfg(test)]');
  return i === -1 ? rust : rust.slice(0, i);
}

function fnBody(rust: string, name: string): string {
  const start = rust.indexOf(`fn ${name}(`);
  if (start === -1) return '';
  const open = rust.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < rust.length; i++) {
    if (rust[i] === '{') depth++;
    if (rust[i] === '}' && --depth === 0) return rust.slice(open, i + 1);
  }
  return '';
}
