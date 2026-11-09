import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// R4-P2: the h0x Claude Code plugin and the repo-root marketplace that lists it.
const ROOT = path.resolve(__dirname, "../../..");
const PLUGIN = path.join(ROOT, "plugin");
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

function frontmatter(file: string): Record<string, string> {
  const m = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  expect(m, `${file} has frontmatter`).not.toBeNull();
  return Object.fromEntries(
    m![1].split(/\r?\n/).map((l) => l.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map((x) => [x![1], x![2].replace(/^"|"$/g, "")]),
  );
}

describe("h0x plugin", () => {
  it("marketplace.json lists the plugin at ./plugin", () => {
    const m = json(path.join(ROOT, ".claude-plugin/marketplace.json"));
    expect(m.name).toBe("h0x-video-studio");
    expect(m.owner.name).toBe("Buckleson");
    const entry = m.plugins.find((p: { name: string }) => p.name === "h0x");
    expect(entry.source).toBe("./plugin");
    expect(existsSync(path.join(ROOT, entry.source, ".claude-plugin/plugin.json"))).toBe(true);
  });

  it("plugin.json has name, version, description and author", () => {
    const p = json(path.join(PLUGIN, ".claude-plugin/plugin.json"));
    expect(p.name).toBe("h0x");
    expect(p.version).toBe("0.4.1");
    expect(p.description).toBeTruthy();
    expect(p.author.name).toBe("Buckleson");
  });

  it("only the manifest lives in .claude-plugin/", () => {
    expect(readdirSync(path.join(PLUGIN, ".claude-plugin"))).toEqual(["plugin.json"]);
  });

  it(".mcp.json starts the bundled server with plain node", () => {
    const { mcpServers } = json(path.join(PLUGIN, ".mcp.json"));
    const servers = Object.values(mcpServers) as { command: string; args: string[] }[];
    expect(servers).toHaveLength(1);
    expect(servers[0].command).toBe("node");
    expect(servers[0].args).toEqual(["${CLAUDE_PLUGIN_ROOT}/server/h0x-mcp.mjs"]);
    expect(existsSync(path.join(PLUGIN, "server/h0x-mcp.mjs"))).toBe(true);
    expect(existsSync(path.join(PLUGIN, "server/explainer-runtime/EXPLAINER.md"))).toBe(true);
    expect(existsSync(path.join(PLUGIN, "server/explainer-runtime/engine/h0x.js"))).toBe(true);
    expect(existsSync(path.join(PLUGIN, "sync.mjs"))).toBe(true);
  });

  it("/h0x:start offers both options, asks before using a key and never echoes one", () => {
    const file = path.join(PLUGIN, "commands/start.md");
    expect(frontmatter(file).description).toBeTruthy();
    const body = readFileSync(file, "utf8");
    expect(body).toMatch(/Give me a URL/);
    expect(body).toMatch(/No API key needed/);
    expect(body).toMatch(/Give me your API key/);
    expect(body).toMatch(/provider_status/);
    expect(body).toMatch(/never repeat, print or log a key/i);
    expect(body).toMatch(/OK to use your .* key/);
    expect(body).toMatch(/Settings → Providers & keys/);
    expect(body).toMatch(/My Library/);
    for (const tool of ["create_explainer", "qa_explainer", "render_explainer", "generate_image", "generate_video"]) {
      expect(body + readFileSync(path.join(PLUGIN, "skills/explainer-studio/SKILL.md"), "utf8")).toContain(tool);
    }
  });

  it.each(["explainer-studio", "ai-video"])("skill %s has a name and description", (name) => {
    const fm = frontmatter(path.join(PLUGIN, "skills", name, "SKILL.md"));
    expect(fm.name).toBe(name);
    expect(fm.description).toBeTruthy();
  });

  it("plugin text carries no foreign brand", () => {
    const files = [".claude-plugin/plugin.json", ".mcp.json", "commands/start.md", "skills/explainer-studio/SKILL.md", "skills/ai-video/SKILL.md"];
    const text = files.map((f) => readFileSync(path.join(PLUGIN, f), "utf8")).join("\n") + readFileSync(path.join(ROOT, ".claude-plugin/marketplace.json"), "utf8");
    expect(text).not.toMatch(/ArtCraft|getartcraft|Storyteller|FakeYou|LTX|Lightricks|ltx\.io/i);
  });
});
