// R2-1b edge cases: the "Provider keys" pane (masked BytePlus key + Save).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsModal from './settings-modal';

// --- constants ---

const KEY = 'bp-secret-123';
const LABEL = 'BytePlus API key';
const SAVED = 'saved ✓';
const BRAND_LEAKS = /artcraft|getartcraft|storyteller|fakeyou|ltx|lightricks/i;

// --- helpers ---

const api = vi.hoisted(() => ({ setKey: vi.fn() }));

vi.mock('@storyteller/tauri-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ProviderSetApiKey: api.setKey,
}));

const renderModal = (initialSection?: string) =>
  render(
    <SettingsModal
      isOpen
      onClose={() => {}}
      globalAccountLogoutCallback={() => {}}
      {...(initialSection ? { initialSection: initialSection as any } : {})}
    />,
  );

const keyInput = () => screen.getByLabelText(LABEL) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

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

describe('Provider keys pane', () => {
  it('is reachable from the settings nav', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    await user.click(screen.getByText('Provider keys'));
    expect(keyInput().type).toBe('password');
  });

  it('labels the masked input and disables autocomplete', () => {
    renderModal('provider_keys');
    expect(keyInput().type).toBe('password');
    expect(keyInput().getAttribute('autocomplete')).toBe('off');
    expect(keyInput().value).toBe('');
  });

  it('keeps Save disabled while the input is empty and never calls the wrapper', async () => {
    const user = userEvent.setup();
    renderModal('provider_keys');
    expect(saveButton().disabled).toBe(true);
    await user.click(saveButton());
    expect(api.setKey).not.toHaveBeenCalled();
    expect(screen.queryByText(SAVED)).toBeNull();
  });

  it('re-disables Save after the user deletes what they typed', async () => {
    const user = userEvent.setup();
    renderModal('provider_keys');
    await user.type(keyInput(), 'ab');
    expect(saveButton().disabled).toBe(false);
    await user.clear(keyInput());
    expect(saveButton().disabled).toBe(true);
  });

  it('does not show saved or clear the input before the save resolves', async () => {
    const user = userEvent.setup();
    const pending = deferred<{ status: string }>();
    api.setKey.mockReturnValue(pending.promise);
    renderModal('provider_keys');

    await user.type(keyInput(), KEY);
    await user.click(saveButton());
    expect(screen.queryByText(SAVED)).toBeNull();
    expect(keyInput().value).toBe(KEY);

    pending.resolve({ status: 'success' });
    await screen.findByText(SAVED);
    expect(keyInput().value).toBe('');
  });

  it('on an error status: no saved mark and the key stays for a retry', async () => {
    const user = userEvent.setup();
    api.setKey.mockResolvedValue({ status: 'server_error' });
    renderModal('provider_keys');

    await user.type(keyInput(), KEY);
    await user.click(saveButton());

    await waitFor(() => expect(api.setKey).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(SAVED)).toBeNull();
    expect(keyInput().value).toBe(KEY);
  });

  it('on a null/undefined result: no saved mark', async () => {
    const user = userEvent.setup();
    api.setKey.mockResolvedValue(undefined);
    renderModal('provider_keys');

    await user.type(keyInput(), KEY);
    await user.click(saveButton());

    await waitFor(() => expect(api.setKey).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(SAVED)).toBeNull();
  });

  it('on a rejected save (backend offline): no saved mark and no unhandled error', async () => {
    const user = userEvent.setup();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    api.setKey.mockRejectedValue(new Error('ipc down'));
    try {
      renderModal('provider_keys');
      await user.type(keyInput(), KEY);
      await user.click(saveButton());
      await waitFor(() => expect(api.setKey).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByText(SAVED)).toBeNull();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('hides the saved mark once the user starts typing a new key', async () => {
    const user = userEvent.setup();
    renderModal('provider_keys');
    await user.type(keyInput(), KEY);
    await user.click(saveButton());
    await screen.findByText(SAVED);

    await user.type(keyInput(), 'n');
    expect(screen.queryByText(SAVED)).toBeNull();
  });

  it('saves a second key separately and never renders either key', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderModal('provider_keys');

    await user.type(keyInput(), 'first-key');
    await user.click(saveButton());
    await screen.findByText(SAVED);
    await user.type(keyInput(), 'second-key');
    await user.click(saveButton());
    await screen.findByText(SAVED);

    expect(api.setKey.mock.calls).toEqual([['first-key'], ['second-key']]);
    expect(baseElement.innerHTML).not.toContain('first-key');
    expect(baseElement.innerHTML).not.toContain('second-key');
    expect(baseElement.textContent).not.toContain('second-key');
  });

  it('passes the key without trimming', async () => {
    const user = userEvent.setup();
    renderModal('provider_keys');
    await user.type(keyInput(), ' k e y ');
    await user.click(saveButton());
    expect(api.setKey).toHaveBeenCalledWith(' k e y ');
  });

  it('has no brand leaks in the pane text or the nav label', () => {
    const { baseElement } = renderModal('provider_keys');
    const pane = keyInput().closest('div')!.parentElement!;
    expect(within(pane).getByText(LABEL)).toBeTruthy();
    expect(pane.textContent ?? '').not.toMatch(BRAND_LEAKS);
    expect(LABEL).not.toMatch(BRAND_LEAKS);
    expect(SAVED).not.toMatch(BRAND_LEAKS);
    expect(screen.getAllByText('Provider keys')[0].textContent).not.toMatch(BRAND_LEAKS);
    expect(baseElement).toBeTruthy();
  });
});
