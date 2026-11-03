import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import SettingsModal from './settings-modal';

const api = vi.hoisted(() => ({ setKey: vi.fn() }));

vi.mock('@storyteller/tauri-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ProviderSetApiKey: api.setKey,
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  api.setKey.mockResolvedValue({ status: 'success' });
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

it('should render successfully', () => {
  const { baseElement } = renderProviderKeys();
  expect(baseElement).toBeTruthy();
});

it('shows a masked BytePlus key input with a Save button', () => {
  renderProviderKeys();
  expect(screen.getAllByText('Provider keys').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('BytePlus API key').getAttribute('type')).toBe('password');
  expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
});

it('saves the typed key once, then clears it and never renders it', async () => {
  const user = userEvent.setup();
  const { baseElement } = renderProviderKeys();
  const input = screen.getByLabelText('BytePlus API key') as HTMLInputElement;

  await user.type(input, 'bp-secret-123');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(api.setKey).toHaveBeenCalledTimes(1);
  expect(api.setKey).toHaveBeenCalledWith('bp-secret-123');
  await screen.findByText('saved ✓');
  await waitFor(() => expect(input.value).toBe(''));
  expect(baseElement.innerHTML).not.toContain('bp-secret-123');
});
