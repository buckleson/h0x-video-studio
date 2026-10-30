// A3d: the third-party provider logo folder (public/resources/images/services)
// is gone, nothing in the repo still loads a file from it, and the A3d sources
// and model-selector specs use neutral icons and no removed provider enum members.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const SERVICES_DIR = 'frontend/apps/artcraft/app/public/resources/images/services';
const LIBS = 'frontend/libs';
const TOUCHED = [
  `${LIBS}/components/model-selector/src/lib/provider-icons.tsx`,
  `${LIBS}/components/settings-modal/src/lib/panes/ProviderPrioritySettingsPane.tsx`,
  `${LIBS}/model-list/src/lib/classes/metadata/ModelCreatorIconForId.ts`,
  `${LIBS}/model-list/src/lib/classes/metadata/ModelCreatorIcons.ts`,
];
const MODEL_SELECTOR_SPECS = [
  `${LIBS}/components/model-selector/src/lib/classy-model-selector.spec.tsx`,
  `${LIBS}/components/model-selector/src/lib/classy-model-selector-store.spec.ts`,
];
const REMOVED_ENUM_MEMBERS = /GenerationProvider\.(Sora|WorldLabs|Midjourney|Grok)\b/;

// --- tests ---

describe('A3d services logo folder', () => {
  it('is not on disk', () => {
    expect(existsSync(path.join(APP_ROOT, ...SERVICES_DIR.split('/')))).toBe(false);
  });

  it('has no tracked file left in the working tree', () => {
    const tracked = lines(git('ls-files', '--', SERVICES_DIR));
    const deleted = new Set(lines(git('ls-files', '--deleted', '--', SERVICES_DIR)));
    expect(tracked.filter((f) => !deleted.has(f))).toEqual([]);
  });

  it('git grep finds no "images/services" under frontend/', () => {
    expect(gitGrep('images/services', 'frontend/')).toBe('');
  });

  // Windows '\', url-encoded '%2F', or template-split separators.
  it('finds no reference with any separator under frontend/', () => {
    expect(gitGrep('images(/|\\\\|%2F|"\\s*\\+\\s*")services', 'frontend/')).toBe('');
  });

  it('no non-doc source outside frontend/ loads a file from it', () => {
    // NOTICE and markdown may mention the history; code must not include it.
    const hits = lines(gitGrep('images/services', '.', ':(exclude)*.md', ':(exclude)NOTICE'));
    expect(hits).toEqual([]);
  });
});

describe('A3d touched sources', () => {
  it.each(TOUCHED)('%s has no logo file path', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/images\/services|getServicesBasePath|\.svg["'`]/);
    expect(src).not.toMatch(/LTX|Lightricks/i);
  });

  it.each(TOUCHED)('%s uses no removed GenerationProvider member', (f) => {
    expect(read(f)).not.toMatch(REMOVED_ENUM_MEMBERS);
  });

  it.each(TOUCHED.filter((f) => f.endsWith('.tsx')))('%s falls back to GENERIC_ICON_PATH', (f) => {
    expect(read(f)).toMatch(/src=\{GENERIC_ICON_PATH\}/);
  });
});

describe('A3d model-selector specs', () => {
  it.each(MODEL_SELECTOR_SPECS)('%s does not use a removed enum member or logo path', (f) => {
    const src = read(f);
    expect(src).not.toMatch(REMOVED_ENUM_MEMBERS);
    expect(src).not.toMatch(/images\/services/);
  });
});

// --- helpers ---

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).trim();
}

// Test and spec files (and brand-check itself) name what they check for.
const NOT_TESTS = [
  ':(exclude,glob)**/*.test.*',
  ':(exclude,glob)**/*.spec.*',
  ':(exclude)frontend/tools/brand-check',
];

function gitGrep(pattern: string, ...pathspecs: string[]): string {
  try {
    return git('grep', '-n', '-E', pattern, '--', ...pathspecs, ...NOT_TESTS);
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 1) return '';
    throw e;
  }
}

function lines(s: string): string[] {
  return s.split(/\r?\n/).filter(Boolean);
}

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, ...rel.split('/')), 'utf8');
}
