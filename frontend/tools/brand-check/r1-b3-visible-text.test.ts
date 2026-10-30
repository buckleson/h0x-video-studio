// @vitest-environment jsdom
// R1 B3: no user-visible "ArtCraft"/"getartcraft" text in frontend code, the
// vendor login/billing/social entry points are hidden, the memes tab is gone.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { createElement, Fragment } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { TopBar } from '~/components/signaled/TopBar/TopBar';

// --- constants ---

const APP_ROOT = path.resolve(__dirname, '../../..');
const BRAND = /\bArt[Cc]raft\b|getartcraft|discord\.gg\/artcraft/;
const TEST_FILE = /\.(test|spec)\.tsx?$|^frontend\/tools\//;

// Identifiers, enum members and imports that keep the upstream name until R2.
const ALLOWED: RegExp[] = [
  /\b(GenerationProvider|Provider|ModelCreator)\.Art[Cc]raft\b/g,
  /^\s*Artcraft = "artcraft",$/g, // GenerationProvider enum member
  /^\s*ArtCraft = "artcraft",$/g, // Provider enum member
  /^\s*ArtCraft = "ArtCraft",$/g, // ModelCreator enum member
  /^export const SHARE_URL_BASE = "https:\/\/getartcraft\.com\/media\/";$/, // vendor host kept until R2 (ADR rule 4, ADR-005)
  /^const APEX_DOMAINS = \["getartcraft\.com"\];$/, // vendor host kept until R2 (ADR rule 4, ADR-005)
];

const TOP_BAR = 'frontend/apps/artcraft/app/src/components/signaled/TopBar/TopBar.tsx';
const MAIN_APP = 'frontend/apps/artcraft/app/src/pages/MainApp.tsx';
const APPS_INDEX = 'frontend/apps/artcraft/app/src/pages/PageApps/AppsIndexPage.tsx';
const LOGIN_MODAL = 'frontend/libs/components/login-modal/src/lib/login-modal.tsx';
const HELP_MENU = 'frontend/libs/components/help-menu/src/lib/help-menu.tsx';
const SETTINGS_MODAL = 'frontend/libs/components/settings-modal/src/lib/settings-modal.tsx';
const ASSET_MODAL = 'frontend/libs/components/pagescene/src/lib/comps/AssetMenu/AssetModal.tsx';
const LIGHTBOX = 'frontend/libs/components/lightbox-modal/src/lib/lightbox-modal.tsx';

// TopBar render mocks: stores answer selectors, components render nothing.
const { store, Stub, auth, credits, plan } = vi.hoisted(() => ({
  auth: { status: { value: 'logged_out' } },
  credits: { totalCredits: 1234, iconStatus: 'hidden', fetchFromServer: () => {} },
  plan: { hasPaidPlan: () => false, fetchFromServer: () => {} },
  store: <T extends object>(state: T) =>
    Object.assign((selector?: (s: T) => unknown) => (selector ? selector(state) : state), { getState: () => state }),
  Stub: () => null,
}));

vi.mock('@storyteller/icons', () => ({ DynamicIcon: Stub }));
vi.mock('@storyteller/credits', () => ({ useCreditsState: store(credits) }));
vi.mock('@storyteller/provider-billing-modal', () => ({ ProviderBillingModal: Stub }));
vi.mock('@storyteller/provider-setup-modal', () => ({ ProviderSetupModal: Stub }));
vi.mock('@storyteller/subscription', () => ({ useSubscriptionState: store(plan) }));
vi.mock('@storyteller/tauri-events', () => ({ useCreditsBalanceChangedEvent: () => {}, useSubscriptionPlanChangedEvent: () => {} }));
vi.mock('@storyteller/tauri-utils', () => ({ useTauriPlatform: () => 'windows', useTauriWindowControls: () => ({ isDesktop: false }) }));
vi.mock('@storyteller/ui-button', () => ({
  Button: ({ children, onClick, ...p }: { children?: unknown; onClick?: () => void; 'aria-label'?: string }) =>
    createElement('button', { 'aria-label': p['aria-label'], onClick }, children),
}));
vi.mock('@storyteller/ui-gallery-modal', () => ({ GalleryModal: Stub, galleryModalLightboxVisible: {}, galleryModalVisibleDuringDrag: {}, galleryModalVisibleViewMode: {} }));
vi.mock('@storyteller/ui-menu-icon-selector', () => ({ MenuIconSelector: Stub }));
vi.mock('@storyteller/ui-pricing-modal', () => ({ CostBreakdownModal: Stub, CreditsModal: Stub }));
vi.mock('@storyteller/ui-generation-list', () => ({ GalleryAutoplayToggle: Stub, GallerySelectToggle: Stub, GalleryViewToggle: Stub }));
vi.mock('@storyteller/ui-settings-modal', () => ({ SettingsModal: Stub }));
vi.mock('@storyteller/ui-tooltip', () => ({ Tooltip: ({ children }: { children?: unknown }) => createElement(Fragment, null, children) }));
vi.mock('@storyteller/ui-pagedraw', () => ({ useSceneStore: store({}) }));
vi.mock('@storyteller/ui-pagescene', () => ({ usePageSceneStore: store({ is3DSceneLoaded: true, is3DEditorInitialized: true }) }));
vi.mock('~/config/appMenu', () => ({ APP_DESCRIPTORS: [], goToApp: () => {} }));
vi.mock('~/components/generation-feed/desktopMediaActions', () => ({ applyMakeVideoFromImage: () => {}, applyRecreateFromPromptData: () => {}, downloadMediaFileToDisk: () => {} }));
vi.mock('~/pages/PageStoryboard', () => ({ useStoryboardStore: store({}) }));
vi.mock('~/pages/PageImageTo3DObject/ImageTo3DStore', () => ({ useImageTo3DStore: store({}) }));
vi.mock('~/pages/PageImageTo3DWorld/ImageTo3DWorldStore', () => ({ useImageTo3DWorldStore: store({}) }));
vi.mock('~/pages/PageRemoveBackground/RemoveBackgroundStore', () => ({ useRemoveBackgroundStore: store({}) }));
vi.mock('~/pages/Stores/TabState', () => ({ useTabStore: store({ activeTabId: 'APPS' }) }));
vi.mock('~/enums', () => ({ AUTH_STATUS: { LOGGED_IN: 'logged_in' } }));
vi.mock('~/signals', () => ({ authentication: auth }));
vi.mock('~/signals/authentication/utilities', () => ({ setLogoutStates: () => {} }));
vi.mock('~/Helpers/galleryModalTauriBindings', () => ({ galleryModalDeleteMedia: () => {}, galleryModalSubscribeToMediaEvents: () => {} }));
vi.mock('~/components/signaled/TopBar/AppsQuickMenu', () => ({ AppsQuickMenu: Stub }));
vi.mock('~/components/signaled/TopBar/SceneTitleInput', () => ({ SceneTitleInput: Stub }));
vi.mock('~/components/signaled/TopBar/TaskQueue', () => ({ TaskQueue: Stub }));
vi.mock('~/components/signaled/TopBar/UploadImagesButton', () => ({ UploadImagesButton: Stub }));

afterEach(() => {
  cleanup();
  auth.status.value = 'logged_out';
  credits.iconStatus = 'hidden';
  plan.hasPaidPlan = () => false;
});

// --- tests ---

describe('R1 B3 visible text', () => {
  it('no string literal or JSX text says ArtCraft, getartcraft or discord.gg/artcraft', () => {
    expect(brandViolations()).toEqual([]);
  });

  it('no frontend code references the old logo, icon or demo videos', () => {
    expect(gitGrep('artcraft-logo\\|artcraft-icon\\|artcraft-.*-demo.mp4', ['frontend', ':!frontend/tools/**'], false)).toEqual([]);
  });

  it('Apps index asks "What will you create today?"', () => {
    expect(
      read(APPS_INDEX)
        .replace(/<[^>]+>/g, '')
        .replace(/\{\s*["']\s*["']\s*\}/g, ' ')
        .replace(/\s+/g, ' '),
    ).toContain('What will you create today?');
  });
});

describe('R1 B3 TopBar', () => {
  const src = read(TOP_BAR);

  it('shows the h0x icon and the product name', () => {
    expect(src).toContain('src="/resources/logo/h0x-icon.png"');
    expect(src).toMatch(/>\s*H0x Video Studio\s*</);
  });

  it('has no theme-based logo picker', () => {
    expect(src).not.toMatch(/MutationObserver|setLogoSrc|computeLogo/);
  });

  it('has no credits, upgrade or pricing entry points', () => {
    expect(src).not.toMatch(/Buy credits|>\s*Upgrade\s*<|toggleSubscriptionModal|toggleCreditsModal|CreditsCoinWithStatus/);
  });
});

describe('R1 B3 TopBar render', () => {
  it('shows the h0x icon and product name', () => {
    const { container } = render(createElement(TopBar, { pageName: 'Home' }));
    expect(container.querySelector('img[src="/resources/logo/h0x-icon.png"]')).toBeTruthy();
    expect(screen.getByText('H0x Video Studio')).toBeTruthy();
    expect(container.textContent).not.toMatch(/artcraft/i);
  });

  it('renders no sign-in, pricing or credits buttons', () => {
    const { container } = render(createElement(TopBar, { pageName: 'Home' }));
    expect(screen.queryByRole('button', { name: /sign ?in|sign ?up|log ?in|upgrade|support|buy credits|pricing/i })).toBeNull();
    expect(container.textContent).not.toMatch(/1,?234|credit/i);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it.each([
    ['logged in, free plan, credits visible', 'logged_in', false, 'ok'],
    ['logged in, paid plan', 'logged_in', true, 'ok'],
    ['unknown auth state', 'bogus', false, 'warning'],
  ])('renders no sign-in, upgrade or credits UI when %s', (_label, status, paid, icon) => {
    auth.status.value = status;
    plan.hasPaidPlan = () => paid;
    credits.iconStatus = icon;
    const { container, unmount } = render(createElement(TopBar, { pageName: 'Home' }));
    expect(screen.queryByRole('button', { name: /sign ?in|sign ?up|log ?in|log ?out|upgrade|buy credits|pricing|account/i })).toBeNull();
    expect(container.textContent).not.toMatch(/1,?234|credit|upgrade|subscri/i);
    expect(container.querySelector('img[src="/resources/logo/h0x-icon.png"]')).toBeTruthy();
    unmount();
  });
});

describe('R1 B3 brand-check filter (self-test)', () => {
  it.each([
    ['frontend/libs/x/a.tsx:1:  label: "ArtCraft Presets",', true],
    ['frontend/libs/x/a.tsx:1:  <span>Artcraft</span>', true],
    ['frontend/libs/x/a.ts:1:const u = "https://getartcraft.com/media/";', true],
    ['frontend/libs/x/a.ts:1:const d = "https://discord.gg/artcraft";', true],
    ['frontend/libs/x/a.ts:1:if (p === Provider.ArtCraft) "ArtCraft";', true],
    ['frontend/libs/x/a.ts:1:if (p === Provider.ArtCraft) return;', false],
    ['frontend/libs/x/a.ts:1:  ArtCraft = "ArtCraft",', false],
    ['frontend/libs/x/a.ts:1:  Artcraft = "artcraft",', false],
    ['frontend/libs/x/a.ts:1:// ArtCraft legacy note', false],
    ['frontend/libs/x/a.ts:1: * ArtCraft doc comment', false],
    ['frontend/libs/x/a.ts:1:foo(); // ArtCraft trailing', false],
    ['frontend/libs/x/a.ts:1:import { ArtcraftBillingBlock } from "./artcraft/ArtcraftBillingBlock";', false],
    ['frontend/libs/x/a.spec.tsx:1:expect("ArtCraft")', false],
    ['frontend/tools/brand-check/x.ts:1:"ArtCraft"', false],
  ])('%s -> violation %s', (hit, expected) => {
    expect(isViolation(hit)).toBe(expected);
  });

  it('Windows-style separators in the hit path still parse and still skip test files', () => {
    expect(isViolation('frontend\\libs\\x\\a.tsx:1:  label: "ArtCraft",')).toBe(true);
    expect(isViolation('frontend\\libs\\x\\a.spec.tsx:1:  label: "ArtCraft",')).toBe(false);
  });
});

describe('R1 B3 login and MainApp', () => {
  it('login modal uses the h0x icon', () => {
    expect(read(LOGIN_MODAL)).toContain('src="/resources/logo/h0x-icon.png"');
  });

  it('MainApp mounts a Coming soon state instead of the vendor login modal', () => {
    const src = read(MAIN_APP);
    expect(src).not.toMatch(/<LoginModal\b|videoSrc2D|videoSrc3D|\.mp4/);
    expect(src).toContain('title="Coming soon"');
  });
});

describe('R1 B3 hidden vendor entry points', () => {
  it('help menu has no News, Discord or YouTube links', () => {
    const src = read(HELP_MENU);
    expect(src).not.toMatch(/label: "(News & Updates|Discord|ArtCraft Studios)"/);
    expect(src).not.toMatch(/discord\.com|discord\.gg|youtube\.com\/@|storytold\/artcraft/);
  });

  it('settings has no Accounts or Plan & Credits section', () => {
    const src = read(SETTINGS_MODAL);
    expect(src).not.toMatch(/label: "(Accounts|Plan & Credits)"/);
  });

  it('lightbox has no vendor share link', () => {
    expect(read(LIGHTBOX)).not.toMatch(/Share link copied|getartcraft/);
  });
});

describe('R1 B3 asset picker', () => {
  it('has no tab with id "memes"', () => {
    expect(read(ASSET_MODAL)).not.toMatch(/id:\s*"memes"/);
  });
});

// --- helpers ---

function read(rel: string): string {
  return readFileSync(path.join(APP_ROOT, rel), 'utf8');
}

function gitGrep(pattern: string, paths: string[], extended = true): string[] {
  const args = ['grep', '-n', '--untracked', ...(extended ? ['-E'] : []), pattern, '--', ...paths, ':!**/node_modules/**', ':!**/dist/**'];
  try {
    return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (e) {
    if ((e as { status?: number }).status === 1) return [];
    throw e;
  }
}

function brandViolations(): string[] {
  const hits = gitGrep('\\bArt[Cc]raft\\b|getartcraft|discord\\.gg/artcraft', ['frontend/**/*.ts', 'frontend/**/*.tsx']);
  return hits.filter(isViolation);
}

function isViolation(hit: string): boolean {
  const [file, , ...rest] = hit.split(':');
  if (TEST_FILE.test(file)) return false;
  let code = rest.join(':').trimEnd();
  if (/^\s*(\/\/|\*|\/\*)/.test(code)) return false;
  code = code.replace(/\/\*.*?\*\//g, '').replace(/\s\/\/.*$/, '');
  for (const re of ALLOWED) code = code.replace(re, '');
  return BRAND.test(code);
}
