// Tests for R2-7: the MCP server saves into ~/Artcraft/downloads/h0x-mcp by default.
// Run: node --test mcp/h0x-mcp/index.test.mjs
// Each case spawns index.mjs over stdio with a fake home directory. Generation is
// served by a local fake BytePlus endpoint (BYTEPLUS_BASE_URL), so nothing touches
// the real network or the real home folder.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isBuiltin } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CHROME_HELP, findChrome } from "./explainer/engine.mjs";

const execFileP = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "index.mjs");
const README = path.join(HERE, "README.md");
const DEFAULT_PARTS = ["Artcraft", "downloads", "h0x-mcp"];
const VIDEO_BYTES = Buffer.from("fake-mp4-bytes");
const IMAGE_BYTES = Buffer.from("fake-png-bytes");

let fake;
let baseUrl;
let scratch;

before(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "h0x-mcp-test-"));
  fake = http.createServer((req, res) => {
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    req.resume();
    req.on("end", () => {
      const u = req.url;
      if (req.method === "POST" && u === "/api/v3/images/generations") return send(200, { data: [{ url: `${baseUrl}/files/img.png` }] });
      if (req.method === "POST" && u === "/api/v3/contents/generations/tasks") return send(200, { id: "task-ok" });
      if (u === "/api/v3/contents/generations/tasks/task-ok") return send(200, { status: "succeeded", content: { video_url: `${baseUrl}/files/video.mp4` } });
      if (u === "/files/video.mp4") return send(200, VIDEO_BYTES, "video/mp4");
      if (u === "/files/img.png") return send(200, IMAGE_BYTES, "image/png");
      return send(404, "not found", "text/plain");
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${fake.address().port}`;
});

after(async () => {
  await new Promise((r) => fake.close(r));
  await rm(scratch, { recursive: true, force: true });
});

// A fresh fake home per case. The space checks that Windows paths with spaces work.
async function fakeHome() {
  return mkdtemp(path.join(scratch, "home with space-"));
}

// homedir() reads HOME first (libuv), then USERPROFILE on Windows; set both.
async function withServer(home, extraEnv, fn) {
  const env = { HOME: home, USERPROFILE: home, ...extraEnv };
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env, stderr: "ignore" });
  const client = new Client({ name: "h0x-mcp-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

const textOf = (res) => res.content.map((c) => c.text).join("\n");
const savedDir = (res) => textOf(res).match(/^Videos are saved to: (.+)$/m)?.[1];
const savedFile = (res) => textOf(res).match(/^Saved (?:video|image): (.+)$/m)?.[1];
const defaultDir = (home) => path.join(home, ...DEFAULT_PARTS);
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

test("default OUTPUT_DIR is <home>/Artcraft/downloads/h0x-mcp when H0X_OUTPUT_DIR is unset", async () => {
  const home = await fakeHome();
  const res = await withServer(home, {}, (c) => c.callTool({ name: "list_video_providers", arguments: {} }));
  assert.equal(res.isError, false);
  assert.equal(savedDir(res), defaultDir(home));
});

test("an empty H0X_OUTPUT_DIR falls back to the default", async () => {
  const home = await fakeHome();
  const res = await withServer(home, { H0X_OUTPUT_DIR: "" }, (c) => c.callTool({ name: "list_video_providers", arguments: {} }));
  assert.equal(savedDir(res), defaultDir(home));
});

test("H0X_OUTPUT_DIR override is still honoured", async () => {
  const home = await fakeHome();
  const custom = path.join(scratch, "custom out");
  const res = await withServer(home, { H0X_OUTPUT_DIR: custom }, (c) => c.callTool({ name: "list_video_providers", arguments: {} }));
  assert.equal(savedDir(res), custom);
});

test("generate_video saves the .mp4 under ~/Artcraft/downloads/h0x-mcp (dir created on demand)", async () => {
  const home = await fakeHome();
  assert.equal(existsSync(defaultDir(home)), false);
  const res = await withServer(home, { BYTEPLUS_API_KEY: "test-key", BYTEPLUS_BASE_URL: `${baseUrl}/api/v3` }, (c) =>
    c.callTool({ name: "generate_video", arguments: { prompt: "a paper boat", provider: "seedance", file_name: "boat" } }),
  );
  assert.equal(res.isError, false, textOf(res));
  const file = savedFile(res);
  assert.equal(file, path.join(defaultDir(home), "boat.mp4"));
  assert.ok(isInside(file, home));
  assert.deepEqual(await readFile(file), VIDEO_BYTES);
});

test("generate_image saves the .png under the default dir too", async () => {
  const home = await fakeHome();
  const res = await withServer(home, { BYTEPLUS_API_KEY: "test-key", BYTEPLUS_BASE_URL: `${baseUrl}/api/v3` }, (c) =>
    c.callTool({ name: "generate_image", arguments: { prompt: "a keyframe", file_name: "key" } }),
  );
  assert.equal(res.isError, false, textOf(res));
  assert.equal(savedFile(res), path.join(defaultDir(home), "key.png"));
  assert.deepEqual(await readFile(savedFile(res)), IMAGE_BYTES);
});

test("generate_video with an override writes into the override, not the default", async () => {
  const home = await fakeHome();
  const custom = path.join(scratch, "override-target");
  const res = await withServer(
    home,
    { H0X_OUTPUT_DIR: custom, BYTEPLUS_API_KEY: "test-key", BYTEPLUS_BASE_URL: `${baseUrl}/api/v3` },
    (c) => c.callTool({ name: "generate_video", arguments: { prompt: "x", provider: "seedance", file_name: "ov" } }),
  );
  assert.equal(savedFile(res), path.join(custom, "ov.mp4"));
  assert.equal(existsSync(defaultDir(home)), false);
});

test("an unconfigured provider errors and creates no output folder", async () => {
  const home = await fakeHome();
  const res = await withServer(home, {}, (c) =>
    c.callTool({ name: "generate_video", arguments: { prompt: "x", provider: "seedance" } }),
  );
  assert.equal(res.isError, true);
  assert.equal(existsSync(path.join(home, "Artcraft")), false);
});

test("a provider HTTP error is reported and leaves no file behind", async () => {
  const home = await fakeHome();
  // Base URL points at a path the fake server 404s, so the task POST fails.
  const res = await withServer(home, { BYTEPLUS_API_KEY: "test-key", BYTEPLUS_BASE_URL: `${baseUrl}/missing` }, (c) =>
    c.callTool({ name: "generate_video", arguments: { prompt: "x", provider: "seedance", file_name: "nope" } }),
  );
  assert.equal(res.isError, true);
  assert.match(textOf(res), /HTTP 404/);
  assert.equal(existsSync(path.join(defaultDir(home), "nope.mp4")), false);
});

test("file_name cannot escape the output folder", async () => {
  const home = await fakeHome();
  for (const bad of ["../escape", "..\\escape", "a/b", "C:\\x", ""]) {
    const res = await withServer(home, { BYTEPLUS_API_KEY: "test-key", BYTEPLUS_BASE_URL: `${baseUrl}/api/v3` }, (c) =>
      c.callTool({ name: "generate_video", arguments: { prompt: "x", provider: "seedance", file_name: bad } }).catch((e) => ({ isError: true, content: [{ text: e.message }] })),
    );
    assert.equal(res.isError, true, `file_name ${JSON.stringify(bad)} should be rejected`);
  }
  const leftovers = existsSync(defaultDir(home)) ? await readdir(defaultDir(home)) : [];
  assert.deepEqual(leftovers, []);
  assert.deepEqual((await readdir(home)).filter((n) => n !== "Artcraft"), []);
});

test("README states the new default path and the override", async () => {
  const readme = await readFile(README, "utf8");
  assert.match(readme, /`~\/Artcraft\/downloads\/h0x-mcp`/);
  assert.match(readme, /H0X_OUTPUT_DIR/);
  assert.doesNotMatch(readme, /Videos\/H0x Video Studio/);
});

test("the source no longer points at the old ~/Videos default", async () => {
  const src = await readFile(SERVER, "utf8");
  assert.doesNotMatch(src, /"Videos",\s*"H0x Video Studio"/);
  assert.match(src, /process\.env\.H0X_OUTPUT_DIR \|\|/);
});

test("the lines this subtask changed carry no LTX/Lightricks branding", async () => {
  const readmeLine = (await readFile(README, "utf8")).split(/\r?\n/).find((l) => l.includes("Videos are saved to"));
  const srcLine = (await readFile(SERVER, "utf8")).split(/\r?\n/).find((l) => l.startsWith("const OUTPUT_DIR"));
  for (const line of [readmeLine, srcLine]) {
    assert.ok(line);
    assert.doesNotMatch(line, /LTX|Lightricks/i);
  }
});

// ── R4-P1: list_library, provider_status, open_library, Chrome detection, single-file bundle ──

const ALL_TOOLS = ["create_explainer", "generate_image", "generate_video", "list_library", "list_video_providers", "open_library", "provider_status", "qa_explainer", "render_explainer"];
const libDir = (home) => path.join(home, "Artcraft", "downloads");
const rejected = (e) => ({ isError: true, content: [{ text: e.message }] });

async function putFile(file, bytes, secondsAgo) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  const t = new Date(Date.now() - secondsAgo * 1000);
  await utimes(file, t, t);
}

test("the server lists every tool, including the new library and status tools", async () => {
  const res = await withServer(await fakeHome(), {}, (c) => c.listTools());
  assert.deepEqual(res.tools.map((t) => t.name).sort(), ALL_TOOLS);
});

test("list_library lists media under ~/Artcraft/downloads newest first, recursing into subfolders", async () => {
  const home = await fakeHome();
  const lib = libDir(home);
  await putFile(path.join(lib, "old.png"), Buffer.alloc(3), 300);
  await putFile(path.join(lib, "h0x-mcp", "new.mp4"), Buffer.alloc(7), 10);
  await putFile(path.join(lib, "explainers", "mid.WEBM"), Buffer.alloc(5), 100);
  await putFile(path.join(lib, "notes.txt"), Buffer.from("not media"), 1);
  await putFile(path.join(lib, "explainers", "mid.srt"), Buffer.from("1"), 1);
  const res = await withServer(home, {}, (c) => c.callTool({ name: "list_library", arguments: {} }));
  assert.equal(res.isError, false);
  const rows = textOf(res).split("\n").slice(1);
  assert.deepEqual(rows.map((r) => r.split(" | ")[0]), [
    path.join(lib, "h0x-mcp", "new.mp4"),
    path.join(lib, "explainers", "mid.WEBM"),
    path.join(lib, "old.png"),
  ]);
  const [file, kind, size, created] = rows[0].split(" | ");
  assert.equal(kind, "video");
  assert.equal(size, "7 bytes");
  assert.ok(!Number.isNaN(Date.parse(created)), created);
  assert.match(rows[2], / \| image \| 3 bytes \| /);
  assert.ok(isInside(file, home));
});

test("list_library filters by kind and honours limit", async () => {
  const home = await fakeHome();
  const lib = libDir(home);
  for (let i = 0; i < 4; i++) await putFile(path.join(lib, `img${i}.jpg`), Buffer.alloc(1), i * 10 + 5);
  await putFile(path.join(lib, "clip.mov"), Buffer.alloc(1), 0);
  await withServer(home, {}, async (c) => {
    const images = textOf(await c.callTool({ name: "list_library", arguments: { kind: "image", limit: 2 } })).split("\n");
    assert.match(images[0], /^4 file\(s\)/);
    assert.deepEqual(images.slice(1).map((r) => path.basename(r.split(" | ")[0])), ["img0.jpg", "img1.jpg"]);
    const videos = textOf(await c.callTool({ name: "list_library", arguments: { kind: "video" } })).split("\n");
    assert.deepEqual(videos.slice(1).map((r) => path.basename(r.split(" | ")[0])), ["clip.mov"]);
    for (const args of [{ kind: "audio" }, { limit: 0 }, { limit: 1.5 }]) {
      const bad = await c.callTool({ name: "list_library", arguments: args }).catch(rejected);
      assert.equal(bad.isError, true, JSON.stringify(args));
    }
  });
});

test("list_library on a missing library says it is empty and creates nothing", async () => {
  const home = await fakeHome();
  const res = await withServer(home, {}, (c) => c.callTool({ name: "list_library", arguments: { kind: "video" } }));
  assert.equal(res.isError, false);
  assert.equal(textOf(res), `No videos in ${libDir(home)}.`);
  assert.equal(existsSync(path.join(home, "Artcraft")), false);
});

test("provider_status reports env and app credential files as true/false and never leaks values", async () => {
  const home = await fakeHome();
  await putFile(path.join(home, "Artcraft", "credentials", "fal.api_key.txt"), Buffer.from("fal-file-SECRET-123"), 0);
  const res = await withServer(home, { BYTEPLUS_API_KEY: "bp-env-SECRET-456" }, (c) => c.callTool({ name: "provider_status", arguments: {} }));
  assert.equal(res.isError, false);
  const out = textOf(res);
  assert.match(out, /^seedance: true \(env BYTEPLUS_API_KEY: true, app credentials: false\)$/m);
  assert.match(out, /^fal: true \(env FAL_KEY: false, app credentials: true\)$/m);
  assert.match(out, /^free: true; Hugging Face token false/m);
  assert.doesNotMatch(out, /SECRET|bp-env|fal-file/);
});

test("provider_status with nothing configured reports false everywhere", async () => {
  const out = textOf(await withServer(await fakeHome(), {}, (c) => c.callTool({ name: "provider_status", arguments: {} })));
  assert.match(out, /^seedance: false/m);
  assert.match(out, /^fal: false/m);
  assert.match(out, /Hugging Face token false/);
});

test("open_library returns the downloads path and how to open My Library", async () => {
  const home = await fakeHome();
  const res = await withServer(home, {}, (c) => c.callTool({ name: "open_library", arguments: {} }));
  assert.equal(res.isError, false);
  assert.equal(textOf(res).match(/^My Library folder: (.+)$/m)?.[1], libDir(home));
  assert.match(textOf(res), /choose My Library/);
  assert.doesNotMatch(textOf(res), /LTX|Lightricks|ArtCraft/);
});

// findChrome reads CHROME_PATH and PATH at call time; restore them after each case.
async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (vs) => { for (const [k, v] of Object.entries(vs)) v === undefined ? delete process.env[k] : (process.env[k] = v); };
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(saved);
  }
}

test("findChrome: CHROME_PATH wins on every platform; a CHROME_PATH that does not exist finds nothing", async () => {
  const fake = path.join(await fakeHome(), "my chrome.exe");
  await writeFile(fake, "");
  await withEnv({ CHROME_PATH: fake }, () => {
    for (const p of ["win32", "darwin", "linux"]) assert.equal(findChrome(p), fake);
  });
  await withEnv({ CHROME_PATH: fake + ".missing" }, () => assert.equal(findChrome("linux"), null));
});

test("findChrome on Linux searches PATH for google-chrome, chromium and chromium-browser", async () => {
  const bin1 = await fakeHome();
  const bin2 = await fakeHome();
  await withEnv({ CHROME_PATH: undefined, PATH: [bin1, bin2].join(path.delimiter) }, async () => {
    assert.equal(findChrome("linux"), null);
    await writeFile(path.join(bin2, "chromium-browser"), "");
    assert.equal(findChrome("linux"), path.join(bin2, "chromium-browser"));
    await writeFile(path.join(bin1, "chromium"), "");
    assert.equal(findChrome("linux"), path.join(bin1, "chromium"));
    await writeFile(path.join(bin2, "google-chrome"), "");
    assert.equal(findChrome("linux"), path.join(bin2, "google-chrome"), "google-chrome is preferred over chromium");
  });
});

test("findChrome on macOS ignores PATH, and the error help explains CHROME_PATH for each OS", { skip: process.platform === "darwin" && "real macOS" }, async () => {
  const bin = await fakeHome();
  await writeFile(path.join(bin, "google-chrome"), "");
  await withEnv({ CHROME_PATH: undefined, PATH: bin }, () => assert.equal(findChrome("darwin"), null));
  assert.match(CHROME_HELP, /set CHROME_PATH/);
  for (const p of ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "chrome.exe"]) assert.ok(CHROME_HELP.includes(p), p);
});

test("npm run bundle makes one self-contained file that serves every tool without node_modules", { timeout: 180000 }, async () => {
  await execFileP(process.execPath, [path.join(HERE, "build-bundle.mjs")], { cwd: HERE });
  // Copy dist/ somewhere with no node_modules above it, so any import left unbundled fails.
  const away = await mkdtemp(path.join(tmpdir(), "h0x-bundle-"));
  try {
    await cp(path.join(HERE, "dist"), away, { recursive: true });
    assert.deepEqual((await readdir(away)).sort(), ["explainer-runtime", "h0x-mcp.mjs"]);
    for (const f of ["engine/gsap.min.js", "engine/h0x.js", "engine/h0x.css", "engine/iso-kit.mjs", "tts.py", "EXPLAINER.md",
      "fonts/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
      "fonts/playfair-display/files/playfair-display-latin-wght-italic.woff2",
      "fonts/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
      "fonts/space-grotesk/files/space-grotesk-latin-wght-normal.woff2"]) {
      assert.ok(existsSync(path.join(away, "explainer-runtime", f)), f);
    }
    const home = await fakeHome();
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(away, "h0x-mcp.mjs")], cwd: away, env: { HOME: home, USERPROFILE: home }, stderr: "ignore" });
    const client = new Client({ name: "h0x-bundle-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), ALL_TOOLS);
      const res = await client.callTool({ name: "open_library", arguments: {} });
      assert.equal(textOf(res).match(/^My Library folder: (.+)$/m)?.[1], libDir(home));
    } finally {
      await client.close();
    }
  } finally {
    await rm(away, { recursive: true, force: true });
  }
});

// ── R4-P1 edge cases (test-writer) ──

const BRAND_LEAK = /LTX|Lightricks|ArtCraft|ARTCRAFT|getartcraft|storyteller\.ai|fakeyou/i;
// ~/Artcraft/... is the app's real data folder (internal name until R2); drop paths before brand checks.
const withoutPaths = (s, home) => s.split(libDir(home)).join("<lib>").split(home).join("<home>").replace(/~\/Artcraft\/[\w/]*/g, "<path>");

// A project that passes requireProject() without voice or Chrome.
async function fakeProject(work, name) {
  const proj = path.join(work, name);
  await putFile(path.join(proj, "build", "timings.js"), Buffer.from("window.TIMINGS={lines:[],total:0}"), 0);
  await putFile(path.join(proj, "scene.html"), Buffer.from("<!doctype html>"), 0);
}

test("new tool descriptions and outputs carry no third-party branding", async () => {
  const home = await fakeHome();
  await withServer(home, {}, async (c) => {
    const { tools } = await c.listTools();
    for (const name of ["list_library", "provider_status", "open_library"]) {
      const t = tools.find((x) => x.name === name);
      assert.ok(t, name);
      assert.doesNotMatch(withoutPaths(t.description, home), BRAND_LEAK, name);
      const out = textOf(await c.callTool({ name, arguments: {} }));
      assert.doesNotMatch(withoutPaths(out, home), BRAND_LEAK, `${name} output`);
    }
  });
});

test("list_library: only non-media files means 'No media', and a folder named like a video is not listed", async () => {
  const home = await fakeHome();
  const lib = libDir(home);
  await putFile(path.join(lib, "readme.txt"), Buffer.from("x"), 0);
  await putFile(path.join(lib, "clip.srt"), Buffer.from("x"), 0);
  await putFile(path.join(lib, "noext"), Buffer.from("x"), 0);
  await mkdir(path.join(lib, "folder.mp4"), { recursive: true });
  const res = await withServer(home, {}, (c) => c.callTool({ name: "list_library", arguments: { kind: "all" } }));
  assert.equal(res.isError, false);
  assert.equal(textOf(res), `No media in ${lib}.`);
});

test("list_library: every media extension maps to the right kind, case-insensitively, and empty files show 0 bytes", async () => {
  const home = await fakeHome();
  const lib = libDir(home);
  const expect = { "a.PNG": "image", "b.jpg": "image", "c.JPEG": "image", "d.webp": "image", "e.gif": "image", "f.mp4": "video", "g.WebM": "video", "h.MOV": "video" };
  let age = 0;
  for (const f of Object.keys(expect)) await putFile(path.join(lib, "deep", "er", f), Buffer.alloc(0), (age += 10));
  const out = textOf(await withServer(home, {}, (c) => c.callTool({ name: "list_library", arguments: { limit: 500 } })));
  const rows = out.split("\n").slice(1).map((r) => r.split(" | "));
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((r) => path.basename(r[0])), Object.keys(expect), "newest first");
  for (const [file, kind, size] of rows) {
    assert.equal(kind, expect[path.basename(file)], file);
    assert.equal(size, "0 bytes");
  }
});

test("list_library: limit 1 and 500 accepted, 501 / negative / string rejected; the count is before the limit", async () => {
  const home = await fakeHome();
  for (let i = 0; i < 3; i++) await putFile(path.join(libDir(home), `v${i}.mp4`), Buffer.alloc(1), i * 10);
  await withServer(home, {}, async (c) => {
    const one = textOf(await c.callTool({ name: "list_library", arguments: { limit: 1 } })).split("\n");
    assert.match(one[0], /^3 file\(s\)/);
    assert.equal(one.length, 2);
    assert.equal(path.basename(one[1].split(" | ")[0]), "v0.mp4");
    assert.equal(textOf(await c.callTool({ name: "list_library", arguments: { limit: 500 } })).split("\n").length, 4);
    for (const args of [{ limit: 501 }, { limit: -1 }, { limit: "5" }, { kind: "IMAGE" }]) {
      const bad = await c.callTool({ name: "list_library", arguments: args }).catch(rejected);
      assert.equal(bad.isError, true, JSON.stringify(args));
    }
  });
});

test("list_library on an empty library uses the right noun for the image filter", async () => {
  const home = await fakeHome();
  const res = await withServer(home, {}, (c) => c.callTool({ name: "list_library", arguments: { kind: "image" } }));
  assert.equal(textOf(res), `No images in ${libDir(home)}.`);
});

test("list_library keeps Windows-style and unicode file names intact", async () => {
  const home = await fakeHome();
  const file = path.join(libDir(home), "My Clips (1)", "\u00e9t\u00e9 clip #2.mp4");
  await putFile(file, Buffer.alloc(2), 0);
  const out = textOf(await withServer(home, {}, (c) => c.callTool({ name: "list_library", arguments: {} })));
  assert.equal(out.split("\n")[1].split(" | ")[0], file);
});

test("provider_status: empty env vars count as not set; all three app credential files count as set", async () => {
  const home = await fakeHome();
  const creds = path.join(home, "Artcraft", "credentials");
  await withServer(home, { BYTEPLUS_API_KEY: "", FAL_KEY: "", HF_TOKEN: "" }, async (c) => {
    const out = textOf(await c.callTool({ name: "provider_status", arguments: {} }));
    assert.match(out, /^seedance: false \(env BYTEPLUS_API_KEY: false, app credentials: false\)$/m);
    assert.match(out, /^fal: false \(env FAL_KEY: false, app credentials: false\)$/m);
    assert.match(out, /Hugging Face token false \(env HF_TOKEN: false, app credentials: false\)/);
  });
  await putFile(path.join(creds, "byteplus.api_key.txt"), Buffer.from("FILE-SECRET-bp"), 0);
  await putFile(path.join(creds, "fal.api_key.txt"), Buffer.from("FILE-SECRET-fal"), 0);
  await putFile(path.join(creds, "huggingface.api_key.txt"), Buffer.from("FILE-SECRET-hf"), 0);
  const out = textOf(await withServer(home, {}, (c) => c.callTool({ name: "provider_status", arguments: {} })));
  assert.match(out, /^seedance: true \(env BYTEPLUS_API_KEY: false, app credentials: true\)$/m);
  assert.match(out, /^fal: true \(env FAL_KEY: false, app credentials: true\)$/m);
  assert.match(out, /Hugging Face token true \(env HF_TOKEN: false, app credentials: true\)/);
  assert.doesNotMatch(out, /FILE-SECRET/);
});

test("provider_status never echoes env values, even short or token-shaped ones", async () => {
  const home = await fakeHome();
  const secrets = { BYTEPLUS_API_KEY: "zq9Wv", FAL_KEY: "id:0123456789abcdef", HF_TOKEN: "hf_ABCDEFGHIJKLMNOP" };
  const out = textOf(await withServer(home, secrets, (c) => c.callTool({ name: "provider_status", arguments: {} })));
  for (const v of Object.values(secrets)) assert.ok(!out.includes(v), `leaked ${v}`);
  assert.match(out, /^seedance: true/m);
  assert.match(out, /^fal: true/m);
  assert.match(out, /Hugging Face token true \(env HF_TOKEN: true/);
});

test("provider_status ignores look-alike credential files", async () => {
  const home = await fakeHome();
  const creds = path.join(home, "Artcraft", "credentials");
  await putFile(path.join(creds, "byteplus.txt"), Buffer.from("x"), 0);
  await putFile(path.join(creds, "fal.api_key.txt.bak"), Buffer.from("x"), 0);
  const out = textOf(await withServer(home, {}, (c) => c.callTool({ name: "provider_status", arguments: {} })));
  assert.match(out, /^seedance: false/m);
  assert.match(out, /^fal: false/m);
});

test("open_library has no side effects: it creates no folders", async () => {
  const home = await fakeHome();
  await withServer(home, {}, (c) => c.callTool({ name: "open_library", arguments: {} }));
  assert.deepEqual(await readdir(home), []);
});

test("findChrome: an empty CHROME_PATH is treated as unset and falls back to the PATH search", async () => {
  const bin = await fakeHome();
  await writeFile(path.join(bin, "chromium"), "");
  await withEnv({ CHROME_PATH: "", PATH: bin }, () => assert.equal(findChrome("linux"), path.join(bin, "chromium")));
});

test("findChrome on Linux also finds google-chrome-stable and microsoft-edge, skips empty PATH entries, and handles no PATH", async () => {
  const bin = await fakeHome();
  await withEnv({ CHROME_PATH: undefined, PATH: ["", bin, ""].join(path.delimiter) }, async () => {
    await writeFile(path.join(bin, "microsoft-edge"), "");
    assert.equal(findChrome("linux"), path.join(bin, "microsoft-edge"));
    await writeFile(path.join(bin, "google-chrome-stable"), "");
    assert.equal(findChrome("linux"), path.join(bin, "google-chrome-stable"), "Chrome is preferred over Edge");
  });
  await withEnv({ CHROME_PATH: undefined, PATH: undefined, Path: undefined }, () => assert.equal(findChrome("linux"), null));
});

test("findChrome on an unknown platform falls back to the Linux PATH search", async () => {
  const bin = await fakeHome();
  await writeFile(path.join(bin, "chromium-browser"), "");
  await withEnv({ CHROME_PATH: undefined, PATH: bin }, () => assert.equal(findChrome("freebsd"), path.join(bin, "chromium-browser")));
});

test("findChrome on Windows checks the per-user LOCALAPPDATA Chrome install", async () => {
  const local = await fakeHome();
  const userChrome = path.join(local, "Google", "Chrome", "Application", "chrome.exe");
  await mkdir(path.dirname(userChrome), { recursive: true });
  await writeFile(userChrome, "");
  // Machine-wide installs are checked first; only expect the per-user one when none exists here.
  const machine = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"];
  await withEnv({ CHROME_PATH: undefined, LOCALAPPDATA: local }, () => {
    const found = findChrome("win32");
    if (machine.some((m) => existsSync(m))) assert.ok(machine.includes(found), found);
    else assert.equal(found, userChrome);
  });
});

test("qa_explainer with a CHROME_PATH that does not exist fails with a clear message, without launching Chrome", async () => {
  const home = await fakeHome();
  const work = path.join(home, "projects");
  await fakeProject(work, "demo");
  const missing = path.join(home, "no such", "chrome.exe");
  const res = await withServer(home, { H0X_EXPLAINER_DIR: work, CHROME_PATH: missing }, (c) =>
    c.callTool({ name: "qa_explainer", arguments: { name: "demo" } }));
  assert.equal(res.isError, true);
  assert.equal(textOf(res), `qa_explainer failed: CHROME_PATH does not exist: ${missing}`);
});

test("CHROME_HELP covers macOS, Linux and Windows, names Edge, and has no third-party branding", () => {
  for (const s of ["macOS", "Linux", "Windows", "Edge"]) assert.ok(CHROME_HELP.includes(s), s);
  assert.doesNotMatch(CHROME_HELP, BRAND_LEAK);
});

test("package.json pins esbuild exactly as a devDependency and the lockfile agrees", async () => {
  const pkg = JSON.parse(await readFile(path.join(HERE, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(HERE, "package-lock.json"), "utf8"));
  assert.equal(pkg.scripts.bundle, "node build-bundle.mjs");
  assert.match(pkg.devDependencies.esbuild, /^\d+\.\d+\.\d+$/, "exact version, no range");
  assert.equal(pkg.dependencies?.esbuild, undefined, "esbuild must not be a runtime dependency");
  assert.equal(lock.packages["node_modules/esbuild"].version, pkg.devDependencies.esbuild);
  assert.equal(lock.packages["node_modules/esbuild"].dev, true);
});

test("README documents the three new tools, CHROME_PATH and npm run bundle", async () => {
  const readme = await readFile(README, "utf8");
  for (const s of ["`list_library`", "`provider_status`", "`open_library`", "CHROME_PATH", "npm run bundle", "dist/h0x-mcp.mjs"]) assert.ok(readme.includes(s), s);
});

test("a rebuilt bundle drops stale dist files, has no bare imports or build-machine paths, and its explainer tools work", { timeout: 180000 }, async () => {
  const dist = path.join(HERE, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "stale.txt"), "old");
  await execFileP(process.execPath, [path.join(HERE, "build-bundle.mjs")], { cwd: HERE });
  try {
    assert.equal(existsSync(path.join(dist, "stale.txt")), false, "build clears dist first");
    const src = await readFile(path.join(dist, "h0x-mcp.mjs"), "utf8");
    // Top-level static imports only (indented ones live in browser-side scene templates).
    const bare = [...src.matchAll(/^import\s[^;]*?from\s*["']([^"']+)["']/gm)].map((m) => m[1]).filter((s) => !isBuiltin(s));
    assert.deepEqual(bare, [], "only Node builtins may stay as static imports");
    for (const p of new Set([HERE, HERE.replace(/\\/g, "/"), HERE.replace(/\\/g, "\\\\")])) assert.ok(!src.includes(p), `bundle embeds the build path ${p}`);
    // Only the Latin variable faces ship, not every subset.
    for (const family of await readdir(path.join(dist, "explainer-runtime", "fonts"))) {
      const files = await readdir(path.join(dist, "explainer-runtime", "fonts", family, "files"));
      assert.ok(files.length > 0 && files.every((f) => /-latin-wght-(normal|italic)\.woff2$/.test(f)), `${family}: ${files}`);
    }
    // Run a copy with no node_modules from a folder with a space: explainer tools load and validate there too.
    const away = await mkdtemp(path.join(tmpdir(), "h0x bundle edge-"));
    try {
      await cp(dist, away, { recursive: true });
      const home = await fakeHome();
      const work = path.join(home, "projects");
      await fakeProject(work, "demo");
      const missing = path.join(home, "nope", "chrome");
      const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(away, "h0x-mcp.mjs")], cwd: home, env: { HOME: home, USERPROFILE: home, H0X_EXPLAINER_DIR: work, CHROME_PATH: missing }, stderr: "ignore" });
      const client = new Client({ name: "h0x-bundle-edge", version: "0.0.0" });
      await client.connect(transport);
      try {
        assert.equal(textOf(await client.callTool({ name: "qa_explainer", arguments: { name: "demo" } })), `qa_explainer failed: CHROME_PATH does not exist: ${missing}`);
        const bad = await client.callTool({ name: "render_explainer", arguments: { name: "Bad Name" } }).catch(rejected);
        assert.equal(bad.isError, true);
        assert.match(textOf(await client.callTool({ name: "provider_status", arguments: {} })), /^seedance: false/m);
      } finally {
        await client.close();
      }
    } finally {
      await rm(away, { recursive: true, force: true });
    }
  } finally {
    await rm(dist, { recursive: true, force: true });
  }
});
