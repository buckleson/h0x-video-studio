// A1: unlicensed assets are gone from the repo, nothing still points at
// them, and NOTICE keeps its text plus the H0x modification line.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const APP_ROOT = path.resolve(__dirname, '../../..');
const PUBLIC_RESOURCES = 'frontend/apps/artcraft/app/public/resources';
const REMOVED_PATHS = [
  `${PUBLIC_RESOURCES}/sound`,
  `${PUBLIC_RESOURCES}/memes`,
  `${PUBLIC_RESOURCES}/skybox/gray`,
  `${PUBLIC_RESOURCES}/skybox/night`,
  `${PUBLIC_RESOURCES}/characters_gif`,
  `${PUBLIC_RESOURCES}/pose/Lumine Idle cycle.vmd`,
];
const REFERENCE_PATTERN =
  'resources/(sound|memes|skybox/gray|skybox/night|characters_gif)|Lumine Idle';
const NOTICE_LINE =
  'H0x Video Studio — modified by Buckleson (2026). The ArtCraft name and logos are not used.';

describe('A1 removed assets', () => {
  it.each(REMOVED_PATHS)('%s is not tracked by git', (p) => {
    expect(git('ls-files', '--', p)).toBe('');
  });

  it.each(REMOVED_PATHS)('%s is not on disk', (p) => {
    expect(existsSync(path.join(APP_ROOT, ...p.split('/')))).toBe(false);
  });

  it('git grep finds no reference to a removed asset under frontend/', () => {
    expect(gitGrep(REFERENCE_PATTERN, 'frontend/')).toBe('');
  });

  // Any separator ('/', Windows '\', or url-encoded) between the segments.
  it('finds no reference with any path separator', () => {
    expect(
      gitGrep(
        'resources.{1,3}(sound|memes|characters_gif)[^a-z_]|skybox.{1,3}(gray|night)|Lumine',
        'frontend/',
      ),
    ).toBe('');
  });

  it('keeps the remaining skybox assets used by the app', () => {
    for (const f of ['black.jpg', 'day/px.webp', 'day/nz.webp']) {
      expect(git('ls-files', '--', `${PUBLIC_RESOURCES}/skybox/${f}`)).not.toBe('');
    }
  });
});

describe('A1 NOTICE', () => {
  const notice = readFileSync(path.join(APP_ROOT, 'NOTICE'), 'utf8');

  it('ends with the H0x modification line', () => {
    const lines = notice.replace(/\r\n/g, '\n').trimEnd().split('\n');
    expect(lines[lines.length - 1]).toBe(NOTICE_LINE);
  });

  it('contains the H0x line exactly once', () => {
    expect(notice.split(NOTICE_LINE).length - 1).toBe(1);
  });

  it('keeps the upstream copyright, license and third-party sections', () => {
    for (const line of [
      'Copyright (c) 2026 ArtCraft Team and the ArtCraft contributors.',
      'Licensed under the MIT License or the Apache License, Version 2.0, at your option',
      'Third-party material',
      'Material not covered by the license above',
    ]) {
      expect(notice).toContain(line);
    }
  });
});

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).trim();
}

// Test and spec files name what they check for, so they are left out.
const NOT_TESTS = [':(exclude,glob)**/*.test.*', ':(exclude,glob)**/*.spec.*'];

// git grep exits 1 when nothing matches; treat that as "no output".
function gitGrep(pattern: string, scope: string): string {
  try {
    return git('grep', '-n', '-I', '-E', pattern, '--', scope, ...NOT_TESTS);
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    if (err.status === 1) return '';
    throw e;
  }
}
