#!/usr/bin/env node
// H0x Video Studio MCP server: lets an MCP client (Claude Code, Claude Desktop)
// generate videos with the user's own provider keys. Runs locally over stdio.

import { existsSync } from "node:fs";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client as GradioClient, handle_file } from "@gradio/client";
import { z } from "zod";
import { GUIDE, NAME_RE, createExplainer, qaExplainer, renderExplainer } from "./explainer/engine.mjs";
import { addFavorite, favoritesFile, listFavorites } from "./favorites.mjs";
import { listRecent } from "./recent.mjs";

const OUTPUT_DIR = process.env.H0X_OUTPUT_DIR || path.join(homedir(), "Artcraft", "downloads", "h0x-mcp");
// The app's My Library lists everything under ~/Artcraft/downloads.
const LIBRARY_DIR = path.join(homedir(), "Artcraft", "downloads");
const FAVORITES_FILE = favoritesFile(LIBRARY_DIR);
const CREDENTIALS_DIR = path.join(homedir(), "Artcraft", "credentials");
const MEDIA = { ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".mp4": "video", ".webm": "video", ".mov": "video" };
const POLL_MS = 5000;
const TIMEOUT_MS = 15 * 60 * 1000;

const FREE_SPACE = "Lightricks/ltx-video-distilled";
const SEEDANCE_BASE = process.env.BYTEPLUS_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
// 1.5 pro stopped taking new activations; 1.0 pro and 1.0 pro fast (seedance-1-0-pro-fast-251015) still do.
const SEEDANCE_MODEL = process.env.BYTEPLUS_SEEDANCE_MODEL || "seedance-1-0-pro-250528";
const SEEDREAM_MODEL = process.env.BYTEPLUS_SEEDREAM_MODEL || "seedream-4-5-251128";
const FAL_DEFAULT_MODEL = "fal-ai/veo3.1/fast";

const PROVIDERS = {
  free: {
    label: "Free: open video model on a public Hugging Face Space (short, 704x512, no key; HF_TOKEN raises the quota)",
    ready: () => true,
    run: generateFree,
  },
  seedance: {
    label: `Seedance on BytePlus ModelArk (${SEEDANCE_MODEL}, needs BYTEPLUS_API_KEY)`,
    ready: () => Boolean(process.env.BYTEPLUS_API_KEY),
    run: generateSeedance,
  },
  fal: {
    label: `fal.ai queue API (default ${FAL_DEFAULT_MODEL}, needs FAL_KEY)`,
    ready: () => Boolean(process.env.FAL_KEY),
    run: generateFal,
  },
};

const server = new McpServer({ name: "h0x-video-studio", version: "0.1.0" });

server.registerTool(
  "list_video_providers",
  {
    description: "List the video providers this H0x MCP server can use and whether each has its key configured.",
    inputSchema: {},
  },
  async () => {
    const rows = Object.entries(PROVIDERS).map(([id, p]) => `${id}: ${p.ready() ? "ready" : "not configured"} - ${p.label}`);
    return text([...rows, `Videos are saved to: ${OUTPUT_DIR}`].join("\n"));
  },
);

server.registerTool(
  "generate_video",
  {
    description:
      "Generate a short video from a text prompt, optionally animating a local image. Waits for the result and saves an .mp4 locally. Returns the file path.",
    inputSchema: {
      prompt: z.string().min(1).describe("What should happen in the video: subject, motion, camera, lighting, style."),
      image_path: z.string().optional().describe("Absolute path to a local PNG/JPEG to animate (image-to-video)."),
      provider: z.enum(["free", "seedance", "fal"]).default("free"),
      duration_seconds: z.number().min(1).max(10).default(5).describe("Requested length. The free provider caps at a few seconds."),
      resolution: z.enum(["720p", "1080p"]).default("1080p").describe("Seedance output resolution. 720p uses less than half the tokens."),
      model: z.string().optional().describe("fal model id, e.g. fal-ai/veo3.1/fast or fal-ai/kling-video/v2.6/pro/text-to-video."),
      file_name: z.string().regex(/^[\w-]+$/).optional().describe("Output file name without extension."),
    },
  },
  async (args) => {
    const provider = PROVIDERS[args.provider];
    if (!provider.ready()) {
      return text(`Provider "${args.provider}" is not configured. ${provider.label}.`, true);
    }
    try {
      const video = await provider.run(args);
      const file = await save(video, args.file_name || `${args.provider}-${Date.now()}`);
      return text(`Saved video: ${file}`);
    } catch (e) {
      return text(`Generation failed (${args.provider}): ${e.message}`, true);
    }
  },
);

server.registerTool(
  "generate_image",
  {
    description:
      "Generate a still image with Seedream on BytePlus ModelArk (needs BYTEPLUS_API_KEY) and save it as a PNG. Use it to make a sharp keyframe, then pass the path to generate_video as image_path.",
    inputSchema: {
      prompt: z.string().min(1).describe("The image: subject, composition, lighting, style, aspect ratio."),
      size: z.string().default("2560x1440").describe('"2K", "4K" or exact WIDTHxHEIGHT, e.g. 2560x1440 for 16:9.'),
      reference_image_paths: z.array(z.string()).max(14).optional().describe("Local images to guide the result: character sheets, a 3D blocking frame, a style reference."),
      file_name: z.string().regex(/^[\w-]+$/).optional().describe("Output file name without extension."),
    },
  },
  async ({ prompt, size, reference_image_paths, file_name }) => {
    if (!PROVIDERS.seedance.ready()) return text("Image generation needs BYTEPLUS_API_KEY.", true);
    try {
      const res = await json(fetch(`${SEEDANCE_BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.BYTEPLUS_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: SEEDREAM_MODEL,
          prompt,
          size,
          response_format: "url",
          watermark: false,
          ...(reference_image_paths?.length ? { image: await Promise.all(reference_image_paths.map(dataUrl)) } : {}),
        }),
      }));
      const url = res.data?.[0]?.url;
      if (!url) throw new Error("no image returned");
      const file = await save(await download(url), file_name || `image-${Date.now()}`, "png");
      return text(`Saved image: ${file}`);
    } catch (e) {
      return text(`Image generation failed: ${e.message}`, true);
    }
  },
);

server.registerTool(
  "list_library",
  {
    description: "List the images and videos in H0x My Library (~/Artcraft/downloads), newest first: path, kind, size and creation time.",
    inputSchema: {
      kind: z.enum(["image", "video", "all"]).default("all"),
      limit: z.number().int().min(1).max(500).default(50),
    },
  },
  async ({ kind, limit }) => {
    const files = (await libraryFiles(LIBRARY_DIR)).filter((f) => kind === "all" || f.kind === kind);
    if (!files.length) return text(`No ${kind === "all" ? "media" : `${kind}s`} in ${LIBRARY_DIR}.`);
    files.sort((a, b) => b.created - a.created);
    const rows = files.slice(0, limit).map((f) => `${f.path} | ${f.kind} | ${f.size} bytes | ${new Date(f.created).toISOString()}`);
    return text([`${files.length} file(s) in ${LIBRARY_DIR}, newest first:`, ...rows].join("\n"));
  },
);

server.registerTool(
  "provider_status",
  {
    description: "Report which video/image providers are usable: a key in this server's environment or in the H0x app's credential files. Reports true/false only, never key values.",
    inputSchema: {},
  },
  async () => {
    const has = (env, file) => {
      const fromEnv = Boolean(process.env[env]);
      const fromApp = existsSync(path.join(CREDENTIALS_DIR, file));
      return `${fromEnv || fromApp} (env ${env}: ${fromEnv}, app credentials: ${fromApp})`;
    };
    return text([
      `seedance: ${has("BYTEPLUS_API_KEY", "byteplus.api_key.txt")}`,
      `fal: ${has("FAL_KEY", "fal.api_key.txt")}`,
      `free: true; Hugging Face token ${has("HF_TOKEN", "huggingface.api_key.txt")}`,
      "This server's generate tools use the environment variables; keys saved only in the app work inside the H0x app.",
    ].join("\n"));
  },
);

server.registerTool(
  "open_library",
  {
    description: "Where H0x My Library keeps generated media, and how to open it in the app.",
    inputSchema: {},
  },
  async () => text(`My Library folder: ${LIBRARY_DIR}\nOpen the H0x Video Studio app and choose My Library to browse, preview and reuse these files.`),
);

server.registerTool(
  "list_favorites",
  {
    description: "Favorites in H0x: each favorite's path, kind (image or video) and whether the file is missing.",
    inputSchema: {},
  },
  async () => {
    const favorites = await listFavorites(FAVORITES_FILE);
    if (!favorites.length) return text("No favorites yet.");
    return text(favorites.map((f) => `${f.path} | ${f.kind} | ${f.missing ? "missing" : "ok"}`).join("\n"));
  },
);

server.registerTool(
  "list_recent",
  {
    description: "Recent images and videos in H0x My Library, newest first, as JSON { path, kind, created }.",
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(8),
    },
  },
  async ({ limit }) => text(JSON.stringify(await listRecent(LIBRARY_DIR, limit))),
);

server.registerTool(
  "add_favorite",
  {
    description: "Favorite an existing image or video by path; a file outside My Library is copied into My Library/favorites first and a duplicate is a no-op.",
    inputSchema: {
      path: z.string().min(1).describe("Absolute path to a local image (png, jpg, jpeg, webp) or video (mp4, webm, mov)."),
    },
  },
  async ({ path: source }) => {
    try {
      const { path: file, added, copied } = await addFavorite(FAVORITES_FILE, LIBRARY_DIR, source);
      if (!added) return text(`Already a favorite: ${file}`);
      return text(copied ? `Copied to ${file} and added to favorites.` : `Added to favorites: ${file}`);
    } catch (err) {
      return text(err.message, true);
    }
  },
);

// ── Explainer Studio: voiced motion-graphics explainers with isometric Anatomy figures ──

const explainerName = z.string().regex(NAME_RE).describe("Project name: lowercase letters, digits and dashes, e.g. how-rollups-work.");

server.registerTool(
  "create_explainer",
  {
    description:
      "Explainer Studio step 1. Create (or update) an explainer project from a voice script: writes script.json, speaks every line with an edge-tts voice, and writes build/voice.mp3, build/timings.js and build/subs.srt. Adds a starter scene.html the first time. Re-running with an edited script only re-speaks changed lines; scene.html is never overwritten. Read EXPLAINER.md (path in the result) before writing the scene.",
    inputSchema: {
      name: explainerName,
      script: z.object({
        title: z.string().min(1).describe("Video title, shown in the starter scene."),
        voice: z.string().default("en-US-AvaMultilingualNeural").describe("edge-tts voice id."),
        rate: z.string().regex(/^[+-]\d+%$/).default("+0%").describe('Speaking rate, e.g. "+4%".'),
        gap: z.number().min(0).max(3).default(0.4).describe("Default silence after each line, in seconds."),
        style: z.string().optional().describe("Art direction for the scene: palette, type, motion character."),
        display: z.record(z.string()).optional().describe('Spoken spelling -> subtitle spelling, e.g. {"Hyper-Ox": "Hyper 0X"}.'),
        lines: z.array(z.object({
          id: z.string().regex(/^[\w-]+$/).describe("Stable id used by at(id) in the scene, e.g. l1."),
          text: z.string().min(1).describe("What the voice says."),
          show: z.string().optional().describe("Storyboard: what the picture shows during this line."),
          pause: z.number().min(0).max(5).optional().describe("Silence after this line (overrides gap)."),
        })).min(1).max(60).refine((ls) => new Set(ls.map((l) => l.id)).size === ls.length, "line ids must be unique"),
      }).passthrough(),
    },
  },
  async ({ name, script }) => {
    try {
      const r = await createExplainer({ name, script });
      return text([
        `Explainer "${name}" voiced: ${r.lines.length} lines, ${r.total.toFixed(1)} s.`,
        `Project: ${r.dir}`,
        `Scene: ${r.scene}${r.scaffolded ? " (starter written; replace it with your scene)" : " (kept as is)"}`,
        `Voice lines (seconds):`,
        ...r.lines.map((l) => `  ${l.id}  ${l.start.toFixed(2)}-${l.end.toFixed(2)}  ${l.text.slice(0, 70)}`),
        `Next: write scene.html following ${GUIDE}, then call qa_explainer.`,
      ].join("\n"));
    } catch (e) {
      return text(`create_explainer failed: ${e.message}`, true);
    }
  },
);

server.registerTool(
  "qa_explainer",
  {
    description:
      "Explainer Studio step 2. Snapshot the scene at chosen moments and check the layout. Returns WARN lines (text off-frame, under the subtitles or watermark, overlapping text), scene errors, and a contact sheet image to look at. Fix and repeat until it is clean.",
    inputSchema: {
      name: explainerName,
      times: z.union([z.literal("lines"), z.array(z.number().min(0)).min(1).max(40)]).default("lines")
        .describe('"lines" = 2 frames per voice line, or a list of seconds to inspect.'),
      full: z.boolean().default(false).describe("Save 1920x1080 frames instead of 960x540."),
    },
  },
  async ({ name, times, full }) => {
    try {
      const r = await qaExplainer({ name, times, full });
      const warned = r.frames.filter((f) => f.warnings.length);
      const report = [
        `QA "${name}": ${r.frames.length} frames, scene length ${r.duration.toFixed(1)} s, ${warned.length} frames with warnings.`,
        ...r.errors.map((e) => `ERROR ${e}`),
        ...warned.map((f) => `t=${f.t.toFixed(2)} WARN ${f.warnings.join(" | ")}`),
        `Frames: ${path.dirname(r.sheet)}`,
        `Contact sheet: ${r.sheet}`,
      ].join("\n");
      const sheet = await readFile(r.sheet);
      return { content: [{ type: "text", text: report }, { type: "image", data: sheet.toString("base64"), mimeType: "image/jpeg" }], isError: false };
    } catch (e) {
      return text(`qa_explainer failed: ${e.message}`, true);
    }
  },
);

server.registerTool(
  "render_explainer",
  {
    description:
      'Explainer Studio step 3. Render the scene frame by frame with its voice. mode "preview" makes a fast 960x540 12 fps check in the project. mode "final" makes the 1080p30 master in the project and copies a compact MP4 and the .srt to ~/Artcraft/downloads/explainers, where H0x My Library shows them. A final render takes several minutes; only one Chrome job runs at a time.',
    inputSchema: {
      name: explainerName,
      mode: z.enum(["final", "preview"]).default("final"),
      from: z.number().min(0).default(0).describe("Start of a slice, in seconds."),
      to: z.number().min(0).optional().describe("End of a slice, in seconds. Default: the end."),
    },
  },
  async ({ name, mode, from, to }, extra) => {
    const token = extra?._meta?.progressToken;
    const onProgress = (progress, total) => {
      if (token !== undefined) extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress, total } }).catch(() => {});
    };
    try {
      const r = await renderExplainer({ name, mode, from, to, onProgress });
      return text([
        `Rendered ${r.frames} frames (${r.seconds.toFixed(1)} s of video) in ${r.renderSeconds} s.`,
        ...(r.restarts ? [`Chrome's page crashed ${r.restarts} time(s) (low memory?) and was reopened; the render resumed at the same frame.`] : []),
        `Master: ${r.master}`,
        ...(r.library ? [`My Library: ${r.library}`] : []),
        ...(r.subtitles ? [`Subtitles: ${r.subtitles}`] : []),
        ...r.errors.map((e) => `Scene error: ${e}`),
      ].join("\n"));
    } catch (e) {
      return text(`render_explainer failed: ${e.message}`, true);
    }
  },
);

await server.connect(new StdioServerTransport());

// ── providers ──

async function generateFree({ prompt, image_path, duration_seconds }) {
  const app = await GradioClient.connect(FREE_SPACE, process.env.HF_TOKEN ? { hf_token: process.env.HF_TOKEN } : {});
  const endpoint = image_path ? "/image_to_video" : "/text_to_video";
  const res = await app.predict(endpoint, {
    prompt,
    negative_prompt: "worst quality, inconsistent motion, blurry, jittery, distorted",
    input_image_filepath: image_path ? handle_file(await readFile(image_path).then((b) => new Blob([b]))) : null,
    height_ui: 512,
    width_ui: 704,
    mode: image_path ? "image-to-video" : "text-to-video",
    duration_ui: Math.min(duration_seconds, 8),
    randomize_seed: true,
  });
  const url = res.data?.[0]?.video?.url;
  if (!url) throw new Error("the Space returned no video");
  return download(url);
}

async function generateSeedance({ prompt, image_path, duration_seconds, resolution }) {
  const headers = { Authorization: `Bearer ${process.env.BYTEPLUS_API_KEY}`, "Content-Type": "application/json" };
  const content = [{ type: "text", text: prompt }];
  if (image_path) content.push({ type: "image_url", image_url: { url: await dataUrl(image_path) }, role: "first_frame" });
  const task = await json(fetch(`${SEEDANCE_BASE}/contents/generations/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: SEEDANCE_MODEL,
      content,
      // Seedance 1.0 renders 5 s or 10 s clips.
      duration: duration_seconds > 7 ? 10 : 5,
      resolution,
      ratio: image_path ? "adaptive" : "16:9",
      watermark: false,
    }),
  }));
  const done = await poll(async () => {
    const t = await json(fetch(`${SEEDANCE_BASE}/contents/generations/tasks/${task.id}`, { headers }));
    if (t.status === "failed") throw new Error(t.error?.message || "task failed");
    return t.status === "succeeded" ? t : null;
  });
  return download(done.content.video_url);
}

async function generateFal({ prompt, image_path, duration_seconds, model }) {
  const id = model || (image_path ? `${FAL_DEFAULT_MODEL}/image-to-video` : FAL_DEFAULT_MODEL);
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const input = { prompt, duration: `${Math.round(duration_seconds)}s` };
  if (image_path) input.image_url = await dataUrl(image_path);
  const queued = await json(fetch(`https://queue.fal.run/${id}`, { method: "POST", headers, body: JSON.stringify(input) }));
  await poll(async () => {
    const s = await json(fetch(queued.status_url, { headers }));
    return s.status === "COMPLETED" ? s : null;
  });
  const result = await json(fetch(queued.response_url, { headers }));
  const url = result.video?.url;
  if (!url) throw new Error("fal returned no video");
  return download(url);
}

// ── helpers ──

async function poll(check) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const result = await check();
    if (result) return result;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("timed out waiting for the video");
}

async function json(responsePromise) {
  const res = await responsePromise;
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function dataUrl(file) {
  const ext = path.extname(file).slice(1).toLowerCase().replace("jpg", "jpeg");
  return `data:image/${ext};base64,${(await readFile(file)).toString("base64")}`;
}

// Media files under dir (recursively); a missing folder is an empty library.
async function libraryFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(entries.map(async (e) => {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) return libraryFiles(file);
    const kind = MEDIA[path.extname(e.name).toLowerCase()];
    if (!kind || !e.isFile()) return [];
    const info = await stat(file);
    return [{ path: file, kind, size: info.size, created: info.mtimeMs }];
  }));
  return found.flat();
}

async function save(bytes, name, ext = "mp4") {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${name}.${ext}`);
  await writeFile(file, bytes);
  return file;
}

function text(message, isError = false) {
  return { content: [{ type: "text", text: message }], isError };
}
