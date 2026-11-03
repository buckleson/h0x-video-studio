// R2-1b: ProviderSetApiKey wrapper. The payload must match the Rust
// ProviderSetApiKeyRequest struct and the serde name of ProviderCredentialKey::BytePlusApiKey.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { invoke } from "@tauri-apps/api/core";
import { ProviderSetApiKey } from "./ProviderSetApiKey";
import * as api from "../../index";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const APP_ROOT = resolve(__dirname, "../../../../../..");
const ARTCRAFT_SRC = join(APP_ROOT, "crates/desktop/artcraft/src");
const KEY_RS = join(ARTCRAFT_SRC, "core/providers/credentials/provider_credential_key.rs");
const COMMAND_RS = join(ARTCRAFT_SRC, "core/commands/providers/provider_set_api_key_command.rs");
const LIB_RS = join(ARTCRAFT_SRC, "lib.rs");
const WRAPPER_TS = join(__dirname, "ProviderSetApiKey.ts");

const COMMAND = "provider_set_api_key_command";
const BYTEPLUS_SERDE = "byte_plus_api_key";

// --- helpers ---

const mockedInvoke = vi.mocked(invoke);

// Mirrors serde's rename_all = "snake_case" for unit variants.
const toSnake = (pascal: string) =>
  pascal.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();

const read = (path: string) => readFileSync(path, "utf8");

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProviderSetApiKey", () => {
  it("is exported from the tauri-api index", () => {
    expect((api as Record<string, unknown>).ProviderSetApiKey).toBe(ProviderSetApiKey);
  });

  it("invokes provider_set_api_key_command once with the BytePlus credential and the key", async () => {
    mockedInvoke.mockResolvedValue({ status: "success" });
    await ProviderSetApiKey("bp-secret-123");
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith(COMMAND, {
      request: { provider_credential: BYTEPLUS_SERDE, api_key: "bp-secret-123" },
    });
  });

  it("returns the command result unchanged", async () => {
    const ok = { status: "success" };
    mockedInvoke.mockResolvedValue(ok);
    await expect(ProviderSetApiKey("k")).resolves.toBe(ok);

    const bad = { status: "server_error", error_message: "Failed to save API key" };
    mockedInvoke.mockResolvedValue(bad);
    await expect(ProviderSetApiKey("k")).resolves.toBe(bad);
  });

  it("passes the key through verbatim (no trim, empty, unicode, long)", async () => {
    mockedInvoke.mockResolvedValue({ status: "success" });
    const keys = ["", "  padded  ", "kéy-✓", "x".repeat(4096)];
    for (const key of keys) {
      await ProviderSetApiKey(key);
    }
    expect(mockedInvoke.mock.calls.map((c) => (c[1] as any).request.api_key)).toEqual(keys);
  });

  it("propagates an invoke rejection (e.g. backend unavailable)", async () => {
    mockedInvoke.mockRejectedValue(new Error("ipc down"));
    await expect(ProviderSetApiKey("k")).rejects.toThrow("ipc down");
  });
});

describe("ProviderSetApiKey matches the Rust side", () => {
  it("BytePlusApiKey is a ProviderCredentialKey variant with snake_case serde", () => {
    const src = read(KEY_RS);
    expect(src).toMatch(/#\[serde\(rename_all\s*=\s*"snake_case"\)\]\s*pub enum ProviderCredentialKey/);
    expect(src).toMatch(/\bBytePlusApiKey\s*,/);
    expect(toSnake("BytePlusApiKey")).toBe(BYTEPLUS_SERDE);
  });

  it("request field names match ProviderSetApiKeyRequest", () => {
    const src = read(COMMAND_RS);
    const struct = src.match(/pub struct ProviderSetApiKeyRequest\s*\{([^}]*)\}/);
    expect(struct).not.toBeNull();
    const fields = [...struct![1].matchAll(/pub\s+(\w+)\s*:/g)].map((m) => m[1]).sort();
    expect(fields).toEqual(["api_key", "provider_credential"]);
    expect(src).not.toMatch(/rename_all/); // fields are sent as-is
    expect(src).toMatch(new RegExp(`pub async fn ${COMMAND}\\(\\s*request:`));
  });

  it("the command is registered in generate_handler!", () => {
    const handler = read(LIB_RS).match(/generate_handler!\[([\s\S]*?)\]/);
    expect(handler).not.toBeNull();
    expect(handler![1]).toMatch(new RegExp(`\\b${COMMAND}\\b`));
  });

  it("the wrapper never logs the key", () => {
    expect(read(WRAPPER_TS)).not.toMatch(/console\.(log|info|debug|warn|error)/);
  });
});
