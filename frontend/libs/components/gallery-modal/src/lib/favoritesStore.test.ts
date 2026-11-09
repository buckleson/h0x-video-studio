// FAV-3: favorites signal store. Loads once per session, toggles optimistically,
// rolls back and shows a toast when the backend command fails.
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks ---

const tauri = vi.hoisted(() => ({
  listFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@storyteller/tauri-api", () => ({
  ...tauri,
  // Same contract as the real helper: backend message first, then fallback.
  commandErrorMessage: (error: unknown, fallback: string) => {
    if (error && typeof error === "object") {
      const e = error as { error_message?: string; message?: string };
      return e.error_message ?? e.message ?? fallback;
    }
    return typeof error === "string" ? error : fallback;
  },
}));
vi.mock("@storyteller/ui-toaster", () => ({ toast: { error: toastError } }));

// --- constants ---

const WIN_PATH = "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4";
const UNIX_PATH = "/home/jane/h0x/still.png";
const OTHER_PATH = "D:\\Médias\\über clip.mov";
const BRAND_LEAK = /artcraft|getartcraft|storyteller|fakeyou|ltx|lightricks/i;

// --- helpers ---

type Store = typeof import("./favoritesStore");

const entry = (path: string) => ({
  path,
  added_at: "2026-11-01T00:00:00Z",
  kind: "video",
  missing: false,
});

const deferred = <T = void>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Fresh module per test so the once-per-session flag starts clean.
let mod: Store;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  tauri.listFavorites.mockResolvedValue([]);
  tauri.addFavorite.mockResolvedValue(undefined);
  tauri.removeFavorite.mockResolvedValue(undefined);
  mod = await import("./favoritesStore");
});

describe("favoritesStore.load", () => {
  it("fills favoritePaths from listFavorites", async () => {
    tauri.listFavorites.mockResolvedValue([entry(WIN_PATH), entry(UNIX_PATH)]);
    await mod.favoritesStore.load();
    expect([...mod.favoritePaths.value]).toEqual([WIN_PATH, UNIX_PATH]);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(true);
    expect(mod.favoritesStore.isFavorite(OTHER_PATH)).toBe(false);
  });

  it("calls the backend only once across repeated and concurrent loads", async () => {
    const pending = deferred<ReturnType<typeof entry>[]>();
    tauri.listFavorites.mockReturnValue(pending.promise);
    const a = mod.favoritesStore.load();
    const b = mod.favoritesStore.load();
    pending.resolve([entry(WIN_PATH)]);
    await Promise.all([a, b]);
    await mod.favoritesStore.load();
    expect(tauri.listFavorites).toHaveBeenCalledTimes(1);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(true);
  });

  it("handles an empty favorites list", async () => {
    await mod.favoritesStore.load();
    expect(mod.favoritePaths.value.size).toBe(0);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("starts empty before any load", () => {
    expect(mod.favoritePaths.value.size).toBe(0);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(false);
    expect(tauri.listFavorites).not.toHaveBeenCalled();
  });

  it("does not reject, keeps the state and shows a toast when the load fails", async () => {
    tauri.listFavorites.mockRejectedValue({ error_message: "favorites db locked" });
    await expect(mod.favoritesStore.load()).resolves.toBeUndefined();
    expect(mod.favoritePaths.value.size).toBe(0);
    expect(toastError).toHaveBeenCalledWith("favorites db locked");
  });

  it("retries on the next load after a failed first load", async () => {
    tauri.listFavorites.mockRejectedValueOnce(new Error("offline"));
    await mod.favoritesStore.load();
    tauri.listFavorites.mockResolvedValueOnce([entry(UNIX_PATH)]);
    await mod.favoritesStore.load();
    expect(tauri.listFavorites).toHaveBeenCalledTimes(2);
    expect(mod.favoritesStore.isFavorite(UNIX_PATH)).toBe(true);
    // A successful load is then cached again.
    await mod.favoritesStore.load();
    expect(tauri.listFavorites).toHaveBeenCalledTimes(2);
  });

  it("uses a neutral fallback message for errors without a message", async () => {
    tauri.listFavorites.mockRejectedValue(undefined);
    await mod.favoritesStore.load();
    const message = toastError.mock.calls[0][0] as string;
    expect(message).toBe("Failed to load favorites.");
    expect(message).not.toMatch(BRAND_LEAK);
  });
});

describe("favoritesStore.refresh", () => {
  it("re-fetches even after load and replaces the whole set", async () => {
    tauri.listFavorites.mockResolvedValueOnce([entry(WIN_PATH)]);
    await mod.favoritesStore.load();
    tauri.listFavorites.mockResolvedValueOnce([entry(UNIX_PATH)]);
    await mod.favoritesStore.refresh();
    expect(tauri.listFavorites).toHaveBeenCalledTimes(2);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(false);
    expect(mod.favoritesStore.isFavorite(UNIX_PATH)).toBe(true);
  });

  it("keeps the previous set when the refresh fails", async () => {
    tauri.listFavorites.mockResolvedValueOnce([entry(WIN_PATH)]);
    await mod.favoritesStore.load();
    tauri.listFavorites.mockRejectedValueOnce("network down");
    await mod.favoritesStore.refresh();
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(true);
    expect(toastError).toHaveBeenCalledWith("network down");
  });
});

describe("favoritesStore.toggle", () => {
  it("adds a favorite with the exact Windows path", async () => {
    await mod.favoritesStore.toggle(WIN_PATH);
    expect(tauri.addFavorite).toHaveBeenCalledWith(WIN_PATH);
    expect(tauri.removeFavorite).not.toHaveBeenCalled();
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("removes an existing favorite", async () => {
    tauri.listFavorites.mockResolvedValue([entry(UNIX_PATH)]);
    await mod.favoritesStore.load();
    await mod.favoritesStore.toggle(UNIX_PATH);
    expect(tauri.removeFavorite).toHaveBeenCalledWith(UNIX_PATH);
    expect(tauri.addFavorite).not.toHaveBeenCalled();
    expect(mod.favoritesStore.isFavorite(UNIX_PATH)).toBe(false);
  });

  it("updates the UI state before the add command resolves", async () => {
    const pending = deferred();
    tauri.addFavorite.mockReturnValue(pending.promise);
    const before = mod.favoritePaths.value;
    const done = mod.favoritesStore.toggle(WIN_PATH);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(true);
    // A new Set instance, so signal subscribers re-render.
    expect(mod.favoritePaths.value).not.toBe(before);
    expect(before.has(WIN_PATH)).toBe(false);
    pending.resolve();
    await done;
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(true);
  });

  it("updates the UI state before the remove command resolves", async () => {
    tauri.listFavorites.mockResolvedValue([entry(WIN_PATH)]);
    await mod.favoritesStore.load();
    const pending = deferred();
    tauri.removeFavorite.mockReturnValue(pending.promise);
    const done = mod.favoritesStore.toggle(WIN_PATH);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(false);
    pending.resolve();
    await done;
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(false);
  });

  it("rolls back a failed add and shows the backend error", async () => {
    const pending = deferred();
    tauri.addFavorite.mockReturnValue(pending.promise);
    const done = mod.favoritesStore.toggle(WIN_PATH);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(true);
    pending.reject({ error_message: "file not found" });
    await expect(done).resolves.toBeUndefined();
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("file not found");
  });

  it("rolls back a failed remove", async () => {
    tauri.listFavorites.mockResolvedValue([entry(UNIX_PATH)]);
    await mod.favoritesStore.load();
    tauri.removeFavorite.mockRejectedValue(new Error("db locked"));
    await mod.favoritesStore.toggle(UNIX_PATH);
    expect(mod.favoritesStore.isFavorite(UNIX_PATH)).toBe(true);
    expect(toastError).toHaveBeenCalledWith("db locked");
  });

  it("rollback only touches the failed path, not other concurrent toggles", async () => {
    const failing = deferred();
    tauri.addFavorite.mockImplementation((p: string) =>
      p === WIN_PATH ? failing.promise : Promise.resolve(),
    );
    const first = mod.favoritesStore.toggle(WIN_PATH);
    await mod.favoritesStore.toggle(OTHER_PATH);
    failing.reject(new Error("offline"));
    await first;
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(false);
    expect(mod.favoritesStore.isFavorite(OTHER_PATH)).toBe(true);
  });

  it("uses a neutral fallback toast when the error has no message", async () => {
    tauri.addFavorite.mockRejectedValue(null);
    await mod.favoritesStore.toggle(WIN_PATH);
    const message = toastError.mock.calls[0][0] as string;
    expect(message).toBe("Failed to update favorites.");
    expect(message).not.toMatch(BRAND_LEAK);
  });

  it("toggling twice returns to the original state", async () => {
    await mod.favoritesStore.toggle(WIN_PATH);
    await mod.favoritesStore.toggle(WIN_PATH);
    expect(tauri.addFavorite).toHaveBeenCalledTimes(1);
    expect(tauri.removeFavorite).toHaveBeenCalledTimes(1);
    expect(mod.favoritesStore.isFavorite(WIN_PATH)).toBe(false);
  });

  it("does not trigger a load", async () => {
    await mod.favoritesStore.toggle(WIN_PATH);
    expect(tauri.listFavorites).not.toHaveBeenCalled();
  });
});
