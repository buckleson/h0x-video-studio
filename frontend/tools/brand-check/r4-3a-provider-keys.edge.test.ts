// R4-3a edge cases: every contract command is wired (file, mod, use, generate_handler),
// no response struct can carry a key, settings stores hold no key field, the old
// BytePlus path is intact, and no foreign brand reaches provider names or errors.
// Static source checks only: the desktop crate is compiled in CI, not here.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(__dirname, '../../..');
const SRC = path.join(APP_DIR, 'crates/desktop/artcraft/src');
const COMMANDS_DIR = path.join(SRC, 'core/commands/providers');
const PROVIDERS_DIR = path.join(SRC, 'core/providers');
const LIB_RS = path.join(SRC, 'lib.rs');

const CONTRACT_COMMANDS = [
  'provider_list_command',
  'provider_set_api_key_command',
  'provider_clear_command',
  'custom_endpoint_list_command',
  'custom_endpoint_save_command',
  'custom_endpoint_delete_command',
  'modality_defaults_get_command',
  'modality_defaults_set_command',
  'set_fal_api_key_command',
  'get_fal_api_key_command',
  'set_openai_api_key_command',
  'get_openai_api_key_command',
];
const CONTRACT_IDS = [
  'byteplus', 'openai', 'anthropic', 'gemini', 'higgsfield', 'fal', 'replicate',
  'huggingface', 'openrouter', 'minimax', 'kling', 'runway', 'luma', 'elevenlabs',
];
// Field names that would put a key (or part of one beyond the hint) into a response.
const KEY_FIELD = /^\s*pub\s+(api_key|key|full_key|maybe_full_key|secret|token|value)\s*:/m;
const FOREIGN_BRANDS = /artcraft|storyteller|fakeyou|ltx|lightricks/i;

const read = (f: string) => readFileSync(f, 'utf8');
const production = (src: string) => src.split('#[cfg(test)]')[0];
const LIB = read(LIB_RS);

/** Bodies of `#[derive(...Serialize...)] pub struct Name { ... }` in a source file. */
function serializeStructs(src: string): { name: string; body: string }[] {
  const re = /#\[derive\(([^)]*)\)\]\s*(?:#\[[^\]]*\]\s*)*pub struct (\w+)\s*\{([^}]*)\}/g;
  return [...src.matchAll(re)]
    .filter((m) => /\bSerialize\b/.test(m[1]))
    .map((m) => ({ name: m[2], body: m[3] }));
}

/** Body of one struct, any derive. */
function structBody(src: string, name: string): string {
  const m = src.match(new RegExp(`pub struct ${name}\\s*\\{([^}]*)\\}`));
  expect(m, name).not.toBeNull();
  return m![1];
}

/** Rust string literals (these files have no raw strings in production code). */
function stringLiterals(src: string): string[] {
  return [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

function generateHandlerList(): string[] {
  const start = LIB.indexOf('generate_handler![');
  expect(start).toBeGreaterThan(-1);
  const end = LIB.indexOf(']', start + 'generate_handler!['.length);
  return LIB.slice(start + 'generate_handler!['.length, end)
    .split(',')
    .map((s) => s.replace(/\/\/.*$/gm, '').trim())
    .filter(Boolean);
}

describe('R4-3a command wiring', () => {
  const handlers = generateHandlerList();
  const commandsMod = read(path.join(COMMANDS_DIR, 'mod.rs'));

  it.each(CONTRACT_COMMANDS)('%s has its own file with exactly one tauri command', (cmd) => {
    const file = path.join(COMMANDS_DIR, `${cmd}.rs`);
    expect(existsSync(file)).toBe(true);
    const src = read(file);
    expect(src.match(/#\[tauri::command\]/g)?.length).toBe(1);
    expect(src).toMatch(new RegExp(`pub async fn ${cmd}\\(`));
  });

  it.each(CONTRACT_COMMANDS)('%s is declared, imported and registered exactly once', (cmd) => {
    expect(commandsMod).toMatch(new RegExp(`^pub mod ${cmd};`, 'm'));
    expect(LIB).toContain(`use crate::core::commands::providers::${cmd}::${cmd};`);
    expect(handlers.filter((h) => h === cmd)).toHaveLength(1);
  });

  it('every handler in the generate_handler list is unique', () => {
    expect(new Set(handlers).size).toBe(handlers.length);
  });

  it('every pub mod in commands/providers points at an existing file or folder', () => {
    for (const m of commandsMod.matchAll(/^pub mod (\w+);/gm)) {
      const asFile = path.join(COMMANDS_DIR, `${m[1]}.rs`);
      const asDir = path.join(COMMANDS_DIR, m[1], 'mod.rs');
      expect(existsSync(asFile) || existsSync(asDir), m[1]).toBe(true);
    }
  });

  it('the store modules are declared in core/providers/mod.rs', () => {
    const mod = read(path.join(PROVIDERS_DIR, 'mod.rs'));
    expect(mod).toMatch(/^pub mod custom_endpoints;/m);
    expect(mod).toMatch(/^pub mod modality_defaults;/m);
  });

  it('command files use log macros, not println', () => {
    for (const f of readdirSync(COMMANDS_DIR).filter((n) => n.endsWith('.rs'))) {
      expect(production(read(path.join(COMMANDS_DIR, f))), f).not.toMatch(/\b(e?println)!/);
    }
  });
});

describe('R4-3a keys never reach the frontend or the settings JSON', () => {
  const commandFiles = readdirSync(COMMANDS_DIR).filter((n) => n.endsWith('.rs'));

  it('no Serialize struct in the provider commands has a key field', () => {
    for (const f of commandFiles) {
      for (const s of serializeStructs(production(read(path.join(COMMANDS_DIR, f))))) {
        expect(s.body, `${f}::${s.name}`).not.toMatch(KEY_FIELD);
      }
    }
  });

  it('the removed maybe_full_key is gone from the whole crate source', () => {
    const stack = [SRC];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name.endsWith('.rs')) expect(read(p), p).not.toContain('maybe_full_key');
      }
    }
  });

  it.each(['get_fal_api_key_command', 'get_openai_api_key_command'])(
    '%s response is has_key only',
    (cmd) => {
      const structs = serializeStructs(production(read(path.join(COMMANDS_DIR, `${cmd}.rs`))));
      expect(structs).toHaveLength(1);
      const fields = [...structs[0].body.matchAll(/pub\s+(\w+)\s*:/g)].map((m) => m[1]);
      expect(fields).toEqual(['has_key']);
    },
  );

  it('custom endpoint list entries expose has_key and key_hint, never the key', () => {
    const src = production(read(path.join(PROVIDERS_DIR, 'custom_endpoints.rs')));
    const body = structBody(src, 'CustomEndpointListEntry');
    expect(body).toMatch(/pub has_key: bool/);
    expect(body).toMatch(/pub key_hint: Option<String>/);
    expect(body).not.toMatch(KEY_FIELD);
  });

  it('the stored custom endpoint and its file wrapper have no key field', () => {
    const src = production(read(path.join(PROVIDERS_DIR, 'custom_endpoints.rs')));
    expect(structBody(src, 'CustomEndpoint')).not.toMatch(/key/);
    const file = src.match(/struct CustomEndpointsFile\s*\{([^}]*)\}/);
    expect(file).not.toBeNull();
    expect(file![1]).not.toMatch(/key/);
  });

  it('stores write to the contract file names in the settings dir', () => {
    const endpoints = production(read(path.join(PROVIDERS_DIR, 'custom_endpoints.rs')));
    const defaults = production(read(path.join(PROVIDERS_DIR, 'modality_defaults.rs')));
    expect(endpoints).toContain('"custom_endpoints.json"');
    expect(defaults).toContain('"modality_defaults.json"');
    expect(endpoints).toMatch(/settings_dir\(\)/);
    expect(defaults).toMatch(/settings_dir\(\)/);
    expect(defaults).not.toMatch(/api_key|ApiKeyData/);
  });

  it('custom endpoint keys go to the credentials dir, not settings', () => {
    const cache = production(read(path.join(PROVIDERS_DIR, 'credentials/provider_credential_loading_cache.rs')));
    const fn = cache.slice(cache.indexOf('fn custom_endpoint_key_path'));
    expect(fn).toMatch(/credentials_dir\(\)/);
    expect(fn.slice(0, 300)).not.toMatch(/settings_dir/);
  });

  it('log lines in the new code never format a key value', () => {
    const files = [
      ...commandFiles.map((f) => path.join(COMMANDS_DIR, f)),
      path.join(PROVIDERS_DIR, 'custom_endpoints.rs'),
      path.join(PROVIDERS_DIR, 'modality_defaults.rs'),
    ];
    for (const f of files) {
      for (const line of production(read(f)).split('\n').filter((l) => /\b(info|warn|error|debug|trace)!/.test(l))) {
        // Format arguments only: command names in the message text may contain "api_key".
        const args = line.replace(/"((?:[^"\\]|\\.)*)"/g, '""');
        expect(args, f).not.toMatch(/api_key|\.key\b|as_str\(\)/);
      }
    }
  });
});

describe('R4-3a provider ids and the old BytePlus flow', () => {
  const keySrc = production(read(path.join(PROVIDERS_DIR, 'credentials/provider_credential_key.rs')));
  const idArms = [...keySrc.slice(keySrc.indexOf('fn provider_id'), keySrc.indexOf('fn display_name'))
    .matchAll(/=>\s*"([^"]+)"/g)].map((m) => m[1]);

  it('provider_id covers every contract id exactly once', () => {
    for (const id of CONTRACT_IDS) expect(idArms.filter((a) => a === id), id).toHaveLength(1);
    expect(new Set(idArms).size).toBe(idArms.length);
  });

  it('the BytePlus variant keeps its serde name byte_plus_api_key', () => {
    expect(keySrc).toMatch(/#\[serde\(rename_all = "snake_case"\)\]\s*pub enum ProviderCredentialKey/);
    expect(keySrc).toMatch(/^\s*BytePlusApiKey,/m);
    expect(keySrc).toContain('ProviderCredentialKey::BytePlusApiKey => "byteplus.api_key.txt"');
  });

  it('provider_set_api_key_command still accepts the legacy provider_credential field', () => {
    const src = production(read(path.join(COMMANDS_DIR, 'provider_set_api_key_command.rs')));
    const body = structBody(src, 'ProviderSetApiKeyRequest');
    expect(body).toMatch(/pub provider_credential: Option<ProviderCredentialKey>/);
    expect(body).toMatch(/pub provider: Option<String>/);
    expect(body).toMatch(/pub api_key: String/);
  });

  it('BytePlus generation and polling still read BytePlusApiKey from the credential cache', () => {
    for (const rel of [
      'core/commands/generate/generate_video/byteplus.rs',
      'core/commands/generate/generate_image/providers/byteplus.rs',
      'core/threads/third_party_task_polling_thread/handlers/byteplus/poll_byteplus_tasks.rs',
    ]) {
      expect(production(read(path.join(SRC, rel))), rel).toMatch(/get_credentials\(ProviderCredentialKey::BytePlusApiKey\)/);
    }
  });
});

describe('R4-3a brand leaks', () => {
  it('provider display names carry no foreign brand', () => {
    const src = production(read(path.join(PROVIDERS_DIR, 'credentials/provider_credential_key.rs')));
    const names = [...src.slice(src.indexOf('fn display_name'), src.indexOf('fn modalities'))
      .matchAll(/=>\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(18);
    for (const n of names) expect(n).not.toMatch(FOREIGN_BRANDS);
  });

  it('user-visible strings in the new commands and stores carry no foreign brand', () => {
    const files = [
      ...readdirSync(COMMANDS_DIR).filter((n) => n.endsWith('.rs')).map((f) => path.join(COMMANDS_DIR, f)),
      path.join(PROVIDERS_DIR, 'custom_endpoints.rs'),
      path.join(PROVIDERS_DIR, 'modality_defaults.rs'),
    ];
    for (const f of files) {
      for (const lit of stringLiterals(production(read(f)))) expect(lit, f).not.toMatch(FOREIGN_BRANDS);
    }
  });
});
