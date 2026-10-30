// A2c: artcraft-native no longer depends on the Midjourney / scraper crates or
// cookie_store_wrapper, its Midjourney code paths are gone from the six files
// the subtask owns, and the fal + ArtCraft paths in those files are untouched.
// Static checks only (cargo is deferred to A2); no network, no build.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const NATIVE = 'artcraft-native';
const CARGO = `${NATIVE}/Cargo.toml`;
const TOUCHED = [
  `${NATIVE}/src/backend/mod.rs`,
  `${NATIVE}/src/backend/providers/accounts.rs`,
  `${NATIVE}/src/backend/providers/submit.rs`,
  `${NATIVE}/src/backend/providers/worker.rs`,
  `${NATIVE}/src/overlays/providers.rs`,
];
const DELETED_CRATES = [
  'midjourney_client',
  'openai_sora_client',
  'grok_consumer_client',
  'kinovi_web_client',
  'worldlabs_consumer_client',
  'cloudflare_mitigation',
  'browser_emulation',
];
// The 7 crates, the cookie/HTTP-emulation crates, and the two crates only the
// deleted Midjourney sign-in window used.
const FORBIDDEN_DEPS = [...DELETED_CRATES, 'cookie_store_wrapper', 'wreq', 'wreq-util', 'wry', 'url'];
// Dependencies the fal / ArtCraft paths still need; dropping one is a regression.
const KEPT_DEPS = ['artcraft_api_defs', 'artcraft_client', 'artcraft_router', 'fal_client', 'tokens', 'cookie', 'reqwest', 'serde_json', 'tokio'];
const ACCEPTANCE_GREP =
  'midjourney_client|openai_sora_client|grok_consumer_client|kinovi_web_client|worldlabs_consumer_client|cloudflare_mitigation|browser_emulation|cookie_store_wrapper|wreq';
// Removed providers, in any casing or spelling (snake, camel, spaced).
const REMOVED_PROVIDER = /midjourney|\bmj_|\bsora\b|grok[_ ]?consumer|kinovi|world[_ ]?labs[_ ]?consumer|\bniji\b/i;
const REMOVED_SYMBOLS = [
  'MidjourneyLogin',
  'LoginEvent',
  'MidjourneyWatch',
  'RouterMidjourneyClient',
  'CookieStore',
  'ConnectMidjourney',
  'DisconnectMidjourney',
  'save_midjourney_login',
  'disconnect_midjourney',
  'midjourney_account',
  'submit_midjourney',
  'poll_midjourney',
  'MIDJOURNEY_BATCH',
  'MIDJOURNEY_URL',
];
// Every item each touched file has after the removals (the fal / ArtCraft
// paths are unchanged, so none of these may go).
const KEPT_ITEMS: Record<string, string[]> = {
  [`${NATIVE}/src/backend/mod.rs`]: [
    'const CHARACTER_MODEL', 'const LIBRARY_PAGE_SIZE', 'const MODEL_LIST_ATTEMPTS', 'const MODEL_LIST_BACKOFF',
    'const PROVIDER_COST_PATH', 'const SHARE_URL_BASE', 'const USER_AGENT', 'enum Event', 'enum Modality', 'fn accounts',
    'fn api', 'fn api_error_message', 'fn api_message', 'fn api_status', 'fn body_message', 'fn cancel_browser_login',
    'fn collects_every_job_token_once', 'fn create_character', 'fn data_root', 'fn delete_character', 'fn delete_media',
    'fn describe_upload', 'fn drain', 'fn edit_character', 'fn estimate_cost', 'fn estimate_provider_cost', 'fn fal_cost_body',
    'fn fal_costs_count_references_as_the_mode', 'fn from', 'fn generate', 'fn generate_with_provider', 'fn get_json',
    'fn handle', 'fn http', 'fn job_tokens', 'fn load_batch', 'fn load_characters', 'fn load_library', 'fn load_models',
    'fn load_prompt', 'fn login_error', 'fn login_with_browser', 'fn login_with_password', 'fn logout', 'fn new', 'fn path',
    'fn poll_jobs', 'fn provider_jobs', 'fn reads_the_servers_error_message', 'fn refresh_credits', 'fn refresh_session',
    'fn request_json', 'fn runtime', 'fn save_url', 'fn send_credits', 'fn session_from_set_cookie', 'fn spawn',
    'fn store_session', 'fn takes_the_session_from_set_cookie', 'fn upload_audio', 'fn upload_file', 'fn upload_png',
    'static str', 'struct Api', 'struct Backend', 'struct BackendHandle', 'struct EnqueueMeta', 'struct FileResponse',
    'struct UploadedMedia',
  ],
  [`${NATIVE}/src/backend/providers/accounts.rs`]: [
    'const FAL_KEY_FILENAME', 'fn clear_fal_key', 'fn fal_key', 'fn fal_key_hint', 'fn fal_keys_are_trimmed_masked_and_cleared',
    'fn load', 'fn mask_key', 'fn set_fal_key', 'struct ProviderAccounts',
  ],
  [`${NATIVE}/src/backend/providers/submit.rs`]: [
    'enum SubmitError', 'fn fal_needs_its_key', 'fn from', 'fn model_id', 'fn new_job', 'fn page_fields_become_the_routers_request',
    'fn parse', 'fn request_builder', 'fn router_message', 'fn submit', 'fn submit_fal',
  ],
  [`${NATIVE}/src/backend/providers/worker.rs`]: [
    'const REQUEST_TIMEOUT', 'const TICK', 'const TRANSFER_TIMEOUT', 'fn download', 'fn fail', 'fn fal_results_prefer_the_batch',
    'fn finish', 'fn image_extension', 'fn image_urls', 'fn poll_fal', 'fn results_keep_their_file_type', 'fn run', 'fn send',
    'fn tick', 'static str', 'struct Worker',
  ],
  [`${NATIVE}/src/overlays/providers.rs`]: [
    'enum AccountAction', 'enum SetupAction', 'fn account_row', 'fn accounts_section', 'fn setup_dialog', 'struct AccountsView',
  ],
};
// "ArtCraft" string literals each touched file has after A2c; more is a new user-visible string.
const MAX_ARTCRAFT_STRINGS: Record<string, number> = {
  [`${NATIVE}/src/backend/mod.rs`]: 5,
  [`${NATIVE}/src/backend/providers/accounts.rs`]: 1,
  [`${NATIVE}/src/backend/providers/submit.rs`]: 3,
  [`${NATIVE}/src/backend/providers/worker.rs`]: 1,
  [`${NATIVE}/src/overlays/providers.rs`]: 2,
};
// artcraft-native's dependencies after the drops, sorted.
const EXPECTED_DEPS = [
  'anyhow', 'arboard', 'artcraft_api_defs', 'artcraft_client', 'artcraft_router', 'chrono', 'cookie', 'directories', 'eframe',
  'egui', 'egui_extras', 'egui_kittest', 'enums', 'env_logger', 'fal_client', 'image', 'log', 'open', 'reqwest', 'resvg', 'rfd',
  'rodio', 'serde', 'serde_json', 'tempfile', 'tokens', 'tokio', 'uuid',
];

describe('A2c artcraft-native Cargo.toml', () => {
  const toml = read(CARGO);
  const deps = dependencyNames(toml);

  it('parses at least one dependency table (guards against a silent empty parse)', () => {
    expect(deps.length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN_DEPS)('does not depend on %s in any table', (crate) => {
    expect(deps).not.toContain(crate);
  });

  it('mentions no deleted crate anywhere, including comments, features and path = entries', () => {
    const pattern = new RegExp(`\\b(${[...DELETED_CRATES, 'cookie_store_wrapper', 'wreq(-util)?', 'wry'].join('|')})\\b`, 'i');
    expect(toml).not.toMatch(pattern);
    expect(toml).not.toMatch(/midjourney/i);
  });

  it.each(KEPT_DEPS)('still depends on %s', (crate) => {
    expect(deps).toContain(crate);
  });

  it('lists each dependency once', () => {
    expect(deps.filter((d, i) => deps.indexOf(d) !== i)).toEqual([]);
  });

  it('depends on exactly the remaining crates (nothing added, nothing else dropped)', () => {
    expect([...deps].sort()).toEqual(EXPECTED_DEPS);
  });

  it('keeps the package and bin sections intact', () => {
    expect(toml).toMatch(/^name\s*=\s*"artcraft_native"/m);
    expect(toml).toMatch(/^\[\[bin\]\]/m);
    expect(toml).toMatch(/^path\s*=\s*"src\/main\.rs"/m);
  });
});

describe('A2c acceptance grep', () => {
  it('git grep over artcraft-native (tracked and untracked) is empty', () => {
    expect(gitGrep(ACCEPTANCE_GREP, false, NATIVE)).toBe('');
  });

  it('no Rust source still uses the dropped url or wry crates', () => {
    expect(gitGrep('(^|[^A-Za-z0-9_:])(url|wry)::', false, `${NATIVE}/src`)).toBe('');
    expect(gitGrep('^\\s*(pub\\s+)?(use|extern crate)\\s+(url|wry)\\b', false, `${NATIVE}/src`)).toBe('');
  });

  it('no Rust source imports a deleted crate under a renamed path (use ... as)', () => {
    expect(gitGrep(`\\b(${DELETED_CRATES.join('|')})\\s*(::|as\\b)`, true, `${NATIVE}/src`)).toBe('');
  });
});

describe.each(TOUCHED)('A2c %s', (file) => {
  const src = read(file);

  it('has no reference to a removed provider, even in comments or tests', () => {
    const hits = lines(src).filter((l) => REMOVED_PROVIDER.test(l));
    expect(hits).toEqual([]);
  });

  it.each(REMOVED_SYMBOLS)('no longer names %s', (symbol) => {
    expect(src).not.toMatch(new RegExp(`\\b${symbol}\\b`));
  });

  it('has no cookie-store / browser-emulation import', () => {
    expect(src).not.toMatch(/\bcookie_store\b|CookieStore|browser_emulation|cloudflare|\bwreq\b|\bwry\b|\burl::/i);
  });

  it('keeps every fal / ArtCraft item', () => {
    const after = items(src);
    expect(KEPT_ITEMS[file].filter((i) => !after.includes(i))).toEqual([]);
  });

  it('has no Provider::Midjourney match arm left behind', () => {
    expect(src).not.toMatch(/Provider::\s*Midjourney|RouterProvider::\s*Midjourney|GenerateImageResponse::\s*Midjourney/);
  });

  it('has no LTX or Lightricks brand in any string or comment', () => {
    expect(src).not.toMatch(/\bLTX\b|Lightricks/i);
  });

  it('adds no new user-visible "ArtCraft" string', () => {
    const now = stringLiterals(src).filter((s) => /artcraft/i.test(s)).length;
    expect(now).toBeLessThanOrEqual(MAX_ARTCRAFT_STRINGS[file]);
  });

  it('has balanced braces (no half-deleted block)', () => {
    expect(balance(stripStringsAndComments(src))).toEqual({ brace: 0, paren: 0, bracket: 0 });
  });
});

describe('A2c remaining providers unchanged', () => {
  const submit = read(`${NATIVE}/src/backend/providers/submit.rs`);
  const worker = read(`${NATIVE}/src/backend/providers/worker.rs`);
  const accounts = read(`${NATIVE}/src/backend/providers/accounts.rs`);
  const overlays = read(`${NATIVE}/src/overlays/providers.rs`);
  const backend = read(`${NATIVE}/src/backend/mod.rs`);

  it('submit dispatches exactly the fal and ArtCraft arms', () => {
    const arms = [...submit.matchAll(/^\s*Provider::(\w+)\s*=>/gm)].map((m) => m[1]);
    expect(arms.sort()).toEqual(['Artcraft', 'Fal']);
    expect(submit).toMatch(/async fn submit_fal\(/);
    expect(submit).toMatch(/NeedsAccount\(Provider::Fal\)/);
  });

  it('request_builder builds fal requests only and still rejects unsupported models', () => {
    expect(submit).toMatch(/provider:\s*RouterProvider::Fal/);
    expect(submit).not.toMatch(/fn request_builder\([^)]*provider:/);
    expect(submit).toMatch(/fn page_fields_become_the_routers_request/);
    expect(submit).toMatch(/fn fal_needs_its_key/);
  });

  it('worker still polls fal and maps both remaining providers', () => {
    expect(worker).toMatch(/async fn poll_fal\(/);
    const arms = [...worker.matchAll(/^\s*Provider::(\w+)\s*=>/gm)].map((m) => m[1]);
    expect(arms.sort()).toEqual(['Artcraft', 'Fal']);
    expect(worker).toMatch(/fn fal_results_prefer_the_batch/);
    expect(worker).toMatch(/fn results_keep_their_file_type/);
  });

  it('accounts keeps the full fal key lifecycle and its test', () => {
    for (const f of ['fal_key', 'fal_key_hint', 'set_fal_key', 'clear_fal_key', 'mask_key']) {
      expect(accounts, f).toMatch(new RegExp(`fn ${f}\\b`));
    }
    expect(accounts).toMatch(/fn fal_keys_are_trimmed_masked_and_cleared/);
  });

  it('setup dialog and account actions are fal-only', () => {
    expect(enumVariants(overlays, 'SetupAction')).toEqual(['Close', 'SaveFalKey']);
    expect(enumVariants(overlays, 'AccountAction')).toEqual(['SaveFalKey', 'RemoveFalKey']);
    expect(structFields(overlays, 'AccountsView')).not.toContain('midjourney');
    expect(structFields(overlays, 'AccountsView')).toContain('fal_key_hint');
  });

  it('provider cost estimate keeps the ArtCraft and fal arms', () => {
    const body = fnBody(backend, 'estimate_provider_cost');
    expect(body).toMatch(/Provider::Artcraft\s*=>/);
    expect(body).toMatch(/Provider::Fal\s*=>/);
    expect(body).not.toMatch(/Provider::Midjourney/);
  });

  it('the fal setup copy names no removed provider', () => {
    const strings = stringLiterals(overlays);
    expect(strings.some((s) => /FAL API key/.test(s))).toBe(true);
    expect(strings.filter((s) => REMOVED_PROVIDER.test(s))).toEqual([]);
  });
});

function read(rel: string): string {
  // Normalise CRLF so line-anchored checks behave the same on Windows checkouts.
  return readFileSync(path.join(APP_ROOT, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n');
}

function lines(s: string): string[] {
  return s.split('\n');
}

function count(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

// Dependency names from every [*dependencies] table (and target-specific ones).
function dependencyNames(toml: string): string[] {
  const names: string[] = [];
  let inDeps = false;
  for (const raw of lines(toml.replace(/\r\n/g, '\n'))) {
    const line = raw.replace(/#.*$/, '').trim();
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      inDeps = /(^|\.)(dev-|build-)?dependencies$/.test(header[1]);
      const inline = header[1].match(/(?:^|\.)(?:dev-|build-)?dependencies\.([\w-]+)$/);
      if (inline) names.push(inline[1]);
      continue;
    }
    const m = inDeps && line.match(/^([\w-]+)(?:\.workspace)?\s*=/);
    if (m) names.push(m[1]);
  }
  return names;
}

// Top-level-ish Rust items as "kind name", deduplicated and sorted.
function items(src: string): string[] {
  const found = src.match(/\b(fn|struct|enum|const|static|type) [A-Za-z_0-9]+/g) ?? [];
  return [...new Set(found)].sort();
}

function stringLiterals(src: string): string[] {
  return [...src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]);
}

function balance(code: string): { brace: number; paren: number; bracket: number } {
  return {
    brace: count(code, /\{/g) - count(code, /\}/g),
    paren: count(code, /\(/g) - count(code, /\)/g),
    bracket: count(code, /\[/g) - count(code, /\]/g),
  };
}

function stripStringsAndComments(src: string): string {
  return src
    .replace(/r(#+)"[\s\S]*?"/g, '""')
    .replace(/r"[^"]*"/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)'/g, "' '")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function enumVariants(src: string, name: string): string[] {
  const m = src.match(new RegExp(`enum ${name}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/[,({].*$/, '').trim());
}

function structFields(src: string, name: string): string[] {
  const m = src.match(new RegExp(`struct ${name}(?:<[^>]*>)?\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`struct ${name} not found`);
  return [...m[1].matchAll(/(?:pub(?:\([^)]*\))?\s+)?(\w+)\s*:/g)].map((f) => f[1]);
}

// Body of a fn up to its matching closing brace.
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`fn ${name}\\b`));
  if (start < 0) throw new Error(`fn ${name} not found`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`fn ${name} is unbalanced`);
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).replace(/\r\n/g, '\n').trim();
}

// git grep exits 1 when nothing matches; treat that as "no output".
// --untracked also catches new files the developer has not added yet.
function gitGrep(pattern: string, ignoreCase: boolean, ...scope: string[]): string {
  const flags = ['grep', '--untracked', '-n', '-I', '-E', ...(ignoreCase ? ['-i'] : []), pattern, '--', ...scope];
  try {
    return git(...flags);
  } catch (e) {
    const err = e as { status?: number };
    if (err.status === 1) return '';
    throw e;
  }
}
