// R5-CM-3 edge cases: the plugin bundle matches index.mjs, schemas keep their shape,
// instructions and descriptions carry no paths, keys or brand words, and the how-to
// text that left the descriptions still lives in EXPLAINER.md.
// Run: node --test descriptions.edge.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "index.mjs");
const BUNDLE = path.join(HERE, "..", "..", "plugin", "server", "h0x-mcp.mjs");
const BRAND_LEAK = /LTX|Lightricks|ArtCraft|Artcraft|ARTCRAFT|getartcraft|storyteller\.ai|fakeyou/i;
const PATH_LEAK = /~[\\/]|[A-Za-z]:\\|\/Users\/|\/home\/|\\\\/;
const FAKE_KEYS = { BYTEPLUS_API_KEY: "bp-secret-123456", FAL_KEY: "fal-secret-654321" };

// Input property names and required fields after CM-1/CM-2; CM-3 must not change them.
const SCHEMAS = {
  add_favorite: [["path"], ["path"]],
  create_explainer: [["name", "script"], ["name", "script"]],
  generate_image: [["prompt", "size", "reference_image_paths", "file_name"], ["prompt"]],
  generate_video: [["prompt", "image_path", "provider", "duration_seconds", "resolution", "model", "file_name"], ["prompt"]],
  list_favorites: [[], []],
  list_library: [["kind", "limit", "detail"], []],
  list_recent: [["limit"], []],
  list_video_providers: [[], []],
  open_library: [[], []],
  provider_status: [[], []],
  qa_explainer: [["name", "times", "full", "image"], ["name"]],
  render_explainer: [["name", "mode", "from", "to"], ["name"]],
};

const homes = [];
const clients = [];

async function connect(entry, extraEnv = {}) {
  const home = await mkdtemp(path.join(tmpdir(), "h0x-mcp-desc-edge-"));
  homes.push(home);
  // Only a fake home and optional fake keys: real provider keys from the shell never reach the server.
  const env = { HOME: home, USERPROFILE: home, ...extraEnv };
  const client = new Client({ name: "h0x-mcp-edge-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: "ignore" }));
  clients.push(client);
  return client;
}

let src;
let bundle;
let keyed;
let srcTools;

before(async () => {
  [src, bundle, keyed] = await Promise.all([connect(SERVER), connect(BUNDLE), connect(SERVER, FAKE_KEYS)]);
  srcTools = (await src.listTools()).tools;
});

after(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await Promise.all(homes.map((h) => rm(h, { recursive: true, force: true })));
});

const byName = (tools) => Object.fromEntries(tools.map((t) => [t.name, t]));

test("plugin bundle sends the same instructions as index.mjs", () => {
  assert.equal(bundle.getInstructions(), src.getInstructions());
});

test("plugin bundle lists the same tools, descriptions and schemas as index.mjs", async () => {
  const b = byName((await bundle.listTools()).tools);
  const s = byName(srcTools);
  assert.deepEqual(Object.keys(b).sort(), Object.keys(s).sort());
  for (const name of Object.keys(s)) {
    assert.equal(b[name].description, s[name].description, `${name}: bundle description is stale`);
    assert.deepEqual(b[name].inputSchema, s[name].inputSchema, `${name}: bundle schema differs`);
  }
});

test("plugin bundle holds none of the old multi-sentence descriptions", async () => {
  const text = await readFile(BUNDLE, "utf8");
  assert.doesNotMatch(text, /Explainer Studio step [123]\./);
  assert.doesNotMatch(text, /Waits for the result and saves an \.mp4 locally/);
});

test("input schemas keep their property names and required fields", () => {
  const s = byName(srcTools);
  assert.deepEqual(Object.keys(s).sort(), Object.keys(SCHEMAS).sort());
  for (const [name, [props, required]] of Object.entries(SCHEMAS)) {
    const schema = s[name].inputSchema;
    assert.equal(schema.type, "object", `${name}: schema type`);
    assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), [...props].sort(), `${name}: properties`);
    assert.deepEqual([...(schema.required ?? [])].sort(), [...required].sort(), `${name}: required`);
  }
});

test("instructions are one tidy paragraph with no paths or brand words", () => {
  const s = src.getInstructions();
  assert.equal(s, s.trim(), "no leading or trailing whitespace");
  assert.doesNotMatch(s, /\n/, "no newlines");
  assert.doesNotMatch(s, / {2}/, "no double spaces");
  assert.doesNotMatch(s, PATH_LEAK);
  assert.doesNotMatch(s, BRAND_LEAK);
  assert.ok(s.length <= 600, `instructions are ${s.length} chars`);
});

test("every tool-like name in the instructions is a real tool or input field", () => {
  const s = src.getInstructions();
  const known = new Set([...Object.keys(SCHEMAS), ...Object.values(SCHEMAS).flatMap(([p]) => p)]);
  const names = s.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
  assert.ok(names.length > 0);
  for (const n of names) assert.ok(known.has(n), `instructions name unknown "${n}"`);
});

test("instructions send the agent to provider_status before generating", () => {
  const s = src.getInstructions();
  assert.ok(s.includes("provider_status"));
  assert.ok(s.indexOf("provider_status") < s.indexOf("generate_image"));
  assert.match(s, /EXPLAINER\.md/);
});

test("instructions and descriptions do not change or leak when provider keys are set", async () => {
  const s = keyed.getInstructions();
  assert.equal(s, src.getInstructions());
  const k = byName((await keyed.listTools()).tools);
  for (const t of srcTools) {
    assert.equal(k[t.name].description, t.description, `${t.name}: description depends on env`);
    for (const v of Object.values(FAKE_KEYS)) assert.ok(!k[t.name].description.includes(v), `${t.name}: leaks a key`);
  }
  for (const v of Object.values(FAKE_KEYS)) assert.ok(!s.includes(v), "instructions leak a key");
});

test("descriptions are single-line, trimmed, unique and short, with no paths", () => {
  const seen = new Set();
  for (const { name, description: d } of srcTools) {
    assert.equal(typeof d, "string", `${name}: has a description`);
    assert.equal(d, d.trim(), `${name}: trimmed`);
    assert.doesNotMatch(d, /\n/, `${name}: one line`);
    assert.doesNotMatch(d, / {2}/, `${name}: no double spaces`);
    assert.doesNotMatch(d, PATH_LEAK, `${name}: no home or drive paths`);
    assert.doesNotMatch(d, BRAND_LEAK, `${name}: no brand words`);
    assert.doesNotMatch(d, /^Explainer Studio step/i, `${name}: keyword first, not a step label`);
    assert.ok(d.length >= 20 && d.length <= 300, `${name}: ${d.length} chars`);
    assert.ok(!seen.has(d), `${name}: duplicate description`);
    seen.add(d);
  }
});

test("how-to text cut from the explainer descriptions still lives in EXPLAINER.md", async () => {
  const guide = await readFile(path.join(HERE, "EXPLAINER.md"), "utf8");
  assert.match(guide, /re-speaks only the changed lines/);
  assert.match(guide, /never overwrites `scene\.html`/i);
  assert.match(guide, /Only one Chrome job/);
  assert.match(guide, /mode: "preview"/);
});
