// Tests for R5-CM-1: qa_explainer attaches the contact-sheet image only on warnings/errors or image: true.
// Run: node --test qa-explainer-image.test.mjs   (from mcp/h0x-mcp)
// Projects are written by hand (no TTS), so only Chrome is needed; the cases skip without it.

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

const scene = (body, extra = "") => `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/engine/h0x.css">
<div id="stage"><section class="scene" id="s1" style="visibility:visible">${body}</section></div>
<script src="/engine/gsap.min.js"></script><script src="build/timings.js"></script><script src="/engine/h0x.js"></script>
${extra}<script>H0X.boot({});</script>`;

const CLEAN = scene(`<h1 style="position:absolute;left:600px;top:400px;font-size:80px">All clear</h1>`);
const OVERLAP = scene(`<h1 style="position:absolute;left:200px;top:200px;font-size:80px">Overlapping one</h1>
  <h2 style="position:absolute;left:220px;top:230px;font-size:80px">Overlapping two</h2>`);
const BROKEN = scene(`<h1 style="position:absolute;left:600px;top:400px;font-size:80px">All clear</h1>`, `<script src="missing.js"></script>\n`);

let scratch, work, client;

before(async () => {
  scratch = await mkdtemp(path.join(process.env.H0X_TEST_TMP || tmpdir(), "h0x-qa-image-test-"));
  work = path.join(scratch, "projects");
  for (const [name, html] of [["clean", CLEAN], ["overlap", OVERLAP], ["broken", BROKEN]]) {
    await mkdir(path.join(work, name, "build"), { recursive: true });
    await writeFile(path.join(work, name, "build", "timings.js"), "window.TIMINGS={lines:[],total:2}");
    await writeFile(path.join(work, name, "scene.html"), html);
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, H0X_EXPLAINER_DIR: work, H0X_EXPLAINER_LIBRARY_DIR: path.join(scratch, "library") },
    stderr: "ignore",
  });
  client = new Client({ name: "qa-image-test", version: "0.0.0" });
  await client.connect(transport);
});

after(async () => {
  await client?.close();
  await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
});

const qa = (args) => client.callTool({ name: "qa_explainer", arguments: { times: [1], ...args } }, undefined, { timeout: 300000 });
const textOf = (res) => res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
const imageOf = (res) => res.content.find((c) => c.type === "image");
const sheetPath = (res) => textOf(res).match(/^Contact sheet: (.+)$/m)?.[1];

test("a clean pass returns only text with the contact-sheet path", { skip: noChrome }, async () => {
  const res = await qa({ name: "clean" });
  assert.equal(res.isError, false, textOf(res));
  assert.doesNotMatch(textOf(res), /WARN|ERROR/);
  assert.equal(imageOf(res), undefined);
  assert.equal(res.content.length, 1);
  assert.ok(existsSync(sheetPath(res)), "contact sheet is still written");
});

test("a pass with warnings includes the contact-sheet image", { skip: noChrome }, async () => {
  const res = await qa({ name: "overlap" });
  assert.equal(res.isError, false, textOf(res));
  assert.match(textOf(res), /WARN/);
  assert.equal(imageOf(res)?.mimeType, "image/jpeg");
  assert.ok(Buffer.from(imageOf(res).data, "base64").length > 1000);
});

test("a pass with scene errors includes the contact-sheet image", { skip: noChrome }, async () => {
  const res = await qa({ name: "broken" });
  assert.equal(res.isError, false, textOf(res));
  assert.match(textOf(res), /ERROR/);
  assert.doesNotMatch(textOf(res), /WARN/);
  assert.equal(imageOf(res)?.mimeType, "image/jpeg");
});

test("image: true includes the image on a clean pass", { skip: noChrome }, async () => {
  const res = await qa({ name: "clean", image: true });
  assert.equal(res.isError, false, textOf(res));
  assert.doesNotMatch(textOf(res), /WARN|ERROR/);
  assert.equal(imageOf(res)?.mimeType, "image/jpeg");
  assert.ok(sheetPath(res));
});

test("image: false still includes the image when there are warnings", { skip: noChrome }, async () => {
  const res = await qa({ name: "overlap", image: false });
  assert.match(textOf(res), /WARN/);
  assert.equal(imageOf(res)?.mimeType, "image/jpeg");
});
