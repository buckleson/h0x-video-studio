// R2-3b: the BytePlus image branch runs Seedream, saves locally, and never reaches the vendor backend.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const IMAGE_DIR = path.resolve(
  __dirname,
  '../../../crates/desktop/artcraft/src/core/commands/generate/generate_image',
);
const BYTEPLUS_RS = readFileSync(path.join(IMAGE_DIR, 'providers/byteplus.rs'), 'utf8');
const COMMAND_RS = readFileSync(path.join(IMAGE_DIR, 'generate_image_command.rs'), 'utf8');
const VENDOR_REFS = ['create_prompt_record', 'upload_to_backend', 'storyteller', 'artcraft_client::endpoints'];

describe('R2-3b BytePlus image branch', () => {
  it.each(VENDOR_REFS)('providers/byteplus.rs has no %s reference', (ref) => {
    expect(BYTEPLUS_RS.toLowerCase()).not.toContain(ref);
  });

  it('the CDN field carries only the local asset URL (no upload)', () => {
    const shipped = BYTEPLUS_RS.split('#[cfg(test)]')[0];
    expect(shipped).toContain('let asset_url = local_asset_url(&path);');
    expect(shipped).toMatch(/maybe_cdn_url:\s*Some\(asset_url\)/);
    expect(shipped).not.toMatch(/maybe_cdn_url:\s*None/);
  });

  it('runs Seedream 4.5 and records a completed local byteplus task', () => {
    expect(BYTEPLUS_RS).toContain('"seedream-4-5-251128"');
    expect(BYTEPLUS_RS).toMatch(/generate_image\(&key, /);
    expect(BYTEPLUS_RS).toContain('image_to_data_url(');
    expect(BYTEPLUS_RS).toContain('downloads_dir()');
    expect(BYTEPLUS_RS).toContain('status: TaskStatus::CompleteSuccess');
    expect(BYTEPLUS_RS).toContain('provider: GenerationProvider::BytePlus');
    expect(BYTEPLUS_RS).toContain('notify_frontend_of_completion(');
  });

  it('the command branches to BytePlus before the legacy handlers', () => {
    const branch = COMMAND_RS.indexOf('generate_image_byteplus(request');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(COMMAND_RS.indexOf('decode_native(request)'));
  });
});
