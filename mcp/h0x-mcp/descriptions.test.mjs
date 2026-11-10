// R5-CM-3: the server sends short instructions with the tool order, and every tool
// description is one sentence that starts with its keyword.
// Run: node --test descriptions.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const BRAND_LEAK = /LTX|Lightricks|ArtCraft|ARTCRAFT|getartcraft|storyteller\.ai|fakeyou/i;
const TOOLS = [
  "add_favorite", "create_explainer", "generate_image", "generate_video", "list_favorites", "list_library",
  "list_recent", "list_video_providers", "open_library", "provider_status", "qa_explainer", "render_explainer",
];

let home;
let client;

before(async () => {
  home = await mkdtemp(path.join(tmpdir(), "h0x-mcp-desc-"));
  const env = { HOME: home, USERPROFILE: home };
  client = new Client({ name: "h0x-mcp-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env, stderr: "ignore" }));
});

after(async () => {
  await client.close();
  await rm(home, { recursive: true, force: true });
});

test("instructions are short and name the create, qa, render and image, video order", () => {
  const s = client.getInstructions();
  assert.equal(typeof s, "string");
  assert.ok(s.length > 0 && s.length <= 600, `instructions are ${s.length} chars`);
  assert.doesNotMatch(s, BRAND_LEAK);
  const at = (name) => {
    const i = s.indexOf(name);
    assert.ok(i >= 0, `instructions name ${name}`);
    return i;
  };
  assert.ok(at("create_explainer") < at("qa_explainer"), "create before qa");
  assert.ok(at("qa_explainer") < at("render_explainer"), "qa before render");
  assert.ok(at("generate_image") < at("generate_video"), "image before video");
});

test("tool names are unchanged", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
});

test("every tool description is one sentence that starts with its keyword", async () => {
  const { tools } = await client.listTools();
  for (const { name, description: d } of tools) {
    assert.match(d, /^[A-Z]/, `${name}: capitalised`);
    assert.match(d, /\.$/, `${name}: ends with a period`);
    assert.equal(d.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length, 1, `${name}: one sentence: ${d}`);
    const keyword = d.split(/[\s:,]/)[0].toLowerCase().replace(/s$/, "");
    const parts = name.split("_").map((p) => p.replace(/s$/, ""));
    assert.ok(parts.includes(keyword), `${name}: starts with a keyword from its name, got "${keyword}"`);
    assert.doesNotMatch(d, BRAND_LEAK, name);
  }
});
