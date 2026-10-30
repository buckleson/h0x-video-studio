// R1 B3 edge cases: the B3-owned files carry no vendor brand in user-visible
// strings (including ARTCRAFT/Art Craft variants and LTX/Lightricks), the
// product name is spelled exactly "H0x Video Studio", hidden vendor flows are
// unreachable from the mounted app (ADR-005: hidden, code kept), and the
// memes tab and theme logo picker are fully gone. Paths use node:path so a
// Windows checkout works.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const APP_SRC = 'frontend/apps/artcraft/app/src';
const PUBLIC = 'frontend/apps/artcraft/app/public';
const LIBS = 'frontend/libs/components';

const TOP_BAR = `${APP_SRC}/components/signaled/TopBar/TopBar.tsx`;
const MAIN_APP = `${APP_SRC}/pages/MainApp.tsx`;
const APPS_INDEX = `${APP_SRC}/pages/PageApps/AppsIndexPage.tsx`;
const LOGIN_MODAL = `${LIBS}/login-modal/src/lib/login-modal.tsx`;
const HELP_MENU = `${LIBS}/help-menu/src/lib/help-menu.tsx`;
const SETTINGS_MODAL = `${LIBS}/settings-modal/src/lib/settings-modal.tsx`;
const ABOUT = `${LIBS}/settings-modal/src/lib/panes/AboutSettingsPane.tsx`;
const ASSET_MODAL = `${LIBS}/pagescene/src/lib/comps/AssetMenu/AssetModal.tsx`;
const REMINDER = `${LIBS}/action-reminder-modal/src/lib/action-reminder-modal.tsx`;

// Files B3 owns; their user-visible text must be clean even while the repo-wide
// sweep in r1-b3-visible-text.test.ts still lists files outside B3.
const B3_FILES = [
  TOP_BAR,
  MAIN_APP,
  APPS_INDEX,
  LOGIN_MODAL,
  HELP_MENU,
  SETTINGS_MODAL,
  ABOUT,
  ASSET_MODAL,
  REMINDER,
  `${LIBS}/settings-modal/src/lib/panes/VideoSettingsPane.tsx`,
  `${LIBS}/settings-modal/src/lib/panes/ProviderPrioritySettingsPane.tsx`,
  `${LIBS}/settings-modal/src/lib/panes/BillingSettingsPane.tsx`,
  `${LIBS}/settings-modal/src/lib/panes/DownloadsSettingsPane.tsx`,
  `${LIBS}/settings-modal/src/lib/panes/AccountSettings/ArtcraftAccountBlock.tsx`,
  `${LIBS}/pricing-modal/src/lib/pricing-modal.tsx`,
  `${LIBS}/pricing-modal/src/lib/cost-breakdown-modal.tsx`,
  `${LIBS}/pricing-table/src/lib/pricing-promo-banner.tsx`,
  `${LIBS}/provider-billing-modal/src/lib/artcraft/ArtcraftBillingBlock.tsx`,
  `${LIBS}/provider-billing-modal/src/lib/others/GenericProviderBillingBlock.tsx`,
  `${LIBS}/provider-setup-modal/src/lib/provider-setup-modal.tsx`,
  `${LIBS}/lightbox-modal/src/lib/lightbox-modal.tsx`,
  `${LIBS}/model-selector/src/lib/provider-icons.tsx`,
  'frontend/libs/model-list/src/lib/classes/metadata/ModelMapping.ts',
  'frontend/libs/markdown-content/src/lib/pages/NewsIndex.tsx',
];

// Brand variants a user could read. Matched only inside string literals and
// JSX text, never identifiers (ArtcraftBillingBlock, Provider.ArtCraft).
const VISIBLE_BRAND = /\bart[\s-]?craft\b|getartcraft|lightricks|\bLTX\b/i;
const WRONG_NAME = /\bH[O0]x\s+Video\s+Studio\b/gi;
const SOCIAL_URL = /discord\.(gg|com)\/|youtube\.com\/@|twitter\.com\/|\/\/(www\.)?x\.com\/|getartcraft\.com/i;

// --- cases ---

describe('B3 edge: B3-owned files have no visible vendor brand', () => {
  it.each(B3_FILES)('%s exists', (rel) => {
    expect(existsSync(abs(rel))).toBe(true);
  });

  it.each(B3_FILES)('%s has no ArtCraft/Art Craft/ARTCRAFT/LTX/Lightricks text', (rel) => {
    expect(visibleTexts(read(rel)).filter((t) => VISIBLE_BRAND.test(t))).toEqual([]);
  });

  it.each(B3_FILES)('%s spells the product "H0x Video Studio" (zero, lower-case x)', (rel) => {
    const variants = (read(rel).match(WRONG_NAME) ?? []).filter((m) => m !== 'H0x Video Studio');
    expect(variants).toEqual([]);
  });
});

describe('B3 edge: every file under the B3 lib globs is clean, not just the listed ones', () => {
  const globbed = gitLsFiles([
    `${LIBS}/help-menu/src/**/*.ts`,
    `${LIBS}/help-menu/src/**/*.tsx`,
    `${LIBS}/settings-modal/src/lib/panes/AccountSettings/*.tsx`,
    ...['pricing-table', 'pricing-modal', 'provider-billing-modal', 'provider-setup-modal', 'action-reminder-modal', 'lightbox-modal'].map(
      (lib) => `${LIBS}/${lib}/src/lib/*.tsx`,
    ),
  ]).filter((f) => !/\.(test|spec)\.tsx?$/.test(f));

  it('the globs match files (guards against a silent empty sweep)', () => {
    expect(globbed.length).toBeGreaterThan(10);
  });

  it('no globbed file shows ArtCraft/Art Craft/ARTCRAFT/LTX/Lightricks text', () => {
    const leaks = globbed.flatMap((rel) => visibleTexts(read(rel)).filter((t) => VISIBLE_BRAND.test(t)).map((t) => `${rel}: ${t}`));
    expect(leaks).toEqual([]);
  });

  it('no globbed file links to Discord, YouTube, X or getartcraft', () => {
    expect(globbed.filter((rel) => SOCIAL_URL.test(stripComments(read(rel))))).toEqual([]);
  });
});

describe('B3 edge: social and vendor links are not reachable', () => {
  it.each([TOP_BAR, MAIN_APP, HELP_MENU, SETTINGS_MODAL, ABOUT, `${LIBS}/lightbox-modal/src/lib/lightbox-modal.tsx`])(
    '%s has no Discord, YouTube channel, X or getartcraft URL',
    (rel) => {
      expect(stripComments(read(rel))).not.toMatch(SOCIAL_URL);
    },
  );

  it('the vendor LoginModal (with its Discord/CDN leftovers) is not mounted by any app', () => {
    expect(gitGrep('<LoginModal\\b', [`frontend/apps`])).toEqual([]);
  });

  it('only hidden code opens the pricing or credits modal', () => {
    const openers = gitGrep('usePricingModalStore|useCreditsModalStore', ['frontend/apps', 'frontend/libs'])
      .map((h) => h.split(':')[0])
      .filter((f) => !/\.(test|spec)\.tsx?$/.test(f));
    const allowed = [
      MAIN_APP, // mounts the closed modals only
      `${LIBS}/pricing-modal/`,
      `${LIBS}/settings-modal/src/lib/panes/BillingSettingsPane.tsx`, // pane hidden from nav
    ];
    expect([...new Set(openers)].filter((f) => !allowed.some((a) => f.startsWith(a)))).toEqual([]);
  });

  it('MainApp never calls openModal on the credits or pricing stores', () => {
    expect(read(MAIN_APP)).not.toMatch(/(Credits|Pricing)ModalStore\(\)\.(openModal|toggleModal)|toggleModal\(/);
  });
});

describe('B3 edge: hidden settings panes keep their code (ADR-005)', () => {
  const src = read(SETTINGS_MODAL);

  it.each(['AccountSettingsPane', 'BillingSettingsPane'])('%s is still imported', (name) => {
    expect(src).toContain(`import { ${name} }`);
  });

  it('nav lists no Accounts or billing/credits section', () => {
    const nav = src.slice(src.indexOf('const sections = ['), src.indexOf('const renderContent'));
    const live = stripComments(nav);
    expect(live).not.toMatch(/id: "(accounts|billing)"/);
    expect(live).toMatch(/id: "about" as const, label: "About"/);
  });

  it('TopBar never opens Settings on the accounts or billing section', () => {
    expect(read(TOP_BAR)).not.toMatch(/setSettingsSection\(\s*"(accounts|billing)"\s*\)/);
  });

  it.each([
    `${LIBS}/settings-modal/src/lib/panes/AccountSettings/AccountSettingsPane.tsx`,
    `${LIBS}/settings-modal/src/lib/panes/BillingSettingsPane.tsx`,
    'frontend/libs/markdown-content/src/lib/pages/NewsIndex.tsx',
  ])('%s still exists', (rel) => {
    expect(existsSync(abs(rel))).toBe(true);
  });
});

describe('B3 edge: logo and login', () => {
  it('h0x-icon.png exists where TopBar and the login modal point', () => {
    expect(existsSync(abs(`${PUBLIC}/resources/logo/h0x-icon.png`))).toBe(true);
  });

  it('TopBar uses exactly one logo image (no light/dark variants)', () => {
    const imgs = read(TOP_BAR).match(/src="\/resources\/logo\/[^"]+"/g) ?? [];
    expect(imgs).toEqual(['src="/resources/logo/h0x-icon.png"']);
    expect(read(TOP_BAR)).not.toMatch(/logo-color-(black|white)|data-theme.*logo|logoSrc/);
  });

  it('logo paths are URL paths, never Windows paths', () => {
    for (const rel of [TOP_BAR, LOGIN_MODAL]) {
      expect(read(rel)).not.toMatch(/src="[^"]*\\[^"]*"/);
    }
  });

  it('login modal no longer takes demo video props', () => {
    expect(read(LOGIN_MODAL)).not.toMatch(/videoSrc2D|videoSrc3D|artcraft-.*-demo\.mp4/);
  });

  it('MainApp shows a neutral Coming soon state with no sign-in call to action', () => {
    const src = read(MAIN_APP);
    const modal = src.slice(src.indexOf('title="Coming soon"'), src.indexOf('</Modal>'));
    expect(modal).not.toMatch(/sign ?in|sign ?up|log ?in|subscribe|upgrade/i);
  });

  it('the login reminder offers OK, not Login / Sign Up', () => {
    const src = read(REMINDER);
    expect(src).not.toMatch(/"Login \/ Sign Up"|Login to/);
    expect(src).toContain('"OK"');
  });
});

describe('B3 edge: asset picker and apps index', () => {
  const asset = read(ASSET_MODAL);

  it('no memes tab, label, data or icon remains', () => {
    expect(asset).not.toMatch(/"memes"|"Memes"|"Meme"|demoMemeItems|memeOverrideItems|LaughIcon/);
  });

  it('other library tabs still exist', () => {
    expect((asset.match(/\bid: "[a-z_]+",\s*\n\s*label:/g) ?? []).length).toBeGreaterThan(1);
  });

  it('apps index no longer says "craft"', () => {
    const text = read(APPS_INDEX).replace(/<[^>]+>/g, '');
    expect(text).not.toMatch(/What will you\s+craft\s+today/);
  });
});

// --- helpers ---

function abs(rel: string): string {
  return path.join(APP_ROOT, ...rel.split('/'));
}

function read(rel: string): string {
  return readFileSync(abs(rel), 'utf8');
}

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}

// String literals plus JSX text between tags, comments and imports removed.
function visibleTexts(src: string): string[] {
  const code = stripComments(src)
    .split('\n')
    .filter((l) => !/^\s*(import|export \* from|} from)\b/.test(l))
    .join('\n');
  const strings = [...code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  // `/> ... <` can span plain code between two JSX elements; drop dotted
  // identifiers such as GenerationProvider.Artcraft from those spans.
  const jsx = [...code.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].replace(/\b\w+\.\w+\b/g, ''))
    .filter((t) => /[A-Za-z]/.test(t));
  // Enum values and object keys like `artcraft: "H0x Video Studio"` keep the
  // lower-case id; only flag capitalised or spaced brand forms in literals.
  return [...strings, ...jsx].filter((t) => t !== 'artcraft' && !/^@storyteller\//.test(t));
}

function gitLsFiles(globs: string[]): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...globs.map((g) => `:(glob)${g}`)], {
    cwd: APP_ROOT,
    encoding: 'utf8',
  });
  return [...new Set(out.split('\n').filter(Boolean))];
}

function gitGrep(pattern: string, paths: string[]): string[] {
  const args = ['grep', '-n', '--untracked', '-E', pattern, '--', ...paths, ':!**/node_modules/**', ':!**/dist/**'];
  try {
    return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) {
    if ((e as { status?: number }).status === 1) return [];
    throw e;
  }
}
