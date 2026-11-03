// R2-3b edge cases: the BytePlus image branch runs Seedream, reuses the R2-3a
// data URL helper, saves the result locally, records a completed task, and
// never reaches the vendor backend or leaks a key or foreign brand.
// Static source checks only: the desktop crate is compiled in CI, not here.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(__dirname, '../../..');
const GEN_DIR = path.join(APP_DIR, 'crates/desktop/artcraft/src/core/commands/generate');
const IMAGE_DIR = path.join(GEN_DIR, 'generate_image');
const PROVIDER_RS = path.join(IMAGE_DIR, 'providers/byteplus.rs');
const VIDEO_BYTEPLUS_RS = path.join(GEN_DIR, 'generate_video/byteplus.rs');
const SEEDREAM_MODEL = 'seedream-4-5-251128';
const VENDOR_REFS = ['create_prompt_record', 'upload_to_backend', 'storyteller', 'artcraft_client::endpoints'];
// The only artcraft_client item allowed: the ApiHost type notify_frontend_of_completion needs.
const ALLOWED_ARTCRAFT_CLIENT_USE = 'use artcraft_client::utils::api_host::ApiHost;';
const VENDOR_SYMBOLS = [
  'StorytellerCredentialManager',
  'CreditsBalanceChangedEvent',
  'handle_artcraft',
  'handle_router',
  'FalApiKey',
  'omni::generate',
];
const FOREIGN_BRANDS = /artcraft|storyteller|fakeyou|ltx|lightricks/i;

/** File text, or '' when missing, so each test reports its own failure. */
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const PROVIDER = read(PROVIDER_RS);
const COMMAND = read(path.join(IMAGE_DIR, 'generate_image_command.rs'));

/** Shipped code only: drop a trailing #[cfg(test)] module. */
const shipped = (src: string) => src.split('#[cfg(test)]')[0];

/** Rust string literals in a source file. */
function stringLiterals(src: string): string[] {
  return [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

/** Body of `generate_image_command`, up to the next top-level fn. */
function commandBody(): string {
  const start = COMMAND.indexOf('pub async fn generate_image_command(');
  const end = COMMAND.indexOf('async fn generate_image_native(');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return COMMAND.slice(start, end);
}

describe('R2-3b module wiring', () => {
  it('providers/byteplus.rs exists', () => {
    expect(existsSync(PROVIDER_RS)).toBe(true);
  });

  it('providers/mod.rs declares the byteplus module exactly once', () => {
    const mods = read(path.join(IMAGE_DIR, 'providers/mod.rs')).match(/^\s*pub(?:\(crate\))? mod byteplus;/gm) ?? [];
    expect(mods).toHaveLength(1);
  });

  it('the R2-3a helper is reused, not copied', () => {
    // The image provider imports the video helper and has no copy of its own.
    expect(PROVIDER).toMatch(/generate_video::byteplus::\{?[^;]*\bimage_to_data_url\b/);
    expect(PROVIDER).not.toMatch(/fn image_to_data_url\b/);
    // The helper and its module are reachable from the image provider.
    expect(read(VIDEO_BYTEPLUS_RS)).toMatch(/pub(?:\(crate\))? async fn image_to_data_url\(/);
    expect(read(path.join(GEN_DIR, 'generate_video/mod.rs'))).toMatch(/^\s*pub(?:\(crate\))? mod byteplus;/m);
  });

  it('the R2-3a video branch still works after the helper is exposed', () => {
    expect(read(VIDEO_BYTEPLUS_RS)).toContain('image_to_data_url(');
    expect(read(VIDEO_BYTEPLUS_RS)).toContain('create_video_task(');
  });
});

describe('R2-3b branch in generate_image_command', () => {
  it('branches to BytePlus before decode_native and the legacy handlers', () => {
    const body = commandBody();
    const byteplus = body.indexOf('request.provider == Some(GenerationProvider::BytePlus)');
    expect(byteplus).toBeGreaterThan(-1);
    expect(byteplus).toBeLessThan(body.indexOf('decode_native(request)'));
  });

  it('returns from the BytePlus branch instead of falling through', () => {
    expect(commandBody()).toMatch(
      /if request\.provider == Some\(GenerationProvider::BytePlus\) \{\s*return [^;]*generate_image_byteplus\([^;]*\.await[^;]*;\s*\}/,
    );
  });

  it('BytePlus never reaches the artcraft handler or the router', () => {
    // generate_image_native sends every non-Artcraft provider to handle_router;
    // the early return is what keeps BytePlus out of it.
    const body = commandBody();
    expect(body.indexOf('GenerationProvider::BytePlus')).toBeLessThan(body.indexOf('generate_image_native('));
  });
});

describe('R2-3b Seedream call', () => {
  it('calls byteplus_client::generate_image with the Seedream 4.5 model', () => {
    expect(PROVIDER).toMatch(/generate_image\(\s*&key\s*,/);
    expect(PROVIDER).toContain('ImageRequest');
    expect(PROVIDER).toContain(`"${SEEDREAM_MODEL}"`);
  });

  it('pins exactly one Seedream model and no Seedance or other ids', () => {
    const models = stringLiterals(PROVIDER).filter((s) => /^seed(?:ream|ance)-/.test(s));
    expect(new Set(models)).toEqual(new Set([SEEDREAM_MODEL]));
  });

  it('converts every input image with the shared helper before calling BytePlus', () => {
    const helper = PROVIDER.indexOf('image_to_data_url(');
    expect(helper).toBeGreaterThan(-1);
    expect(helper).toBeLessThan(PROVIDER.search(/generate_image\(\s*&key/));
    expect(PROVIDER).toContain('image_data_urls');
  });

  it('loads the BytePlus key before converting images or calling BytePlus', () => {
    const key = PROVIDER.search(/ProviderCredentialKey::BytePlusApiKey|load_api_key\(/);
    expect(key).toBeGreaterThan(-1);
    expect(key).toBeLessThan(PROVIDER.indexOf('image_to_data_url('));
    expect(key).toBeLessThan(PROVIDER.search(/generate_image\(\s*&key/));
  });

  it('uses only the BytePlus credential, never another provider key', () => {
    const keys = new Set(PROVIDER.match(/ProviderCredentialKey::\w+/g) ?? []);
    for (const k of keys) expect(k).toBe('ProviderCredentialKey::BytePlusApiKey');
  });

  it('a missing prompt or no input images is not a panic', () => {
    expect(shipped(PROVIDER)).not.toMatch(/\.unwrap\(\)|\.expect\(/);
  });
});

describe('R2-3b local save and completion', () => {
  it('downloads the result into the app downloads directory', () => {
    expect(PROVIDER).toMatch(/downloads_dir\(\)|download_url_to_user_download_dir|AppDownloadsDir/);
  });

  it('a failed BytePlus call or download returns before any tasks row is written', () => {
    const call = PROVIDER.search(/generate_image\(\s*&key/);
    const row = PROVIDER.search(/TaskStatus::CompleteSuccess/);
    expect(call).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(call);
    expect(PROVIDER).toMatch(/generate_image\(\s*&key\s*,[^;]*\)\s*\.await\s*\.map_err\(/);
  });

  it('writes a completed ImageGeneration byteplus row, not a pending one', () => {
    expect(PROVIDER).toContain('TaskStatus::CompleteSuccess');
    expect(PROVIDER).not.toContain('TaskStatus::Pending');
    expect(PROVIDER).toContain('TaskType::ImageGeneration');
    expect(PROVIDER).toContain('GenerationProvider::BytePlus');
  });

  it('notifies the frontend after the row is written', () => {
    const row = PROVIDER.indexOf('TaskStatus::CompleteSuccess');
    const notify = PROVIDER.indexOf('notify_frontend_of_completion(');
    expect(notify).toBeGreaterThan(row);
  });

  it('the saved path is built with Path::join, not string concatenation (Windows paths)', () => {
    expect(PROVIDER).toMatch(/\.join\(/);
    expect(PROVIDER).not.toMatch(/format!\("\{\}\/\{\}"|"\/"\s*\+|\+\s*"\/"/);
  });
});

describe('R2-3b vendor and brand leaks', () => {
  it.each(VENDOR_REFS)('providers/byteplus.rs has no %s reference', (ref) => {
    expect(PROVIDER.length).toBeGreaterThan(0);
    expect(PROVIDER.toLowerCase()).not.toContain(ref);
  });

  it('the only artcraft_client use is the ApiHost type, never an endpoint call', () => {
    const uses = PROVIDER.match(/artcraft_client::[\w:{}, ]+/g) ?? [];
    expect(uses).toEqual(['artcraft_client::utils::api_host::ApiHost']);
    expect(PROVIDER).toContain(ALLOWED_ARTCRAFT_CLIENT_USE);
  });

  it('the only CDN mention is the empty maybe_cdn_url field (no upload, no CDN URL)', () => {
    const lines = PROVIDER.split(/\r?\n/).filter((l) => /cdn/i.test(l));
    expect(lines.map((l) => l.trim())).toEqual(['maybe_cdn_url: None,']);
  });

  it.each(VENDOR_SYMBOLS)('providers/byteplus.rs does not use %s', (symbol) => {
    expect(PROVIDER.length).toBeGreaterThan(0);
    expect(PROVIDER).not.toContain(symbol);
  });

  it('no string literal in providers/byteplus.rs names a foreign brand', () => {
    for (const s of stringLiterals(PROVIDER)) expect(s).not.toMatch(FOREIGN_BRANDS);
  });

  it('has no hard-coded URL; the host lives in the client only', () => {
    expect(shipped(PROVIDER)).not.toMatch(/https?:\/\//);
  });

  it('never logs or formats the API key', () => {
    const logs = PROVIDER.match(/(?:info|warn|error|debug)!\([^;]*\);/g) ?? [];
    for (const line of logs) expect(line).not.toMatch(/\bkey\b/);
    for (const call of PROVIDER.match(/format!\([^;]*?\)/g) ?? []) expect(call).not.toMatch(/\bkey\b/);
  });
});
