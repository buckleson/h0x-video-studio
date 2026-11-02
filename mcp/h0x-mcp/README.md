# H0x Video Studio MCP server

Lets Claude (Claude Code or Claude Desktop) make videos for you. It runs on your computer and uses **your own** provider keys. No H0x account is needed.

## Tools

| Tool | What it does |
|---|---|
| `list_video_providers` | Shows which providers are ready and where videos are saved |
| `generate_video` | Makes a video from a prompt (and optionally animates an image), waits, and saves an `.mp4` |

## Providers

| Provider | Key (environment variable) | Notes |
|---|---|---|
| `free` | none (optional `HF_TOKEN`) | LTX-Video on a public Hugging Face Space. Short clips (up to about 8 s), 704×512. Shared daily GPU quota. |
| `seedance` | `BYTEPLUS_API_KEY` | Seedance 1.0 Pro on BytePlus ModelArk, 1080p, 5 or 10 s (set `BYTEPLUS_SEEDANCE_MODEL=seedance-1-0-pro-fast-251015` for the cheaper Fast model). New accounts get free tokens. Change the model with `BYTEPLUS_SEEDANCE_MODEL`. |
| `fal` | `FAL_KEY` | fal.ai models such as `fal-ai/veo3.1/fast` or `fal-ai/kling-video/v2.6/pro/text-to-video` (pass `model`). |

Videos are saved to `~/Videos/H0x Video Studio`. Set `H0X_OUTPUT_DIR` to change this.

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

**Claude Desktop:** add the same `h0x-video-studio` entry under `mcpServers` in `claude_desktop_config.json`.

Then ask Claude, for example: *"Make a 5-second video of a paper boat sailing through a neon city, with Seedance."*
