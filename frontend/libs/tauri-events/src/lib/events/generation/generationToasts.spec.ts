// R4-T1: provider success toasts are gone. Enqueue-success and
// generation-complete events only play a sound; failure events still toast.error.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationAction } from "./common";
import { useGenerationEnqueueSuccessEvent } from "./useGenerationEnqueueSuccessEvent";
import { useGenerationCompleteEvent } from "./useGenerationCompleteEvent";
import { useGenerationEnqueueFailureEvent } from "./useGenerationEnqueueFailureEvent";
import { useGenerationFailedEvent } from "./useGenerationFailedEvent";

type Handler = (event: { payload: unknown }) => Promise<void> | void;

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => Promise<void> | void>(),
  unlisten: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  },
  sound: {
    playEnqueueSuccess: vi.fn(),
    playGenerationSuccess: vi.fn(),
    playEnqueueFailure: vi.fn(),
    playGenerationFailure: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, cb: Handler) => {
    h.handlers.set(name, cb);
    return Promise.resolve(h.unlisten);
  }),
}));
vi.mock("@storyteller/ui-toaster", () => ({ toast: h.toast }));
vi.mock("@storyteller/soundboard", () => ({ SoundManager: h.sound }));

const SUCCESS = "generation-enqueue-success-event";
const COMPLETE = "generation-complete-event";
const ENQUEUE_FAIL = "generation-enqueue-failure-event";
const FAILED = "generation-failed-event";

const PROVIDERS = ["byteplus", "fal", "artcraft", "unknown_provider"];
const ACTIONS = Object.values(GenerationAction);
const MODELS = [undefined, "kling_2.0", "seedream-4-5-251128", ""];

function toastCalls() {
  return Object.values(h.toast).reduce((n, fn) => n + fn.mock.calls.length, 0);
}

async function fire(name: string, payload: unknown) {
  const handler = h.handlers.get(name);
  expect(handler, `listener for ${name}`).toBeDefined();
  await handler!({ payload });
}

beforeEach(() => {
  h.handlers.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  for (const fn of Object.values(h.sound)) fn.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe.each([
  ["enqueue success", useGenerationEnqueueSuccessEvent, SUCCESS, "playEnqueueSuccess"],
  ["generation complete", useGenerationCompleteEvent, COMPLETE, "playGenerationSuccess"],
] as const)("%s event", (_label, hook, eventName, soundKey) => {
  it("registers exactly one listener and unsubscribes on unmount", async () => {
    await Promise.resolve(); // drain unlisten from the previous test's cleanup
    h.unlisten.mockClear();
    const { unmount } = renderHook(() => hook());
    expect(h.handlers.has(eventName)).toBe(true);
    unmount();
    await Promise.resolve();
    expect(h.unlisten).toHaveBeenCalledTimes(1);
  });

  it.each(
    PROVIDERS.flatMap((service) =>
      ACTIONS.flatMap((action) => MODELS.map((model) => [service, action, model] as const)),
    ),
  )("service=%s action=%s model=%s: no toast, one sound", async (service, action, model) => {
    renderHook(() => hook());
    await fire(eventName, { status: "success", data: { service, action, model } });
    expect(toastCalls()).toBe(0);
    expect(h.sound[soundKey]).toHaveBeenCalledTimes(1);
  });

  it("plays one sound per event across repeated events, still without toasts", async () => {
    renderHook(() => hook());
    for (const service of PROVIDERS) {
      await fire(eventName, { status: "success", data: { service, action: GenerationAction.GenerateVideo } });
    }
    expect(h.sound[soundKey]).toHaveBeenCalledTimes(PROVIDERS.length);
    expect(toastCalls()).toBe(0);
  });

  it.each([
    ["empty data", { status: "success", data: {} }],
    ["missing service", { status: "success", data: { action: GenerationAction.GenerateImage } }],
    ["missing action", { status: "success", data: { service: "fal" } }],
    ["unknown action", { status: "success", data: { service: "fal", action: "make_coffee" } }],
    ["null data", { status: "success", data: null }],
    ["no data key", { status: "success" }],
    ["null payload", null],
    ["undefined payload", undefined],
  ])("malformed payload (%s): no throw, no toast, one sound", async (_name, payload) => {
    renderHook(() => hook());
    await expect(fire(eventName, payload)).resolves.toBeUndefined();
    expect(toastCalls()).toBe(0);
    expect(h.sound[soundKey]).toHaveBeenCalledTimes(1);
  });

  it("other sounds are not played", async () => {
    renderHook(() => hook());
    await fire(eventName, { status: "success", data: { service: "fal", action: GenerationAction.GenerateImage } });
    for (const [key, fn] of Object.entries(h.sound)) {
      if (key !== soundKey) expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe.each([
  ["enqueue failure", useGenerationEnqueueFailureEvent, ENQUEUE_FAIL, "playEnqueueFailure", {
    [GenerationAction.GenerateImage]: "Couldn't enqueue image generation!",
    [GenerationAction.GenerateVideo]: "Couldn't enqueue video generation!",
    [GenerationAction.RemoveBackground]: "Couldn't enqueue background removal!",
    [GenerationAction.ImageTo3d]: "Couldn't enqueue 3D model generation!",
    [GenerationAction.GenerateGaussian]: "Couldn't enqueue 3D world generation!",
    [GenerationAction.GenerateAudio]: "Couldn't enqueue generation!",
    [GenerationAction.ImageInpaintEdit]: "Couldn't enqueue generation!",
  }],
  ["generation failed", useGenerationFailedEvent, FAILED, "playGenerationFailure", {
    [GenerationAction.GenerateImage]: "Image generation failed!",
    [GenerationAction.GenerateVideo]: "Video generation failed!",
    [GenerationAction.RemoveBackground]: "Background removal failed!",
    [GenerationAction.ImageTo3d]: "3D model generation failed!",
    [GenerationAction.GenerateGaussian]: "3D world generation failed!",
    [GenerationAction.GenerateAudio]: "Generation failed!",
    [GenerationAction.ImageInpaintEdit]: "Generation failed!",
  }],
] as const)("%s event still shows toast.error", (_label, hook, eventName, soundKey, messages) => {
  it.each(
    PROVIDERS.flatMap((service) => ACTIONS.map((action) => [service, action] as const)),
  )("service=%s action=%s: toast.error with the unchanged message", async (service, action) => {
    renderHook(() => hook());
    await fire(eventName, { status: "failure", data: { service, action } });
    expect(h.toast.error).toHaveBeenCalledTimes(1);
    expect(h.toast.error).toHaveBeenCalledWith(messages[action]);
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.sound[soundKey]).toHaveBeenCalledTimes(1);
  });

  it("prefers the backend reason over the default message", async () => {
    renderHook(() => hook());
    await fire(eventName, {
      status: "failure",
      data: { service: "byteplus", action: GenerationAction.GenerateImage, reason: "Quota exceeded" },
    });
    expect(h.toast.error).toHaveBeenCalledWith("Quota exceeded");
  });

  it("falls back to the default message for an empty reason and unknown action", async () => {
    renderHook(() => hook());
    await fire(eventName, { status: "failure", data: { service: "fal", action: "nope", reason: "" } });
    expect(h.toast.error).toHaveBeenCalledWith(Object.values(messages).at(-1));
  });
});

describe("static guard", () => {
  it.each(["useGenerationEnqueueSuccessEvent.ts", "useGenerationCompleteEvent.ts"])(
    "%s has no toast.success and no toaster import",
    (file) => {
      const src = readFileSync(join(__dirname, file), "utf8");
      expect(src).not.toMatch(/toast\s*\.\s*success/);
      expect(src).not.toMatch(/@storyteller\/ui-toaster/);
      expect(src).not.toMatch(/makeMessage/);
      for (const leak of [/artcraft/i, /\bLTX\b/, /lightricks/i]) expect(src).not.toMatch(leak);
    },
  );
});
