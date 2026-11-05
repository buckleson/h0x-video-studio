// R4-3b: Providers & keys pane (provider cards, custom endpoints, defaults, connect your agent).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

import { MCP_SNIPPET, ProvidersPane } from './ProvidersPane';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const OK = { status: 'success' };

const PROVIDERS = [
  { id: 'byteplus', name: 'BytePlus', kind: 'api_key', modalities: ['image', 'video'], has_key: true, key_hint: '1234' },
  { id: 'openai', name: 'OpenAI', kind: 'api_key', modalities: ['llm', 'image'], has_key: false, key_hint: null },
  { id: 'runway_web_login', name: 'Runway (web login)', kind: 'web_login', modalities: ['video'], has_key: false, key_hint: null },
];

const ENDPOINTS = [
  { id: 'ep-1', name: 'Local LLM', base_url: 'http://localhost:8000/v1', kind: 'openai_compatible', modalities: ['llm'], has_key: true, key_hint: '9876' },
];

// --- helpers ---

const mockedInvoke = vi.mocked(invoke);

const backend = (overrides: Record<string, unknown> = {}) =>
  mockedInvoke.mockImplementation(async (cmd: string) => {
    if (cmd in overrides) {
      const value = overrides[cmd];
      if (value instanceof Error) throw value;
      return value;
    }
    switch (cmd) {
      case 'provider_list_command':
        return { ...OK, payload: { providers: PROVIDERS } };
      case 'custom_endpoint_list_command':
        return { ...OK, payload: { endpoints: ENDPOINTS } };
      case 'modality_defaults_get_command':
        return { ...OK, payload: { image: 'byteplus' } };
      case 'custom_endpoint_save_command':
        return { ...OK, payload: { id: 'ep-2' } };
      default:
        return OK;
    }
  });

const callsOf = (cmd: string) => mockedInvoke.mock.calls.filter(([c]) => c === cmd).map(([, args]) => args);

const renderPane = async () => {
  const view = render(<ProvidersPane />);
  await screen.findByTestId('provider-byteplus');
  return view;
};

const card = (id: string) => within(screen.getByTestId(`provider-${id}`));

beforeEach(() => {
  backend();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('provider cards', () => {
  it('lists API-key providers with their status and masked hint only', async () => {
    await renderPane();
    expect(card('byteplus').getByText('Connected •••• 1234')).toBeTruthy();
    expect(card('byteplus').getByText('Image')).toBeTruthy();
    expect(card('byteplus').getByRole('button', { name: 'Replace' })).toBeTruthy();
    expect(card('byteplus').getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(card('openai').getByText('Not set')).toBeTruthy();
    expect(card('openai').getByRole('button', { name: 'Set key' })).toBeTruthy();
    expect(card('openai').queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByTestId('provider-runway_web_login')).toBeNull();
  });

  it('sets a key through a password field with the trimmed key and never renders it', async () => {
    const user = userEvent.setup();
    const { baseElement } = await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    const input = screen.getByLabelText('OpenAI API key') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('off');

    await user.type(input, '  sk-secret-5678  ');
    await user.click(card('openai').getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(callsOf('provider_set_api_key_command')).toEqual([
        { request: { provider: 'openai', api_key: 'sk-secret-5678' } },
      ]),
    );
    await waitFor(() => expect(screen.queryByLabelText('OpenAI API key')).toBeNull());
    expect(baseElement.innerHTML).not.toContain('sk-secret');
  });

  it('keeps Save disabled for a blank key', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), '   ');
    expect((card('openai').getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('BytePlus still saves through provider_set_api_key_command', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(card('byteplus').getByRole('button', { name: 'Replace' }));
    await user.type(screen.getByLabelText('BytePlus API key'), 'bp-key');
    await user.click(card('byteplus').getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(callsOf('provider_set_api_key_command')).toEqual([{ request: { provider: 'byteplus', api_key: 'bp-key' } }]),
    );
  });

  it('shows the backend error and keeps the input on a failed save', async () => {
    const user = userEvent.setup();
    backend({ provider_set_api_key_command: { status: 'bad_request', error_message: 'API key is empty' } });
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'k');
    await user.click(card('openai').getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('API key is empty');
    expect(screen.getByLabelText('OpenAI API key')).toBeTruthy();
  });

  it('removes a key with provider_clear_command', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(card('byteplus').getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(callsOf('provider_clear_command')).toEqual([{ request: { provider: 'byteplus' } }]));
  });
});

describe('custom endpoints', () => {
  it('lists endpoints with a masked hint', async () => {
    await renderPane();
    expect(screen.getByText('http://localhost:8000/v1')).toBeTruthy();
    expect(screen.getByText('Connected •••• 9876')).toBeTruthy();
  });

  it('rejects a bad base URL client-side', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    await user.type(screen.getByLabelText('Name'), 'Mine');
    await user.type(screen.getByLabelText('Base URL'), 'ftp://nope');
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/http/);
    expect(callsOf('custom_endpoint_save_command')).toEqual([]);
  });

  it('requires a name', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.com');
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Name is required');
    expect(callsOf('custom_endpoint_save_command')).toEqual([]);
  });

  it('adds an endpoint with a masked key field', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    await user.type(screen.getByLabelText('Name'), ' Mine ');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.com/v1');
    await user.selectOptions(screen.getByLabelText('Type'), 'other');
    await user.click(screen.getByRole('checkbox', { name: 'Video' }));
    const key = screen.getByLabelText('API key') as HTMLInputElement;
    expect(key.type).toBe('password');
    await user.type(key, ' ek ');
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    await waitFor(() =>
      expect(callsOf('custom_endpoint_save_command')).toEqual([
        { request: { name: 'Mine', base_url: 'https://api.example.com/v1', kind: 'other', modalities: ['video'], api_key: 'ek' } },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save endpoint' })).toBeNull());
  });

  it('edits an endpoint by id and keeps the key when left blank', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Edit Local LLM' }));
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('http://localhost:8000/v1');
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    await waitFor(() => expect(callsOf('custom_endpoint_save_command')).toHaveLength(1));
    const { request } = callsOf('custom_endpoint_save_command')[0] as any;
    expect(request.id).toBe('ep-1');
    expect(request.api_key).toBeUndefined();
  });

  it('deletes an endpoint', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Delete Local LLM' }));
    await waitFor(() => expect(callsOf('custom_endpoint_delete_command')).toEqual([{ request: { id: 'ep-1' } }]));
  });
});

describe('defaults', () => {
  it('offers connected providers and endpoints per modality and saves the choice', async () => {
    const user = userEvent.setup();
    await renderPane();
    const image = screen.getByLabelText('Image', { selector: 'select' }) as HTMLSelectElement;
    expect(image.value).toBe('byteplus');
    const llm = screen.getByLabelText('LLM', { selector: 'select' }) as HTMLSelectElement;
    expect([...llm.options].map((o) => o.value)).toEqual(['', 'ep-1']);

    await user.selectOptions(llm, 'ep-1');
    await waitFor(() =>
      expect(callsOf('modality_defaults_set_command')).toEqual([
        { request: { modality: 'llm', provider_or_endpoint_id: 'ep-1' } },
      ]),
    );

    await user.selectOptions(image, '');
    await waitFor(() =>
      expect(callsOf('modality_defaults_set_command')[1]).toEqual({
        request: { modality: 'image', provider_or_endpoint_id: null },
      }),
    );
  });
});

describe('connect your agent', () => {
  it('shows the MCP config and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderPane();
    expect(JSON.parse(MCP_SNIPPET)).toEqual({
      mcpServers: { h0x: { command: 'node', args: ['<install>/mcp/h0x-mcp/index.mjs'] } },
    });
    expect(screen.getByText(/"mcpServers"/).textContent).toBe(MCP_SNIPPET);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(MCP_SNIPPET);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });
});

it('shows an error when the provider list fails to load', async () => {
  backend({ provider_list_command: new Error('ipc down') });
  render(<ProvidersPane />);
  expect((await screen.findByRole('alert')).textContent).toBe('ipc down');
});

it('has no brand leaks', async () => {
  const { baseElement } = await renderPane();
  expect(baseElement.textContent).not.toMatch(/artcraft|getartcraft|storyteller|fakeyou|\bltx\b|lightricks/i);
});
