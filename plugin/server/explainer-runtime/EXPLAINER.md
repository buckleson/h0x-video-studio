# Explainer Studio: agent guide

Explainer Studio lets an agent (Claude Code or any MCP client connected to the H0x MCP server) make a voiced motion-graphics explainer with isometric 3D figures, called "Anatomy" figures. The result is a 1080p30 MP4 with a female voice and burned-in subtitles. It appears in H0x **My Library**.

You write the script and the scene. The tools do the voice, the checks and the render.

```
script ──create_explainer──▶ voice + timings + subtitles + starter scene.html
                              │
            you write scene.html (HTML + GSAP + Anatomy kit)
                              │
         ┌──── qa_explainer ◀─┘   (snapshots, WARN list, contact sheet image)
         │ fix, repeat until clean
         ▼
render_explainer mode "preview"  (fast motion check, optional)
render_explainer mode "final"    (1080p30 master + copy in My Library)
```

## 1. Write the script

Each voice line has a stable `id`, the spoken `text` and a storyboard note `show` (what the picture shows while it is spoken). Keep lines to one or two sentences, so beats stay tight. 12–16 lines make a 90–120 s explainer.

```json
{
  "name": "how-rollups-work",
  "script": {
    "title": "How rollups work",
    "voice": "en-US-AvaMultilingualNeural",
    "rate": "+2%",
    "style": "Dark ink #070b16, accent #0066FF, Jakarta, calm expo easing, isometric bench instruments.",
    "display": { "Hyper-Ox": "Hyper 0X" },
    "lines": [
      { "id": "l1", "text": "Every blockchain has a speed limit.", "show": "Title card; an isometric toll gate with a queue of cars." },
      { "id": "l2", "text": "A rollup batches thousands of payments into one.", "show": "A press squeezes 1,000 slips into one sealed block.", "pause": 0.6 }
    ]
  }
}
```

- `display` maps a spoken spelling to the subtitle spelling. Use it when the voice needs a phonetic spelling ("Hyper-Ox"), but the screen must show the brand ("Hyper 0X").
- Facts must be true. For Buckleson products, take facts only from the product brief you were given.
- Calling `create_explainer` again with an edited script re-speaks only the changed lines. It never overwrites `scene.html`. Timings can shift, so run `qa_explainer` again afterwards.

The result lists every line with its start and end in seconds, and the project folder:

```
<H0X_EXPLAINER_DIR>/<name>/
  script.json
  scene.html            ← you write this (a working starter is created)
  build/voice.mp3  build/timings.js  build/timings.json  build/subs.srt
  build/qa/             ← qa_explainer frames + contact-sheet.jpg
  out/<name>.mp4        ← final master;  out/preview.mp4
  (anything else you add: scene.js, scene.css, broll/, svg/)
```

## 2. Write the scene

The scene is one HTML page that the renderer steps through frame by frame. A local server serves it:

| URL | Serves |
|---|---|
| `/scene.html`, `/build/…`, `/broll/…` | files in the project folder |
| `/engine/h0x.css`, `/engine/h0x.js` | the base styles (fonts, subtitles, watermark, `.safe`) and the runtime |
| `/engine/gsap.min.js` | GSAP 3 |
| `/engine/iso-kit.mjs`, `/engine/iso.css` | the Anatomy kit (MIT, by Ryan) and its tone styles |

Only files in these places load. There is no network at render time, so use no CDNs or web fonts.

### Contract

```html
<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/engine/h0x.css">
<link rel="stylesheet" href="/engine/iso.css">
<link rel="stylesheet" href="scene.css">
<div id="stage">
  <section class="scene" id="s-intro"> <h1>…</h1> <div class="fig iso" id="fig-gate"></div> </section>
  <section class="scene" id="s-batch"> … </section>
</div>
<script src="/engine/gsap.min.js"></script>
<script src="build/timings.js"></script>
<script src="/engine/h0x.js"></script>
<script type="module">
  import * as k from "/engine/iso-kit.mjs";
  const { tl, at, end, show, words } = H0X.boot({ watermark: { label: "H0x" } });
  show("#s-intro", 0, at("l2", -0.3));                    // scene visible from 0 until just before l2
  tl.from(words("#s-intro h1"), { y: 50, opacity: 0, stagger: 0.08, duration: 0.7, ease: "expo.out" }, at("l1"));
</script>
```

- `H0X.boot({ watermark: { src, label }, subtitles = true })` creates the subtitles and the watermark, and returns:
  - `tl`, the paused master timeline;
  - `at(id, offset)`, the start of a voice line in seconds;
  - `end(id, offset)`, the end of a voice line;
  - `show(sel, from, to)`, which crossfades a whole `.scene` in and out;
  - `words(sel)`, which splits text into word spans for staggered reveals.
- **Everything moves on `tl`.** Do not use CSS animations or transitions (`h0x.css` switches them off), `setTimeout`, `Date`, or unseeded `Math.random()`. The renderer seeks `tl` to each frame, so nothing off the timeline renders.
- **Timing:** an element's entrance lands within about 0.3 s of the words it illustrates. Keep one or two scenes visible at a time.
- **Layout:** the canvas is fixed at 1920×1080 px.
  - Keep content inside `.safe` (140 px left and right, 110 px top, 210 px bottom).
  - The subtitles fill the bottom band.
  - The watermark sits in the top-right corner (about 260×90 px).
  - On-screen text is at least 28 px.
- **Fonts:** `Jakarta` (sans), `Grotesk`, `Playfair` (serif, italic too) and `Mono`.
- **Images and b-roll:** put them in the project, for example `broll/`.
  - Make stills with `generate_image` and clips with `generate_video` on the same server. They are saved in `~/Artcraft/downloads/h0x-mcp`; copy the ones you use into `broll/`.
  - A video plays in sync when written as `<video src="broll/x.mp4" muted playsinline preload="auto" data-start="12.3">`. The renderer seeks it to `t − 12.3`.
- **Logos:** do not use third-party company logos. Write names as text pills.

## 3. Anatomy figures (isometric 3D)

**The object is the explanation.** Don't draw boxes, arrows and labels. Invent a real, well-made physical thing whose working *is* the idea:
- a toll gate for a rate limit;
- a press that seals slips into a block for batching;
- a chain of receipt slips anchored into a slab for an audit log;
- a row of inspection gates for a security pipeline.

The figure is built from many small, precise parts (40–80 for a main figure): a base plate on feet, corner screws, rails, posts, a label plate, ruler ticks, and the moving mechanism. Build it in the scene's module script with the kit. The geometry is pure and deterministic, so it renders identically every frame.

### Kit cheat sheet (`import * as k from "/engine/iso-kit.mjs"`)

World units: x and y on the floor, z up. Plans are rounded rectangles `{ x, y, w, d, r }`.

| Need | Call |
|---|---|
| Camera fitted to a box of points | `P = k.fitProjection(k.boxCorners(plan, z0, z1), width, height, { pad: 24, azimuth: 45 })` (azimuth 35–60 shows a long side) |
| Point to screen | `k.iso([x, y, z], P)` |
| Block or plate (four-tone sides + top) | `k.slabOf(plan, z, height, P, steps = 8, bevel = 0)` |
| Round part | `k.cylinder(cx, cy, radius, z, height, P, steps = 32, bevel)` |
| Paint a solid | `k.solidSvg(paths, { tone: "lo" \| "mid" \| "hi", lit, crease, halo, flat })` |
| Lines on a top face | `k.planOutline(plan, z, P)`, `k.lineOnTop(from, to, z, P)`, `k.ring(cx, cy, r, z, P)` |
| Ruler ticks | `k.topTicks(from, to, step, every, edge, z, [minor, major], P)` returns `{ minor, major }` |
| Knurled knob, coil spring | `k.knurl(cx, cy, r, z0, z1, count, P)`, `k.coil(from, to, center, radius, turns, axis, P)` |
| Draw a line | `k.lineSvg(d, { tone, dotted, dashed, free })` |
| Screws and dots | `k.dotsSvg(points, { size, tone })` with points from `k.iso` and `k.corners(plan, inset)` |
| Wire with terminal dots | `k.wireSvg(fromPt, toPt, { via, tone })` |
| Soft shadow under a part | `` `<path class="iso-halo" d="${k.haloOf(plan, z, h, P)}"/>` `` |
| Text engraved on a face | `k.faceTextSvg(k.topMatrix(at, z, P), "TEXT", { size, tone })` or `k.sideMatrix(at, z, P, face)` |
| Depth sort | `items.sort((a, b) => k.depthOf(a, P) - k.depthOf(b, P))` |
| Move along a world axis | `[dx, dy] = k.axisVector(P, [0, 0, 1])`, then `tl.to(part, { x: dx * 20, y: dy * 20 })` moves 20 units up z |
| Wrap as SVG | `el.innerHTML = k.figureSvg({ width, height, label, body: [...] })` inside an element with class `iso` |

### Craft rules

- **Solids, not wireframes.** Every part is filled and painted **back to front, bottom to top**: base, then structure, then mechanism, then the subject. Split anything that wraps another part (a spring around a rod) into back and front halves.
- **Tone hierarchy:**
  - base and feet are `lo`, structure is `mid`, the subject is `hi`;
  - exactly **one** part is `lit: true`, the one the viewer should watch;
  - grooves are `faint`, minor ticks `lo` and major ticks `mid`.
- **Detail belongs to parts:**
  - bevels of 0.4–1.6;
  - grooves inset 3–5 units from an edge;
  - screws as small dots with a ring at the plate corners;
  - ticks every 4–5 units, with every 5th one major.
- **Lines end on something:** a face, another line or a terminal dot. Do not add floating leader lines or dimension arrows. Put titles and labels in the HTML around the figure, not inside the drawing.
- **Volume:** parts stand on other parts, and lifted parts get a halo.
- **Colour:** tone the kit to the brand by setting the `--anatomy-*` variables on the `.iso` wrapper: `--anatomy-paper`, `-face`, `-top`, `-shade-0..3`, `-hi`, `-mid`, `-lo`, `-faint`, `-lit-top`, `-lit-shade`. The starter scene shows a blue palette.
- **Motion:**
  - wrap each moving part in `<g id="…">` and move it on `tl` along `k.axisVector` screen vectors;
  - reveal parts bottom-up with a short stagger;
  - use calm `power3`/`expo` eases;
  - draw lines on with `strokeDasharray`/`strokeDashoffset`.
  Don't rebuild geometry per frame.
- With the `anatomy` skill installed (Claude Code), load it for the full method and the parts vocabulary. You only need its static SVG geometry, animated by GSAP; skip its interactive, WebGL and gallery parts.

## 4. Check the layout: `qa_explainer`

- `times: "lines"` (the default) takes 2 frames per voice line. `times: [12.5, 40.2]` inspects chosen moments, and `full: true` saves them at full size.
- The result includes:
  - `WARN` lines: text off-frame, under a subtitle, under the watermark, or overlapping other text;
  - `ERROR` lines: script errors and files that failed to load;
  - the contact sheet as an image. Look at it.
- Fix every WARN unless it is clearly intentional. Then check by eye:
  - Is the layout balanced?
  - Is all text readable?
  - Is there no empty frame longer than about 1 s?
  - Is nothing left over from the previous scene?
  - Do the figures read as real objects?
- Iterate until it looks premium.

## 5. Render: `render_explainer`

- `mode: "preview"` writes `out/preview.mp4` at 960×540 and 12 fps with the voice. Use `from`/`to` for a slice, for example a 6-second motion check.
- `mode: "final"` writes the 1080p30 master `out/<name>.mp4` (crf 17). It also copies a compact MP4 (crf 23) and `<name>.srt` to `~/Artcraft/downloads/explainers/`, where **My Library** shows them.
  - A final render runs at roughly real time × 3–6, so a 100 s video takes 5–10 minutes.
  - Set `MCP_TOOL_TIMEOUT` high enough in your client.
- Only one Chrome job (QA or render) runs at a time per server. Calls queue, which keeps 8 GB machines usable.

## Setup

- **Machine:** Node 20+, Google Chrome (or set `CHROME_PATH`), ffmpeg on `PATH`, and Python 3 with `pip install edge-tts` (or set `H0X_PYTHON`). The voice uses Microsoft Edge's online TTS service, so `create_explainer` needs the internet.
- **Folders:**
  - `H0X_EXPLAINER_DIR` holds the projects and masters. The default is `~/Artcraft/explainers`. Point it at a roomy drive.
  - `H0X_EXPLAINER_LIBRARY_DIR` is where final copies go. The default is `~/Artcraft/downloads/explainers`.
- **Tests:** run `npm test` in this folder. The tests use an offline fake voice and skip the Chrome cases when Chrome is missing.
