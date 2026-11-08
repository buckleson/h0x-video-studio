// R4-P2 edge cases: the h0x Claude Code plugin and its repo-root marketplace.
// Manifests agree with each other, every path is relative and resolves (also on
// Windows), the MCP server starts with plain node and offers the tools the
// onboarding names, onboarding never asks for or shows a key, sync.mjs is safe
// when the bundle is missing, and the shipped text carries no foreign brand.
// No network: the server is only asked for tools/list, with provider keys removed.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const PLUGIN = path.join(ROOT, 'plugin');
const SERVER = path.join(PLUGIN, 'server/h0x-mcp.mjs');
const DIST = path.join(ROOT, 'mcp/h0x-mcp/dist');
const TEXT_FILES = ['commands/start.md', 'skills/explainer-studio/SKILL.md', 'skills/ai-video/SKILL.md'];
const ONBOARDING_TOOLS = ['provider_status', 'create_explainer', 'qa_explainer', 'render_explainer', 'generate_image', 'generate_video'];
const KEY_ENV = ['BYTEPLUS_API_KEY', 'FAL_KEY', 'HF_TOKEN'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const FOREIGN = /ArtCraft|getartcraft|storyteller|fakeyou|\bLTX\b|LTX-|Lightricks|ltx\.io/i;

const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const json = (file: string) => JSON.parse(read(file));
const plugin = () => json(path.join(PLUGIN, '.claude-plugin/plugin.json'));
const market = () => json(path.join(ROOT, '.claude-plugin/marketplace.json'));
const mcp = () => json(path.join(PLUGIN, '.mcp.json'));

function frontmatter(file: string): { fm: Record<string, string>; raw: string } {
  const m = read(file).match(/^---\n([\s\S]*?)\n---\n/);
  expect(m, `${file} starts with --- frontmatter ---`).not.toBeNull();
  const fm: Record<string, string> = {};
  for (const line of m![1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    expect(kv, `frontmatter line "${line}" is key: value`).not.toBeNull();
    fm[kv![1]] = kv![2].replace(/^"|"$/g, '');
  }
  return { fm, raw: m![1] };
}

// Only the h0x part of the bundle (from the esbuild "// explainer/engine.mjs" marker on) is ours.
function ownServerSource(): string {
  const src = read(SERVER);
  const at = src.indexOf('\n// explainer/engine.mjs\n');
  return at >= 0 ? src.slice(at) : src;
}

function registeredTools(): string[] {
  return [...read(SERVER).matchAll(/\.(?:registerTool|tool)\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
}

describe('R4-P2 manifests', () => {
  it('marketplace entry and plugin.json agree on the name, and the name is kebab-case', () => {
    const entry = market().plugins.find((p: { name: string }) => p.name === 'h0x');
    expect(entry).toBeDefined();
    expect(plugin().name).toBe(entry.name);
    expect(market().name).toMatch(KEBAB);
    expect(plugin().name).toMatch(KEBAB);
    if (entry.version) expect(entry.version).toBe(plugin().version);
  });

  it('marketplace has unique plugin names and every source is a ./ relative POSIX path that resolves', () => {
    const names = market().plugins.map((p: { name: string }) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of market().plugins) {
      expect(typeof p.source).toBe('string');
      expect(p.source).toMatch(/^\.\//);
      expect(p.source).not.toMatch(/\\|^[A-Za-z]:|\.\.\//);
      expect(existsSync(path.join(ROOT, p.source, '.claude-plugin/plugin.json'))).toBe(true);
    }
  });

  it('plugin.json version is semver and author/description are non-empty strings', () => {
    const p = plugin();
    expect(p.version).toMatch(SEMVER);
    expect(typeof p.description).toBe('string');
    expect(p.description.trim().length).toBeGreaterThan(10);
    expect(typeof p.author.name).toBe('string');
  });

  it('the plugin dir has no nested marketplace and components sit at the plugin root', () => {
    expect(existsSync(path.join(PLUGIN, '.claude-plugin/marketplace.json'))).toBe(false);
    for (const dir of ['commands', 'skills']) {
      expect(existsSync(path.join(PLUGIN, dir))).toBe(true);
      expect(existsSync(path.join(PLUGIN, '.claude-plugin', dir))).toBe(false);
    }
  });
});

describe('R4-P2 MCP config', () => {
  it('uses plain node, a ${CLAUDE_PLUGIN_ROOT}-relative forward-slash path, and no package runner', () => {
    for (const s of Object.values(mcp().mcpServers) as { command: string; args: string[]; env?: object }[]) {
      expect(s.command).toBe('node');
      expect(s.command).not.toMatch(/npx|npm|bun|tsx|deno|\.exe$/i);
      for (const a of s.args) {
        expect(a).not.toMatch(/\\|^[A-Za-z]:|^\//);
      }
      expect(s.args[0].startsWith('${CLAUDE_PLUGIN_ROOT}/')).toBe(true);
    }
  });

  it('does not carry key values or key env vars in its config', () => {
    const raw = read(path.join(PLUGIN, '.mcp.json'));
    for (const k of KEY_ENV) expect(raw).not.toContain(k);
    expect(raw).not.toMatch(/sk-[A-Za-z0-9]{8,}|[A-Za-z0-9_-]{32,}/);
  });

  it('every arg path resolves when ${CLAUDE_PLUGIN_ROOT} is a Windows path', () => {
    for (const s of Object.values(mcp().mcpServers) as { args: string[] }[]) {
      const target = s.args[0].replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN);
      expect(existsSync(path.normalize(target))).toBe(true);
    }
  });

  it('the bundled server only imports Node built-ins (no node_modules at install time)', () => {
    const src = read(SERVER);
    expect(src.startsWith('#!/usr/bin/env node')).toBe(true);
    const external = [...src.matchAll(/^import\s[^;\n]*?from\s*"([^"]+)"/gm)]
      .map((m) => m[1])
      .filter((x) => !x.startsWith('node:') && !builtinModules.includes(x));
    expect(external).toEqual([]);
  });

  it('the server registers every tool the onboarding and skills name', () => {
    const tools = registeredTools();
    for (const t of ONBOARDING_TOOLS) expect(tools).toContain(t);
    const text = TEXT_FILES.map((f) => read(path.join(PLUGIN, f))).join('\n');
    const named = new Set([...text.matchAll(/`([a-z]+_[a-z_]+)`/g)].map((m) => m[1]));
    for (const n of named) {
      if (/_(explainer|image|video|status|library|providers)$/.test(n)) expect(tools, n).toContain(n);
    }
  });

  it('the key env vars the onboarding names are the ones the server reads', () => {
    const src = read(SERVER);
    for (const k of KEY_ENV) {
      expect(src).toContain(`process.env.${k}`);
      expect(read(path.join(PLUGIN, 'commands/start.md'))).toContain(k);
    }
  });

  it.skipIf(!existsSync(path.join(DIST, 'h0x-mcp.mjs')))('the synced server matches the current dist bundle', () => {
    expect(readFileSync(SERVER).equals(readFileSync(path.join(DIST, 'h0x-mcp.mjs')))).toBe(true);
    const distRt = readdirSync(path.join(DIST, 'explainer-runtime'), { recursive: true }).map(String).sort();
    const pluginRt = readdirSync(path.join(PLUGIN, 'server/explainer-runtime'), { recursive: true }).map(String).sort();
    expect(pluginRt).toEqual(distRt);
  });

  it('starts with plain node and answers tools/list without any provider key', async () => {
    const env = { ...process.env, H0X_OUTPUT_DIR: os.tmpdir() };
    for (const k of KEY_ENV) delete env[k];
    const args = (Object.values(mcp().mcpServers)[0] as { args: string[] }).args.map((a) => a.replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN));
    const child = spawn('node', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      const tools = await new Promise<string[]>((resolve, reject) => {
        let buf = '';
        child.on('error', reject);
        child.on('exit', (code) => reject(new Error(`server exited early with ${code}`)));
        child.stdout.on('data', (d) => {
          buf += d;
          for (const line of buf.split('\n')) {
            try {
              const msg = JSON.parse(line);
              if (msg.id === 2) resolve(msg.result.tools.map((t: { name: string }) => t.name));
            } catch {
              /* partial line */
            }
          }
        });
        const send = (m: object) => child.stdin.write(JSON.stringify(m) + '\n');
        send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      });
      for (const t of ONBOARDING_TOOLS) expect(tools).toContain(t);
    } finally {
      child.kill();
    }
  });
});

describe('R4-P2 onboarding and skills', () => {
  const start = () => read(path.join(PLUGIN, 'commands/start.md'));

  it('the command file is commands/start.md so it runs as /h0x:start, with valid single-line frontmatter', () => {
    const { fm } = frontmatter(path.join(PLUGIN, 'commands/start.md'));
    expect(fm.description.trim().length).toBeGreaterThan(0);
    expect(fm.description).not.toMatch(/\t/);
    if (fm['argument-hint']) expect(start()).toContain('$ARGUMENTS');
  });

  it('offers the no-key URL option before the API-key option, plus a free-form option', () => {
    const body = start();
    const url = body.indexOf('Give me a URL');
    const key = body.indexOf('Give me your API key');
    expect(url).toBeGreaterThan(-1);
    expect(key).toBeGreaterThan(url);
    expect(body.slice(url, key)).toMatch(/No API key needed/i);
    expect(body).toMatch(/Something else|free-form/i);
  });

  it('calls provider_status before offering the options', () => {
    const body = start();
    expect(body.indexOf('provider_status')).toBeLessThan(body.indexOf('Give me a URL'));
  });

  it('option 1 asks about an image key at most once and continues without one', () => {
    const opt1 = start().split(/^## Option 2/m)[0].split(/^## Option 1/m)[1];
    expect(opt1).toMatch(/ask once/i);
    expect(opt1).toMatch(/continue without/i);
    expect(opt1).toMatch(/only after they say yes/i);
  });

  it('option 2 names all three providers, never asks to paste a key and asks before a paid call', () => {
    const opt2 = start().split(/^## Option 2/m)[1].split(/^## Option 3/m)[0];
    expect(opt2).toMatch(/BytePlus/);
    expect(opt2).toMatch(/\bfal\b/);
    expect(opt2).toMatch(/Hugging Face/);
    expect(opt2).toMatch(/Never ask them to paste a key/i);
    expect(opt2).toMatch(/don't echo it/i);
    expect(opt2).toMatch(/Wait for a yes/i);
  });

  it('every option path, including free-form, keeps the ask-first and no-echo rules', () => {
    const opt3 = start().split(/^## Option 3/m)[1].split(/^## Always finish/m)[0];
    expect(opt3).toMatch(/Ask before using any key/i);
    expect(opt3).toMatch(/never echo/i);
    expect(read(path.join(PLUGIN, 'skills/ai-video/SKILL.md'))).toMatch(/never repeat, print or log/i);
  });

  it('ends with the My Library hand-off', () => {
    const tail = start().split(/^## Always finish/m)[1];
    expect(tail).toMatch(/H0x Studio → My Library/);
  });

  it('no plugin text contains a key-like literal', () => {
    for (const f of TEXT_FILES) {
      const t = read(path.join(PLUGIN, f));
      expect(t, f).not.toMatch(/\bsk-[A-Za-z0-9]{8,}|\bhf_[A-Za-z0-9]{10,}|\b[A-Za-z0-9]{32,}\b/);
    }
  });

  it.each(['explainer-studio', 'ai-video'])('skill %s: name matches its folder, kebab-case, description under 1024 chars', (name) => {
    const { fm } = frontmatter(path.join(PLUGIN, 'skills', name, 'SKILL.md'));
    expect(fm.name).toBe(name);
    expect(fm.name).toMatch(KEBAB);
    expect(fm.description.length).toBeGreaterThan(20);
    expect(fm.description.length).toBeLessThan(1024);
  });

  it('every ${CLAUDE_PLUGIN_ROOT}/ path mentioned in plugin text exists', () => {
    for (const f of [...TEXT_FILES, '.mcp.json']) {
      for (const m of read(path.join(PLUGIN, f)).matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) {
        expect(existsSync(path.join(PLUGIN, m[1])), `${f}: ${m[1]}`).toBe(true);
      }
    }
  });
});

describe('R4-P2 sync.mjs', () => {
  const tmps: string[] = [];
  afterEach(() => {
    for (const t of tmps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  // A throwaway copy of the layout <tmp>/plugin/sync.mjs + <tmp>/mcp/h0x-mcp/dist; the path has a space.
  function sandbox(): { root: string; run: () => { code: number; out: string } } {
    const root = mkdtempSync(path.join(os.tmpdir(), 'h0x p2 '));
    tmps.push(root);
    mkdirSync(path.join(root, 'plugin'));
    cpSync(path.join(PLUGIN, 'sync.mjs'), path.join(root, 'plugin/sync.mjs'));
    const run = () => {
      try {
        const out = execFileSync(process.execPath, [path.join(root, 'plugin/sync.mjs')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, out };
      } catch (e: any) {
        return { code: e.status ?? -1, out: String(e.stderr) + String(e.stdout) };
      }
    };
    return { root, run };
  }

  it('stops with a hint and leaves server/ untouched when the bundle is missing', () => {
    const { root, run } = sandbox();
    mkdirSync(path.join(root, 'plugin/server'));
    writeFileSync(path.join(root, 'plugin/server/keep.txt'), 'x');
    const r = run();
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/npm run bundle/);
    expect(existsSync(path.join(root, 'plugin/server/keep.txt'))).toBe(true);
  });

  it('replaces server/ with the bundle and runtime, dropping stale files', () => {
    const { root, run } = sandbox();
    const dist = path.join(root, 'mcp/h0x-mcp/dist');
    mkdirSync(path.join(dist, 'explainer-runtime/engine'), { recursive: true });
    writeFileSync(path.join(dist, 'h0x-mcp.mjs'), '// bundle v2\n');
    writeFileSync(path.join(dist, 'explainer-runtime/engine/h0x.js'), '// engine\n');
    mkdirSync(path.join(root, 'plugin/server'));
    writeFileSync(path.join(root, 'plugin/server/stale.txt'), 'old');
    const r = run();
    expect(r.code).toBe(0);
    expect(read(path.join(root, 'plugin/server/h0x-mcp.mjs'))).toBe('// bundle v2\n');
    expect(existsSync(path.join(root, 'plugin/server/explainer-runtime/engine/h0x.js'))).toBe(true);
    expect(existsSync(path.join(root, 'plugin/server/stale.txt'))).toBe(false);
  });
});

describe('R4-P2 branding of shipped files', () => {
  // Allowed: the ~/Artcraft data folder (a real on-disk path shared with the app)
  // and the Hugging Face Space id the free provider calls (an identifier, not a label).
  const scrub = (s: string) =>
    s
      .replace(/~\/Artcraft\//g, '~/<data>/')
      .replace(/"Artcraft"/g, '"<data>"')
      .replace(/var FREE_SPACE = "[^"]+";/, '');

  it('plugin manifests, command and skills carry no foreign brand', () => {
    const files = ['.claude-plugin/plugin.json', '.mcp.json', 'sync.mjs', ...TEXT_FILES].map((f) => read(path.join(PLUGIN, f)));
    for (const t of [...files, read(path.join(ROOT, '.claude-plugin/marketplace.json'))]) expect(t).not.toMatch(FOREIGN);
  });

  it('the bundled EXPLAINER.md guide carries no foreign brand', () => {
    expect(scrub(read(path.join(PLUGIN, 'server/explainer-runtime/EXPLAINER.md')))).not.toMatch(FOREIGN);
  });

  it('user-visible strings in the h0x part of the bundled server carry no foreign brand', () => {
    const hits = scrub(ownServerSource())
      .split('\n')
      .filter((l) => FOREIGN.test(l))
      .map((l) => l.trim().slice(0, 120));
    expect(hits).toEqual([]);
  });
});
