// FAV-3: favorites wrappers. Each must call the matching Rust command with the
// exact argument shape and hand back the typed result unchanged.
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  addFavorite,
  importFavoriteFiles,
  listFavorites,
  removeFavorite,
  type FavoriteEntry,
  type ImportFavoriteResult,
} from "./Favorites";
import * as api from "../../index";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const WIN_PATH = "C:\Users\Jane Doe\Videos\h0x\clip one.mp4";
const UNIX_PATH = "/home/jane/h0x/still.png";
const UNICODE_PATH = "D:\Médias\写真\über clip.mov";

const ENTRIES: FavoriteEntry[] = [
  { path: WIN_PATH, added_at: "2026-11-01T00:00:00Z", kind: "video", missing: false },
  { path: UNIX_PATH, added_at: "2026-10-31T00:00:00Z", kind: "image", missing: true },
];

const IMPORT_RESULTS: ImportFavoriteResult[] = [
  { source: WIN_PATH, dest: "C:\Users\Jane Doe\h0x\favorites\clip one.mp4", error: null },
  { source: UNIX_PATH, dest: null, error: "unsupported file type" },
];

// --- helpers ---

const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  vi.clearAllMocks();
});

describe("favorites wrappers", () => {
  it("are all exported from the tauri-api index", () => {
    expect(api.listFavorites).toBe(listFavorites);
    expect(api.addFavorite).toBe(addFavorite);
    expect(api.removeFavorite).toBe(removeFavorite);
    expect(api.importFavoriteFiles).toBe(importFavoriteFiles);
  });

  describe("listFavorites", () => {
    it("invokes list_favorites once with no arguments", async () => {
      mockedInvoke.mockResolvedValue(ENTRIES);
      await listFavorites();
      expect(mockedInvoke).toHaveBeenCalledTimes(1);
      expect(mockedInvoke.mock.calls[0]).toEqual(["list_favorites"]);
    });

    it("returns entries unchanged, including missing ones and Windows paths", async () => {
      mockedInvoke.mockResolvedValue(ENTRIES);
      const result = await listFavorites();
      expect(result).toEqual(ENTRIES);
      expect(result[0].path).toBe(WIN_PATH);
      expect(result[1].missing).toBe(true);
    });

    it("returns an empty list when there are no favorites", async () => {
      mockedInvoke.mockResolvedValue([]);
      await expect(listFavorites()).resolves.toEqual([]);
    });

    it("propagates a backend error", async () => {
      mockedInvoke.mockRejectedValue(new Error("favorites db locked"));
      await expect(listFavorites()).rejects.toThrow("favorites db locked");
    });
  });

  describe("addFavorite", () => {
    it("invokes add_favorite with { path } and resolves to undefined", async () => {
      mockedInvoke.mockResolvedValue(null);
      await expect(addFavorite(WIN_PATH)).resolves.toBeUndefined();
      expect(mockedInvoke.mock.calls).toEqual([["add_favorite", { path: WIN_PATH }]]);
    });

    it("passes unicode paths through untouched", async () => {
      mockedInvoke.mockResolvedValue(null);
      await addFavorite(UNICODE_PATH);
      expect(mockedInvoke).toHaveBeenCalledWith("add_favorite", { path: UNICODE_PATH });
    });

    it("passes an empty path through for the backend to reject", async () => {
      mockedInvoke.mockResolvedValue(null);
      await addFavorite("");
      expect(mockedInvoke).toHaveBeenCalledWith("add_favorite", { path: "" });
    });

    it("propagates a backend error", async () => {
      mockedInvoke.mockRejectedValue({ error_message: "file not found" });
      await expect(addFavorite(WIN_PATH)).rejects.toEqual({ error_message: "file not found" });
    });
  });

  describe("removeFavorite", () => {
    it("invokes remove_favorite with { path } and resolves to undefined", async () => {
      mockedInvoke.mockResolvedValue(null);
      await expect(removeFavorite(UNIX_PATH)).resolves.toBeUndefined();
      expect(mockedInvoke.mock.calls).toEqual([["remove_favorite", { path: UNIX_PATH }]]);
    });

    it("propagates a backend error", async () => {
      mockedInvoke.mockRejectedValue(new Error("not a favorite"));
      await expect(removeFavorite(WIN_PATH)).rejects.toThrow("not a favorite");
    });
  });

  describe("importFavoriteFiles", () => {
    it("invokes import_favorite_files with { paths } and returns per-file results", async () => {
      mockedInvoke.mockResolvedValue(IMPORT_RESULTS);
      const result = await importFavoriteFiles([WIN_PATH, UNIX_PATH]);
      expect(mockedInvoke.mock.calls).toEqual([
        ["import_favorite_files", { paths: [WIN_PATH, UNIX_PATH] }],
      ]);
      expect(result).toEqual(IMPORT_RESULTS);
      expect(result[1].dest).toBeNull();
      expect(result[1].error).toBe("unsupported file type");
    });

    it("sends an empty array as-is and returns an empty result", async () => {
      mockedInvoke.mockResolvedValue([]);
      await expect(importFavoriteFiles([])).resolves.toEqual([]);
      expect(mockedInvoke).toHaveBeenCalledWith("import_favorite_files", { paths: [] });
    });

    it("propagates a backend error", async () => {
      mockedInvoke.mockRejectedValue(new Error("disk full"));
      await expect(importFavoriteFiles([WIN_PATH])).rejects.toThrow("disk full");
    });
  });
});
