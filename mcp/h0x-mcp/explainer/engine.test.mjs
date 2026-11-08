// Tests for Explainer Studio (create_explainer, qa_explainer, render_explainer).
// Run: node --test explainer/engine.test.mjs   (from mcp/h0x-mcp)
// Needs python and ffmpeg. The voice comes from test-fixtures/edge_tts.py (offline silence),
// so the real tts.py runs without the network. Chrome cases are skipped if Chrome is missing.
// Set H0X_TEST_TMP to keep the scratch folder off a full system drive.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { homedir, tmpdir } from "node:os";
import { findChrome, libraryDir, projectDir, resolveUrl, starterScene, workDir } from "./engine.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..", "index.mjs");
const FIXTURES = path.join(HERE, "test-fixtures");
const noChrome = findChrome() ? false : "Chrome not found";

const SCRIPT = {
  title: "Test <Explainer>",
  lines: [
    { id: "l1", text: "First line of the test." },
    { id: "l2", text: "Second line here.", show: "A card" },
  ],
};

let scratch, library, work, ttsLog, client;

before(async () => {
  scratch = await mkdtemp(path.join(process.env.H0X_TEST_TMP || tmpdir(), "h0x-explainer-test-"));
  library = path.join(scratch, "library with space");
  work = path.join(scratch, "projects");
  ttsLog = path.join(scratch, "tts.log");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, H0X_EXPLAINER_LIBRARY_DIR: library, H0X_EXPLAINER_DIR: work, PYTHONPATH: FIXTURES, FAKE_TTS_LOG: ttsLog },
    stderr: "ignore",
  });
  client = new Client({ name: "explainer-test", version: "0.0.0" });
  await client.connect(transport);
});

after(async () => {
  await client?.close();
  // Chrome's crash handler can hold the profile for a moment after the browser exits.
  await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
});

const call = (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 300000 });
const textOf = (res) => res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
const spoken = async () => (existsSync(ttsLog) ? (await readFile(ttsLog, "utf8")).trim().split(/\r?\n/) : []);

// ── pure helpers ──

test("resolveUrl serves the runtime, gsap, fonts and project files", () => {
  const root = path.resolve("/proj");
  assert.equal(resolveUrl(root, "/scene.html"), path.join(root, "scene.html"));
  assert.equal(resolveUrl(root, "/build/timings.js?x=1"), path.join(root, "build", "timings.js"));
  assert.equal(resolveUrl(root, "/engine/h0x.js"), path.join(HERE, "runtime", "h0x.js"));
  assert.match(resolveUrl(root, "/engine/gsap.min.js"), /gsap[\\/]dist[\\/]gsap\.min\.js$/);
  assert.match(resolveUrl(root, "/fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2"), /@fontsource-variable[\\/]space-grotesk[\\/]files[\\/]/);
});

test("resolveUrl never leaves the project or runtime folders", () => {
  const root = path.resolve("/proj");
  for (const url of ["/../secret.txt", "/%2e%2e/secret.txt", "/build/../../secret.txt", "/engine/../../index.mjs", "/engine/%2e%2e/engine.mjs", "/fonts/../../x.woff2", "/fonts/a/..%2f..%2fx.woff2"]) {
    const file = resolveUrl(root, url);
    const ok = file === null || file.startsWith(root + path.sep) || file.startsWith(path.join(HERE, "runtime") + path.sep);
    assert.ok(ok, `${url} -> ${file}`);
  }
});

test("default folders: projects in ~/Artcraft/explainers, finals in ~/Artcraft/downloads/explainers (My Library)", () => {
  const saved = { ...process.env };
  try {
    delete process.env.H0X_EXPLAINER_DIR;
    delete process.env.H0X_EXPLAINER_LIBRARY_DIR;
    assert.equal(workDir(), path.join(homedir(), "Artcraft", "explainers"));
    assert.equal(libraryDir(), path.join(homedir(), "Artcraft", "downloads", "explainers"));
    process.env.H0X_EXPLAINER_DIR = "E:/x";
    process.env.H0X_EXPLAINER_LIBRARY_DIR = "E:/lib";
    assert.equal(workDir(), "E:/x");
    assert.equal(libraryDir(), "E:/lib");
  } finally {
    process.env = saved;
  }
});

test("projectDir only accepts simple lowercase names", () => {
  for (const bad of ["", "Bad", "../x", "a/b", "a b", "-x", "x".repeat(65)]) assert.throws(() => projectDir(bad), /invalid explainer name/);
  assert.ok(projectDir("how-rollups-work-2").endsWith("how-rollups-work-2"));
});

test("starterScene escapes the title and wires every voice line", () => {
  const html = starterScene(SCRIPT);
  assert.ok(html.includes("Test &lt;Explainer&gt;"));
  assert.ok(!html.includes("<Explainer>"));
  assert.ok(html.includes('show("#s-l2"'));
  assert.ok(html.includes('import * as k from "/engine/iso-kit.mjs"'));
});

// ── MCP tools ──

test("the server lists the three explainer tools", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ["create_explainer", "qa_explainer", "render_explainer"]) assert.ok(names.includes(n), n);
});

test("create_explainer rejects duplicate line ids and bad names", async () => {
  const dup = await call("create_explainer", { name: "dup", script: { title: "x", lines: [{ id: "a", text: "one" }, { id: "a", text: "two" }] } });
  assert.equal(dup.isError, true);
  assert.match(textOf(dup), /unique/);
  const bad = await call("create_explainer", { name: "Bad Name", script: SCRIPT });
  assert.equal(bad.isError, true);
});

test("qa_explainer and render_explainer report a missing project", async () => {
  for (const tool of ["qa_explainer", "render_explainer"]) {
    const res = await call(tool, { name: "nothing-here" });
    assert.equal(res.isError, true);
    assert.match(textOf(res), /run create_explainer first/);
  }
});

test("create_explainer voices the script and writes the starter scene", async () => {
  const res = await call("create_explainer", { name: "demo", script: SCRIPT });
  assert.equal(res.isError, false, textOf(res));
  const dir = path.join(work, "demo");
  for (const f of ["script.json", "scene.html", "build/voice.mp3", "build/timings.js", "build/timings.json", "build/subs.srt"]) {
    assert.ok(existsSync(path.join(dir, f)), f);
  }
  const timings = JSON.parse(await readFile(path.join(dir, "build", "timings.json"), "utf8"));
  assert.deepEqual(timings.lines.map((l) => l.id), ["l1", "l2"]);
  assert.ok(timings.lines[1].start > timings.lines[0].end);
  assert.match(textOf(res), /starter written/);
  assert.deepEqual(await spoken(), SCRIPT.lines.map((l) => l.text));
  const saved = JSON.parse(await readFile(path.join(dir, "script.json"), "utf8"));
  assert.equal(saved.voice, "en-US-AvaMultilingualNeural");
});

test("re-running create_explainer re-speaks only changed lines and keeps scene.html", async () => {
  const scene = path.join(work, "demo", "scene.html");
  await writeFile(scene, (await readFile(scene, "utf8")) + "\n<!-- edited by agent -->\n");
  await writeFile(ttsLog, "");
  const edited = { ...SCRIPT, lines: [SCRIPT.lines[0], { id: "l2", text: "A changed second line." }] };
  const res = await call("create_explainer", { name: "demo", script: edited });
  assert.equal(res.isError, false, textOf(res));
  assert.deepEqual(await spoken(), ["A changed second line."]);
  assert.match(await readFile(scene, "utf8"), /edited by agent/);
  assert.match(textOf(res), /kept as is/);
});

test("qa_explainer returns a clean report and a contact sheet for the starter scene", { skip: noChrome }, async () => {
  const res = await call("qa_explainer", { name: "demo" });
  assert.equal(res.isError, false, textOf(res));
  assert.match(textOf(res), /4 frames/);
  assert.doesNotMatch(textOf(res), /WARN|ERROR/);
  const image = res.content.find((c) => c.type === "image");
  assert.equal(image?.mimeType, "image/jpeg");
  assert.ok(Buffer.from(image.data, "base64").length > 1000);
});

test("qa_explainer flags overlapping text, text under the subtitles and scene errors", { skip: noChrome }, async () => {
  await call("create_explainer", { name: "broken", script: SCRIPT });
  await writeFile(path.join(work, "broken", "scene.html"), `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/engine/h0x.css">
<div id="stage"><section class="scene" id="s1" style="visibility:visible">
  <h1 style="position:absolute;left:200px;top:200px;font-size:80px">Overlapping one</h1>
  <h2 style="position:absolute;left:220px;top:230px;font-size:80px">Overlapping two</h2>
  <p style="position:absolute;left:700px;top:960px;font-size:40px">Low caption text</p>
</section></div>
<script src="/engine/gsap.min.js"></script><script src="build/timings.js"></script><script src="/engine/h0x.js"></script>
<script src="missing.js"></script>
<script>H0X.boot({});</script>`);
  const res = await call("qa_explainer", { name: "broken", times: [1.5] });
  assert.equal(res.isError, false, textOf(res));
  const report = textOf(res);
  assert.match(report, /overlap: "Overlapping one" x "Overlapping two"/);
  assert.match(report, /under subtitle: "Low caption text"/);
  assert.match(report, /ERROR (HTTP 404|failed to load) \/missing\.js/);
});

test("render_explainer preview writes a small MP4 in the project only", { skip: noChrome }, async () => {
  const res = await call("render_explainer", { name: "demo", mode: "preview", from: 0, to: 1.5 });
  assert.equal(res.isError, false, textOf(res));
  assert.match(textOf(res), /Rendered 18 frames/);
  assert.ok(existsSync(path.join(work, "demo", "out", "preview.mp4")));
  assert.equal(existsSync(path.join(work, "demo", "out", "preview.part.mp4")), false);
  assert.equal(existsSync(library), false);
});

test("render_explainer final writes the master and copies MP4 + SRT to My Library", { skip: noChrome }, async () => {
  const res = await call("render_explainer", { name: "demo", mode: "final", from: 0, to: 1 });
  assert.equal(res.isError, false, textOf(res));
  assert.match(textOf(res), /Rendered 30 frames/);
  assert.ok(existsSync(path.join(work, "demo", "out", "demo.mp4")));
  const lib = library;
  assert.ok(existsSync(path.join(lib, "demo.mp4")));
  assert.match(await readFile(path.join(lib, "demo.srt"), "utf8"), /First line of the test\./);
});
