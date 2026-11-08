// R4-3b edge cases for the Providers & keys pane: empty/null data, failures and offline paths,
// URL validation (incl. Windows paths), default filtering, masking, clipboard failure, source hygiene.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  { id: 'eleven', name: 'Voices', kind: 'api_key', modalities: ['audio'], has_key: true, key_hint: null },
];

const ENDPOINTS = [
  { id: 'ep-1', name: 'Local LLM', base_url: 'http://localhost:8000/v1', kind: 'openai_compatible', modalities: ['llm', 'video'], has_key: false, key_hint: null },
];

const BAD_URLS = ['ftp://nope', 'javascript:alert(1)', 'C:\\models\\llm', 'localhost:8000', 'http://', 'api.example.com', '   '];

const BRAND_LEAKS = /artcraft|getartcraft|storyteller|fakeyou|\bltx\b|lightricks/i;

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

const select = (label: string) => screen.getByLabelText(label, { selector: 'select' }) as HTMLSelectElement;

const optionValues = (label: string) => [...select(label).options].map((o) => o.value);

beforeEach(() => {
  backend();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('empty and null data', () => {
  it('renders all four sections with no providers, endpoints or defaults', async () => {
    backend({
      provider_list_command: { ...OK, payload: { providers: [] } },
      custom_endpoint_list_command: { ...OK, payload: { endpoints: [] } },
      modality_defaults_get_command: OK, // payload absent
    });
    render(<ProvidersPane />);
    await waitFor(() => expect(callsOf('modality_defaults_get_command')).toHaveLength(1));
    for (const heading of ['Providers', 'Custom endpoints', 'Defaults', 'Connect your agent']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(screen.queryByTestId(/^provider-/)).toBeNull();
    for (const m of ['LLM', 'Image', 'Video', 'Audio']) {
      expect(optionValues(m)).toEqual(['']);
      expect(select(m).value).toBe('');
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows "Connected ••••" without a "null" hint when the key has no hint', async () => {
    await renderPane();
    expect(card('eleven').getByText('Connected ••••')).toBeTruthy();
    expect(screen.getByTestId('provider-eleven').textContent).not.toMatch(/null|undefined/);
  });

  it('shows an endpoint without a key as "Not set"', async () => {
    await renderPane();
    const row = screen.getByRole('button', { name: 'Edit Local LLM' }).parentElement!;
    expect(within(row).getByText('Not set')).toBeTruthy();
  });
});

describe('API key entry', () => {
  it('Replace opens an empty password field (the hint is never pre-filled)', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(card('byteplus').getByRole('button', { name: 'Replace' }));
    const input = screen.getByLabelText('BytePlus API key') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
  });

  it('Cancel discards the typed key without saving, and reopening starts empty', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'sk-typed');
    await user.click(card('openai').getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('OpenAI API key')).toBeNull();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    expect((screen.getByLabelText('OpenAI API key') as HTMLInputElement).value).toBe('');
    expect(callsOf('provider_set_api_key_command')).toEqual([]);
  });

  it('only one card is in edit mode at a time', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.click(card('byteplus').getByRole('button', { name: 'Replace' }));
    expect(screen.queryByLabelText('OpenAI API key')).toBeNull();
    expect(screen.getAllByLabelText(/API key$/, { selector: 'input[type="password"]' })).toHaveLength(1);
  });

  it('reloads the provider list after a successful save', async () => {
    const user = userEvent.setup();
    await renderPane();
    expect(callsOf('provider_list_command')).toHaveLength(1);
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'k');
    await user.click(card('openai').getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(callsOf('provider_list_command')).toHaveLength(2));
  });

  it('backend offline on save: shows the error, keeps the field, does not reload', async () => {
    const user = userEvent.setup();
    backend({ provider_set_api_key_command: new Error('ipc down') });
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'sk-x');
    await user.click(card('openai').getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('ipc down');
    expect((screen.getByLabelText('OpenAI API key') as HTMLInputElement).value).toBe('sk-x');
    expect(callsOf('provider_list_command')).toHaveLength(1);
  });

  it('an undefined save result counts as a failure with the fallback message', async () => {
    const user = userEvent.setup();
    backend({ provider_set_api_key_command: undefined });
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'k');
    await user.click(card('openai').getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to save API key');
  });

  it('a later success clears an earlier error', async () => {
    const user = userEvent.setup();
    let fail = true;
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'provider_set_api_key_command') {
        return fail ? { status: 'bad_request', error_message: 'nope' } : OK;
      }
      if (cmd === 'provider_list_command') return { ...OK, payload: { providers: PROVIDERS } };
      if (cmd === 'custom_endpoint_list_command') return { ...OK, payload: { endpoints: ENDPOINTS } };
      return OK;
    });
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), 'k');
    await user.click(card('openai').getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    fail = false;
    await user.click(card('openai').getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('Remove failure shows the backend message and the card stays connected', async () => {
    const user = userEvent.setup();
    backend({ provider_clear_command: { status: 'server_error', error_message: 'Failed to delete key file' } });
    await renderPane();
    await user.click(card('byteplus').getByRole('button', { name: 'Remove' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to delete key file');
    expect(card('byteplus').getByText('Connected •••• 1234')).toBeTruthy();
  });

  it('the Windows-style key with backslashes is sent verbatim after trimming', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(card('openai').getByRole('button', { name: 'Set key' }));
    await user.type(screen.getByLabelText('OpenAI API key'), '  ab\\cd ');
    await user.click(card('openai').getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(callsOf('provider_set_api_key_command')).toEqual([{ request: { provider: 'openai', api_key: 'ab\\cd' } }]),
    );
  });
});

describe('custom endpoint form', () => {
  it.each(BAD_URLS)('rejects base URL %j client-side', async (url) => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    await user.type(screen.getByLabelText('Name'), 'Mine');
    if (url) await user.type(screen.getByLabelText('Base URL'), url.replace(/[{[]/g, '$&$&'));
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Base URL must start with http:// or https://');
    expect(callsOf('custom_endpoint_save_command')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Save endpoint' })).toBeTruthy();
  });

  it('a whitespace-only name is rejected before the URL is checked', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    await user.type(screen.getByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Name is required');
  });

  it('trims a padded URL, defaults to OpenAI-compatible, and omits a blank key', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('openai_compatible');
    await user.type(screen.getByLabelText('Name'), 'Lan');
    await user.type(screen.getByLabelText('Base URL'), '  http://192.168.1.5:11434/v1  ');
    await user.type(screen.getByLabelText('API key'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    await waitFor(() => expect(callsOf('custom_endpoint_save_command')).toHaveLength(1));
    const { request } = callsOf('custom_endpoint_save_command')[0] as any;
    expect(request).toEqual({
      name: 'Lan',
      base_url: 'http://192.168.1.5:11434/v1',
      kind: 'openai_compatible',
      modalities: [],
      api_key: undefined,
    });
    expect('id' in request).toBe(false);
  });

  it('toggling a modality twice removes it; edit starts from the stored modalities', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Edit Local LLM' }));
    expect((screen.getByRole('checkbox', { name: 'LLM' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Video' }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Video' }));
    await user.click(screen.getByRole('checkbox', { name: 'Audio' }));
    await user.click(screen.getByRole('checkbox', { name: 'Audio' }));
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    await waitFor(() => expect(callsOf('custom_endpoint_save_command')).toHaveLength(1));
    expect((callsOf('custom_endpoint_save_command')[0] as any).request.modalities).toEqual(['llm']);
  });

  it('edit never pre-fills the key and its field is a password input', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Edit Local LLM' }));
    const key = screen.getByLabelText('API key') as HTMLInputElement;
    expect(key.type).toBe('password');
    expect(key.value).toBe('');
    expect(key.placeholder).toBe('Leave blank to keep the current key');
  });

  it('Cancel closes the form without saving and brings back Add endpoint', async () => {
    const user = userEvent.setup();
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    expect(screen.queryByRole('button', { name: 'Add endpoint' })).toBeNull();
    await user.type(screen.getByLabelText('Name'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add endpoint' })).toBeTruthy();
    expect(callsOf('custom_endpoint_save_command')).toEqual([]);
  });

  it('a backend save error keeps the form open with the typed values', async () => {
    const user = userEvent.setup();
    backend({ custom_endpoint_save_command: { status: 'bad_request', error_message: 'Duplicate name' } });
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    await user.type(screen.getByLabelText('Name'), 'Dup');
    await user.type(screen.getByLabelText('Base URL'), 'https://x.io');
    await user.click(screen.getByRole('button', { name: 'Save endpoint' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Duplicate name');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Dup');
  });

  it('delete failure shows the error and keeps the endpoint listed', async () => {
    const user = userEvent.setup();
    backend({ custom_endpoint_delete_command: new Error('ipc down') });
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Delete Local LLM' }));
    expect((await screen.findByRole('alert')).textContent).toBe('ipc down');
    expect(screen.getByRole('button', { name: 'Edit Local LLM' })).toBeTruthy();
  });
});

describe('defaults', () => {
  it('offers only connected providers and endpoints that support the modality', async () => {
    await renderPane();
    expect(optionValues('LLM')).toEqual(['', 'ep-1']); // openai has no key
    expect(optionValues('Image')).toEqual(['', 'byteplus']); // ep-1 is not an image endpoint
    expect(optionValues('Video')).toEqual(['', 'byteplus', 'ep-1']);
    expect(optionValues('Audio')).toEqual(['', 'eleven']);
  });

  it('a failed save shows the error and the select keeps its previous value', async () => {
    const user = userEvent.setup();
    backend({ modality_defaults_set_command: { status: 'server_error', error_message: 'Could not write defaults' } });
    await renderPane();
    await user.selectOptions(select('Image'), '');
    expect((await screen.findByRole('alert')).textContent).toBe('Could not write defaults');
    expect(select('Image').value).toBe('byteplus');
  });

  it('a stored default pointing at a removed provider falls back to None', async () => {
    backend({ modality_defaults_get_command: { ...OK, payload: { video: 'gone-provider' } } });
    await renderPane();
    expect(optionValues('Video')).not.toContain('gone-provider');
    expect(select('Video').selectedOptions[0]?.value ?? '').toBe('');
  });
});

describe('connect your agent', () => {
  it('a clipboard failure shows an error and the button stays "Copy"', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not copy to the clipboard');
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });

  it('a missing clipboard API is handled without throwing', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await renderPane();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not copy to the clipboard');
  });

  it('the snippet is valid JSON, uses forward slashes, and points at the shipped MCP server', () => {
    const config = JSON.parse(MCP_SNIPPET);
    const args: string[] = config.mcpServers.h0x.args;
    expect(args).toHaveLength(1);
    expect(args[0]).not.toContain('\\');
    expect(args[0].endsWith('/mcp/h0x-mcp/index.mjs')).toBe(true);
    const appRoot = join(__dirname, '../../../../../..');
    expect(readFileSync(join(appRoot, 'mcp/h0x-mcp/index.mjs'), 'utf8').length).toBeGreaterThan(0);
  });

  it('mentions Claude Code and MCP clients in the note', async () => {
    await renderPane();
    expect(screen.getByText(/Claude Code or any MCP client/)).toBeTruthy();
  });
});

describe('source hygiene', () => {
  const PANE_SRC = readFileSync(join(__dirname, 'ProvidersPane.tsx'), 'utf8');

  it('uses Phosphor icons only and never logs', () => {
    expect(PANE_SRC).not.toMatch(/lucide/);
    expect(PANE_SRC).toMatch(/from "@phosphor-icons\/react"/);
    expect(PANE_SRC).not.toMatch(/console\.(log|info|debug|warn|error)/);
  });

  it('every key input is a password field', () => {
    const inputs = [...PANE_SRC.matchAll(/<input[\s\S]*?\/>/g)].map((m) => m[0]);
    const keyInputs = inputs.filter((i) => /keyInput|api_key/.test(i));
    expect(keyInputs.length).toBe(2);
    for (const i of keyInputs) expect(i).toMatch(/type="password"/);
  });

  it('has no brand leaks in the rendered pane or the snippet', async () => {
    const { baseElement } = await renderPane();
    expect(baseElement.textContent).not.toMatch(BRAND_LEAKS);
    expect(MCP_SNIPPET).not.toMatch(BRAND_LEAKS);
  });
});
