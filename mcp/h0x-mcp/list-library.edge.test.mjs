// Edge-case tests for R5-CM-2: list_library default limit 10, compact rows unless detail: true.
// Run: node --test list-library.edge.test.mjs (from mcp/h0x-mcp)
// Spawns index.mjs over stdio with fake home directories (H0X_TEST_TMP, else the OS temp dir). No network.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const homes = [];
const clients = [];

async function makeHome(prefix) {
  const base = process.env.H0X_TEST_TMP || tmpdir();
  await mkdir(base, { recursive: true });
  const home = await mkdtemp(path.join(base, prefix));
  homes.push(home);
  return home;
}

async function connect(home) {
  const client = new Client({ name: "list-library-edge-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { HOME: home, USERPROFILE: home }, stderr: "ignore" }));
  clients.push(client);
  return client;
}

const callWith = (client) => async (args) => {
  const res = await client.callTool({ name: "list_library", arguments: args }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
  const out = res.content.map((c) => c.text).join("\n");
  return { isError: res.isError, out, lines: out.split("\n") };
};

let lib;
let full; // library with 11 media files plus noise
let empty; // home with no library folder at all
let fullClient;

before(async () => {
  const home = await makeHome("h0x-ll-edge-");
  lib = path.join(home, "Artcraft", "downloads");
  // 11 media files (one more than the default), newest first by index; names include spaces and unicode.
  const names = ["a 0.png", "b1.PNG", "c2.mp4", "sub/d3.webm", "sub/deep/e4.jpg", "f 5.MOV", "ünï6.webp", "g7.gif", "h8.jpeg", "i9.mp4", "j10.png"];
  for (let i = 0; i < names.length; i++) {
    const file = path.join(lib, ...names[i].split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.alloc(i));
    const t = new Date(Date.now() - (i + 1) * 60_000);
    await utimes(file, t, t);
  }
  // Noise that must never be listed: non-media files, and a folder whose name looks like media.
  await writeFile(path.join(lib, "notes.txt"), "x");
  await writeFile(path.join(lib, "noext"), "x");
  await mkdir(path.join(lib, "folder.png"), { recursive: true });
  const newest = new Date(Date.now());
  await writeFile(path.join(lib, "newer.txt"), "x");
  await utimes(path.join(lib, "newer.txt"), newest, newest);
  fullClient = await connect(home);
  full = callWith(fullClient);
  empty = callWith(await connect(await makeHome("h0x-ll-empty-")));
});

after(async () => {
  await Promise.all(clients.map((c) => c.close().catch(() => {})));
  await Promise.all(homes.map((h) => rm(h, { recursive: true, force: true })));
});

const rowsOf = (lines) => lines.slice(1).map((r) => r.split(" | "));

test("missing library folder: a plain message, not an error, for default and each kind", async () => {
  const all = await empty({});
  assert.equal(all.isError, false);
  assert.match(all.out, /^No media in .*downloads\.$/);
  assert.match((await empty({ kind: "video" })).out, /^No videos in /);
  assert.match((await empty({ kind: "image", detail: true, limit: 200 })).out, /^No images in /);
});

test("11 media files: header counts all 11, default shows exactly 10 compact rows, noise ignored", async () => {
  const { isError, lines } = await full({});
  assert.equal(isError, false);
  assert.match(lines[0], /^11 file\(s\) in .*, newest first:$/);
  const rows = rowsOf(lines);
  assert.equal(rows.length, 10);
  for (const r of rows) {
    assert.equal(r.length, 2, r.join(" | "));
    assert.ok(["image", "video"].includes(r[1]), r[1]);
    assert.ok(!/bytes|\d{4}-\d\d-\d\dT/.test(r.join(" | ")), "compact row leaks size or time");
  }
  assert.ok(!lines.some((l) => /notes\.txt|noext|newer\.txt|folder\.png$/.test(l)));
  // Oldest file is the one cut by the default limit.
  assert.ok(!lines.some((l) => l.includes("j10.png")));
});

test("compact rows keep absolute Windows-style paths with spaces, unicode and uppercase extensions", async () => {
  const rows = rowsOf((await full({})).lines);
  assert.deepEqual(rows.slice(0, 7), [
    [path.join(lib, "a 0.png"), "image"],
    [path.join(lib, "b1.PNG"), "image"],
    [path.join(lib, "c2.mp4"), "video"],
    [path.join(lib, "sub", "d3.webm"), "video"],
    [path.join(lib, "sub", "deep", "e4.jpg"), "image"],
    [path.join(lib, "f 5.MOV"), "video"],
    [path.join(lib, "ünï6.webp"), "image"],
  ]);
  for (const [p] of rows) assert.ok(path.isAbsolute(p), p);
});

test("detail: false explicitly equals the default output", async () => {
  assert.equal((await full({ detail: false })).out, (await full({})).out);
  assert.equal((await full({ detail: false, limit: 10, kind: "all" })).out, (await full({})).out);
});

test("detail: true keeps the default limit of 10 and adds size and ISO time to every row", async () => {
  const { lines } = await full({ detail: true });
  const rows = rowsOf(lines);
  assert.equal(rows.length, 10);
  rows.forEach(([, , size, created], i) => {
    assert.equal(size, `${i} bytes`);
    assert.equal(new Date(created).toISOString(), created);
  });
  assert.equal(rows[0][2], "0 bytes", "zero-byte file is still listed with its size");
});

test("compact output is much smaller than detailed output for the same rows", async () => {
  const compact = (await full({ limit: 200 })).out;
  const detailed = (await full({ limit: 200, detail: true })).out;
  assert.ok(compact.length < detailed.length * 0.75, `${compact.length} vs ${detailed.length}`);
});

test("limit boundaries: 1 and 200 accepted; a limit above the match count returns all matches", async () => {
  const one = rowsOf((await full({ limit: 1 })).lines);
  assert.deepEqual(one, [[path.join(lib, "a 0.png"), "image"]]);
  assert.equal(rowsOf((await full({ limit: 200 })).lines).length, 11);
  assert.equal(rowsOf((await full({ limit: 11 })).lines).length, 11);
  const videos = await full({ kind: "video", limit: 200 });
  assert.match(videos.lines[0], /^4 file\(s\)/);
  assert.equal(rowsOf(videos.lines).length, 4);
});

test("kind filter applies before the limit, header counts only that kind", async () => {
  const images = await full({ kind: "image" });
  assert.match(images.lines[0], /^7 file\(s\)/);
  const rows = rowsOf(images.lines);
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r[1] === "image" && r.length === 2));
});

test("schema rejects bad limit, detail and kind values", async () => {
  const bad = [
    { limit: 0 }, { limit: 201 }, { limit: 500 }, { limit: -10 }, { limit: 1.5 }, { limit: "10" }, { limit: null },
    { limit: Number.MAX_SAFE_INTEGER },
    { detail: "true" }, { detail: 1 }, { detail: 0 }, { detail: null },
    { kind: "audio" }, { kind: "" }, { kind: "VIDEO" },
  ];
  for (const args of bad) {
    const res = await full(args);
    assert.equal(res.isError, true, JSON.stringify(args));
    assert.ok(!/ file\(s\) in /.test(res.out), `listed files for ${JSON.stringify(args)}`);
  }
});

test("advertised schema: limit 1..200 default 10, detail boolean default false; no third-party brand in text", async () => {
  const { tools } = await fullClient.listTools();
  const tool = tools.find((t) => t.name === "list_library");
  assert.ok(tool, "list_library is registered");
  const { limit, detail, kind } = tool.inputSchema.properties;
  assert.equal(limit.type, "integer");
  assert.equal(limit.default, 10);
  assert.equal(limit.minimum, 1);
  assert.equal(limit.maximum, 200);
  assert.equal(detail.type, "boolean");
  assert.equal(detail.default, false);
  assert.deepEqual(kind.enum, ["image", "video", "all"]);
  assert.ok(!(tool.inputSchema.required || []).length, "all list_library args are optional");
  assert.match(tool.description, /detail/);
  const visible = [tool.description, (await full({})).out, (await full({ detail: true })).out, (await empty({})).out].join("\n");
  assert.ok(!/LTX|Lightricks/i.test(visible), "brand leak in list_library text");
});
