// R3-1: the bundled CC0 Mesh2Motion characters and clips are valid, self-contained GLBs on
// one shared rig, credited, and small.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../apps/artcraft/app/public/resources/3d');
const NOTICE = path.resolve(__dirname, '../../../NOTICE');
const CLIPS = [
  'Fighting Idle', 'Punch_Jab', 'Punch_Cross', 'Melee_Hook', 'Kick Roundhouse', 'Kick_Spin',
  'Dual_Wield_Cross_Slash', 'Sword_Regular_Combo', 'Sword_Dash_RM', 'Dodge_left', 'Dodge_back',
  'Hit_Head', 'Hit_Knockback', 'Death_A', 'Idle_Sword', 'Roll',
];

type Gltf = {
  nodes?: { name?: string }[];
  skins?: unknown[];
  buffers?: { uri?: string }[];
  images?: { uri?: string }[];
  animations?: { name?: string; channels: { target: { node?: number } }[] }[];
};

const glbs = (dir: string) =>
  readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.glb')).map((f) => `${dir}/${f}`);
const CHARACTERS = glbs('characters');
const ANIMATIONS = glbs('animations');

function readGlb(rel: string) {
  const b = readFileSync(path.join(ROOT, rel));
  const jsonLength = b.readUInt32LE(12);
  return {
    magic: b.readUInt32LE(0),
    version: b.readUInt32LE(4),
    json: JSON.parse(b.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf,
  };
}

const nodeNames = (g: Gltf) => new Set((g.nodes ?? []).map((n) => n.name));

function dirSize(dir: string): number {
  return readdirSync(dir).reduce((sum, f) => {
    const p = path.join(dir, f);
    const s = statSync(p);
    return sum + (s.isDirectory() ? dirSize(p) : s.size);
  }, 0);
}

describe('R3-1 local 3D assets', () => {
  it('bundles 2 characters and the 16 fight clips', () => {
    expect(CHARACTERS).toHaveLength(2);
    expect(ANIMATIONS).toHaveLength(16);
    const names = ANIMATIONS.flatMap((f) => (readGlb(f).json.animations ?? []).map((a) => a.name));
    expect(names.sort()).toEqual([...CLIPS].sort());
  });

  it.each([...CHARACTERS, ...ANIMATIONS])('%s is a self-contained glTF 2 binary', (f) => {
    const { magic, version, json } = readGlb(f);
    expect(magic).toBe(0x46546c67);
    expect(version).toBe(2);
    expect((json.buffers ?? []).filter((b) => b.uri !== undefined)).toEqual([]);
    expect((json.images ?? []).filter((i) => i.uri !== undefined)).toEqual([]);
  });

  it.each(ANIMATIONS)('%s has an animation', (f) => {
    expect(readGlb(f).json.animations?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it.each(CHARACTERS)('%s has a skin', (f) => {
    expect(readGlb(f).json.skins?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it.each(ANIMATIONS.flatMap((a) => CHARACTERS.map((c) => [a, c])))(
    '%s tracks all exist in %s',
    (a, c) => {
      const clip = readGlb(a).json;
      const tracks = new Set(
        (clip.animations ?? []).flatMap((an) =>
          an.channels.map((ch) => clip.nodes?.[ch.target.node ?? -1]?.name),
        ),
      );
      const bones = nodeNames(readGlb(c).json);
      expect([...tracks].filter((n) => !bones.has(n))).toEqual([]);
    },
  );

  it('total size is at most 30 MB', () => {
    expect(dirSize(ROOT)).toBeLessThanOrEqual(30 * 1024 * 1024);
  });

  it('CREDITS.md lists every file with its source and CC0 - Mesh2Motion', () => {
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    for (const f of [...CHARACTERS, ...ANIMATIONS]) {
      const row = credits.split('\n').find((l) => l.startsWith(`| ${f} |`));
      expect(row, f).toMatch(/https:\/\/raw\.githubusercontent\.com\/Mesh2Motion\/\S+\.glb/);
      expect(row, f).toContain('CC0 - Mesh2Motion');
    }
  });

  it('NOTICE has one Mesh2Motion CC0 line', () => {
    const lines = readFileSync(NOTICE, 'utf8').split('\n').filter((l) => l.includes('Mesh2Motion'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('CC0');
  });
});
