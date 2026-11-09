// Tests for FAV-8: the MCP favorites store shares ~/Artcraft/settings/favorites.json with the app.
// Run: cd mcp/h0x-mcp && node --test favorites.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addFavorite, favoritesFile, listFavorites } from "./favorites.mjs";

async function setup(t) {
  const home = await mkdtemp(path.join(tmpdir(), "h0x-fav-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const library = path.join(home, "Artcraft", "downloads");
  await mkdir(library, { recursive: true });
  return { home, library, file: favoritesFile(library) };
}

async function media(file, bytes = "media") {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}

test("favorites.json lives in ~/Artcraft/settings, next to the library", async (t) => {
  const { home, file } = await setup(t);
  assert.equal(file, path.join(home, "Artcraft", "settings", "favorites.json"));
});

test("list_favorites returns path, kind and missing for each favorite", async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "a.png"));
  const video = await media(path.join(library, "sub", "b.MP4"));
  await addFavorite(file, library, image);
  await addFavorite(file, library, video);
  await rm(video);

  assert.deepEqual(await listFavorites(file), [
    { path: image, kind: "image", missing: false },
    { path: video, kind: "video", missing: true },
  ]);
});

test("a missing favorites.json lists nothing", async (t) => {
  const { file } = await setup(t);
  assert.deepEqual(await listFavorites(file), []);
});

test("the file keeps the app's format: an array of path and RFC 3339 UTC added_at", async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "a.png"));
  await addFavorite(file, library, image);

  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.length, 1);
  assert.deepEqual(Object.keys(saved[0]).sort(), ["added_at", "path"]);
  assert.equal(saved[0].path, image);
  assert.match(saved[0].added_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
});

test("entries written by the app are kept and listed", async (t) => {
  const { library, file } = await setup(t);
  const appImage = await media(path.join(library, "app.webp"));
  await media(file, JSON.stringify([{ path: appImage, added_at: "2026-11-01T10:00:00.123456Z" }], null, 2));
  const mine = await media(path.join(library, "mine.mov"));
  await addFavorite(file, library, mine);

  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(saved[0], { path: appImage, added_at: "2026-11-01T10:00:00.123456Z" });
  assert.deepEqual((await listFavorites(file)).map((f) => f.kind), ["image", "video"]);
});

test("adding a duplicate is a no-op", async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "a.png"));
  assert.equal((await addFavorite(file, library, image)).added, true);
  const before = await readFile(file, "utf8");

  const again = await addFavorite(file, library, image);
  assert.deepEqual(again, { path: image, added: false, copied: false });
  assert.equal(await readFile(file, "utf8"), before);
});

test("case and separator variants are one favorite on Windows", { skip: process.platform !== "win32" }, async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "a.png"));
  await addFavorite(file, library, image);
  assert.equal((await addFavorite(file, library, image.toUpperCase())).added, false);
  assert.equal((await addFavorite(file, library, image.replaceAll("\\", "/"))).added, false);
  assert.equal((await listFavorites(file)).length, 1);
});

test("a non-media file is rejected with a clear message", async (t) => {
  const { library, file } = await setup(t);
  const notes = await media(path.join(library, "notes.txt"));
  await assert.rejects(addFavorite(file, library, notes), /Only images and videos can be favorited/);
  assert.equal(existsSync(file), false);
});

test("a missing path is rejected with a clear message", async (t) => {
  const { library, file } = await setup(t);
  await assert.rejects(addFavorite(file, library, path.join(library, "gone.mp4")), /File not found/);
  await assert.rejects(addFavorite(file, library, "relative.png"), /Path must be absolute/);
  await assert.rejects(addFavorite(file, library, ""), /Path must be absolute/);
  assert.equal(existsSync(file), false);
});

test("a folder named like media is rejected", async (t) => {
  const { library, file } = await setup(t);
  const dir = path.join(library, "folder.png");
  await mkdir(dir);
  await assert.rejects(addFavorite(file, library, dir), /File not found/);
});

test("a file outside the library is copied into favorites/ and the source is untouched", async (t) => {
  const { home, library, file } = await setup(t);
  const source = await media(path.join(home, "elsewhere", "clip.mp4"), "source-bytes");

  const result = await addFavorite(file, library, source);
  const copy = path.join(library, "favorites", "clip.mp4");
  assert.deepEqual(result, { path: copy, added: true, copied: true });
  assert.equal(await readFile(copy, "utf8"), "source-bytes");
  assert.equal(await readFile(source, "utf8"), "source-bytes");
  assert.deepEqual(await listFavorites(file), [{ path: copy, kind: "video", missing: false }]);
});

test("a name clash in favorites/ gets a -1, -2 suffix and never overwrites", async (t) => {
  const { home, library, file } = await setup(t);
  const existing = await media(path.join(library, "favorites", "shot.png"), "existing");
  const first = await media(path.join(home, "x", "shot.png"), "first");
  const second = await media(path.join(home, "y", "shot.png"), "second");

  assert.equal((await addFavorite(file, library, first)).path, path.join(library, "favorites", "shot-1.png"));
  assert.equal((await addFavorite(file, library, second)).path, path.join(library, "favorites", "shot-2.png"));
  assert.equal(await readFile(existing, "utf8"), "existing");
  assert.deepEqual((await readdir(path.join(library, "favorites"))).sort(), ["shot-1.png", "shot-2.png", "shot.png"]);
});

test("a file already inside the library is added in place, not copied", async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "h0x-mcp", "a.jpg"));
  assert.deepEqual(await addFavorite(file, library, image), { path: image, added: true, copied: false });
  assert.equal(existsSync(path.join(library, "favorites")), false);
});

test("a sibling folder whose name starts like the library counts as outside", async (t) => {
  const { library, file } = await setup(t);
  const source = await media(`${library}-other${path.sep}a.png`);
  assert.equal((await addFavorite(file, library, source)).copied, true);
});

test("writes are atomic and leave no temp file", async (t) => {
  const { library, file } = await setup(t);
  await addFavorite(file, library, await media(path.join(library, "a.png")));
  await addFavorite(file, library, await media(path.join(library, "b.png")));
  assert.equal(existsSync(`${file}.tmp`), false);
  assert.equal(JSON.parse(await readFile(file, "utf8")).length, 2);
});

test("a failed write leaves the previous file intact", async (t) => {
  const { library, file } = await setup(t);
  await addFavorite(file, library, await media(path.join(library, "a.png")));
  const before = await readFile(file, "utf8");
  await mkdir(`${file}.tmp`);

  await assert.rejects(addFavorite(file, library, await media(path.join(library, "b.png"))));
  assert.equal(await readFile(file, "utf8"), before);
});

test("a corrupt favorites.json is kept as .bak, never deleted", async (t) => {
  const { library, file } = await setup(t);
  await media(file, "{ not json");
  assert.deepEqual(await listFavorites(file), []);
  assert.equal(await readFile(`${file}.bak`, "utf8"), "{ not json");

  await addFavorite(file, library, await media(path.join(library, "a.png")));
  assert.equal((await listFavorites(file)).length, 1);
});
