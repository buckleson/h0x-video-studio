// R4-3b: typed wrappers behind the "Providers & keys" pane. Each wrapper must send exactly the
// payload the Rust command deserializes, be exported from the package index, and never log keys.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { invoke } from "@tauri-apps/api/core";
import * as api from "../../index";
import { ProviderList } from "./ProviderList";
import { ProviderClear } from "./ProviderClear";
import { CustomEndpointList } from "./CustomEndpointList";
import { CustomEndpointSave } from "./CustomEndpointSave";
import { CustomEndpointDelete } from "./CustomEndpointDelete";
import { ModalityDefaultsGet } from "./ModalityDefaultsGet";
import { ModalityDefaultsSet } from "./ModalityDefaultsSet";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const APP_ROOT = resolve(__dirname, "../../../../../..");
const ARTCRAFT_SRC = join(APP_ROOT, "crates/desktop/artcraft/src");
const COMMANDS_DIR = join(ARTCRAFT_SRC, "core/commands/providers");
const CUSTOM_ENDPOINTS_RS = join(ARTCRAFT_SRC, "core/providers/custom_endpoints.rs");
const MODALITY_DEFAULTS_RS = join(ARTCRAFT_SRC, "core/providers/modality_defaults.rs");
const LIB_RS = join(ARTCRAFT_SRC, "lib.rs");

const WRAPPERS = {
  ProviderList,
  ProviderClear,
  CustomEndpointList,
  CustomEndpointSave,
  CustomEndpointDelete,
  ModalityDefaultsGet,
  ModalityDefaultsSet,
};

const COMMANDS = [
  "provider_list_command",
  "provider_clear_command",
  "custom_endpoint_list_command",
  "custom_endpoint_save_command",
  "custom_endpoint_delete_command",
  "modality_defaults_get_command",
  "modality_defaults_set_command",
];

// --- helpers ---

const mockedInvoke = vi.mocked(invoke);

const read = (path: string) => readFileSync(path, "utf8");

const structFields = (src: string, name: string) => {
  const m = src.match(new RegExp(`pub struct ${name}\\s*\\{([^}]*)\\}`));
  expect(m, `struct ${name}`).not.toBeNull();
  return [...m![1].matchAll(/pub\s+(\w+)\s*:/g)].map((x) => x[1]).sort();
};

const enumVariants = (src: string, name: string) => {
  const m = src.match(new RegExp(`pub enum ${name}\\s*\\{([^}]*)\\}`));
  expect(m, `enum ${name}`).not.toBeNull();
  return [...m![1].matchAll(/^\s*(\w+)\s*,?\s*$/gm)].map((x) => x[1]);
};

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

afterEach(() => {
  vi.clearAllMocks();
});

describe("exports", () => {
  it.each(Object.entries(WRAPPERS))("%s is exported from the tauri-api index", (name, fn) => {
    expect((api as Record<string, unknown>)[name]).toBe(fn);
  });

  it("commandErrorMessage and CommandSuccessStatus (used by the pane) are exported", () => {
    expect(typeof (api as any).commandErrorMessage).toBe("function");
    expect((api as any).CommandSuccessStatus?.Success).toBe("success");
  });
});

describe("invoke payloads", () => {
  it("list/get commands are invoked with no arguments", async () => {
    mockedInvoke.mockResolvedValue({ status: "success", payload: {} });
    await ProviderList();
    await CustomEndpointList();
    await ModalityDefaultsGet();
    expect(mockedInvoke.mock.calls).toEqual([
      ["provider_list_command"],
      ["custom_endpoint_list_command"],
      ["modality_defaults_get_command"],
    ]);
  });

  it("ProviderClear wraps the provider id in request", async () => {
    mockedInvoke.mockResolvedValue({ status: "success" });
    await ProviderClear("byteplus");
    expect(mockedInvoke).toHaveBeenCalledWith("provider_clear_command", { request: { provider: "byteplus" } });
  });

  it("CustomEndpointDelete wraps the id in request", async () => {
    mockedInvoke.mockResolvedValue({ status: "success" });
    await CustomEndpointDelete("ep-1");
    expect(mockedInvoke).toHaveBeenCalledWith("custom_endpoint_delete_command", { request: { id: "ep-1" } });
  });

  it("CustomEndpointSave passes the request through unchanged (create without id, no key)", async () => {
    mockedInvoke.mockResolvedValue({ status: "success", payload: { id: "ep-9" } });
    const request = { name: "Local", base_url: "http://127.0.0.1:1234/v1", kind: "openai_compatible" as const, modalities: [] };
    const result = await CustomEndpointSave(request);
    expect(mockedInvoke).toHaveBeenCalledWith("custom_endpoint_save_command", { request });
    expect(result.payload.id).toBe("ep-9");
  });

  it("ModalityDefaultsSet sends provider_or_endpoint_id, null to clear", async () => {
    mockedInvoke.mockResolvedValue({ status: "success" });
    await ModalityDefaultsSet("video", "byteplus");
    await ModalityDefaultsSet("audio", null);
    expect(mockedInvoke.mock.calls).toEqual([
      ["modality_defaults_set_command", { request: { modality: "video", provider_or_endpoint_id: "byteplus" } }],
      ["modality_defaults_set_command", { request: { modality: "audio", provider_or_endpoint_id: null } }],
    ]);
  });

  it("returns error results unchanged and propagates invoke rejections (backend offline)", async () => {
    const bad = { status: "server_error", error_message: "disk full" };
    mockedInvoke.mockResolvedValueOnce(bad);
    await expect(ProviderClear("openai")).resolves.toBe(bad);
    mockedInvoke.mockRejectedValueOnce(new Error("ipc down"));
    await expect(ModalityDefaultsGet()).rejects.toThrow("ipc down");
  });
});

describe("matches the Rust side", () => {
  it.each(COMMANDS)("%s is registered in generate_handler!", (cmd) => {
    const handler = read(LIB_RS).match(/generate_handler!\[([\s\S]*?)\]/);
    expect(handler).not.toBeNull();
    expect(handler![1]).toMatch(new RegExp(`\\b${cmd}\\b`));
  });

  it("request structs have the fields the wrappers send", () => {
    expect(structFields(read(join(COMMANDS_DIR, "provider_clear_command.rs")), "ProviderClearRequest")).toEqual(["provider"]);
    expect(structFields(read(join(COMMANDS_DIR, "custom_endpoint_delete_command.rs")), "CustomEndpointDeleteRequest")).toEqual(["id"]);
    expect(structFields(read(join(COMMANDS_DIR, "modality_defaults_set_command.rs")), "ModalityDefaultsSetRequest")).toEqual(
      ["modality", "provider_or_endpoint_id"],
    );
    expect(structFields(read(CUSTOM_ENDPOINTS_RS), "CustomEndpointSaveRequest")).toEqual(
      ["api_key", "base_url", "id", "kind", "modalities", "name"],
    );
  });

  it("list entries expose has_key and key_hint, never the key itself", () => {
    const providerFields = structFields(read(join(COMMANDS_DIR, "provider_list_command.rs")), "ProviderListEntry");
    const endpointFields = structFields(read(CUSTOM_ENDPOINTS_RS), "CustomEndpointListEntry");
    for (const fields of [providerFields, endpointFields]) {
      expect(fields).toEqual(expect.arrayContaining(["has_key", "key_hint", "modalities"]));
      expect(fields).not.toContain("api_key");
    }
  });

  it("Modality and CustomEndpointKind serialize to the TS string literals", () => {
    const md = read(MODALITY_DEFAULTS_RS);
    expect(md).toMatch(/rename_all\s*=\s*"snake_case"\)\]\s*pub enum Modality/);
    expect(enumVariants(md, "Modality").map(snake)).toEqual(["llm", "image", "video", "audio"]);
    const ce = read(CUSTOM_ENDPOINTS_RS);
    expect(ce).toMatch(/rename_all\s*=\s*"snake_case"\)\]\s*pub enum CustomEndpointKind/);
    expect(enumVariants(ce, "CustomEndpointKind").map(snake)).toEqual(["openai_compatible", "other"]);
  });

  it("no wrapper logs its arguments", () => {
    for (const name of Object.keys(WRAPPERS)) {
      expect(read(join(__dirname, `${name}.ts`)), name).not.toMatch(/console\.(log|info|debug|warn|error)/);
    }
  });
});
