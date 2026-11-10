// POL-2: `npm test` must run every h0x-mcp test file, never node_modules/dist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = [
  'index.test.mjs',
  'explainer/engine.test.mjs',
  'favorites.test.mjs',
  'favorites.edge.test.mjs',
  'recent.test.mjs',
  'recent.edge.test.mjs',
];
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git']);
const BRAND_LEAKS = [/artcraft/i, /getartcraft/i, /storyteller\.ai/i, /fakeyou/i, /\bLTX\b/, /lightricks/i];

const pkgDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

function testScriptArgs(script) {
  const parts = script.trim().split(/\s+/);
  assert.equal(parts[0], 'node', 'test script starts with node');
  assert.equal(parts[1], '--test', 'test script uses the built-in runner');
  return parts.slice(2).filter((p) => !p.startsWith('-'));
}

function findTestFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findTestFiles(full));
    else if (name.endsWith('.test.mjs')) out.push(relative(pkgDir, full).split(sep).join('/'));
  }
  return out;
}

test('package.json has a test script', () => {
  assert.equal(typeof pkg.scripts?.test, 'string');
  assert.ok(pkg.scripts.test.trim().length > 0);
});

test('test script lists all six required test files', () => {
  const files = testScriptArgs(pkg.scripts.test);
  for (const f of REQUIRED) assert.ok(files.includes(f), `missing ${f}`);
});

test('test script has no duplicate entries', () => {
  const files = testScriptArgs(pkg.scripts.test);
  assert.equal(new Set(files).size, files.length);
});

test('every listed file exists and is a .test.mjs file', () => {
  for (const f of testScriptArgs(pkg.scripts.test)) {
    assert.ok(f.endsWith('.test.mjs'), `${f} is not a .test.mjs file`);
    assert.ok(existsSync(join(pkgDir, f)), `${f} does not exist`);
  }
});

test('no listed entry points into node_modules or dist', () => {
  for (const f of testScriptArgs(pkg.scripts.test)) {
    const segs = f.split(/[\\/]/);
    assert.ok(!segs.includes('node_modules'), `${f} is under node_modules`);
    assert.ok(!segs.includes('dist'), `${f} is under dist`);
  }
});

test('entries are portable on Windows and Linux', () => {
  for (const f of testScriptArgs(pkg.scripts.test)) {
    assert.ok(!f.includes('\\'), `${f} uses a backslash`);
    assert.ok(!isAbsolute(f) && !/^[A-Za-z]:/.test(f), `${f} is absolute`);
    assert.ok(!f.split('/').includes('..'), `${f} escapes the package`);
    // An unquoted glob expands in sh but not in cmd.exe, so a bare * is not portable.
    assert.ok(!/^[^"']*\*/.test(f), `${f} is an unquoted glob`);
  }
});

test('the discovery helper itself skips node_modules and dist', () => {
  const found = findTestFiles(pkgDir);
  assert.ok(found.every((f) => !f.startsWith('node_modules/') && !f.startsWith('dist/')));
  for (const f of REQUIRED) assert.ok(found.includes(f), `${f} not found on disk`);
});

test('every listed file is a real package test file', () => {
  const found = new Set(findTestFiles(pkgDir));
  for (const f of testScriptArgs(pkg.scripts.test)) assert.ok(found.has(f), `${f} not discovered`);
});

test('unlisted package test files are reported', (t) => {
  const listed = new Set(testScriptArgs(pkg.scripts.test));
  const unlisted = findTestFiles(pkgDir).filter(
    (f) => !listed.has(f) && f !== 'package-scripts.test.mjs',
  );
  if (unlisted.length) t.diagnostic(`not run by npm test: ${unlisted.join(', ')}`);
  assert.ok(Array.isArray(unlisted));
});

test('package.json has no upstream brand leaks', () => {
  const text = JSON.stringify({ name: pkg.name, description: pkg.description, scripts: pkg.scripts });
  for (const re of BRAND_LEAKS) assert.ok(!re.test(text), `brand leak ${re}`);
});
