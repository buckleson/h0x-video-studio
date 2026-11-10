// Tests for R5-CM-2: list_library defaults to 10 compact rows (path | kind); detail: true adds size and time.
// Run: node --test mcp/h0x-mcp/list-library.test.mjs
// Spawns index.mjs over stdio with a fake home directory (H0X_TEST_TMP, else the OS temp dir).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
let home;
let lib;
let client;

before(async () => {
  const base = process.env.H0X_TEST_TMP || tmpdir();
  await mkdir(base, { recursive: true });
  home = await mkdtemp(path.join(base, "h0x-list-library-"));
  lib = path.join(home, "Artcraft", "downloads");
  for (let i = 0; i < 12; i++) {
    const file = path.join(lib, i % 2 ? "sub" : "", `f${i}.${i % 3 ? "png" : "mp4"}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.alloc(i + 1));
    const t = new Date(Date.now() - i * 10_000);
    await utimes(file, t, t);
  }
  client = new Client({ name: "list-library-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { HOME: home, USERPROFILE: home }, stderr: "ignore" }));
});

after(async () => {
  await client?.close();
  await rm(home, { recursive: true, force: true });
});

const call = async (args) => {
  const res = await client.callTool({ name: "list_library", arguments: args }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
  return { isError: res.isError, lines: res.content.map((c) => c.text).join("\n").split("\n") };
};

test("default: at most 10 rows, newest first, each only path and kind", async () => {
  const { isError, lines } = await call({});
  assert.equal(isError, false);
  assert.match(lines[0], /^12 file\(s\)/);
  const rows = lines.slice(1).map((r) => r.split(" | "));
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((r) => path.basename(r[0])), Array.from({ length: 10 }, (_, i) => `f${i}.${i % 3 ? "png" : "mp4"}`));
  for (const r of rows) {
    assert.equal(r.length, 2, r.join(" | "));
    assert.equal(r[1], r[0].endsWith(".mp4") ? "video" : "image");
  }
});

test("detail: true returns path, kind, size and creation time", async () => {
  const rows = (await call({ detail: true, limit: 2 })).lines.slice(1).map((r) => r.split(" | "));
  assert.equal(rows.length, 2);
  const [file, kind, size, created] = rows[1];
  assert.equal(file, path.join(lib, "sub", "f1.png"));
  assert.equal(kind, "image");
  assert.equal(size, "2 bytes");
  assert.ok(!Number.isNaN(Date.parse(created)), created);
});

test("limit is respected and combines with kind", async () => {
  assert.equal((await call({ limit: 3 })).lines.length, 4);
  assert.equal((await call({ limit: 200 })).lines.length, 13);
  const videos = (await call({ kind: "video", limit: 2 })).lines;
  assert.match(videos[0], /^4 file\(s\)/);
  assert.deepEqual(videos.slice(1).map((r) => path.basename(r.split(" | ")[0])), ["f0.mp4", "f3.mp4"]);
});

test("limit outside 1..200 and a non-boolean detail are rejected", async () => {
  for (const args of [{ limit: 0 }, { limit: 201 }, { limit: -1 }, { limit: 2.5 }, { detail: "yes" }]) {
    assert.equal((await call(args)).isError, true, JSON.stringify(args));
  }
});
