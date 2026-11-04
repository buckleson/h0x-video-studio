// R3-1 edge cases: the bundled Mesh2Motion GLBs are structurally sound containers, load with
// stock three.js (no Draco), share one rig, and their credits match the files exactly.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../apps/artcraft/app/public/resources/3d');
const NOTICE = path.resolve(__dirname, '../../../NOTICE');

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
// three.js GLTFLoader handles these natively, or with the meshopt decoder that ships with it.
const ALLOWED_REQUIRED = new Set(['EXT_meshopt_compression']);
const CHANNEL_PATHS = new Set(['translation', 'rotation', 'scale', 'weights']);
const BANNED = /artcraft|getartcraft|storyteller|fakeyou|\bltx|lightricks|mixamo/i;
// Non-CC0 or wrong-rig Mesh2Motion models, and non-CC0 three.js sample characters.
const EXCLUDED = /jay|sintel|sophia|bunny|zombie|xbot|soldier|michelle|mixamo|cc-sa|cc-by/i;

type Gltf = {
  asset: { version: string; copyright?: string };
  extensionsRequired?: string[];
  buffers?: { uri?: string; byteLength: number; extensions?: Record<string, unknown> }[];
  bufferViews?: {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    extensions?: { EXT_meshopt_compression?: { buffer: number; byteOffset?: number; byteLength: number } };
  }[];
  accessors?: { min?: number[]; max?: number[] }[];
  nodes?: { name?: string }[];
  skins?: { joints: number[] }[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  animations?: {
    name?: string;
    samplers: { input: number; output: number }[];
    channels: { sampler: number; target: { node?: number; path: string } }[];
  }[];
};

const list = (dir: string) => readdirSync(path.join(ROOT, dir)).sort();
const CHARACTERS = list('characters').map((f) => `characters/${f}`);
const ANIMATIONS = list('animations').map((f) => `animations/${f}`);
const ALL = [...CHARACTERS, ...ANIMATIONS];

function parse(rel: string) {
  const b = readFileSync(path.join(ROOT, rel));
  const jsonLen = b.readUInt32LE(12);
  const binHeader = 20 + jsonLen;
  return {
    bytes: b,
    magic: b.readUInt32LE(0),
    declaredLength: b.readUInt32LE(8),
    jsonLen,
    jsonType: b.readUInt32LE(16),
    binLen: b.length > binHeader ? b.readUInt32LE(binHeader) : undefined,
    binType: b.length > binHeader + 4 ? b.readUInt32LE(binHeader + 4) : undefined,
    json: JSON.parse(b.subarray(20, binHeader).toString('utf8')) as Gltf,
  };
}

const slug = (name: string) => name.toLowerCase().replace(/[\s_]+/g, '-');
const jointNames = (g: Gltf) => g.skins![0].joints.map((i) => g.nodes![i].name);
const isFallback = (buf: { extensions?: Record<string, unknown> }) =>
  (buf.extensions?.EXT_meshopt_compression as { fallback?: boolean } | undefined)?.fallback === true;

function heightOf(g: Gltf): number {
  const ys = g.meshes!.flatMap((m) =>
    m.primitives.map((p) => {
      const a = g.accessors![p.attributes.POSITION];
      return a.max![1] - a.min![1];
    }),
  );
  return Math.max(...ys);
}

function creditRows() {
  return readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\| (characters|animations)\//.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

describe('R3-1 edge: folder contents', () => {
  it('3d root holds only characters/, animations/ and CREDITS.md', () => {
    expect(readdirSync(ROOT).sort()).toEqual(['CREDITS.md', 'animations', 'characters']);
  });

  it('asset folders hold only .glb files (no .gltf/.bin/.png sidecars, no subfolders)', () => {
    for (const f of ALL) {
      expect(f).toMatch(/\.glb$/);
      expect(statSync(path.join(ROOT, f)).isFile()).toBe(true);
    }
  });

  it('character files are exactly fighter.glb and brute.glb', () => {
    expect(CHARACTERS).toEqual(['characters/brute.glb', 'characters/fighter.glb']);
  });

  it('file names are lowercase kebab-case (safe on Windows and case-sensitive hosts)', () => {
    for (const f of ALL) expect(path.basename(f)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.glb$/);
  });

  it('no excluded, Mixamo or three.js sample model is bundled', () => {
    for (const f of ALL) expect(f).not.toMatch(EXCLUDED);
  });

  it('fighter and brute are different meshes, and brute is the bigger one', () => {
    const fighter = parse('characters/fighter.glb');
    const brute = parse('characters/brute.glb');
    const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    expect(sha(fighter.bytes)).not.toBe(sha(brute.bytes));
    expect(heightOf(brute.json)).toBeGreaterThan(heightOf(fighter.json));
  });

  it('every file is non-empty and no single file exceeds 10 MB', () => {
    for (const f of ALL) {
      const size = statSync(path.join(ROOT, f)).size;
      expect(size, f).toBeGreaterThan(20);
      expect(size, f).toBeLessThanOrEqual(10 * 1024 * 1024);
    }
  });
});

describe.each(ALL)('R3-1 edge: %s container', (f) => {
  const g = parse(f);

  it('header length matches the file size and chunks are JSON then BIN', () => {
    expect(g.magic).toBe(GLB_MAGIC);
    expect(g.declaredLength).toBe(g.bytes.length);
    expect(g.jsonType).toBe(CHUNK_JSON);
    expect(g.jsonLen % 4).toBe(0);
    expect(g.binType).toBe(CHUNK_BIN);
    expect(20 + g.jsonLen + 8 + g.binLen!).toBe(g.bytes.length);
  });

  it('asset.version is 2.0', () => {
    expect(g.json.asset.version).toBe('2.0');
  });

  it('has exactly one data buffer, backed by the BIN chunk; any others are meshopt fallbacks', () => {
    const buffers = g.json.buffers ?? [];
    const data = buffers.filter((b) => !isFallback(b));
    expect(data).toHaveLength(1);
    expect(buffers[0]).toBe(data[0]);
    expect(data[0].byteLength).toBeLessThanOrEqual(g.binLen!);
    expect(g.binLen! - data[0].byteLength).toBeLessThan(4);
    for (const b of buffers) expect(b.uri).toBeUndefined();
  });

  it('every bufferView (and meshopt source range) lies inside its buffer', () => {
    const buffers = g.json.buffers ?? [];
    for (const v of g.json.bufferViews ?? []) {
      expect(buffers[v.buffer]).toBeDefined();
      expect((v.byteOffset ?? 0) + v.byteLength).toBeLessThanOrEqual(buffers[v.buffer].byteLength);
      const m = v.extensions?.EXT_meshopt_compression;
      if (m) {
        expect(isFallback(buffers[m.buffer])).toBe(false);
        expect((m.byteOffset ?? 0) + m.byteLength).toBeLessThanOrEqual(buffers[m.buffer].byteLength);
      }
    }
  });

  it('requires no extension three.js cannot load without extra decoders (no Draco)', () => {
    for (const e of g.json.extensionsRequired ?? []) expect(ALLOWED_REQUIRED.has(e), e).toBe(true);
  });

  it('carries no brand, Mixamo or LTX strings in names, copyright or extras', () => {
    const text = JSON.stringify({
      asset: g.json.asset,
      nodes: g.json.nodes?.map((n) => n.name),
      animations: g.json.animations?.map((a) => a.name),
      extras: (g.json as { extras?: unknown }).extras,
    });
    expect(text).not.toMatch(BANNED);
  });
});

describe('R3-1 edge: characters', () => {
  it.each(CHARACTERS)('%s needs no required extensions at all', (f) => {
    expect(parse(f).json.extensionsRequired ?? []).toEqual([]);
  });

  it.each(CHARACTERS)('%s has a mesh with POSITION and skinning attributes', (f) => {
    const prims = (parse(f).json.meshes ?? []).flatMap((m) => m.primitives);
    expect(prims.length).toBeGreaterThan(0);
    for (const p of prims) expect(Object.keys(p.attributes)).toEqual(expect.arrayContaining(['POSITION', 'JOINTS_0', 'WEIGHTS_0']));
  });

  it.each(CHARACTERS)('%s skin joints are in range, named and unique', (f) => {
    const g = parse(f).json;
    const joints = g.skins![0].joints;
    for (const i of joints) expect(g.nodes![i]?.name).toBeTruthy();
    expect(new Set(jointNames(g)).size).toBe(joints.length);
  });

  it('both characters share the same Mesh2Motion human rig (identical joint names)', () => {
    const [a, b] = CHARACTERS.map((f) => [...jointNames(parse(f).json)].sort());
    expect(a).toEqual(b);
    expect(a).toEqual(expect.arrayContaining(['head', 'neck_01', 'index_01_l', 'middle_04_leaf_l']));
  });
});

describe.each(ANIMATIONS)('R3-1 edge: %s clip', (f) => {
  const g = parse(f).json;

  it('holds exactly one animation, named so the file name is its slug', () => {
    expect(g.animations).toHaveLength(1);
    expect(path.basename(f, '.glb')).toBe(slug(g.animations![0].name!));
  });

  it('every channel targets a named node with a valid path and sampler', () => {
    const a = g.animations![0];
    expect(a.channels.length).toBeGreaterThan(0);
    for (const ch of a.channels) {
      expect(ch.target.node, 'target.node').toBeDefined();
      expect(g.nodes![ch.target.node!]?.name).toBeTruthy();
      expect(CHANNEL_PATHS.has(ch.target.path), ch.target.path).toBe(true);
      expect(a.samplers[ch.sampler]).toBeDefined();
    }
  });

  it('has a positive duration (sampler input max > 0)', () => {
    const durations = g.animations![0].samplers.map((s) => g.accessors![s.input].max?.[0] ?? 0);
    expect(Math.max(...durations)).toBeGreaterThan(0);
  });

  it('track names do not use the Mixamo rig prefix', () => {
    for (const n of g.nodes ?? []) expect(n.name ?? '').not.toMatch(/^mixamorig/i);
  });
});

describe('R3-1 edge: CREDITS.md', () => {
  const rows = creditRows();
  const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');

  it('has one row per bundled file, no duplicates and no rows for missing files', () => {
    const files = rows.map((r) => r[0]);
    expect(new Set(files).size).toBe(files.length);
    expect([...files].sort()).toEqual([...ALL].sort());
  });

  it('clip column matches the animation name inside each clip GLB; characters use -', () => {
    for (const [file, clip] of rows) {
      if (file.startsWith('characters/')) expect(clip).toBe('-');
      else expect(clip).toBe(parse(file).json.animations![0].name);
    }
  });

  it('every source is a raw Mesh2Motion human-rig URL; clips keep their source file name', () => {
    for (const [file, , src] of rows) {
      expect(src).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/Mesh2Motion\/mesh2motion-app\/[^/\s]+\/static\/assets\/human\/\S+\.glb$/,
      );
      expect(src).not.toMatch(EXCLUDED);
      if (file.startsWith('animations/')) expect(path.posix.basename(src)).toBe(path.posix.basename(file));
    }
  });

  it('uses forward-slash paths only (no Windows backslashes)', () => {
    for (const [file, , src] of rows) {
      expect(file).not.toContain('\\');
      expect(src).not.toContain('\\');
    }
  });

  it('every row licence starts with CC0 - Mesh2Motion', () => {
    for (const r of rows) expect(r[3]).toMatch(/^CC0 - Mesh2Motion/);
  });

  it('contains no brand or vendor leaks', () => {
    expect(credits).not.toMatch(BANNED);
  });
});

describe('R3-1 edge: NOTICE', () => {
  const notice = readFileSync(NOTICE, 'utf8');
  const line = notice.split(/\r?\n/).find((l) => l.includes('Mesh2Motion'))!;

  it('points at the bundled folder and CREDITS.md and names CC0 1.0', () => {
    expect(line).toContain('frontend/apps/artcraft/app/public/resources/3d/');
    expect(line).toContain('CREDITS.md');
    expect(line).toContain('CC0 1.0');
    expect(line).not.toContain('\\');
  });

  it('sits in the licensed third-party list, not under "Material not covered"', () => {
    const notCovered = notice.indexOf('Material not covered');
    expect(notCovered).toBeGreaterThan(-1);
    expect(notice.indexOf(line)).toBeLessThan(notCovered);
  });
});
