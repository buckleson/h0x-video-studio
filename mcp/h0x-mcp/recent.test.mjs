// Tests for RG-4: list_recent returns the newest My Library images and videos.
// Run: cd mcp/h0x-mcp && node --test recent.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { listRecent } from "./recent.mjs";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");

async function setup(t) {
  const home = await mkdtemp(path.join(tmpdir(), "h0x-recent-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return { home, library: path.join(home, "Artcraft", "downloads") };
}

async function put(file, secondsAgo) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "media");
  const time = new Date(Date.now() - secondsAgo * 1000);
  await utimes(file, time, time);
  return file;
}

async function withServer(home, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { HOME: home, USERPROFILE: home }, stderr: "ignore" });
  const client = new Client({ name: "h0x-recent-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test("newest first, recursing, with only path, kind and created", async (t) => {
  const { library } = await setup(t);
  const old = await put(path.join(library, "old.PNG"), 300);
  const mid = await put(path.join(library, "sub", "mid.mov"), 200);
  const nuevo = await put(path.join(library, "new.jpeg"), 100);

  const recent = await listRecent(library);
  assert.deepEqual(recent.map((r) => r.path), [nuevo, mid, old]);
  assert.deepEqual(recent.map((r) => r.kind), ["image", "video", "image"]);
  for (const r of recent) {
    assert.deepEqual(Object.keys(r).sort(), ["created", "kind", "path"]);
    assert.equal(new Date(r.created).toISOString(), r.created);
  }
});

test("skips files that are not images or videos (same extensions as list_local_media)", async (t) => {
  const { library } = await setup(t);
  await put(path.join(library, "notes.txt"), 1);
  await put(path.join(library, "anim.gif"), 1);
  await put(path.join(library, "clip.mp4.part"), 1);
  await put(path.join(library, "noext"), 1);
  const keep = ["a.png", "b.jpg", "c.jpeg", "d.webp", "e.mp4", "f.webm", "g.mov"];
  for (const name of keep) await put(path.join(library, name), 10);

  assert.deepEqual((await listRecent(library, 50)).map((r) => path.basename(r.path)).sort(), keep);
});

test("returns at most limit entries, 8 by default", async (t) => {
  const { library } = await setup(t);
  for (let i = 0; i < 10; i++) await put(path.join(library, `f${i}.png`), i);

  assert.equal((await listRecent(library)).length, 8);
  assert.deepEqual((await listRecent(library, 2)).map((r) => path.basename(r.path)), ["f0.png", "f1.png"]);
});

test("a missing or empty library dir is an empty list", async (t) => {
  const { library } = await setup(t);
  assert.deepEqual(await listRecent(library), []);
  await mkdir(library, { recursive: true });
  assert.deepEqual(await listRecent(library), []);
});

test("list_recent tool: default limit 8, JSON entries, and limit outside 1..50 is rejected", async (t) => {
  const { home, library } = await setup(t);
  for (let i = 0; i < 9; i++) await put(path.join(library, `f${i}.mp4`), i);

  await withServer(home, async (c) => {
    const { tools } = await c.listTools();
    const tool = tools.find((x) => x.name === "list_recent");
    assert.equal(tool.inputSchema.properties.limit.default, 8);

    const res = await c.callTool({ name: "list_recent", arguments: {} });
    const entries = JSON.parse(res.content[0].text);
    assert.equal(entries.length, 8);
    assert.deepEqual(entries[0], { path: path.join(library, "f0.mp4"), kind: "video", created: entries[0].created });

    for (const limit of [0, 51]) {
      const bad = await c.callTool({ name: "list_recent", arguments: { limit } }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
      assert.equal(bad.isError, true);
    }
  });
});

test("list_recent tool: a missing library is an empty list, not an error", async (t) => {
  const { home } = await setup(t);
  const res = await withServer(home, (c) => c.callTool({ name: "list_recent", arguments: {} }));
  assert.notEqual(res.isError, true);
  assert.deepEqual(JSON.parse(res.content[0].text), []);
});
