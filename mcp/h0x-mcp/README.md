# H0x Video Studio MCP server

Lets Claude (Claude Code or Claude Desktop) make videos for you. It runs on your computer and uses **your own** provider keys. No H0x account is needed.

## Tools

| Tool | What it does |
|---|---|
| `list_video_providers` | Shows which providers are ready and where videos are saved |
| `generate_video` | Makes a video from a prompt (and optionally animates an image), waits, and saves an `.mp4` |
| `generate_image` | Makes a still image with Seedream 4.5 (needs `BYTEPLUS_API_KEY`) and saves a `.png`. Use it as a keyframe for `generate_video`. |
| `list_library` | Lists the images and videos in My Library (`~/Artcraft/downloads`), newest first. Filter with `kind` (`image`, `video`, `all`) and `limit`. |
| `provider_status` | Says which providers have a key, in the environment or saved in the H0x app. Shows true/false only, never the key. |
| `open_library` | Gives the My Library folder and how to open it in the app |
| `create_explainer` | **Explainer Studio.** Voices a script (edge-tts) and creates an explainer project with timings, subtitles and a starter scene |
| `qa_explainer` | Snapshots the explainer scene, reports layout warnings and returns a contact sheet image |
| `render_explainer` | Renders the scene with its voice: a quick preview, or the 1080p30 final plus a copy in My Library |

## Explainer Studio

Voiced motion-graphics explainers with isometric 3D "Anatomy" figures, made by an agent. The agent writes a script and an HTML/GSAP scene. The tools do the voice, the layout checks and a deterministic frame-by-frame render. Finals land in `~/Artcraft/downloads/explainers`, so they show in My Library. The agent workflow, scene contract and figure method are in [EXPLAINER.md](EXPLAINER.md).

It also needs Google Chrome (or Chromium or Microsoft Edge), ffmpeg and Python 3 with `pip install edge-tts`. The browser is found in the usual places on Windows, macOS (`/Applications`) and Linux (`google-chrome`, `chromium` or `chromium-browser` on `PATH`); otherwise set `CHROME_PATH` to its executable. Projects are kept in `~/Artcraft/explainers` (set `H0X_EXPLAINER_DIR` to use a roomier drive). The isometric kit in `explainer/runtime/` is from [Anatomy](https://github.com/wheresryan22/anatomy) (MIT, see `explainer/runtime/LICENSE-anatomy`).

## Providers

| Provider | Key (environment variable) | Notes |
|---|---|---|
| `free` | none (optional `HF_TOKEN`) | LTX-Video on a public Hugging Face Space. Short clips (up to about 8 s), 704×512. Shared daily GPU quota. |
| `seedance` | `BYTEPLUS_API_KEY` | Seedance 1.0 Pro on BytePlus ModelArk, 1080p, 5 or 10 s (set `BYTEPLUS_SEEDANCE_MODEL=seedance-1-0-pro-fast-251015` for the cheaper Fast model). New accounts get free tokens. Change the model with `BYTEPLUS_SEEDANCE_MODEL`. |
| `fal` | `FAL_KEY` | fal.ai models such as `fal-ai/veo3.1/fast` or `fal-ai/kling-video/v2.6/pro/text-to-video` (pass `model`). |

Videos are saved to `~/Artcraft/downloads/h0x-mcp`. Set `H0X_OUTPUT_DIR` to change this.

## Set up

```bash
cd mcp/h0x-mcp
npm install
```

**Claude Code:** add this to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "h0x-video-studio": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/h0x-mcp/index.mjs"],
      "env": { "BYTEPLUS_API_KEY": "your-key" }
    }
  }
}
```

**Single file:** `npm run bundle` writes `dist/h0x-mcp.mjs`, the whole server in one file, plus `dist/explainer-runtime/` (scene runtime, GSAP, fonts). Copy the `dist` folder anywhere and point `args` at `dist/h0x-mcp.mjs`; it runs with plain `node` and needs no `npm install`.

**Claude Desktop:** add the same `h0x-video-studio` entry under `mcpServers` in `claude_desktop_config.json`.

Then ask Claude, for example: *"Make a 5-second video of a paper boat sailing through a neon city, with Seedance."*
