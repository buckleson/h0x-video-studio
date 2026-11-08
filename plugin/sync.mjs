// Copies the single-file MCP server and its explainer runtime into plugin/server/.
// Run after `npm run bundle` in mcp/h0x-mcp: node plugin/sync.mjs
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "..", "mcp", "h0x-mcp", "dist");
const SERVER = path.join(HERE, "server");

if (!existsSync(path.join(DIST, "h0x-mcp.mjs"))) {
  console.error(`No bundle in ${DIST}. Run "npm run bundle" in mcp/h0x-mcp first.`);
  process.exit(1);
}

await rm(SERVER, { recursive: true, force: true });
await cp(path.join(DIST, "h0x-mcp.mjs"), path.join(SERVER, "h0x-mcp.mjs"));
await cp(path.join(DIST, "explainer-runtime"), path.join(SERVER, "explainer-runtime"), { recursive: true });

console.log(`Synced ${path.relative(process.cwd(), SERVER)}/`);
