// Tests for R2-7: the MCP server saves into ~/Artcraft/downloads/h0x-mcp by default.
// Run: node --test mcp/h0x-mcp/index.test.mjs
// Each case spawns index.mjs over stdio with a fake home directory. Generation is
// served by a local fake BytePlus endpoint (BYTEPLUS_BASE_URL), so nothing touches
// the real network or the real home folder.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
