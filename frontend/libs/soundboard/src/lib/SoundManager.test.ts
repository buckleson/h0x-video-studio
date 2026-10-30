// A1: the unlicensed sound pack was removed. SoundManager keeps its public
// API but must register, load and play nothing.

const { howlCtor, howlPlay, getPrefs } = vi.hoisted(() => ({
  howlCtor: vi.fn(),
  howlPlay: vi.fn(),
  getPrefs: vi.fn(),
}));

vi.mock("howler", () => ({
  Howl: class {
    constructor(opts: unknown) {
      howlCtor(opts);
    }
    play = howlPlay;
    volume = vi.fn();
  },
}));

vi.mock("@storyteller/tauri-api", () => ({
  GetAppPreferences: getPrefs,
}));

import { SoundManager } from "./SoundManager";
import { SoundRegistry } from "./SoundRegistry";
import * as soundboard from "../index";

const EVENT_PREF_KEYS = [
  "delete_file_sound",
  "enqueue_success_sound",
  "enqueue_failure_sound",
  "generation_success_sound",
  "generation_failure_sound",
] as const;

const EVENT_METHODS = [
  "playFileDeleted",
  "playEnqueueSuccess",
  "playEnqueueFailure",
  "playGenerationSuccess",
  "playGenerationFailure",
] as const;

// Names of the sounds the old catalog shipped; prefs saved before A1 may
// still hold them.
const LEGACY_SOUND_KEYS = ["flower", "next", "done", "fail", "crumble", "bong"];

beforeEach(() => {
  howlCtor.mockReset();
  howlPlay.mockReset();
  getPrefs.mockReset();
  delete (window as unknown as Record<string, unknown>)["artcraft_sound_registry"];
  (SoundManager as unknown as { installed: boolean }).installed = false;
});

describe("SoundManager public API (unchanged by A1)", () => {
  it("is still exported from the package entry point", () => {
    expect(soundboard.SoundManager).toBe(SoundManager);
  });

  it.each(["install", "playPreview", ...EVENT_METHODS])(
    "keeps the static method %s",
    (name) => {
      expect(typeof (SoundManager as unknown as Record<string, unknown>)[name]).toBe(
        "function",
      );
    },
  );

  it("keeps the arities of install and playPreview", () => {
    expect(SoundManager.install.length).toBe(0);
    expect(SoundManager.playPreview.length).toBe(1);
  });

  it.each(EVENT_METHODS)("%s still returns a promise", async (name) => {
    getPrefs.mockResolvedValue({ preferences: { play_sounds: false } });
    const result = SoundManager[name]();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});

describe("SoundManager.OPTIONS", () => {
  it("offers only the silent option", () => {
    expect(SoundManager.OPTIONS).toEqual([{ value: "none", label: "None (Silent)" }]);
  });

  it("has no brand names in user-visible labels", () => {
    for (const { label } of SoundManager.OPTIONS) {
      expect(label).not.toMatch(/artcraft|storyteller|fakeyou|ltx|lightricks/i);
    }
  });
});

describe("SoundManager.install", () => {
  it("registers no sounds and creates no audio objects", () => {
    SoundManager.install();

    expect(howlCtor).not.toHaveBeenCalled();
    for (const key of [...LEGACY_SOUND_KEYS, ...EVENT_PREF_KEYS]) {
      expect(SoundRegistry.getInstance().hasSound(key)).toBe(false);
    }
  });

  it("is idempotent", () => {
    SoundManager.install();
    SoundManager.install();

    expect(howlCtor).not.toHaveBeenCalled();
  });
});

describe("SoundManager.playPreview", () => {
  it.each(["", "none", ...LEGACY_SOUND_KEYS, "C:\\sounds\\x.mp3", "/resources/sound/x.mp3"])(
    "plays nothing for %j",
    (name) => {
      SoundManager.install();

      expect(() => SoundManager.playPreview(name)).not.toThrow();
      expect(howlCtor).not.toHaveBeenCalled();
      expect(howlPlay).not.toHaveBeenCalled();
    },
  );

  it("does not throw before install", () => {
    expect(() => SoundManager.playPreview("flower")).not.toThrow();
    expect(howlPlay).not.toHaveBeenCalled();
  });
});

describe("SoundManager event playback", () => {
  it.each(EVENT_METHODS)(
    "%s plays nothing even with sounds on and legacy keys saved",
    async (name) => {
      const preferences: Record<string, unknown> = { play_sounds: true };
      for (const k of EVENT_PREF_KEYS) preferences[k] = "flower";
      getPrefs.mockResolvedValue({ preferences });
      SoundManager.install();

      await SoundManager[name]();

      expect(howlCtor).not.toHaveBeenCalled();
      expect(howlPlay).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["sounds off", { play_sounds: false, delete_file_sound: "flower" }],
    ["pref missing", { play_sounds: true }],
    ["pref empty", { play_sounds: true, delete_file_sound: "" }],
    ["pref none", { play_sounds: true, delete_file_sound: "none" }],
  ])("plays nothing when %s", async (_label, preferences) => {
    getPrefs.mockResolvedValue({ preferences });

    await SoundManager.playFileDeleted();

    expect(howlPlay).not.toHaveBeenCalled();
  });

  it("tolerates missing preferences (offline / no backend)", async () => {
    getPrefs.mockResolvedValue({ preferences: undefined });

    await expect(SoundManager.playEnqueueFailure()).resolves.toBeUndefined();
    expect(howlPlay).not.toHaveBeenCalled();
  });
});
