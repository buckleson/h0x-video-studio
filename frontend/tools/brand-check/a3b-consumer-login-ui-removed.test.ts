// A3b: the UI no longer offers consumer-login accounts (Midjourney, Sora/ChatGPT,
// Grok consumer, WorldLabs consumer) in settings, setup, billing, reminder and
// pricing modals, the promptbox or the app, and nothing in frontend/ still
// imports a wrapper or block that A3a/A3b deleted. Static checks only.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const FE = 'frontend';
const LIBS = `${FE}/libs/components`;
const ACCOUNT_DIR = `${LIBS}/settings-modal/src/lib/panes/AccountSettings`;

const DELETED_FILES = [`${ACCOUNT_DIR}/GrokAccountBlock.tsx`, `${ACCOUNT_DIR}/MidjourneyAccountBlock.tsx`];

// Production files A3b touched (specs checked separately).
const TOUCHED = [
  `${ACCOUNT_DIR}/AccountSettingsPane.tsx`,
  `${LIBS}/provider-setup-modal/src/lib/provider-setup-modal.tsx`,
  `${LIBS}/provider-billing-modal/src/lib/provider-billing-modal.tsx`,
  `${LIBS}/provider-billing-modal/src/lib/others/GenericProviderBillingBlock.tsx`,
  `${LIBS}/action-reminder-modal/src/lib/action-reminder-modal.tsx`,
  `${LIBS}/action-reminder-modal/src/lib/action-reminder-modal-signals.ts`,
  `${LIBS}/pricing-modal/src/lib/cost-breakdown-modal.tsx`,
  `${LIBS}/promptbox/src/lib/PromptBoxImage.tsx`,
  `${LIBS}/promptbox/src/lib/PromptBoxVideo.tsx`,
  `${FE}/apps/artcraft/app/src/pages/MainApp.tsx`,
];

// The four modals whose user-visible options must not include a consumer login.
const MODALS = [
  `${LIBS}/provider-setup-modal/src`,
  `${LIBS}/provider-billing-modal/src`,
  `${LIBS}/action-reminder-modal/src`,
  `${LIBS}/pricing-modal/src`,
];

// Wrappers deleted in A3a plus the account blocks deleted in A3b.
const DELETED_SYMBOLS = [
  'GrokGetCredentialInfo',
  'MidjourneyGetCredentialInfo',
  'SoraGetCredentialInfo',
  'WorldLabsGetCredentialInfo',
  'CheckSoraSession',
  'LogoutSoraSession',
  'SoraImageRemix',
  'useSoraLoginListener',
  'waitForSoraLogin',
  'EnqueueImageInpaint',
  'EnqueueImageTo3dWorld',
  'EnqueueImageToVideo',
  'EnqueueTextToImage',
  'GrokAccountBlock',
  'MidjourneyAccountBlock',
];
const DELETED_DIRS = ['grok', 'midjourney', 'sora', 'worldlabs'];

// Enum members / reminder types / props that represent a consumer login.
const CONSUMER_ENUM = /\b(Generation)?Provider\.(Sora|Grok|Midjourney|WorldLabs|ChatGPT|OpenAI)\b/;
const CONSUMER_UI = [
  'soraLogin',
  'openAiLogo',
  'isDirectMidjourney',
  'sora_orientation',
  '"sora_2"',
  'Login with OpenAI',
  'Link Your OpenAI',
  'OpenAI Sora',
];
// Display-name entries; Grok/World Labs remain as fal-hosted API providers.
const CONSUMER_DISPLAY_KEYS = /^\s*(midjourney|sora|chatgpt|openai)\s*:/im;
// Any spelling of a consumer-login provider in user-visible modal text.
const CONSUMER_TEXT = /midjourney|\bsora\b|chatgpt|grok\s*(consumer|login|account)|world\s*labs?\s*(consumer|login|account)/i;

// --- tests ---

describe('A3b: account blocks', () => {
  it.each(DELETED_FILES)('%s is deleted', (file) => {
    expect(existsSync(path.join(APP_ROOT, file))).toBe(false);
  });

  it('AccountSettingsPane imports and renders only the main account block', () => {
    const src = read(`${ACCOUNT_DIR}/AccountSettingsPane.tsx`);
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports).toEqual(['./ArtcraftAccountBlock']);
    const rendered = [...src.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]);
    expect(rendered).toEqual(['ArtcraftAccountBlock']);
  });

  it('every relative import under AccountSettings resolves to a file that exists', () => {
    expect(brokenRelativeImports(ACCOUNT_DIR)).toEqual([]);
  });
});

describe('A3b: touched files', () => {
  it.each(TOUCHED)('%s exists', (file) => {
    expect(existsSync(path.join(APP_ROOT, file))).toBe(true);
  });

  it.each(TOUCHED)('%s has no consumer-login provider enum member', (file) => {
    expect(matchingLines(read(file), CONSUMER_ENUM)).toEqual([]);
  });

  it.each(TOUCHED)('%s has no consumer-login reminder, prop or branch', (file) => {
    const src = read(file);
    expect(CONSUMER_UI.filter((s) => src.includes(s))).toEqual([]);
  });

  it('pricing display names have no Midjourney/Sora/ChatGPT entry, and keep ArtCraft and FAL', () => {
    const src = read(`${LIBS}/pricing-modal/src/lib/cost-breakdown-modal.tsx`);
    const map = src.match(/PROVIDER_DISPLAY_NAMES[^{]*\{([^}]*)\}/);
    expect(map, 'PROVIDER_DISPLAY_NAMES not found').not.toBeNull();
    expect(map![1]).not.toMatch(CONSUMER_DISPLAY_KEYS);
    expect(map![1]).toMatch(/artcraft\s*:/);
    expect(map![1]).toMatch(/fal\s*:/);
  });

  it('PromptBoxImage no longer overrides count or credits for a provider', () => {
    const src = read(`${LIBS}/promptbox/src/lib/PromptBoxImage.tsx`);
    expect(src).toMatch(/generationCount\s*=\s*usePromptImageStore/);
    expect(src).toMatch(/credits=\{credits\}/);
  });

  it('PromptBoxVideo has no sora request branch', () => {
    expect(read(`${LIBS}/promptbox/src/lib/PromptBoxVideo.tsx`)).not.toMatch(/case\s+["']sora/);
  });

  it('MainApp passes no openAiLogo to the reminder modal', () => {
    expect(read(`${FE}/apps/artcraft/app/src/pages/MainApp.tsx`)).not.toMatch(/openAiLogo/i);
  });
});

describe('A3b: modals offer no consumer login', () => {
  it.each(MODALS)('%s production text names no consumer-login provider', (dir) => {
    const hits = gitGrep(CONSUMER_TEXT.source, true, dir, ':!*.spec.*', ':!*.test.*');
    expect(hits).toBe('');
  });

  it('ReminderType is exactly "default" | "artcraftLogin"', () => {
    const src = read(`${LIBS}/action-reminder-modal/src/lib/action-reminder-modal.tsx`);
    const decl = src.match(/export type ReminderType\s*=\s*([^;]+);/);
    expect(decl).not.toBeNull();
    const members = decl![1].split('|').map((s) => s.trim().replace(/["']/g, '')).sort();
    expect(members).toEqual(['artcraftLogin', 'default']);
  });

  it('setup and billing name maps cover the same providers', () => {
    const names = (file: string) =>
      [...read(file).matchAll(/case GenerationProvider\.(\w+):/g)].map((m) => m[1]).sort();
    const setup = names(`${LIBS}/provider-setup-modal/src/lib/provider-setup-modal.tsx`);
    const billing = names(`${LIBS}/provider-billing-modal/src/lib/others/GenericProviderBillingBlock.tsx`);
    expect(setup).toEqual(billing);
    expect(setup).toContain('Fal');
  });
});

describe('A3b: no import of a deleted wrapper anywhere in frontend/', () => {
  const PROD = [FE, ':!**/*.spec.*', ':!**/*.test.*', ':!**/dist/**', ':!**/node_modules/**', `:!${FE}/tools/brand-check/**`];

  it('no production source references a deleted wrapper or block symbol', () => {
    expect(gitGrep(`\\b(${DELETED_SYMBOLS.join('|')})\\b`, false, ...PROD)).toBe('');
  });

  it('no source (specs included) imports from a deleted provider folder', () => {
    const pattern = `from\\s+["'][^"']*/providers?/(${DELETED_DIRS.join('|')})(/|["'])`;
    expect(gitGrep(pattern, true, FE, ':!**/dist/**', ':!**/node_modules/**', `:!${FE}/tools/brand-check/**`)).toBe('');
  });

  it('no source (specs included) imports a deleted account block file', () => {
    expect(gitGrep(`from\\s+["'][^"']*(GrokAccountBlock|MidjourneyAccountBlock)["']`, false, FE, ':!**/dist/**', `:!${FE}/tools/brand-check/**`)).toBe('');
  });

  it('touched specs do not reference removed options', () => {
    const specs = [
      `${LIBS}/provider-setup-modal/src/lib/provider-setup-modal.spec.tsx`,
      `${LIBS}/provider-billing-modal/src/lib/provider-billing-modal.spec.tsx`,
      `${LIBS}/action-reminder-modal/src/lib/action-reminder-modal.spec.tsx`,
    ];
    for (const spec of specs) {
      const src = read(spec);
      expect(matchingLines(src, CONSUMER_ENUM), spec).toEqual([]);
      expect(src, spec).not.toMatch(/soraLogin|midjourney_|sora_/i);
    }
  });
});

// --- helpers ---

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

function matchingLines(src: string, re: RegExp): string[] {
  return src.split('\n').filter((l) => re.test(l));
}

function brokenRelativeImports(relDir: string): string[] {
  const listing = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', relDir], {
    cwd: APP_ROOT,
    encoding: 'utf8',
  });
  const broken: string[] = [];
  for (const file of listing.split(/\r?\n/).filter((f) => /\.tsx?$/.test(f))) {
    const abs = path.join(APP_ROOT, file);
    if (!existsSync(abs)) continue; // deleted in the working tree
    for (const m of readFileSync(abs, 'utf8').matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(abs), m[1]);
      const ok = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].some((ext) => existsSync(target + ext));
      if (!ok) broken.push(`${file}: ${m[1]}`);
    }
  }
  return broken;
}

// git grep exits 1 when nothing matches; treat that as "no output".
// --untracked also catches new files the developer has not added yet.
function gitGrep(pattern: string, ignoreCase: boolean, ...scope: string[]): string {
  const args = ['grep', '--untracked', '-n', '-I', '-E', ...(ignoreCase ? ['-i'] : []), pattern, '--', ...scope];
  try {
    return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).replace(/\r\n/g, '\n').trim();
  } catch (e) {
    if ((e as { status?: number }).status === 1) return '';
    throw e;
  }
}
