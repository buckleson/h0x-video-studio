// R4-3b: the settings modal routes "Providers & keys" to ProvidersPane (replacing the R2-1b
// BytePlus-only pane), keeps the Provider Priority pane, and uses Phosphor icons only.
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import SettingsModal from './settings-modal';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const LABEL = 'Providers & keys';
const BRAND_LEAKS = /artcraft|getartcraft|storyteller|fakeyou|\bltx\b|lightricks/i;
const MODAL_SRC = readFileSync(join(__dirname, 'settings-modal.tsx'), 'utf8');

const PROVIDERS = [
  { id: 'byteplus', name: 'BytePlus', kind: 'api_key', modalities: ['image', 'video'], has_key: true, key_hint: 'c123' },
];

// --- helpers ---

const mockedInvoke = vi.mocked(invoke);

const renderModal = () =>
  render(
    <SettingsModal isOpen onClose={() => {}} globalAccountLogoutCallback={() => {}} initialSection="provider_keys" />,
  );

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  mockedInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'provider_list_command') return { status: 'success', payload: { providers: PROVIDERS } };
    if (cmd === 'custom_endpoint_list_command') return { status: 'success', payload: { endpoints: [] } };
    return { status: 'success' };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Providers & keys in the settings modal', () => {
  it('has a nav entry and a header with the new label (old label gone)', async () => {
    renderModal();
    await screen.findByTestId('provider-byteplus');
    expect(screen.getByRole('button', { name: LABEL })).toBeTruthy();
    expect(screen.getByRole('heading', { name: LABEL })).toBeTruthy();
    expect(screen.queryByText('Provider keys')).toBeNull();
  });

  it('leaves the Provider Priority nav entry hidden, as upstream does', async () => {
    renderModal();
    await screen.findByTestId('provider-byteplus');
    expect(screen.queryByRole('button', { name: 'Provider Priority' })).toBeNull();
  });

  it('existing BytePlus users see a masked hint, never a pre-filled key field', async () => {
    renderModal();
    const card = within(await screen.findByTestId('provider-byteplus'));
    expect(card.getByText('Connected •••• c123')).toBeTruthy();
    expect(screen.queryByLabelText('BytePlus API key')).toBeNull();
    expect(screen.getByTestId('provider-byteplus').querySelectorAll('input').length).toBe(0);
    expect(screen.getByTestId('provider-byteplus').textContent).not.toMatch(/c123.+c123/);
  });

  it('shows all four pane sections inside the modal', async () => {
    renderModal();
    await screen.findByTestId('provider-byteplus');
    for (const heading of ['Providers', 'Custom endpoints', 'Defaults', 'Connect your agent']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
  });

  it('has no brand leaks in the modal text', async () => {
    const { baseElement } = renderModal();
    await screen.findByTestId('provider-byteplus');
    expect(baseElement.textContent).not.toMatch(BRAND_LEAKS);
  });
});

describe('settings-modal.tsx source', () => {
  it('has no lucide imports', () => {
    expect(MODAL_SRC).not.toMatch(/lucide/i);
    expect(MODAL_SRC).toMatch(/from "@phosphor-icons\/react"/);
  });

  it('routes provider_keys to ProvidersPane and drops the inline BytePlus-only pane', () => {
    expect(MODAL_SRC).toMatch(/case "provider_keys":\s*return <ProvidersPane \/>/);
    expect(MODAL_SRC).not.toMatch(/ProviderKeysSettingsPane/);
    expect(MODAL_SRC).not.toMatch(/BytePlus API key/);
    expect(MODAL_SRC).toMatch(/<ProviderPrioritySettingsPane \/>/);
  });
});
