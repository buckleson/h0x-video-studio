// R3-3: bundled Local:: Fighter/Brute characters and the 16 fight clips must
// be well-formed, lead their lists, and point at files that exist on disk.
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { demoAnimationItems } from "./demoAnimationItems";
import { demoCharacterItems } from "./demoCharacterItems";
import type { MediaItem } from "../../models/assets";

const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../apps/artcraft/app/public",
);

const CLIPS: [name: string, file: string][] = [
  ["Jab", "punch-jab"],
  ["Cross", "punch-cross"],
  ["Hook", "melee-hook"],
  ["Roundhouse kick", "kick-roundhouse"],
  ["Spin kick", "kick-spin"],
  ["Cross slash", "dual-wield-cross-slash"],
  ["Sword combo", "sword-regular-combo"],
  ["Dash", "sword-dash-rm"],
  ["Dodge left", "dodge-left"],
  ["Dodge back", "dodge-back"],
  ["Hit to head", "hit-head"],
  ["Knockback", "hit-knockback"],
  ["Death", "death-a"],
  ["Sword idle", "idle-sword"],
  ["Fight idle", "fighting-idle"],
  ["Roll", "roll"],
];

const BRANDS =
  /artcraft|getartcraft|storyteller|fakeyou|ltx|lightricks|mixamo|mesh2motion|adobe|quaternius/i;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isLocal = (i: MediaItem) => i.media_id.startsWith("Local::");
const localPath = (i: MediaItem) => i.media_id.slice("Local::".length);
const onDisk = (urlPath: string) =>
  path.join(PUBLIC_DIR, ...urlPath.split("/").filter(Boolean));

const localChars = demoCharacterItems.filter(isLocal);
const localClips = demoAnimationItems.filter(isLocal);
const allLocal = [...localChars, ...localClips];

describe("R3-3 local character presets", () => {
  it("has exactly Fighter then Brute as the first two characters", () => {
    expect(demoCharacterItems.slice(0, 2).map((i) => i.name)).toEqual(["Fighter", "Brute"]);
    expect(localChars.map((i) => i.name)).toEqual(["Fighter", "Brute"]);
  });

  it.each([
    ["Fighter", "fighter"],
    ["Brute", "brute"],
  ])("%s has the expected media_id, type and thumbnail", (name, file) => {
    const item = demoCharacterItems.find((i) => i.name === name)!;
    expect(item.media_id).toBe(`Local::/resources/3d/characters/${file}.glb`);
    expect(item.media_type).toBe("glb");
    expect(item.thumbnail).toBe(`/resources/3d/thumbs/${file}.png`);
  });
});

describe("R3-3 local animation presets", () => {
  it("has the 16 clips first, in order, with the requested names", () => {
    expect(localClips).toHaveLength(16);
    expect(demoAnimationItems.slice(0, 16).map((i) => i.name)).toEqual(CLIPS.map(([n]) => n));
  });

  it.each(CLIPS)("%s points at the R3-1 file %s", (name, file) => {
    const item = demoAnimationItems.find((i) => i.name === name)!;
    expect(item.media_id).toBe(`Local::/resources/3d/animations/${file}.glb`);
    expect(item.media_type).toBe("glb");
    expect(item.thumbnail).toBe(`/resources/3d/thumbs/${file}.png`);
  });

  it("only uses each R3-1 animation file once", () => {
    const ids = localClips.map((i) => i.media_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("R3-3 local presets on disk", () => {
  it("has unique media ids across both lists", () => {
    const ids = [...demoCharacterItems, ...demoAnimationItems].map((i) => i.media_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses POSIX, root-relative, non-traversing URL paths (no Windows separators)", () => {
    for (const item of allLocal) {
      for (const p of [localPath(item), item.thumbnail ?? ""]) {
        expect(p).toMatch(/^\/resources\/3d\/(characters|animations|thumbs)\/[a-z0-9-]+\.(glb|png)$/);
        expect(p).not.toContain("\\");
        expect(p).not.toContain("..");
        expect(p).not.toMatch(/^[a-z]:/i);
        expect(p).not.toMatch(/^https?:/i);
      }
    }
  });

  it("every Local:: glb exists in the app public dir", () => {
    const missing = allLocal.map(localPath).filter((p) => !existsSync(onDisk(p)));
    expect(missing).toEqual([]);
  });

  it("every Local:: thumbnail (characters included) exists and is a real PNG", () => {
    for (const item of allLocal) {
      const file = onDisk(item.thumbnail!);
      expect(existsSync(file), item.thumbnail).toBe(true);
      expect([...readFileSync(file).subarray(0, 8)], item.thumbnail).toEqual(PNG_MAGIC);
    }
  });

  it("every glb has the binary glTF magic header", () => {
    for (const item of allLocal) {
      const head = readFileSync(onDisk(localPath(item))).subarray(0, 4).toString("latin1");
      expect(head, item.media_id).toBe("glTF");
    }
  });

  it("has no brand or vendor names in user-visible names", () => {
    for (const { name } of [...demoCharacterItems, ...demoAnimationItems]) {
      expect(name).not.toMatch(BRANDS);
    }
  });

  it("has no brand or vendor names in local preset paths", () => {
    expect(JSON.stringify(allLocal)).not.toMatch(BRANDS);
  });
});
