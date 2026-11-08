---
name: ai-video
description: Generate AI images and short animated or photorealistic videos with the user's own provider key (BytePlus Seedance/Seedream, fal, Hugging Face) through the h0x MCP tools. Use when someone wants an AI-generated clip or still rather than a motion-graphics explainer.
---

# AI video with your key

## Keys

- Call `provider_status` first. It reports true/false only.
- Never ask for a key in chat, and never repeat, print or log one. If the user pastes a key, don't echo it; suggest they rotate it.
- The user sets keys themselves: in H0x Studio → Settings → Providers & keys for the app, and as environment variables for these tools (`BYTEPLUS_API_KEY` for Seedance and Seedream, `FAL_KEY` for fal, `HF_TOKEN` for a higher free quota) in their shell or the `env` block of `~/.claude/settings.json`, followed by a Claude Code restart.
- Ask before the first call that uses a paid key: "OK to use your <provider> key for this?"

## Generate

1. **Prompt.** Agree on subject, motion, camera, lighting and style in one short exchange.
2. **Keyframe (optional, BytePlus).** `generate_image` with a detailed prompt and `size` (e.g. `2560x1440` for 16:9). Reference images guide characters or style. Show the path and ask if it looks right.
3. **Video.** `generate_video` with `provider` `seedance`, `fal` or `free`, the prompt, and `image_path` set to the keyframe for image-to-video. `duration_seconds` up to 10; `resolution` 720p halves Seedance cost. The free provider makes short, low-resolution clips.
4. **Hand-off.** Tell the user: "Your file is in H0x Studio → My Library", and give the saved path.
