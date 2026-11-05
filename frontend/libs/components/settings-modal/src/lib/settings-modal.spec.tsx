import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import SettingsModal from './settings-modal';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

const PROVIDERS = [
  { id: 'byteplus', name: 'BytePlus', kind: 'api_key', modalities: ['image', 'video'], has_key: false, key_hint: null },
];

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

const renderProviderKeys = () =>
  render(
    <SettingsModal
      isOpen
      onClose={() => {}}
      globalAccountLogoutCallback={() => {}}
      initialSection="provider_keys"
    />,
  );

it('should render successfully', async () => {
  const { baseElement } = renderProviderKeys();
  expect(baseElement).toBeTruthy();
  await screen.findByTestId('provider-byteplus');
});

it('shows the Providers & keys pane with a masked BytePlus key input', async () => {
  const user = userEvent.setup();
  renderProviderKeys();
  expect(screen.getAllByText('Providers & keys').length).toBeGreaterThan(0);
  const card = within(await screen.findByTestId('provider-byteplus'));
  await user.click(card.getByRole('button', { name: 'Set key' }));
  expect(screen.getByLabelText('BytePlus API key').getAttribute('type')).toBe('password');
  expect(card.getByRole('button', { name: 'Save' })).toBeTruthy();
});

it('saves the BytePlus key once through provider_set_api_key_command and never renders it', async () => {
  const user = userEvent.setup();
  const { baseElement } = renderProviderKeys();
  const card = within(await screen.findByTestId('provider-byteplus'));
  await user.click(card.getByRole('button', { name: 'Set key' }));
  await user.type(screen.getByLabelText('BytePlus API key'), 'bp-secret-123');
  await user.click(card.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(mockedInvoke.mock.calls.filter(([c]) => c === 'provider_set_api_key_command')).toEqual([
      ['provider_set_api_key_command', { request: { provider: 'byteplus', api_key: 'bp-secret-123' } }],
    ]),
  );
  await waitFor(() => expect(screen.queryByLabelText('BytePlus API key')).toBeNull());
  expect(baseElement.innerHTML).not.toContain('bp-secret-123');
});
