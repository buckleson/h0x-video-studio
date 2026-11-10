// Edge cases for R5-CM-1: qa_explainer attaches the contact-sheet image only on warnings/errors or image: true.
// Run: node --test qa-explainer-image.edge.test.mjs   (from mcp/h0x-mcp)
// The schema, error-path and branding cases need no Chrome. The render cases skip without Chrome.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { findChrome } from "./explainer/engine.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "index.mjs");
const noChrome = findChrome() ? false : "Chrome not found";
const BRAND_LEAK = /LTX|Lightricks|ArtCraft|ARTCRAFT|getartcraft|storyteller\.ai|fakeyou/i;

const scene = (body, extra = "") => `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/engine/h0x.css">
<div id="stage"><section class="scene" id="s1" style="visibility:visible">${body}</section></div>
<script src="/engine/gsap.min.js"></script><script src="build/timings.js"></script><script src="/engine/h0x.js"></script>
${extra}<script>H0X.boot({});</script>`;

const CLEAN = scene(`<h1 style="position:absolute;left:600px;top:400px;font-size:80px">All clear</h1>`);
// Overlapping text AND a missing script: both warnings and errors in one pass.
const BOTH = scene(`<h1 style="position:absolute;left:200px;top:200px;font-size:80px">Overlapping one</h1>
  <h2 style="position:absolute;left:220px;top:230px;font-size:80px">Overlapping two</h2>`, `<script src="missing.js"></script>\n`);

let scratch, work;

before(async () => {
  // A space in the path checks that Windows paths with spaces survive the report.
  scratch = await mkdtemp(path.join(process.env.H0X_TEST_TMP || tmpdir(), "h0x qa edge-"));
  work = path.join(scratch, "projects");
  for (const [name, html] of [["clean", CLEAN], ["both", BOTH]]) {
    await mkdir(path.join(work, name, "build"), { recursive: true });
    await writeFile(path.join(work, name, "build", "timings.js"), "window.TIMINGS={lines:[],total:2}");
    await writeFile(path.join(work, name, "scene.html"), html);
  }
});

after(async () => {
  await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
});

async function withServer(extraEnv, fn) {
  const env = { ...process.env, H0X_EXPLAINER_DIR: work, H0X_EXPLAINER_LIBRARY_DIR: path.join(scratch, "library"), ...extraEnv };
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env, stderr: "ignore" });
  const client = new Client({ name: "qa-image-edge-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

const rejected = (e) => ({ isError: true, content: [{ type: "text", text: e.message }] });
const qa = (c, args) =>
  c.callTool({ name: "qa_explainer", arguments: { times: [1], ...args } }, undefined, { timeout: 300000 }).catch(rejected);
const textOf = (res) => res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
const images = (res) => res.content.filter((c) => c.type === "image");
const sheetPath = (res) => textOf(res).match(/^Contact sheet: (.+)$/m)?.[1];

// ── No Chrome needed ──

test("qa_explainer declares image as an optional boolean", async () => {
  const { tools } = await withServer({}, (c) => c.listTools());
  const tool = tools.find((t) => t.name === "qa_explainer");
  assert.ok(tool, "qa_explainer is registered");
  const prop = tool.inputSchema.properties.image;
  assert.equal(prop?.type, "boolean");
  assert.ok(!(tool.inputSchema.required ?? []).includes("image"), "image must not be required");
  assert.equal(prop.default, undefined, "image has no default, so omitting it means auto");
});

test("the qa_explainer description and image hint say when the image is attached, with no third-party branding", async () => {
  const { tools } = await withServer({}, (c) => c.listTools());
  const tool = tools.find((t) => t.name === "qa_explainer");
  assert.match(tool.description, /contact sheet/i);
  assert.match(tool.description, /warnings or errors/i);
  assert.match(tool.description, /image is true/i);
  for (const s of [tool.description, tool.inputSchema.properties.image.description ?? ""]) {
    assert.doesNotMatch(s, BRAND_LEAK);
  }
});

test("a non-boolean image value is rejected by the schema", async () => {
  await withServer({}, async (c) => {
    for (const image of ["yes", "true", 1, 0, null, []]) {
      const res = await qa(c, { name: "clean", image });
      assert.equal(res.isError, true, `image ${JSON.stringify(image)} should be rejected`);
      assert.equal(images(res).length, 0);
    }
  });
});

test("image: true on a missing project fails with text only, no image", async () => {
  const res = await withServer({}, (c) => qa(c, { name: "no-such-project", image: true }));
  assert.equal(res.isError, true);
  assert.equal(images(res).length, 0);
  assert.match(textOf(res), /^qa_explainer failed: /);
  assert.equal(sheetPath(res), undefined);
});

test("image: true with an invalid project name is rejected, no image", async () => {
  await withServer({}, async (c) => {
    for (const name of ["", "Bad Name", "../clean", "..\\clean", "C:\\x"]) {
      const res = await qa(c, { name, image: true });
      assert.equal(res.isError, true, `name ${JSON.stringify(name)} should be rejected`);
      assert.equal(images(res).length, 0);
    }
  });
});

test("image: true when Chrome cannot start fails with text only, no image", async () => {
  const missing = path.join(scratch, "no such", "chrome.exe");
  const res = await withServer({ CHROME_PATH: missing }, (c) => qa(c, { name: "clean", image: true }));
  assert.equal(res.isError, true);
  assert.equal(images(res).length, 0);
  assert.equal(textOf(res), `qa_explainer failed: CHROME_PATH does not exist: ${missing}`);
});

// ── Chrome cases ──

test("render edge cases: clean full-size, image: false, warnings plus errors", { skip: noChrome }, async () => {
  await withServer({}, async (c) => {
    // Clean full-size pass: still text only; the path is absolute, keeps its spaces and is the last line.
    const full = await qa(c, { name: "clean", full: true });
    assert.equal(full.isError, false, textOf(full));
    assert.equal(full.content.length, 1);
    assert.equal(full.content[0].type, "text");
    const sheet = sheetPath(full);
    assert.ok(sheet && path.isAbsolute(sheet), `absolute sheet path: ${sheet}`);
    assert.ok(sheet.includes("h0x qa edge-"), "path with a space is kept whole");
    assert.ok(existsSync(sheet), "contact sheet is still written");
    assert.equal(textOf(full).trimEnd().split("\n").at(-1), `Contact sheet: ${sheet}`);
    assert.doesNotMatch(textOf(full), BRAND_LEAK);

    // image: false on a clean pass behaves like omitting it.
    const off = await qa(c, { name: "clean", image: false });
    assert.equal(off.isError, false, textOf(off));
    assert.equal(images(off).length, 0);
    assert.ok(sheetPath(off));

    // Warnings and errors together: exactly one jpeg, after the text, and the report still names the sheet.
    const both = await qa(c, { name: "both" });
    assert.equal(both.isError, false, textOf(both));
    assert.match(textOf(both), /^ERROR /m);
    assert.match(textOf(both), / WARN /);
    assert.equal(images(both).length, 1);
    assert.equal(both.content[0].type, "text");
    assert.equal(both.content[1].type, "image");
    assert.equal(images(both)[0].mimeType, "image/jpeg");
    assert.ok(sheetPath(both) && existsSync(sheetPath(both)));
  });
});
