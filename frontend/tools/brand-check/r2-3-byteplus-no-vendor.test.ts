// R2-3a: the BytePlus video branch talks to BytePlus only, never the vendor backend.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const VIDEO_DIR = path.resolve(
  __dirname,
  '../../../crates/desktop/artcraft/src/core/commands/generate/generate_video',
);
const BYTEPLUS_RS = readFileSync(path.join(VIDEO_DIR, 'byteplus.rs'), 'utf8');
const COMMAND_RS = readFileSync(path.join(VIDEO_DIR, 'generate_video_command.rs'), 'utf8');
const VENDOR_REFS = ['create_prompt_record', 'upload_to_backend', 'storyteller', 'cdn', 'artcraft_client'];

describe('R2-3a BytePlus video branch', () => {
  it.each(VENDOR_REFS)('byteplus.rs has no %s reference', (ref) => {
    expect(BYTEPLUS_RS.toLowerCase()).not.toContain(ref);
  });

  it('creates a Seedance task and records it as a byteplus task', () => {
    expect(BYTEPLUS_RS).toContain('create_video_task(');
    expect(BYTEPLUS_RS).toContain('ProviderCredentialKey::BytePlusApiKey');
    expect(BYTEPLUS_RS).toContain('provider: GenerationProvider::BytePlus');
    expect(BYTEPLUS_RS).toContain('provider_job_id: Some(task_id)');
  });

  it('the command branches to BytePlus before the vendor handler', () => {
    const branch = COMMAND_RS.indexOf('generate_video_byteplus(request');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(COMMAND_RS.search(/handle_video_artcraft\(\s/));
  });
});
