---
name: explainer-studio
description: Script, build, QA and render a voiced motion-graphics explainer video (isometric 3D figures, GSAP, subtitles) with the h0x MCP tools. Use when someone wants an intro, explainer or promo video from a URL, product brief or topic. Needs no API key.
---

# Explainer Studio

Read the full guide before writing a scene: `${CLAUDE_PLUGIN_ROOT}/server/explainer-runtime/EXPLAINER.md`. It has the scene contract, the Anatomy kit cheat sheet, the craft rules and the setup (Node 20+, Chrome, ffmpeg, Python with `edge-tts`).

## Workflow

1. **Facts.** Take facts only from the source you were given (a URL you fetched, a product brief). Never invent numbers, customers or features.
2. **Script.** Write 10-16 voice lines of one or two sentences each, every line with an `id`, the spoken `text` and a `show` storyboard note. 60-90 s suits an intro. Use `display` when the spoken spelling differs from the on-screen brand.
3. **`create_explainer`** with `{ name, script }`. It speaks the lines, writes timings and subtitles, and a starter `scene.html`. Note the project folder and the line timings it returns.
4. **Scene.** Write `scene.html` in the project folder: one `.scene` section per beat, everything animated on the `tl` timeline, entrances within about 0.3 s of their words, content inside `.safe`, text at least 28 px. Build one real isometric object per idea with the kit; no boxes-and-arrows diagrams, no third-party logos. Optional AI backdrops: only with the user's yes to using their image key, via `generate_image`, copied into `broll/`.
5. **`qa_explainer`.** Look at the contact sheet. Fix every WARN and ERROR, check balance, readability, empty frames and leftovers, and repeat until clean.
6. **`render_explainer`** with mode `"preview"` (optional, a short `from`/`to` slice) and then `"final"`. A final render takes several minutes.
7. **Hand-off.** Tell the user: "Your video is in H0x Studio → My Library", and give the path the tool returned.
