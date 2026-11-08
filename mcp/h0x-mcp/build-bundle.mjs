// Builds dist/h0x-mcp.mjs: the whole MCP server in one ESM file that runs with plain `node`
// (no node_modules), plus dist/explainer-runtime/ with the files Explainer Studio serves to
// Chrome at render time. Run: npm run bundle
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "dist");
const RUNTIME = path.join(DIST, "explainer-runtime");
const MODULES = path.join(HERE, "node_modules");

await rm(DIST, { recursive: true, force: true });

await build({
  entryPoints: [path.join(HERE, "index.mjs")],
  outfile: path.join(DIST, "h0x-mcp.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // CommonJS dependencies call require(); give the ESM bundle a real one.
  banner: { js: 'import { createRequire as __h0xRequire } from "node:module"; const require = __h0xRequire(import.meta.url);' },
  logLevel: "warning",
});

await cp(path.join(HERE, "explainer", "runtime"), path.join(RUNTIME, "engine"), { recursive: true });
await cp(path.join(MODULES, "gsap", "dist", "gsap.min.js"), path.join(RUNTIME, "engine", "gsap.min.js"));
await cp(path.join(HERE, "explainer", "tts.py"), path.join(RUNTIME, "tts.py"));
await cp(path.join(HERE, "EXPLAINER.md"), path.join(RUNTIME, "EXPLAINER.md"));
// Only the Latin variable faces that runtime/h0x.css loads.
for (const family of await readdir(path.join(MODULES, "@fontsource-variable"))) {
  const from = path.join(MODULES, "@fontsource-variable", family, "files");
  const to = path.join(RUNTIME, "fonts", family, "files");
  await mkdir(to, { recursive: true });
  for (const f of (await readdir(from)).filter((f) => /-latin-wght-(normal|italic)\.woff2$/.test(f))) await cp(path.join(from, f), path.join(to, f));
}

console.log(`Bundled ${path.relative(HERE, path.join(DIST, "h0x-mcp.mjs"))} and ${path.relative(HERE, RUNTIME)}/`);
