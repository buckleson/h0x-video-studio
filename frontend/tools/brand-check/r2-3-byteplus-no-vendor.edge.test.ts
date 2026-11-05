// R2-3a edge cases: the BytePlus video branch is wired in, checks the key first,
// never falls back to the vendor, and leaks no key or foreign brand.
// Static source checks only: the desktop crate is compiled in CI, not here.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(__dirname, '../../..');
const TAURI_DIR = path.join(APP_DIR, 'crates/desktop/artcraft');
const VIDEO_DIR = path.join(TAURI_DIR, 'src/core/commands/generate/generate_video');
const CLIENT_RS = path.join(APP_DIR, 'crates/api_clients/byteplus_client/src/lib.rs');
const VENDOR_SYMBOLS = [
  'StorytellerCredentialManager',
  'ArtcraftUsageTracker',
  'CreditsBalanceChangedEvent',
  'services::storyteller',
  'FalApiKey',
  'NeedsStorytellerCredentials',
  'handle_video_artcraft',
  'omni::generate',
];
const FOREIGN_BRANDS = /artcraft|storyteller|fakeyou|ltx|lightricks/i;

const read = (f: string) => readFileSync(f, 'utf8');
const BYTEPLUS_RS = read(path.join(VIDEO_DIR, 'byteplus.rs'));
const COMMAND_RS = read(path.join(VIDEO_DIR, 'generate_video_command.rs'));

/** Body of the `generate_video_command` function, up to the next fn. */
function commandBody(): string {
  const start = COMMAND_RS.indexOf('pub async fn generate_video_command(');
  const end = COMMAND_RS.indexOf('async fn generate_video_native(');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return COMMAND_RS.slice(start, end);
}

/** Rust string literals in a source file (no raw strings in these files). */
function stringLiterals(src: string): string[] {
  return [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

/** Text of a top-level fn, from its signature to the next top-level fn. */
function fnBody(src: string, name: string): string {
  const start = src.search(new RegExp(`fn ${name}\\b`));
  expect(start).toBeGreaterThan(-1);
  const next = src.slice(start + 1).search(/\n(?:pub )?(?:async )?fn /);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

describe('R2-3a wiring', () => {
  it('the desktop crate depends on the workspace byteplus_client crate', () => {
    expect(read(path.join(TAURI_DIR, 'Cargo.toml'))).toMatch(/^byteplus_client\.workspace\s*=\s*true/m);
    expect(read(path.join(APP_DIR, 'Cargo.toml'))).toMatch(/^byteplus_client\s*=\s*\{\s*path\s*=\s*"crates\/api_clients\/byteplus_client"/m);
    expect(existsSync(CLIENT_RS)).toBe(true);
  });

  it('mod.rs declares the byteplus module exactly once', () => {
    const mods = read(path.join(VIDEO_DIR, 'mod.rs')).match(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod byteplus;/gm) ?? [];
    expect(mods).toHaveLength(1);
  });

  it('the command imports the byteplus handler', () => {
    expect(COMMAND_RS).toContain('generate_video::byteplus::generate_video_byteplus;');
  });
});

describe('R2-3a branch order in generate_video_command', () => {
  it('runs after the artcraft check and before decode_native and the native handler', () => {
    const body = commandBody();
    const artcraft = body.indexOf('request.uses_artcraft()');
    const byteplus = body.indexOf('request.provider == Some(GenerationProvider::BytePlus)');
    const decode = body.indexOf('decode_native(request)');
    expect(artcraft).toBeGreaterThan(-1);
    expect(byteplus).toBeGreaterThan(artcraft);
    expect(decode).toBeGreaterThan(byteplus);
  });

  it('returns from the BytePlus branch instead of falling through to the vendor path', () => {
    expect(commandBody()).toMatch(
      /if request\.provider == Some\(GenerationProvider::BytePlus\) \{\s*return adapt_legacy_response\(generate_video_byteplus\(request, &app\)\.await\);\s*\}/,
    );
  });

  it('BytePlus is not an artcraft provider, so the branch is reachable', () => {
    const omni = read(path.join(TAURI_DIR, 'src/core/commands/generate/omni/request.rs'));
    const usesArtcraft = fnBody(omni, 'uses_artcraft');
    expect(usesArtcraft).not.toContain('BytePlus');
  });
});

describe('R2-3a missing key and failures', () => {
  const run = fnBody(BYTEPLUS_RS, 'generate_video_byteplus');
  const loadKey = fnBody(BYTEPLUS_RS, 'load_api_key');

  it('loads the key before reading the image or calling BytePlus', () => {
    const key = run.indexOf('load_api_key(app)?');
    expect(key).toBeGreaterThan(-1);
    expect(key).toBeLessThan(run.indexOf('image_to_data_url('));
    expect(key).toBeLessThan(run.indexOf('create_video_task('));
  });

  it('a missing or non-API-key credential is Unauthorized, not a server error', () => {
    expect(loadKey).toContain('Ok(Some(ProviderCredentialPayload::ApiKey(key)))');
    // Ok(None) and any other payload share the missing-key arm.
    expect(loadKey).toMatch(/Ok\(_\) => Err\(command_error\(\s*CommandErrorStatus::Unauthorized/);
  });

  it('the missing-key error never falls back to another provider', () => {
    for (const symbol of VENDOR_SYMBOLS) expect(BYTEPLUS_RS).not.toContain(symbol);
    expect(BYTEPLUS_RS.match(/ProviderCredentialKey::\w+/g)).toEqual(
      expect.arrayContaining(['ProviderCredentialKey::BytePlusApiKey']),
    );
    expect(new Set(BYTEPLUS_RS.match(/ProviderCredentialKey::\w+/g))).toEqual(
      new Set(['ProviderCredentialKey::BytePlusApiKey']),
    );
  });

  it('a failed create_video_task returns an error before any tasks row is written', () => {
    expect(run).toMatch(/create_video_task\(&key, &task_request\)\s*\.await\s*\.map_err\([\s\S]*?\)\?;/);
    expect(run.indexOf('create_video_task(')).toBeLessThan(run.indexOf('insert_into_task_database'));
  });

  it('never logs or returns the API key', () => {
    const logs = BYTEPLUS_RS.match(/(?:info|warn|error|debug)!\([^;]*\);/g) ?? [];
    for (const line of logs) expect(line).not.toMatch(/\bkey\b/);
    for (const call of BYTEPLUS_RS.match(/format!\([^;]*?\)/g) ?? []) expect(call).not.toMatch(/\bkey\b/);
  });
});

describe('R2-3a first-frame image', () => {
  const toDataUrl = fnBody(BYTEPLUS_RS, 'image_to_data_url');

  it('prefers start_frame_image_media_token over image_media_token', () => {
    expect(BYTEPLUS_RS).toMatch(/field\("start_frame_image_media_token"\)\.or_else\(\|\| field\("image_media_token"\)\)/);
  });

  it('no image means a text-only task, not an error', () => {
    expect(BYTEPLUS_RS).toMatch(/None => None/);
  });

  it('a data: URL passes through and a path becomes a base64 data URL', () => {
    expect(toDataUrl).toMatch(/if image\.starts_with\("data:"\) \{\s*return Ok\(image\.to_string\(\)\);/);
    expect(toDataUrl).toContain('format!("data:{};base64,{}"');
  });

  it('a local path, Windows paths included, is read as-is without URL parsing', () => {
    expect(toDataUrl).toContain('tokio::fs::read(image)');
    // Splitting on "/" or parsing as a URL would break "C:\\Users\\me\\a.png".
    expect(toDataUrl).not.toMatch(/split\(|Url::parse|file:\/\//);
  });

  it('an unreadable file or unknown image type is a BadRequest', () => {
    const badRequests = toDataUrl.match(/CommandErrorStatus::BadRequest/g) ?? [];
    expect(badRequests).toHaveLength(2);
  });

  it('the client sends the image with role first_frame and rejects non-data URLs', () => {
    const client = read(CLIENT_RS);
    const body = fnBody(client, 'video_task_body');
    expect(body).toContain('"role": "first_frame"');
    expect(body).toContain('require_data_url(url)?');
  });
});

describe('R2-3a task options', () => {
  it('falls back to a Seedance model, 5 s, 720p and adaptive ratio', () => {
    expect(BYTEPLUS_RS).toMatch(/const DEFAULT_MODEL: &str = "seedance-[\w-]+";/);
    expect(BYTEPLUS_RS).toContain('request.model().unwrap_or(DEFAULT_MODEL)');
    expect(BYTEPLUS_RS).toMatch(/as_u64\)\.unwrap_or\(5\)/);
    expect(BYTEPLUS_RS).toMatch(/_ => "720p"/);
    expect(BYTEPLUS_RS).toMatch(/_ => "adaptive"/);
  });

  it('a missing prompt becomes an empty string, not a panic', () => {
    expect(BYTEPLUS_RS).toContain('field("prompt").unwrap_or_default()');
    expect(BYTEPLUS_RS.split('#[cfg(test)]')[0]).not.toMatch(/\.unwrap\(\)|\.expect\(/);
  });
});

describe('R2-3a tasks row and response', () => {
  const run = fnBody(BYTEPLUS_RS, 'generate_video_byteplus');

  it('writes a VideoGeneration byteplus row keyed by the BytePlus task id', () => {
    expect(run).toContain('task_type: TaskType::VideoGeneration');
    expect(run).toContain('provider: GenerationProvider::BytePlus');
    expect(run).toContain('provider_job_id: Some(task_id)');
    // No vendor prompt record and no vendor queue URLs.
    expect(run).toContain('maybe_prompt_token: None');
    expect(run).toContain('maybe_queue_status_url: None');
    expect(run).toContain('maybe_queue_response_url: None');
  });

  it('keeps the frontend subscriber fields so the UI can match the task', () => {
    expect(run).toContain('insert_into_task_database_with_frontend_payload(');
    expect(run).toContain('request.frontend_caller');
    expect(run).toContain('request.frontend_subscriber_id');
  });

  it('sends the enqueue event after the row and returns the normal response', () => {
    const insert = run.indexOf('insert_into_task_database_with_frontend_payload(');
    const event = run.indexOf('GenerationEnqueueSuccessEvent {');
    expect(insert).toBeGreaterThan(-1);
    expect(event).toBeGreaterThan(insert);
    expect(run).toMatch(/Ok\(TauriGenerateVideoResponse \{\}\.into\(\)\)\s*\}\s*$/);
  });
});

describe('R2-3a branding and vendor hosts', () => {
  it('no user-visible string in byteplus.rs names a foreign brand', () => {
    for (const s of stringLiterals(BYTEPLUS_RS)) expect(s).not.toMatch(FOREIGN_BRANDS);
  });

  it('byteplus.rs has no hard-coded URL; the host lives in the client only', () => {
    expect(BYTEPLUS_RS).not.toMatch(/https?:\/\//);
  });

  it('the client only talks to a BytePlus host', () => {
    // Test fixtures (example.com) live under #[cfg(test)]; check only shipped code.
    const shipped = read(CLIENT_RS).split('#[cfg(test)]')[0];
    const urls = shipped.match(/https?:\/\/[^"\s/]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/\.bytepluses\.com$|\.byteplus\.com$/);
  });
});
