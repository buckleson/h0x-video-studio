// A1: demo asset lists must not point at the removed unlicensed assets, and
// every local thumbnail they still use must exist in the app's public dir.
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as demoAssets from "./index";
import { demoAnimationItems } from "./demoAnimationItems";
import { demoMemeItems } from "./demoMemeItems";
import { demoSkyboxItems } from "./demoSkyboxItems";
import type { MediaItem } from "../../models/assets";

const REMOVED = /resources\/(sound|memes|skybox\/gray|skybox\/night|characters_gif)\b|Lumine Idle/i;

const PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../../apps/artcraft/app/public",
);

describe("demo assets after A1", () => {
  it("still exports every list from the barrel", () => {
    for (const name of [
      "demoAnimationItems",
      "demoMemeItems",
      "demoSkyboxItems",
    ]) {
      expect(Array.isArray((demoAssets as Record<string, unknown>)[name])).toBe(true);
    }
  });

  it("has no meme items", () => {
    expect(demoMemeItems).toEqual([]);
  });

  it("drops the Night and Gray skyboxes", () => {
    const names = demoSkyboxItems.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes("night") || n.includes("gray"))).toBe(false);
    expect(demoSkyboxItems.map((i) => i.media_id)).not.toEqual(
      expect.arrayContaining(["SKY::m_0"]),
    );
    expect(demoSkyboxItems.map((i) => i.media_id)).not.toEqual(
      expect.arrayContaining(["SKY::m_3"]),
    );
  });

  it("keeps a usable skybox list with unique ids", () => {
    expect(demoSkyboxItems.length).toBeGreaterThan(0);
    const ids = demoSkyboxItems.map((i) => i.media_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("SKY::m_1");
  });

  it("keeps the animation entries", () => {
    expect(demoAnimationItems.length).toBeGreaterThan(0);
    for (const item of demoAnimationItems) {
      expect(item.media_id).toBeTruthy();
      expect(item.name).toBeTruthy();
    }
  });

  it.each([
    ["animation", demoAnimationItems],
    ["meme", demoMemeItems],
    ["skybox", demoSkyboxItems],
  ] as const)("%s items reference no removed asset", (_kind, items) => {
    expect(JSON.stringify(items)).not.toMatch(REMOVED);
  });

  it.each([
    ["animation", demoAnimationItems],
    ["skybox", demoSkyboxItems],
  ] as const)("every local %s thumbnail exists on disk", (_kind, items) => {
    const missing = localThumbnails(items).filter(
      (p) => !existsSync(path.join(PUBLIC_DIR, ...p.split("/").filter(Boolean))),
    );
    expect(missing).toEqual([]);
  });

  it("has no brand names in user-visible item names", () => {
    const all = [...demoAnimationItems, ...demoMemeItems, ...demoSkyboxItems];
    for (const { name } of all) {
      expect(name).not.toMatch(/artcraft|storyteller|fakeyou|ltx|lightricks/i);
    }
  });
});

function localThumbnails(items: readonly MediaItem[]): string[] {
  return items
    .map((i) => i.thumbnail)
    .filter((t): t is string => typeof t === "string" && t.startsWith("/"));
}
