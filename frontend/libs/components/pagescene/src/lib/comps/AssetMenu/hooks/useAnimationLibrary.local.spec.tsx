// R3-3: useAnimationLibrary keeps the bundled Local:: clips first and runs no
// featured/user fetch without a session token. The hook keeps module-level
// state, so every test re-imports a fresh copy.
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MediaItem } from "../../../models/assets";

const fetchFeaturedMediaItems = vi.fn();
const fetchUserMediaItems = vi.fn();

vi.mock("../utilities/fetchMediaItems", () => ({
  fetchFeaturedMediaItems: (...a: unknown[]) => fetchFeaturedMediaItems(...a),
  fetchUserMediaItems: (...a: unknown[]) => fetchUserMediaItems(...a),
}));

const CLIPS = [
  "Jab", "Cross", "Hook", "Roundhouse kick", "Spin kick", "Cross slash",
  "Sword combo", "Dash", "Dodge left", "Dodge back", "Hit to head",
  "Knockback", "Death", "Sword idle", "Fight idle", "Roll",
];

const clip = (media_id: string, name: string): MediaItem =>
  ({ version: 1, media_id, name, type: "animation", media_type: "glb" }) as unknown as MediaItem;

const fetchMock = vi.fn();

const setup = async (adapter: unknown) => {
  vi.resetModules();
  const { EngineContext } = await import("../../../contexts/EngineContext/EngineContext");
  const { useAnimationLibrary } = await import("./useAnimationLibrary");
  const { demoAnimationItems } = await import("../../../signals/demoAssets");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EngineContext.Provider value={(adapter === null ? null : { adapter }) as never}>
      {children}
    </EngineContext.Provider>
  );
  const hook = renderHook(() => useAnimationLibrary(), { wrapper });
  return { hook, demoAnimationItems };
};

const names = (items: MediaItem[]) => items.map((i) => i.name);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchFeaturedMediaItems.mockReset();
  fetchUserMediaItems.mockReset();
});

afterEach(() => {
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

it.each([
  ["undefined token", { getCurrentUserToken: () => undefined }],
  ["empty-string token", { getCurrentUserToken: () => "" }],
  ["null token", { getCurrentUserToken: () => null }],
  ["no getCurrentUserToken", {}],
])("fetches nothing with %s and still lists local clips first", async (_l, base) => {
  const adapter = { ...base, showToast: vi.fn() };
  const { hook, demoAnimationItems } = await setup(adapter);

  await act(async () => hook.result.current.fetchUserAnimations());
  await act(async () => hook.result.current.fetchUserAnimations());

  expect(fetchFeaturedMediaItems).not.toHaveBeenCalled();
  expect(fetchUserMediaItems).not.toHaveBeenCalled();
  expect(adapter.showToast).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();

  const { defaultAnimations, allAnimations, userAnimations } = hook.result.current;
  expect(defaultAnimations).toBe(demoAnimationItems);
  expect(names(allAnimations).slice(0, 16)).toEqual(CLIPS);
  expect(userAnimations).toEqual([]);
});

it("does not throw and fetches nothing without an editor", async () => {
  const { hook } = await setup(null);
  await act(async () => hook.result.current.fetchUserAnimations());
  expect(fetchFeaturedMediaItems).not.toHaveBeenCalled();
  expect(fetchUserMediaItems).not.toHaveBeenCalled();
  expect(names(hook.result.current.allAnimations).slice(0, 16)).toEqual(CLIPS);
});

it("keeps local clips before user and featured items once they load", async () => {
  fetchFeaturedMediaItems.mockResolvedValue({
    status: "success",
    mediaItems: [clip("m_feat", "Featured Clip")],
  });
  fetchUserMediaItems.mockResolvedValue({
    status: "success",
    mediaItems: [clip("m_user", "My Clip")],
  });
  const { hook } = await setup({ getCurrentUserToken: () => "user_token", showToast: vi.fn() });

  await act(async () => hook.result.current.fetchUserAnimations());

  const { defaultAnimations, allAnimations } = hook.result.current;
  expect(names(defaultAnimations)).toEqual([...CLIPS, "Featured Clip"]);
  expect(names(allAnimations)).toEqual([...CLIPS, "My Clip", "Featured Clip"]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("dedupes a user/featured item that repeats a local media id, keeping the local one first", async () => {
  const dup = "Local::/resources/3d/animations/punch-jab.glb";
  fetchFeaturedMediaItems.mockResolvedValue({ status: "success", mediaItems: [clip(dup, "Dup Feat")] });
  fetchUserMediaItems.mockResolvedValue({ status: "success", mediaItems: [clip(dup, "Dup User")] });
  const { hook } = await setup({ getCurrentUserToken: () => "t", showToast: vi.fn() });

  await act(async () => hook.result.current.fetchUserAnimations());

  const all = hook.result.current.allAnimations;
  expect(all.filter((i) => i.media_id === dup)).toHaveLength(1);
  expect(all[0].name).toBe("Jab");
  expect(new Set(all.map((i) => i.media_id)).size).toBe(all.length);
});

it.each([
  ["an empty featured list", { status: "success", mediaItems: [] }],
  ["a featured error", { status: "error" }],
])("falls back to the demo list with local clips first on %s", async (_l, featured) => {
  fetchFeaturedMediaItems.mockResolvedValue(featured);
  fetchUserMediaItems.mockResolvedValue({ status: "error" });
  const { hook, demoAnimationItems } = await setup({ getCurrentUserToken: () => "t", showToast: vi.fn() });

  await act(async () => hook.result.current.fetchUserAnimations());

  expect(hook.result.current.defaultAnimations).toBe(demoAnimationItems);
  expect(names(hook.result.current.allAnimations).slice(0, 16)).toEqual(CLIPS);
  expect(hook.result.current.userAnimations).toEqual([]);
});
