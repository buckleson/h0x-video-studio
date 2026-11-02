#!/usr/bin/env node
// H0x Video Studio MCP server: lets an MCP client (Claude Code, Claude Desktop)
// generate videos with the user's own provider keys. Runs locally over stdio.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client as GradioClient, handle_file } from "@gradio/client";
import { z } from "zod";

const OUTPUT_DIR = process.env.H0X_OUTPUT_DIR || path.join(homedir(), "Videos", "H0x Video Studio");
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
    label: "Free: LTX-Video on a public Hugging Face Space (short, 704x512, no key; HF_TOKEN raises the quota)",
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
      file_name: z.string().regex(/^[\w-]+$/).optional().describe("Output file name without extension."),
    },
  },
  async ({ prompt, size, file_name }) => {
    if (!PROVIDERS.seedance.ready()) return text("Image generation needs BYTEPLUS_API_KEY.", true);
    try {
      const res = await json(fetch(`${SEEDANCE_BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.BYTEPLUS_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: SEEDREAM_MODEL, prompt, size, response_format: "url", watermark: false }),
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

async function generateSeedance({ prompt, image_path, duration_seconds }) {
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
      resolution: "1080p",
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

async function save(bytes, name, ext = "mp4") {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${name}.${ext}`);
  await writeFile(file, bytes);
  return file;
}

function text(message, isError = false) {
  return { content: [{ type: "text", text: message }], isError };
}
