// Explainer Studio engine: voice (edge-tts), layout QA snapshots and deterministic rendering
// of GSAP-timeline scenes to 1080p30 MP4. Used by the H0x MCP tools create_explainer,
// qa_explainer and render_explainer (see ../EXPLAINER.md for the agent workflow).
//
// A project is a folder <H0X_EXPLAINER_DIR>/<name>/ holding script.json, build/ (voice,
// timings, subtitles), scene.html and out/ (masters). Scenes are served over a local HTTP
// server: "/" is the project folder and "/engine/", "/fonts/" are the shared runtime.
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The single-file bundle (build-bundle.mjs) ships its assets in explainer-runtime/ next to it.
const BUNDLED = path.join(HERE, "explainer-runtime");
const IS_BUNDLE = existsSync(BUNDLED);
const MODULES = path.join(HERE, "..", "node_modules");
const RUNTIME = IS_BUNDLE ? path.join(BUNDLED, "engine") : path.join(HERE, "runtime");
const FONTS = IS_BUNDLE ? path.join(BUNDLED, "fonts") : path.join(MODULES, "@fontsource-variable");
const TTS = path.join(IS_BUNDLE ? BUNDLED : HERE, "tts.py");
export const GUIDE = IS_BUNDLE ? path.join(BUNDLED, "EXPLAINER.md") : path.join(HERE, "..", "EXPLAINER.md");
export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const workDir = () => process.env.H0X_EXPLAINER_DIR || path.join(homedir(), "Artcraft", "explainers");
// The app's My Library lists everything under ~/Artcraft/downloads.
export const libraryDir = () => process.env.H0X_EXPLAINER_LIBRARY_DIR || path.join(homedir(), "Artcraft", "downloads", "explainers");

export function projectDir(name) {
  if (!NAME_RE.test(name)) throw new Error(`invalid explainer name "${name}" (use lowercase letters, digits and dashes)`);
  return path.join(workDir(), name);
}

async function requireProject(name) {
  const dir = projectDir(name);
  if (!existsSync(path.join(dir, "build", "timings.js"))) throw new Error(`no explainer "${name}" in ${workDir()}; run create_explainer first`);
  if (!existsSync(path.join(dir, "scene.html"))) throw new Error(`${dir} has no scene.html`);
  return dir;
}

// ── create ──

export async function createExplainer({ name, script }) {
  const dir = projectDir(name);
  await mkdir(path.join(dir, "build"), { recursive: true });
  await writeFile(path.join(dir, "script.json"), JSON.stringify(script, null, 1));
  // tts.py caches each line's audio by text/voice/rate, so re-running only re-speaks changed lines.
  await run(process.env.H0X_PYTHON || (process.platform === "win32" ? "python" : "python3"), [TTS, "script.json", "build"], { cwd: dir });
  const timings = JSON.parse(await readFile(path.join(dir, "build", "timings.json"), "utf8"));
  const scene = path.join(dir, "scene.html");
  const scaffolded = !existsSync(scene);
  if (scaffolded) await writeFile(scene, starterScene(script));
  return {
    dir,
    scene,
    scaffolded,
    total: timings.total,
    lines: timings.lines.map(({ id, start, end, text }) => ({ id, start, end, text })),
    files: ["script.json", "build/voice.mp3", "build/timings.js", "build/timings.json", "build/subs.srt"].map((f) => path.join(dir, f)),
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A working placeholder scene: a title card with a small Anatomy figure, then one card per
// voice line showing its storyboard note. The agent replaces it with the real scene.
export function starterScene(script) {
  const lines = script.lines;
  const cards = lines.slice(1).map((l) => `
<section class="scene card" id="s-${esc(l.id)}">
  <div class="safe"><p class="tag">${esc(l.id)} · placeholder</p><h2>${esc(l.show || l.text)}</h2></div>
</section>`).join("");
  const beats = lines.slice(1).map((l, i) => {
    const next = lines[i + 2];
    return `  show("#s-${l.id}", at("${l.id}", -0.3), ${next ? `at("${next.id}", -0.3)` : "null"});
  tl.from("#s-${l.id} h2", { y: 40, opacity: 0, duration: 0.7, ease: "expo.out" }, at("${l.id}"));`;
  }).join("\n");
  const first = lines[0].id;
  const second = lines[1]?.id;
  return `<!doctype html><meta charset="utf-8">
<title>${esc(script.title)}</title>
<link rel="stylesheet" href="/engine/h0x.css">
<link rel="stylesheet" href="/engine/iso.css">
<style>
  :root { --bg: #070b16; }
  .iso { --anatomy-paper: #0d1426; --anatomy-face: #14203a; --anatomy-top: #1a2a4a; --anatomy-hi: #9cc0ff; --anatomy-mid: #4c6aa8; --anatomy-lo: #2b3d66; --anatomy-faint: #1c2947;
         --anatomy-shade-0: #0a1222; --anatomy-shade-1: #0d172b; --anatomy-shade-2: #111d36; --anatomy-shade-3: #152442; --anatomy-lit-top: #2a62ff; --anatomy-lit-shade: #1d47c4; }
  #s-title h1 { position: absolute; left: 140px; top: 330px; width: 820px; font: 800 96px/1.02 "Jakarta"; letter-spacing: -0.02em; }
  #s-title .fig { position: absolute; right: 140px; top: 170px; width: 760px; }
  .card h2 { position: absolute; top: 300px; left: 0; right: 0; font: 600 52px/1.2 "Jakarta"; color: #c9d6f5; }
  .card .tag { font: 500 26px/1 "Mono"; color: #4c6aa8; text-transform: uppercase; letter-spacing: 0.1em; }
</style>

<div id="stage">
<section class="scene" id="s-title">
  <h1>${esc(script.title)}</h1>
  <div class="fig iso" id="fig-title"></div>
</section>${cards}
</div>

<script src="/engine/gsap.min.js"></script>
<script src="build/timings.js"></script>
<script src="/engine/h0x.js"></script>
<script type="module">
  import * as k from "/engine/iso-kit.mjs";
  const { tl, at, end, show, words } = H0X.boot({ watermark: { label: "H0x" } });

  // Anatomy figure: a base plate with a raised, lit block. Geometry is pure and deterministic.
  const plate = { x: 0, y: 0, w: 160, d: 110, r: 8 };
  const block = { x: 45, y: 30, w: 70, d: 50, r: 5 };
  const P = k.fitProjection(k.boxCorners(plate, -6, 60), 760, 520, { pad: 30 });
  document.querySelector("#fig-title").innerHTML = k.figureSvg({
    width: 760, height: 520, label: "starter figure",
    body: [
      \`<path class="iso-halo" d="\${k.haloOf(plate, -6, 6, P)}"/>\`,
      k.solidSvg(k.slabOf(plate, -6, 6, P, 8, 1.2), { tone: "mid" }),
      k.lineSvg(k.planOutline(k.insetPlan(plate, 6), 0, P), { tone: "lo" }),
      \`<g id="lift">\${k.solidSvg(k.slabOf(block, 0, 30, P, 6, 1), { tone: "hi", lit: true })}</g>\`,
    ],
  });
  const [dx, dy] = k.axisVector(P, [0, 0, 1]); // screen offset of one unit up the z axis

  show("#s-title", 0, ${second ? `at("${second}", -0.3)` : "null"});
  tl.from(words("#s-title h1"), { y: 50, opacity: 0, stagger: 0.08, duration: 0.7, ease: "expo.out" }, at("${first}"));
  tl.from("#lift", { x: dx * 40, y: dy * 40, opacity: 0, duration: 1.2, ease: "power3.out" }, at("${first}", 0.4));
${beats}
</script>
`;
}

// ── local server ──

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
};

// Maps a URL path to a file. Returns null for anything outside the allowed roots.
export function resolveUrl(projectRoot, urlPath) {
  const p = decodeURIComponent(urlPath.split("?")[0]);
  const inside = (root, rel) => {
    const file = path.resolve(root, "." + path.posix.normalize("/" + rel));
    return file === root || file.startsWith(root + path.sep) ? file : null;
  };
  if (p === "/engine/gsap.min.js" && !IS_BUNDLE) return path.join(MODULES, "gsap", "dist", "gsap.min.js");
  if (p.startsWith("/engine/")) return inside(RUNTIME, p.slice(8));
  const font = p.match(/^\/fonts\/([a-z-]+)\/([\w.-]+\.woff2)$/);
  if (font) return path.join(FONTS, font[1], "files", font[2]);
  return inside(path.resolve(projectRoot), p.slice(1));
}

async function serve(projectRoot) {
  const server = http.createServer(async (req, res) => {
    const file = resolveUrl(projectRoot, req.url);
    const info = file && (await stat(file).catch(() => null));
    if (!info?.isFile()) { res.writeHead(404); return res.end(); }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    // Chrome needs byte ranges to seek <video> b-roll.
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const stop = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${stop}/${info.size}`, "Content-Length": stop - start + 1, "Accept-Ranges": "bytes" });
      return createReadStream(file, { start, end: stop }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Accept-Ranges": "bytes" });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => {
    server.close(r);
    // Chrome keeps idle and pre-opened sockets alive, which would hold close() for minutes.
    server.closeAllConnections();
  }) };
}

// ── Chrome (one at a time) ──

let queue = Promise.resolve();
// Runs fn after every earlier Chrome job in this process has finished (8 GB RAM laptops).
function exclusive(fn) {
  const job = queue.then(fn, fn);
  queue = job.catch(() => {});
  return job;
}

const CHROME_PATHS = {
  win32: () => [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ],
  darwin: () => [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: () => ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"].map(which),
};

export const CHROME_HELP = "Chrome or Edge not found. Install Google Chrome, or set CHROME_PATH to the browser executable, e.g. "
  + '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" (macOS), /usr/bin/chromium (Linux) or '
  + '"C:/Program Files/Google/Chrome/Application/chrome.exe" (Windows).';

// CHROME_PATH wins; otherwise the usual Chrome/Chromium/Edge locations for the platform.
export function findChrome(platform = process.platform) {
  if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  return (CHROME_PATHS[platform] || CHROME_PATHS.linux)().find((c) => c && existsSync(c)) || null;
}

// Like `which`: the first executable called name on PATH.
function which(name) {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const file = dir && path.join(dir, name);
    if (file && existsSync(file)) return file;
  }
  return null;
}

// Opens scene.html in headless Chrome and calls fn(page, ctx). ctx.reopen() replaces a crashed
// page (relaunching Chrome if it died), so a long render can carry on from the same frame.
async function withScene(dir, { scale = 1 }, fn) {
  return exclusive(async () => {
    const chrome = findChrome();
    if (!chrome) throw new Error(process.env.CHROME_PATH ? `CHROME_PATH does not exist: ${process.env.CHROME_PATH}` : CHROME_HELP);
    const server = await serve(dir);
    const errors = [];
    let browser = null;
    const launch = () => puppeteer.launch({
      executablePath: chrome,
      headless: true,
      // A page that hangs under memory pressure fails within a minute and is reopened.
      protocolTimeout: 60000,
      // Keep Chrome's profile next to the projects, not on the system drive.
      userDataDir: path.join(workDir(), ".chrome-profile"),
      args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--mute-audio"],
    });
    const open = async () => {
      if (!browser?.connected) {
        await browser?.close().catch(() => {});
        browser = await launch();
      }
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: scale });
      page.on("pageerror", (e) => errors.push(e.message));
      // Failed loads are reported with their URL by the response handler below.
      page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text()); });
      page.on("requestfailed", (r) => errors.push(`failed to load ${r.url().replace(server.url, "")}`));
      page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`HTTP ${r.status()} ${r.url().replace(server.url, "")}`); });
      await page.goto(`${server.url}/scene.html`, { waitUntil: "load", timeout: 120000 });
      await page.waitForFunction(() => !!(window.__timeline && window.__ready), { timeout: 30000 }).catch(() => {
        throw new Error(`scene did not start (window.__timeline missing). ${errors.join("; ")}`.trim());
      });
      await page.evaluate(() => window.__ready);
      return page;
    };
    try {
      let page = await open();
      const reopen = async () => {
        await page.close().catch(() => {});
        page = await open();
        return page;
      };
      return await fn(page, { browser, errors, reopen });
    } finally {
      await browser?.close().catch(() => {});
      await server.close();
    }
  });
}

// Seek the timeline to t and wait for <video data-start> b-roll and two paints.
async function seek(page, t) {
  await page.evaluate(async (t) => {
    window.__timeline.seek(t, false);
    const vids = [...document.querySelectorAll("video[data-start]")];
    await Promise.all(vids.map((v) => new Promise((res) => {
      const local = Math.max(0, Math.min(t - Number(v.dataset.start), (v.duration || 1e9) - 0.05));
      if (Math.abs(v.currentTime - local) < 0.001) return res();
      v.addEventListener("seeked", res, { once: true });
      v.currentTime = local;
    })));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
}

// ── QA ──

// Runs in the page: visible text boxes that leave the frame, sit under a subtitle or the
// watermark, or overlap each other.
function layoutWarnings() {
  const vis = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };
  const boxes = [...document.querySelectorAll("#stage h1,#stage h2,#stage h3,#stage p,#stage span,#stage li,#stage label,#stage .txt")]
    .filter((e) => e.textContent.trim() && e.children.length === 0 && vis(e))
    .map((e) => ({ e, r: e.getBoundingClientRect(), t: e.textContent.trim().slice(0, 30) }))
    .filter((b) => b.r.width > 2 && b.r.height > 2);
  const subs = [...document.querySelectorAll("#subs .cue")].filter((c) => Number(getComputedStyle(c).opacity) > 0.05).map((c) => c.getBoundingClientRect());
  const wm = document.querySelector("#wm")?.getBoundingClientRect();
  const hit = (a, b) => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (a.r.right > 1921 || a.r.bottom > 1081 || a.r.left < -1 || a.r.top < -1) out.push(`off-frame: "${a.t}"`);
    for (const s of subs) if (hit(a.r, s)) out.push(`under subtitle: "${a.t}"`);
    if (wm && wm.width > 0 && hit(a.r, wm)) out.push(`under watermark: "${a.t}"`);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      if (hit(a.r, b.r)) out.push(`overlap: "${a.t}" x "${b.t}"`);
    }
  }
  return [...new Set(out)].slice(0, 8);
}

// times: "lines" (0.9 s into each voice line and just before its end) or a list of seconds.
export async function qaExplainer({ name, times = "lines", full = false }) {
  const dir = await requireProject(name);
  const outDir = path.join(dir, "build", "qa");
  await mkdir(outDir, { recursive: true });
  return withScene(dir, { scale: full ? 1 : 0.5 }, async (page, { browser, errors }) => {
    const list = times === "lines"
      ? await page.evaluate(() => window.TIMINGS.lines.flatMap((l) => [l.start + 0.9, Math.max(l.start + 0.9, l.end - 0.2)]))
      : times;
    const duration = await page.evaluate(() => window.__timeline.duration());
    const frames = [];
    for (const t of list) {
      await seek(page, t);
      const warnings = await page.evaluate(layoutWarnings);
      const file = path.join(outDir, `t${t.toFixed(2).padStart(7, "0")}.png`);
      await page.screenshot({ path: file });
      frames.push({ t, file, warnings });
    }
    const sheet = await contactSheet(browser, outDir, frames);
    return { duration, frames, sheet, errors: [...new Set(errors)] };
  });
}

async function contactSheet(browser, outDir, frames) {
  const cols = 4, w = 480, h = 270;
  const cells = frames.map((f) => `<div style="position:relative"><img src="${path.basename(f.file)}" style="width:${w}px;height:${h}px;display:block"><b style="position:absolute;left:6px;top:4px;color:${f.warnings.length ? "#f55" : "#ff0"};font:14px monospace;background:#000b;padding:1px 5px">${f.t.toFixed(1)}s${f.warnings.length ? " WARN" : ""}</b></div>`).join("");
  await writeFile(path.join(outDir, "contact-sheet.html"), `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px">${cells}</body>`);
  const server = await serve(outDir);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: cols * (w + 4), height: Math.ceil(frames.length / cols) * (h + 4), deviceScaleFactor: 1 });
    await page.goto(`${server.url}/contact-sheet.html`, { waitUntil: "load" });
    const file = path.join(outDir, "contact-sheet.jpg");
    await page.screenshot({ path: file, type: "jpeg", quality: 82, fullPage: true });
    return file;
  } finally {
    await server.close();
  }
}

// ── render ──

// mode "final": 1920x1080 at 30 fps with voice -> out/<name>.mp4 (crf 17 master), plus a
// crf 23 copy and the .srt in the My Library folder. mode "preview": 960x540 at 12 fps with
// voice -> out/preview.mp4 (a quick motion check; nothing is copied to the library).
export async function renderExplainer({ name, mode = "final", from = 0, to, onProgress = () => {} }) {
  const dir = await requireProject(name);
  const preview = mode === "preview";
  const fps = preview ? 12 : 30;
  await mkdir(path.join(dir, "out"), { recursive: true });
  const master = path.join(dir, "out", preview ? "preview.mp4" : `${name}.mp4`);
  // ffmpeg writes a .part file that replaces the master only when the render completes.
  const partial = master.replace(/\.mp4$/, ".part.mp4");
  const voice = path.join(dir, "build", "voice.mp3");
  const audio = existsSync(voice);
  const started = Date.now();
  const result = await withScene(dir, { scale: preview ? 0.5 : 1 }, async (page, { errors, reopen }) => {
    const duration = await page.evaluate(() => window.__timeline.duration());
    const end = Math.min(to ?? duration, duration);
    if (!(end > from)) throw new Error(`nothing to render: from ${from} to ${end}`);
    const frames = Math.round((end - from) * fps);
    const ff = spawn("ffmpeg", [
      "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
      ...(audio ? ["-ss", String(from), "-t", String(end - from), "-i", voice] : []),
      "-c:v", "libx264", "-crf", preview ? "26" : "17", "-preset", preview ? "veryfast" : "medium", "-pix_fmt", "yuv420p", "-threads", "2",
      ...(audio ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
      "-movflags", "+faststart", partial,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (d) => { stderr += d; });
    const closed = new Promise((r, j) => { ff.on("close", r); ff.on("error", j); });
    let restarts = 0;
    try {
      for (let i = 0; i < frames; i++) {
        let buf;
        try {
          await seek(page, from + i / fps);
          buf = await capture(page, preview);
        } catch (e) {
          // A page that crashed (low memory) is reopened; the timeline is deterministic, so
          // re-seeking to frame i continues the video seamlessly.
          if (++restarts > MAX_RESTARTS) throw new Error(`${e.message} (gave up after ${MAX_RESTARTS} page restarts; free some memory and render again)`);
          page = await reopen();
          i--;
          continue;
        }
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
        if (i % (fps * 5) === 0) onProgress(i, frames);
      }
    } catch (e) {
      ff.kill();
      await closed.catch(() => {});
      throw e;
    }
    ff.stdin.end();
    const code = await closed;
    if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.slice(-400)}`);
    return { frames, seconds: end - from, restarts, errors: [...new Set(errors)] };
  }).catch(async (e) => {
    await rm(partial, { force: true });
    throw e;
  });
  await rename(partial, master);
  const out = { ...result, master, renderSeconds: Math.round((Date.now() - started) / 1000) };
  if (preview) return out;
  await mkdir(libraryDir(), { recursive: true });
  out.library = path.join(libraryDir(), `${name}.mp4`);
  await run("ffmpeg", ["-v", "error", "-y", "-i", master, "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out.library]);
  const srt = path.join(dir, "build", "subs.srt");
  if (existsSync(srt)) {
    out.subtitles = path.join(libraryDir(), `${name}.srt`);
    await copyFile(srt, out.subtitles);
  }
  return out;
}

// ── helpers ──

const MAX_RESTARTS = 8;

// A frame capture can fail once under memory pressure ("Unable to capture screenshot"); retry it.
async function capture(page, preview, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await page.screenshot({ type: "jpeg", quality: preview ? 80 : 95, optimizeForSpeed: true });
    } catch (e) {
      if (i >= tries || page.isClosed()) throw new Error(`frame capture failed (${e.message})`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("error", (e) => reject(new Error(`${cmd} could not start: ${e.message}`)));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${out.trim().slice(-600)}`))));
  });
}
