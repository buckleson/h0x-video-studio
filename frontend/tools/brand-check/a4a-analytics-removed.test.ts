// A4a: analytics snippets are gone from index.html, analytics hosts are gone
// from every Tauri CSP (and nothing else was dropped), and the SonarCloud /
// CodeRabbit config is deleted with no dangling references.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const INDEX_HTML = 'frontend/apps/artcraft/app/index.html';
const TAURI_DIR = 'crates/desktop/artcraft';
const TAURI_CONFS = [
  'tauri.conf.json',
  'tauri-mac.conf.json',
  'tauri-dev-hot-reload.conf.json',
  'tauri-dev-static.conf.json',
];
const DELETED_FILES = [
  '.github/workflows/sonarcloud.yml',
  'sonar-project.properties',
  '.coderabbit.yaml',
];
// Case-insensitive; covers the acceptance grep plus google-analytics and the
// generic tracking globals the old snippets created.
const ANALYTICS = /G-Y4Y8KMLPQ7|sixp9uu263|clarity\.ms|googletagmanager|google-analytics|posthog/i;
// Non-analytics CSP sources every Tauri config with a CSP must keep.
const BASE_SOURCES = ["'self'", "'unsafe-eval'", "'unsafe-inline'", 'blob:', 'data:', 'ipc://localhost', 'tauri://localhost'];
const KEPT_CSP: Record<string, string[]> = {
  'default-src': BASE_SOURCES,
  'connect-src': [...BASE_SOURCES, 'asset:', 'http://ipc.localhost', 'https://asset.localhost', 'https://unpkg.com/detect-gpu@5.0.70/'],
  'font-src': ['*'],
  'img-src': ["'self'", "'unsafe-inline'", '*', 'blob:', 'data:', 'ipc://localhost', 'tauri://localhost'],
  'script-src': [...BASE_SOURCES, "'wasm-unsafe-eval'", 'asset:', 'https://*.unpkg.com', 'https://unpkg.com', 'tauri:'],
  'style-src': BASE_SOURCES,
};
const ANALYTICS_SNIPPET = /\bgtag\s*\(|dataLayer|["']clarity["']|\/gtag\/js/i;

describe('A4a index.html', () => {
  const html = read(INDEX_HTML);

  it('has no analytics id or host', () => {
    expect(html).not.toMatch(ANALYTICS);
  });

  it('has no gtag/dataLayer/clarity bootstrap code, even commented out', () => {
    expect(html).not.toMatch(ANALYTICS_SNIPPET);
  });

  it('loads no external script other than the commented-out dev helper', () => {
    const live = html.replace(/<!--[\s\S]*?-->/g, '');
    const srcs = [...live.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(
      (m) => m[1],
    );
    expect(srcs).toEqual(['/src/index.tsx']);
    // No inline <script> bodies left either.
    const inline = [...live.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(inline.filter((m) => m[1].trim() !== '')).toEqual([]);
  });

  it('still mounts the app (root div + module entry, balanced head/body)', () => {
    expect(html).toMatch(/<div id="root"><\/div>/);
    expect(html).toMatch(/<script type="module" src="\/src\/index\.tsx"><\/script>/);
    for (const tag of ['html', 'head', 'body']) {
      expect(count(html, new RegExp(`<${tag}[\\s>]`, 'gi'))).toBe(1);
      expect(count(html, new RegExp(`</${tag}>`, 'gi'))).toBe(1);
    }
    expect(count(html, /<script\b/gi)).toBe(count(html, /<\/script>/gi));
  });
});

describe('A4a Tauri CSP', () => {
  it.each(TAURI_CONFS)('%s exists and is valid JSON', (f) => {
    expect(() => JSON.parse(read(`${TAURI_DIR}/${f}`))).not.toThrow();
  });

  it.each(TAURI_CONFS)('%s has no analytics host anywhere in the file', (f) => {
    expect(read(`${TAURI_DIR}/${f}`)).not.toMatch(ANALYTICS);
  });

  it.each(TAURI_CONFS)('%s CSP directives have no analytics source', (f) => {
    const csp = cspOf(JSON.parse(read(`${TAURI_DIR}/${f}`)));
    for (const [directive, sources] of Object.entries(csp)) {
      for (const s of sources) {
        expect(s, `${f} ${directive}`).not.toMatch(ANALYTICS);
      }
    }
  });

  // Regression: only analytics entries were removed; every directive and the
  // app's own sources (self, ipc, tauri, asset, unpkg, fonts...) survive.
  it.each(TAURI_CONFS.filter((f) => f !== 'tauri-dev-static.conf.json'))('%s keeps every non-analytics CSP source', (f) => {
    const csp = cspOf(JSON.parse(read(`${TAURI_DIR}/${f}`)));
    expect(Object.keys(csp).sort()).toEqual(Object.keys(KEPT_CSP).sort());
    for (const [d, sources] of Object.entries(KEPT_CSP)) {
      expect(csp[d], `${f} ${d}`).toEqual(expect.arrayContaining(sources));
    }
  });

  it('tauri-dev-static.conf.json still sets no CSP', () => {
    expect(cspOf(JSON.parse(read(`${TAURI_DIR}/tauri-dev-static.conf.json`)))).toEqual({});
  });

  it('acceptance git grep over index.html and tauri*.conf.json is empty', () => {
    expect(
      gitGrep(
        'G-Y4Y8KMLPQ7|sixp9uu263|clarity\\.ms|googletagmanager|posthog|google-analytics',
        INDEX_HTML,
        `${TAURI_DIR}/tauri*.conf.json`,
      ),
    ).toBe('');
  });
});

describe('A4a SonarCloud / CodeRabbit config', () => {
  it.each(DELETED_FILES)('%s is not tracked by git', (p) => {
    expect(git('ls-files', '--', p)).toBe('');
  });

  it.each(DELETED_FILES)('%s is not on disk', (p) => {
    expect(existsSync(path.join(APP_ROOT, ...p.split('/')))).toBe(false);
  });

  it('no other sonar or coderabbit config file is left', () => {
    const files = git('ls-files').split('\n');
    expect(files.filter((f) => /(^|\/)(sonar[^/]*|\.?coderabbit[^/]*)$/i.test(f))).toEqual([]);
  });

  it('no workflow, README badge or config still references SonarCloud or CodeRabbit', () => {
    expect(gitGrep('sonarcloud|sonarqube|sonar-project|coderabbit', '.')).toBe('');
  });
});

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, ...rel.split('/')), 'utf8');
}

function count(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

type Json = Record<string, unknown>;

// Normalises app.security.csp to { directive: string[] }; a string value
// (e.g. "font-src": "*") becomes a one-item list, a missing CSP is {}.
function cspOf(conf: Json): Record<string, string[]> {
  const csp = ((conf.app as Json | undefined)?.security as Json | undefined)?.csp;
  if (csp == null) return {};
  if (typeof csp === 'string') return { '': [csp] };
  return Object.fromEntries(
    Object.entries(csp as Json).map(([k, v]) => [k, Array.isArray(v) ? (v as string[]) : [String(v)]]),
  );
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).trim();
}

// Test and spec files name what they check for, so they are left out.
const NOT_TESTS = [':(exclude,glob)**/*.test.*', ':(exclude,glob)**/*.spec.*'];

// git grep exits 1 when nothing matches; treat that as "no output".
function gitGrep(pattern: string, ...scope: string[]): string {
  try {
    return git('grep', '-n', '-I', '-i', '-E', pattern, '--', ...scope, ...NOT_TESTS);
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 1) return '';
    throw e;
  }
}
