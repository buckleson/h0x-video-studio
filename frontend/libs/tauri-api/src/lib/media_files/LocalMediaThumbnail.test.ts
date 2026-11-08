// R4-M2: LocalMediaThumbnail wrapper. It must call local_media_thumbnail_command
// with only the path and hand back the cached thumbnail path.
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LocalMediaThumbnail } from "./LocalMediaThumbnail";
import * as api from "../../index";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));

// --- constants ---

const COMMAND = "local_media_thumbnail_command";
const WIN_PATH = "C:\\Users\\Jane Doe\\Vidéos\\h0x\\still #1 (copy).png";
const UNC_PATH = "\\\\nas\\share\\still.webp";
const THUMB = "C:\\Users\\Jane Doe\\AppData\\Local\\h0x\\temp\\thumbs\\00ff00ff00ff00ff.jpg";

// --- helpers ---

const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  vi.clearAllMocks();
});

describe("LocalMediaThumbnail", () => {
  it("is exported from the tauri-api index", () => {
    expect((api as Record<string, unknown>).LocalMediaThumbnail).toBe(LocalMediaThumbnail);
  });

  it("invokes the command once with only the path (backend picks the default size)", async () => {
    mockedInvoke.mockResolvedValue({ thumb_path: THUMB });
    await LocalMediaThumbnail(WIN_PATH);
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke.mock.calls[0]).toEqual([COMMAND, { path: WIN_PATH }]);
  });

  it("returns the thumbnail path unchanged", async () => {
    mockedInvoke.mockResolvedValue({ thumb_path: THUMB });
    await expect(LocalMediaThumbnail(WIN_PATH)).resolves.toBe(THUMB);
  });

  it("passes UNC paths through without normalising them", async () => {
    mockedInvoke.mockResolvedValue({ thumb_path: THUMB });
    await LocalMediaThumbnail(UNC_PATH);
    expect(mockedInvoke).toHaveBeenCalledWith(COMMAND, { path: UNC_PATH });
  });

  it("propagates the backend error so the caller can fall back", async () => {
    mockedInvoke.mockRejectedValue("thumbnail failed");
    await expect(LocalMediaThumbnail(WIN_PATH)).rejects.toBe("thumbnail failed");
  });
});
