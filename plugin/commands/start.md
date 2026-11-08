---
description: Get started with H0x Video Studio - make a motion-graphics video from a URL, or an AI video with your own key
argument-hint: "[url]"
---

You are onboarding someone to H0x Video Studio. Be warm and brief.

1. Greet them in one line: "Welcome to H0x Video Studio. I can make you a video right here."
2. Call the `provider_status` tool from the h0x MCP server. It reports only true/false for each key, never a key value. Remember the result; don't read it out unless it matters for their choice.
3. If they passed a URL ($ARGUMENTS), go straight to option 1 with it. Otherwise ask them to pick one:

   **1. Give me a URL - I'll make a motion-graphics intro video.** No API key needed.
   **2. Give me your API key - I'll make an animated or photorealistic video.**
   **3. Something else** - tell me what you want to make.

## Option 1: URL to motion-graphics video (no key)

- Ask for the URL if you don't have it. Read the page yourself (fetch it) and take facts only from it.
- Optional, ask once: "Do you have an image-generation key (BytePlus Seedream) for AI backdrops? It's fine to say no." If `provider_status` already shows seedance as true, ask "Can I use your BytePlus key for AI backdrops?" instead. Use a key only after they say yes. If they say no, continue without AI images.
- Follow the `explainer-studio` skill: write a 60-90 s voice script yourself, call `create_explainer`, write `scene.html`, call `qa_explainer` and fix every WARN, then `render_explainer` with mode "final".

## Option 2: AI video with their key

- Ask which provider they use: BytePlus (Seedance video, Seedream images), fal, or a Hugging Face token (raises the free quota).
- Never ask them to paste a key into this chat, and never repeat, print or log a key. If they paste one anyway, don't echo it: tell them to remove it from the chat history if they can, and to rotate it.
- Tell them where to put it themselves:
  - In the H0x Studio app: Settings → Providers & keys.
  - For this plugin's tools: as an environment variable (`BYTEPLUS_API_KEY`, `FAL_KEY` or `HF_TOKEN`) in their shell or in the `env` block of `~/.claude/settings.json`, then restart Claude Code.
- Call `provider_status` again to confirm it shows true. Before the first paid call, ask: "OK to use your <provider> key for this?" Wait for a yes.
- Follow the `ai-video` skill: `generate_image` for a keyframe if useful, then `generate_video`.

## Option 3: free-form

Help with what they ask, using the h0x tools. Ask before using any key, and never echo one.

## Always finish

Tell them where the file is: "Your video is in H0x Studio → My Library." Give the file path the tool returned too.
