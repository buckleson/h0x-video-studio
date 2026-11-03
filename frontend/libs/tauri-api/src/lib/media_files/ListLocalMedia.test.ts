// R2-5c: ListLocalMedia wrapper. It must call list_local_media_command with no
// arguments and hand back the typed list unchanged.
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ListLocalMedia, type LocalMediaFile } from "./ListLocalMedia";
import * as api from "../../index";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const COMMAND = "list_local_media_command";

const FILES: LocalMediaFile[] = [
  {
    path: "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4",
    kind: "video",
    size_bytes: 1048576,
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    path: "/home/jane/h0x/still.png",
    kind: "image",
    size_bytes: 0,
    created_at: "2026-10-31T00:00:00Z",
  },
];

// --- helpers ---

const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  vi.clearAllMocks();
});

describe("ListLocalMedia", () => {
  it("is exported from the tauri-api index", () => {
    expect(api.ListLocalMedia).toBe(ListLocalMedia);
  });

  it("invokes list_local_media_command once with no arguments", async () => {
    mockedInvoke.mockResolvedValue(FILES);
    await ListLocalMedia();
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke.mock.calls[0]).toEqual([COMMAND]);
  });

  it("returns the typed list unchanged, keeping Windows paths with spaces and backslashes", async () => {
    mockedInvoke.mockResolvedValue(FILES);
    const result = await ListLocalMedia();
    expect(result).toEqual(FILES);
    expect(result[0].path).toBe("C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4");
    expect(result[1].size_bytes).toBe(0);
  });

  it("returns an empty list when there is no local media", async () => {
    mockedInvoke.mockResolvedValue([]);
    await expect(ListLocalMedia()).resolves.toEqual([]);
  });

  it("propagates a backend error to the caller", async () => {
    mockedInvoke.mockRejectedValue(new Error("downloads folder missing"));
    await expect(ListLocalMedia()).rejects.toThrow("downloads folder missing");
  });
});
