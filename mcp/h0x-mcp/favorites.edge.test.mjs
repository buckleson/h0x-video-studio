// Edge cases for FAV-8 (MCP list_favorites / add_favorite), on top of favorites.test.mjs.
// Run: cd mcp/h0x-mcp && node --test favorites.test.mjs favorites.edge.test.mjs
// Fixtures live in os.tmpdir() (E:\temp on the dev laptop); the MCP cases spawn index.mjs
// with a fake HOME/USERPROFILE, so the real ~/Artcraft is never touched. No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { addFavorite, favoritesFile, listFavorites } from "./favorites.mjs";

const WINDOWS = process.platform === "win32";
const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const BRAND_LEAK = /LTX|Lightricks|ArtCraft|ARTCRAFT|getartcraft|storyteller\.ai|fakeyou/i;

async function setup(t) {
  const home = await mkdtemp(path.join(tmpdir(), "h0x-fav-edge "));
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

const saved = async (file) => JSON.parse(await readFile(file, "utf8"));

// ── Media type rules (same list as the app's store.rs) ──

test("gif is refused even though list_library shows it: the app does not list gif favorites", async (t) => {
  const { library, file } = await setup(t);
  const gif = await media(path.join(library, "loop.gif"));
  await assert.rejects(addFavorite(file, library, gif), /Only images and videos can be favorited/);
  assert.equal(existsSync(file), false);
});

test("extensions are matched case-insensitively and map to the right kind", async (t) => {
  const { library, file } = await setup(t);
  const names = { "a.PNG": "image", "b.Jpg": "image", "c.JPEG": "image", "d.WebP": "image", "e.MP4": "video", "f.WEBM": "video", "g.Mov": "video" };
  for (const name of Object.keys(names)) await addFavorite(file, library, await media(path.join(library, name)));
  const listed = await listFavorites(file);
  assert.deepEqual(listed.map((f) => [path.basename(f.path), f.kind]), Object.entries(names));
  assert.ok(listed.every((f) => f.missing === false));
});

test("a dotfile, a double extension and no extension are not media", async (t) => {
  const { library, file } = await setup(t);
  for (const name of [".png", "clip.mp4.txt", "clip"]) {
    const p = await media(path.join(library, name));
    await assert.rejects(addFavorite(file, library, p), /Only images and videos can be favorited/, name);
  }
  assert.equal(existsSync(file), false);
});

test("the rejection message names the offending path", async (t) => {
  const { library, file } = await setup(t);
  const notes = await media(path.join(library, "notes.txt"));
  await assert.rejects(addFavorite(file, library, notes), (err) => err.message.includes("notes.txt"));
  const gone = path.join(library, "gone.webm");
  await assert.rejects(addFavorite(file, library, gone), (err) => err.message.includes(gone));
});

// ── Input shapes ──

test("null, undefined and whitespace-only paths are rejected as not absolute", async (t) => {
  const { library, file } = await setup(t);
  for (const bad of [null, undefined, "   ", "\t\n"]) {
    await assert.rejects(addFavorite(file, library, bad), /Path must be absolute/, String(bad));
  }
  assert.equal(existsSync(file), false);
});

test("surrounding whitespace is trimmed before the path is stored", async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "a.png"));
  assert.equal((await addFavorite(file, library, `  ${image}\n`)).path, image);
  assert.equal((await saved(file))[0].path, image);
  assert.equal((await addFavorite(file, library, image)).added, false);
});

test("the library folder itself is not a favorite", async (t) => {
  const { library, file } = await setup(t);
  await assert.rejects(addFavorite(file, library, library));
  assert.equal(existsSync(file), false);
});

test("a missing file outside the library is rejected before any copy", async (t) => {
  const { home, library, file } = await setup(t);
  await assert.rejects(addFavorite(file, library, path.join(home, "elsewhere", "gone.png")), /File not found/);
  assert.equal(existsSync(path.join(library, "favorites")), false);
});

test("a non-media file outside the library is not copied", async (t) => {
  const { home, library, file } = await setup(t);
  const doc = await media(path.join(home, "elsewhere", "doc.pdf"), "pdf");
  await assert.rejects(addFavorite(file, library, doc), /Only images and videos/);
  assert.equal(existsSync(path.join(library, "favorites")), false);
  assert.equal(await readFile(doc, "utf8"), "pdf");
});

test("names with spaces and non-ASCII characters are copied byte for byte", async (t) => {
  const { home, library, file } = await setup(t);
  const source = await media(path.join(home, "my clips", "café été 01.webm"), Buffer.from([0, 1, 2, 255]));
  const { path: copy, copied } = await addFavorite(file, library, source);
  assert.equal(copied, true);
  assert.equal(copy, path.join(library, "favorites", "café été 01.webm"));
  assert.deepEqual(await readFile(copy), Buffer.from([0, 1, 2, 255]));
  assert.deepEqual(await readFile(source), Buffer.from([0, 1, 2, 255]));
});

// ── Library boundary and re-adds ──

test("a file already in library/favorites is added in place", async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "favorites", "kept.png"));
  assert.deepEqual(await addFavorite(file, library, image), { path: image, added: true, copied: false });
  assert.deepEqual(await readdir(path.join(library, "favorites")), ["kept.png"]);
});

test("adding the copy's path after an outside add is a no-op", async (t) => {
  const { home, library, file } = await setup(t);
  const source = await media(path.join(home, "out", "a.png"));
  const first = await addFavorite(file, library, source);
  assert.deepEqual(await addFavorite(file, library, first.path), { path: first.path, added: false, copied: false });
  assert.equal((await saved(file)).length, 1);
});

test("re-adding the same outside file makes a new suffixed copy and never touches the first (FAV-2 re-import rule)", async (t) => {
  const { home, library, file } = await setup(t);
  const source = await media(path.join(home, "out", "a.png"), "src");
  const first = await addFavorite(file, library, source);
  const second = await addFavorite(file, library, source);
  assert.equal(first.path, path.join(library, "favorites", "a.png"));
  assert.equal(second.path, path.join(library, "favorites", "a-1.png"));
  assert.equal(await readFile(source, "utf8"), "src");
  assert.equal(await readFile(first.path, "utf8"), "src");
  assert.equal((await saved(file)).length, 2);
});

test("Windows: a library path in other case and with forward slashes counts as inside", { skip: !WINDOWS }, async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "sub", "a.png"));
  const variant = image.toUpperCase().replaceAll("\\", "/");
  const result = await addFavorite(file, library, variant);
  assert.equal(result.copied, false);
  assert.equal(result.path, image.toUpperCase());
  assert.equal(existsSync(path.join(library, "favorites")), false);
});

test("Windows: an outside path with forward slashes is copied and stored with backslashes", { skip: !WINDOWS }, async (t) => {
  const { home, library, file } = await setup(t);
  const source = await media(path.join(home, "out", "b.mov"));
  const result = await addFavorite(file, library, source.replaceAll("\\", "/"));
  assert.equal(result.copied, true);
  assert.equal(result.path, path.join(library, "favorites", "b.mov"));
  assert.ok(!(await saved(file))[0].path.includes("/"));
});

// ── File format shared with the app ──

test("an empty array file lists nothing and is not backed up", async (t) => {
  const { file } = await setup(t);
  await media(file, "[]");
  assert.deepEqual(await listFavorites(file), []);
  assert.equal(existsSync(`${file}.bak`), false);
  assert.equal(await readFile(file, "utf8"), "[]");
});

test("valid JSON in the wrong shape is kept as .bak, like the app's serde failure", async (t) => {
  const { library, file } = await setup(t);
  const image = path.join(library, "a.png");
  const shapes = [
    "{}",
    "null",
    JSON.stringify([{ path: image }]),
    JSON.stringify([{ path: image, added_at: "not a date" }]),
    JSON.stringify([{ path: 42, added_at: "2026-11-01T10:00:00Z" }]),
  ];
  for (const shape of shapes) {
    await media(file, shape);
    assert.deepEqual(await listFavorites(file), [], shape);
    assert.equal(await readFile(`${file}.bak`, "utf8"), shape, shape);
    assert.equal(existsSync(file), false, shape);
  }
});

test("app entries of a kind the MCP does not list stay in the file after an add", async (t) => {
  const { library, file } = await setup(t);
  const old = { path: path.join(library, "old.gif"), added_at: "2026-10-01T00:00:00Z" };
  const extra = { path: path.join(library, "x.png"), added_at: "2026-10-02T00:00:00+02:00" };
  await media(extra.path);
  await media(file, JSON.stringify([old, extra]));
  assert.deepEqual((await listFavorites(file)).map((f) => f.path), [extra.path]);

  await addFavorite(file, library, await media(path.join(library, "new.mp4")));
  const after = await saved(file);
  assert.deepEqual(after.slice(0, 2), [old, extra]);
  assert.equal(after.length, 3);
});

test("new entries are appended in add order with ISO UTC timestamps the app can parse", async (t) => {
  const { library, file } = await setup(t);
  const names = ["1.png", "2.mp4", "3.webp"];
  for (const n of names) await addFavorite(file, library, await media(path.join(library, n)));
  const entries = await saved(file);
  assert.deepEqual(entries.map((e) => path.basename(e.path)), names);
  const times = entries.map((e) => Date.parse(e.added_at));
  assert.ok(times.every((ms, i) => Number.isFinite(ms) && (i === 0 || ms >= times[i - 1])));
  assert.ok(entries.every((e) => e.added_at.endsWith("Z")));
});

test("the settings folder is created on the first add when it does not exist", async (t) => {
  const { library, file } = await setup(t);
  assert.equal(existsSync(path.dirname(file)), false);
  await addFavorite(file, library, await media(path.join(library, "a.png")));
  assert.equal((await saved(file)).length, 1);
  assert.deepEqual((await readdir(path.dirname(file))).sort(), ["favorites.json"]);
});

test("a rejected add leaves an existing favorites.json byte for byte", async (t) => {
  const { library, file } = await setup(t);
  await addFavorite(file, library, await media(path.join(library, "a.png")));
  const before = await readFile(file, "utf8");
  await assert.rejects(addFavorite(file, library, await media(path.join(library, "b.txt"))));
  await assert.rejects(addFavorite(file, library, path.join(library, "gone.png")));
  await assert.rejects(addFavorite(file, library, "rel.png"));
  assert.equal(await readFile(file, "utf8"), before);
});

test("list_favorites never writes: missing files are reported, not pruned", async (t) => {
  const { library, file } = await setup(t);
  const image = await media(path.join(library, "a.png"));
  await addFavorite(file, library, image);
  await rm(image);
  const before = await readFile(file, "utf8");
  assert.deepEqual(await listFavorites(file), [{ path: image, kind: "image", missing: true }]);
  assert.equal(await readFile(file, "utf8"), before);
});

// ── The MCP tools over stdio (index.mjs registration) ──

async function withServer(home, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { HOME: home, USERPROFILE: home }, stderr: "ignore" });
  const client = new Client({ name: "h0x-fav-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

const textOf = (res) => res.content.map((c) => c.text).join("\n");

test("MCP: list_favorites and add_favorite end to end against a fake home", async (t) => {
  const { home, library } = await setup(t);
  const settings = path.join(home, "Artcraft", "settings", "favorites.json");
  const inside = await media(path.join(library, "h0x-mcp", "in.png"));
  const outside = await media(path.join(home, "Desktop", "out.mp4"), "out");
  const notes = await media(path.join(library, "notes.txt"));

  await withServer(home, async (c) => {
    assert.equal(textOf(await c.callTool({ name: "list_favorites", arguments: {} })), "No favorites yet.");
    assert.equal(existsSync(settings), false, "listing creates nothing");

    const added = await c.callTool({ name: "add_favorite", arguments: { path: inside } });
    assert.ok(!added.isError);
    assert.equal(textOf(added), `Added to favorites: ${inside}`);
    assert.equal(textOf(await c.callTool({ name: "add_favorite", arguments: { path: inside } })), `Already a favorite: ${inside}`);

    const copy = path.join(library, "favorites", "out.mp4");
    assert.equal(textOf(await c.callTool({ name: "add_favorite", arguments: { path: outside } })), `Copied to ${copy} and added to favorites.`);
    assert.equal(await readFile(outside, "utf8"), "out");

    const bad = await c.callTool({ name: "add_favorite", arguments: { path: notes } });
    assert.equal(bad.isError, true);
    assert.match(textOf(bad), /Only images and videos can be favorited/);

    const missing = await c.callTool({ name: "add_favorite", arguments: { path: path.join(library, "gone.mov") } });
    assert.equal(missing.isError, true);
    assert.match(textOf(missing), /File not found/);

    await rm(inside);
    assert.deepEqual(textOf(await c.callTool({ name: "list_favorites", arguments: {} })).split("\n"), [
      `${inside} | image | missing`,
      `${copy} | video | ok`,
    ]);
  });
  assert.equal((await saved(settings)).length, 2);
  assert.equal(existsSync(`${settings}.tmp`), false);
});

test("MCP: add_favorite rejects an empty or missing path argument through zod", async (t) => {
  const { home } = await setup(t);
  await withServer(home, async (c) => {
    for (const args of [{}, { path: "" }, { path: 5 }]) {
      const res = await c.callTool({ name: "add_favorite", arguments: args }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
      assert.equal(res.isError, true, JSON.stringify(args));
    }
  });
  assert.equal(existsSync(path.join(home, "Artcraft", "settings")), false);
});

test("MCP: favorites tool descriptions are one keyword-first sentence with no third-party branding", async (t) => {
  const { home } = await setup(t);
  const { tools } = await withServer(home, (c) => c.listTools());
  for (const name of ["list_favorites", "add_favorite"]) {
    const tool = tools.find((x) => x.name === name);
    assert.ok(tool, `${name} is registered`);
    const d = tool.description;
    assert.doesNotMatch(d, BRAND_LEAK, name);
    assert.match(d, /^[A-Z]/, name);
    assert.match(d, /\.$/, name);
    assert.equal(d.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length, 1, `${name}: one sentence`);
    assert.match(d.split(/\s+/).slice(0, 3).join(" "), /favorite/i, `${name}: keyword first`);
  }
  const add = tools.find((x) => x.name === "add_favorite");
  assert.deepEqual(add.inputSchema.required, ["path"]);
});

test("MCP: fixed tool messages carry no third-party branding", async (t) => {
  const { home } = await setup(t);
  const out = await withServer(home, async (c) => textOf(await c.callTool({ name: "list_favorites", arguments: {} })));
  assert.doesNotMatch(out, BRAND_LEAK);
});
