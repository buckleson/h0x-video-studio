// A3a: consumer-login wrappers (Grok, Midjourney, Sora/ChatGPT, WorldLabs) are gone,
// and every invoke() command string in tauri-api is registered in generate_handler!.
import { describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { Provider } from "./Provider";
import * as api from "../../index";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const HERE = __dirname;
const API_SRC = resolve(HERE, "../..");
const APP_ROOT = resolve(API_SRC, "../../../..");
const LIB_RS = join(APP_ROOT, "crates/desktop/artcraft/src/lib.rs");
const EVENTS_COMMON = join(
  APP_ROOT,
  "frontend/libs/tauri-events/src/lib/events/generation/common.ts",
);

const REMOVED_EXPORTS = [
  "GrokGetCredentialInfo",
  "MidjourneyGetCredentialInfo",
  "SoraGetCredentialInfo",
  "CheckSoraSession",
  "LogoutSoraSession",
  "SoraImageRemix",
  "WorldLabsGetCredentialInfo",
  "useSoraLoginListener",
  "waitForSoraLogin",
  "EnqueueImageInpaint",
  "EnqueueImageTo3dWorld",
  "EnqueueImageToVideo",
  "EnqueueTextToImage",
];

const REMOVED_DIRS = ["grok", "midjourney", "sora", "worldlabs"];

const REMOVED_COMMANDS = [
  "grok_get_credential_info_command",
  "midjourney_get_credential_info_command",
  "sora_get_credential_info_command",
  "check_sora_session_command",
  "sora_logout_command",
  "sora_image_remix_command",
  "worldlabs_get_credential_info_command",
  "enqueue_image_inpaint_command",
  "enqueue_image_to_3d_world_command",
  "enqueue_image_to_video_command",
  "enqueue_text_to_image_command",
];

// Wrappers known (developer report, A3a) to invoke commands that were never registered in
// generate_handler!. They live outside A3a's file list and need a follow-up subtask. The
// "stale allow-list" test fails once any of them is fixed, so this list cannot rot silently.
const KNOWN_UNREGISTERED = [
  "enqueue_edit_image_command",
  "fal_background_removal_command",
  "fal_hunyuan_image_to_3d_command",
  "fal_kling_image_to_video_command",
];

// Consumer-login provider identifiers that must not survive as provider/enum values.
const CONSUMER_VALUE_PATTERNS = [
  /["']sora["']/i,
  /["']chatgpt["']/i,
  /["']midjourney["']/i,
  /["']grok["']/i,
  /["']world_?labs["']/i,
  /sora[-_]login/i,
  /sora_username_not_yet_created|sora_is_having_problems/i,
  /CredentialInfo/,
];

// --- tests ---

describe("removed consumer-login wrappers", () => {
  it.each(REMOVED_EXPORTS)("%s is not exported from @frontend/tauri-api", (name) => {
    expect(Object.keys(api)).not.toContain(name);
  });

  it("does not export any *CredentialInfo or Sora* symbol", () => {
    const leaks = Object.keys(api).filter((k) => /CredentialInfo|Sora|Midjourney|Grok|WorldLabs/i.test(k));
    expect(leaks).toEqual([]);
  });

  it.each(REMOVED_DIRS)("lib/%s folder is deleted", (dir) => {
    expect(existsSync(join(API_SRC, "lib", dir))).toBe(false);
  });

  it("index.ts has no export path into a deleted folder or file", () => {
    const index = readFileSync(join(API_SRC, "index.ts"), "utf8");
    for (const m of index.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const target = join(API_SRC, m[1]).replace(/\.js$/, "");
      const exists = [".ts", ".tsx", "/index.ts"].some((ext) => existsSync(target + ext));
      expect(exists, `index.ts re-exports missing module ${m[1]}`).toBe(true);
    }
    for (const dir of REMOVED_DIRS) expect(index).not.toMatch(new RegExp(`/lib/${dir}/`));
  });

  it("no source still invokes or listens for a removed command or event", () => {
    const hits: string[] = [];
    for (const file of productionSources()) {
      const text = readFileSync(file, "utf8");
      for (const cmd of [...REMOVED_COMMANDS, "sora-login-success"]) {
        if (text.includes(cmd)) hits.push(`${relative(API_SRC, file)}: ${cmd}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("provider values", () => {
  it("Provider enum holds exactly ArtCraft and Fal", () => {
    expect({ ...Provider }).toEqual({ ArtCraft: "artcraft", Fal: "fal" });
  });

  it("Provider values are unique, lowercase and non-empty", () => {
    const values = Object.values(Provider);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v).toMatch(/^[a-z0-9_]+$/);
  });

  it("no production source declares a consumer-login provider value", () => {
    const hits: string[] = [];
    for (const file of [...productionSources(), EVENTS_COMMON]) {
      const text = readFileSync(file, "utf8");
      for (const re of CONSUMER_VALUE_PATTERNS) {
        if (re.test(text)) hits.push(`${relative(APP_ROOT, file)}: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("keeps the request fields Rust still accepts (sora_orientation, grok_aspect_ratio)", () => {
    const video = readFileSync(join(API_SRC, "lib/generate/GenerateVideo.ts"), "utf8");
    expect(video).toMatch(/sora_orientation\?:/);
    expect(video).toMatch(/grok_aspect_ratio\?:/);
  });

  it("no LTX or Lightricks branding in tauri-api or tauri-events common.ts", () => {
    const hits = [...productionSources(), EVENTS_COMMON].filter((f) =>
      /\bLTX\b|Lightricks/i.test(readFileSync(f, "utf8")),
    );
    expect(hits).toEqual([]);
  });
});

describe("invoke() commands match generate_handler!", () => {
  it("parses a non-trivial handler list and invoke set", () => {
    expect(registeredCommands().size).toBeGreaterThan(20);
    expect(invokedCommands().size).toBeGreaterThan(20);
  });

  it("catches multi-line and generic invoke calls", () => {
    const invoked = invokedCommands();
    expect(invoked.has("get_task_queue_command")).toBe(true);
    expect(invoked.has("generate_audio_command")).toBe(true);
  });

  it("no removed consumer-login command is registered in Rust", () => {
    const registered = registeredCommands();
    expect(REMOVED_COMMANDS.filter((c) => registered.has(c))).toEqual([]);
  });

  it("every invoked command is registered, apart from the known follow-up gap", () => {
    const registered = registeredCommands();
    const missing = [...invokedCommands()]
      .filter(([cmd]) => !registered.has(cmd) && !KNOWN_UNREGISTERED.includes(cmd))
      .map(([cmd, files]) => `${cmd} (${files.join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("known-gap allow-list is not stale", () => {
    const registered = registeredCommands();
    const invoked = invokedCommands();
    const stale = KNOWN_UNREGISTERED.filter((c) => registered.has(c) || !invoked.has(c));
    expect(stale, "remove fixed entries from KNOWN_UNREGISTERED").toEqual([]);
  });
});

// --- helpers ---

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const productionSources = (): string[] =>
  walk(API_SRC).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/\.(spec|test)\.tsx?$/.test(f) && !f.endsWith("test-setup.ts"),
  );

const invokedCommands = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  const re = /\binvoke\s*(?:<[^()]*?>)?\s*\(\s*["'`]([A-Za-z0-9_]+)["'`]/g;
  for (const file of productionSources()) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) {
      const rel = relative(API_SRC, file).split(sep).join("/");
      found.set(m[1], [...(found.get(m[1]) ?? []), rel]);
    }
  }
  return found;
};

const registeredCommands = (): Set<string> => {
  const text = readFileSync(LIB_RS, "utf8");
  const block = text.match(/generate_handler!\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error(`generate_handler! not found in ${LIB_RS}`);
  const body = block[1].replace(/\/\/.*$/gm, "");
  return new Set(
    body
      .split(",")
      .map((s) => s.trim().split("::").pop() ?? "")
      .filter((s) => /^[a-z0-9_]+$/.test(s)),
  );
};
