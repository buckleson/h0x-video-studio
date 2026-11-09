// Edge cases for RG-4 (MCP list_recent), on top of recent.test.mjs.
// Run: cd mcp/h0x-mcp && node --test recent.test.mjs recent.edge.test.mjs
// Fixtures live in os.tmpdir() (E:\temp on the dev laptop); the MCP cases spawn index.mjs
// with a fake HOME/USERPROFILE, so the real ~/Artcraft is never touched. No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { listRecent } from "./recent.mjs";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const BRAND_LEAK = /LTX|Lightricks|ArtCraft|ARTCRAFT|getartcraft|storyteller\.ai|fakeyou/i;
const names = (entries) => entries.map((r) => path.basename(r.path));

// A home with a space in it, like "C:\Users\First Last", to catch quoting/path bugs.
async function setup(t) {
  const home = await mkdtemp(path.join(tmpdir(), "h0x-recent edge "));
  t.after(() => rm(home, { recursive: true, force: true }));
  return { home, library: path.join(home, "Artcraft", "downloads") };
}

async function put(file, secondsAgo = 1) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "media");
  const time = new Date(Date.now() - secondsAgo * 1000);
  await utimes(file, time, time);
  return file;
}

async function withServer(home, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { HOME: home, USERPROFILE: home }, stderr: "ignore" });
  const client = new Client({ name: "h0x-recent-edge-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

const call = (c, args) => c.callTool({ name: "list_recent", arguments: args }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));

// ── Extensions: same rules as list_local_media_command.rs (media_kind) ──

test("extensions match in any case", async (t) => {
  const { library } = await setup(t);
  const files = ["a.PNG", "b.Jpg", "c.JPEG", "d.WebP", "e.MP4", "f.WEBM", "g.MoV"];
  for (const f of files) await put(path.join(library, f));
  const recent = await listRecent(library, 50);
  assert.deepEqual(names(recent).sort(), files);
  assert.deepEqual(Object.fromEntries(recent.map((r) => [path.basename(r.path), r.kind])), {
    "a.PNG": "image", "b.Jpg": "image", "c.JPEG": "image", "d.WebP": "image", "e.MP4": "video", "f.WEBM": "video", "g.MoV": "video",
  });
});

test("only the last extension counts; look-alikes, dotfiles and other media are skipped", async (t) => {
  const { library } = await setup(t);
  const skip = ["clip.mp4.txt", "photo.gif", "movie.mkv", "image.bmp", "anim.avi", "noext", ".png", "trailing.", "mp4", "clip.mp4.part"];
  for (const f of skip) await put(path.join(library, f));
  await put(path.join(library, "archive.txt.png"));
  assert.deepEqual(names(await listRecent(library, 50)), ["archive.txt.png"]);
});

test("a folder named like media is recursed into, not listed", async (t) => {
  const { library } = await setup(t);
  const inner = await put(path.join(library, "folder.mp4", "inner.webm"));
  const recent = await listRecent(library, 50);
  assert.deepEqual(recent.map((r) => r.path), [inner]);
});

test("deeply nested files and the h0x-mcp output folder are included", async (t) => {
  const { library } = await setup(t);
  const deep = await put(path.join(library, "a", "b", "c", "d", "deep.png"), 20);
  const mcp = await put(path.join(library, "h0x-mcp", "gen.mp4"), 10);
  assert.deepEqual((await listRecent(library)).map((r) => r.path), [mcp, deep]);
});

test("unicode and spaced file names keep their absolute Windows-style path", async (t) => {
  const { library } = await setup(t);
  const file = await put(path.join(library, "My Clips", "café ünïcode 01.mp4"));
  const [entry] = await listRecent(library);
  assert.equal(entry.path, file);
  assert.ok(path.isAbsolute(entry.path));
  if (process.platform === "win32") assert.ok(!entry.path.includes("/"), `expected backslashes: ${entry.path}`);
});

// ── Ordering, limit and timestamps ──

test("created is the file mtime in ISO 8601 (UTC, ms)", async (t) => {
  const { library } = await setup(t);
  const file = path.join(library, "x.png");
  await mkdir(library, { recursive: true });
  await writeFile(file, "media");
  const when = new Date("2024-02-29T12:34:56.000Z");
  await utimes(file, when, when);
  const [entry] = await listRecent(library);
  assert.equal(entry.created, "2024-02-29T12:34:56.000Z");
  assert.match(entry.created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("limit 1 gives only the newest; a limit larger than the library gives everything", async (t) => {
  const { library } = await setup(t);
  for (let i = 0; i < 3; i++) await put(path.join(library, `f${i}.jpg`), (i + 1) * 10);
  assert.deepEqual(names(await listRecent(library, 1)), ["f0.jpg"]);
  assert.deepEqual(names(await listRecent(library, 50)), ["f0.jpg", "f1.jpg", "f2.jpg"]);
});

test("limit 50 caps a library of 51 files at the 50 newest", async (t) => {
  const { library } = await setup(t);
  for (let i = 0; i < 51; i++) await put(path.join(library, `f${String(i).padStart(2, "0")}.png`), (i + 1) * 10);
  const recent = await listRecent(library, 50);
  assert.equal(recent.length, 50);
  assert.equal(path.basename(recent[0].path), "f00.png");
  assert.ok(!names(recent).includes("f50.png"), "the oldest file is dropped");
});

test("skipped files do not use up the limit", async (t) => {
  const { library } = await setup(t);
  for (let i = 0; i < 10; i++) await put(path.join(library, `n${i}.txt`), i);
  await put(path.join(library, "old.png"), 1000);
  assert.deepEqual(names(await listRecent(library, 1)), ["old.png"]);
});

test("files with the same mtime are all returned without error", async (t) => {
  const { library } = await setup(t);
  await mkdir(library, { recursive: true });
  const when = new Date("2025-01-01T00:00:00.000Z");
  for (const f of ["a.png", "b.png", "c.png"]) {
    await writeFile(path.join(library, f), "media");
    await utimes(path.join(library, f), when, when);
  }
  const recent = await listRecent(library);
  assert.deepEqual(names(recent).sort(), ["a.png", "b.png", "c.png"]);
  assert.equal(new Set(recent.map((r) => r.created)).size, 1);
});

// ── Missing / odd library dirs ──

test("a library path that is a file, not a folder, is an empty list", async (t) => {
  const { home } = await setup(t);
  const notDir = await put(path.join(home, "downloads.png"));
  assert.deepEqual(await listRecent(notDir), []);
});

test("a folder holding only empty subfolders and non-media is an empty list", async (t) => {
  const { library } = await setup(t);
  await mkdir(path.join(library, "empty", "nested"), { recursive: true });
  await put(path.join(library, "notes.md"));
  assert.deepEqual(await listRecent(library), []);
});

test("a dangling symlink in the library is skipped, not an error", async (t) => {
  const { library } = await setup(t);
  await mkdir(library, { recursive: true });
  try {
    await symlink(path.join(library, "gone.mp4"), path.join(library, "link.mp4"), "file");
  } catch (e) {
    if (e.code === "EPERM" || e.code === "EACCES") return t.skip("symlinks need developer mode on Windows");
    throw e;
  }
  const real = await put(path.join(library, "real.png"));
  assert.deepEqual((await listRecent(library)).map((r) => r.path), [real]);
});

// ── MCP tool: schema, description, output ──

test("list_recent schema: integer limit 1..50, default 8, and a keyword-first, brand-clean description", async (t) => {
  const { home } = await setup(t);
  await withServer(home, async (c) => {
    const tool = (await c.listTools()).tools.find((x) => x.name === "list_recent");
    assert.ok(tool, "list_recent is registered");
    const limit = tool.inputSchema.properties.limit;
    assert.equal(limit.type, "integer");
    assert.equal(limit.minimum, 1);
    assert.equal(limit.maximum, 50);
    assert.equal(limit.default, 8);
    assert.ok(!(tool.inputSchema.required ?? []).includes("limit"), "limit is optional");

    const d = tool.description;
    assert.match(d, /^Recent\b/, "keyword-first");
    assert.equal(d.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length, 1, `one sentence: ${d}`);
    assert.doesNotMatch(d, BRAND_LEAK);
  });
});

test("list_recent rejects bad limits: 0, -1, 51, 2.5, a string, null", async (t) => {
  const { home, library } = await setup(t);
  await put(path.join(library, "a.png"));
  await withServer(home, async (c) => {
    for (const limit of [0, -1, 51, 1000, 2.5, "5", null]) {
      const res = await call(c, { limit });
      assert.equal(res.isError, true, `limit ${JSON.stringify(limit)} should be rejected`);
    }
  });
});

test("list_recent accepts the boundaries 1 and 50", async (t) => {
  const { home, library } = await setup(t);
  for (let i = 0; i < 3; i++) await put(path.join(library, `f${i}.webp`), (i + 1) * 10);
  await withServer(home, async (c) => {
    const one = await call(c, { limit: 1 });
    assert.notEqual(one.isError, true);
    assert.deepEqual(names(JSON.parse(one.content[0].text)), ["f0.webp"]);
    const fifty = await call(c, { limit: 50 });
    assert.notEqual(fifty.isError, true);
    assert.equal(JSON.parse(fifty.content[0].text).length, 3);
  });
});

test("list_recent over MCP returns only path, kind, created, skipping non-media", async (t) => {
  const { home, library } = await setup(t);
  await put(path.join(library, "skip.gif"), 1);
  await put(path.join(library, "skip.txt"), 1);
  const img = await put(path.join(library, "sub", "img.jpeg"), 20);
  const vid = await put(path.join(library, "vid.mov"), 10);
  await withServer(home, async (c) => {
    const res = await call(c, {});
    assert.notEqual(res.isError, true);
    const entries = JSON.parse(res.content[0].text);
    assert.deepEqual(entries.map((e) => [e.path, e.kind]), [[vid, "video"], [img, "image"]]);
    for (const e of entries) assert.deepEqual(Object.keys(e).sort(), ["created", "kind", "path"]);
  });
});

test("list_recent over MCP with an empty library dir is [] text, not an error", async (t) => {
  const { home, library } = await setup(t);
  await mkdir(library, { recursive: true });
  await withServer(home, async (c) => {
    const res = await call(c, { limit: 5 });
    assert.notEqual(res.isError, true);
    assert.equal(res.content[0].text, "[]");
  });
});
