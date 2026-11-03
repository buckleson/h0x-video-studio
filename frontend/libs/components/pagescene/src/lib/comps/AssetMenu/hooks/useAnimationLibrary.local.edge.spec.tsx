// R3-3 edge cases for useAnimationLibrary: a session that ends must stop all
// featured/user fetches (refresh and load-more), offline/rejected fetches keep
// the local clips first, and the local clips are never displaced.
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

const names = (items: MediaItem[]) => items.map((i) => i.name);
const fetchMock = vi.fn();

// The hook keeps module-level state, so every test re-imports a fresh copy.
const setup = async (adapter: unknown) => {
  vi.resetModules();
  const { EngineContext } = await import("../../../contexts/EngineContext/EngineContext");
  const { useAnimationLibrary } = await import("./useAnimationLibrary");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EngineContext.Provider value={{ adapter } as never}>{children}</EngineContext.Provider>
  );
  return renderHook(() => useAnimationLibrary(), { wrapper });
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchFeaturedMediaItems.mockReset();
  fetchUserMediaItems.mockReset();
});

afterEach(() => {
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

it("stops fetching once the session token is cleared (sign-out)", async () => {
  let token: string | undefined = "user_token";
  fetchFeaturedMediaItems.mockResolvedValue({ status: "error" });
  fetchUserMediaItems.mockResolvedValue({ status: "success", mediaItems: [] });
  const hook = await setup({ getCurrentUserToken: () => token, showToast: vi.fn() });

  await act(async () => hook.result.current.fetchUserAnimations());
  expect(fetchFeaturedMediaItems).toHaveBeenCalledTimes(1);
  expect(fetchUserMediaItems).toHaveBeenCalledTimes(1);

  token = undefined;
  await act(async () => hook.result.current.fetchUserAnimations());
  await act(async () => hook.result.current.fetchUserAnimations());

  // Featured failed, so it would retry if a token were present.
  expect(fetchFeaturedMediaItems).toHaveBeenCalledTimes(1);
  expect(fetchUserMediaItems).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("load-more without a session never fetches", async () => {
  const hook = await setup({ getCurrentUserToken: () => "", showToast: vi.fn() });
  await act(async () => hook.result.current.loadMoreUserAnimations());
  expect(hook.result.current.hasMoreUserAnimations).toBe(false);
  expect(fetchUserMediaItems).not.toHaveBeenCalled();
  expect(fetchFeaturedMediaItems).not.toHaveBeenCalled();
});

it("load-more after the session ends does not request the next user page", async () => {
  let token: string | undefined = "user_token";
  fetchFeaturedMediaItems.mockResolvedValue({ status: "success", mediaItems: [] });
  fetchUserMediaItems.mockResolvedValue({
    status: "success",
    mediaItems: [clip("m_u1", "Mine 1")],
    nextPage: { current: 0, total_page_count: 3 },
  });
  const hook = await setup({ getCurrentUserToken: () => token, showToast: vi.fn() });

  await act(async () => hook.result.current.fetchUserAnimations());
  expect(hook.result.current.hasMoreUserAnimations).toBe(true);
  expect(fetchUserMediaItems).toHaveBeenCalledTimes(1);

  token = undefined;
  await act(async () => hook.result.current.loadMoreUserAnimations());

  expect(fetchUserMediaItems).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps local clips first when both fetches reject (offline)", async () => {
  fetchFeaturedMediaItems.mockResolvedValue({ status: "error" });
  fetchUserMediaItems.mockResolvedValue({ status: "error" });
  const hook = await setup({ getCurrentUserToken: () => "t", showToast: vi.fn() });

  await act(async () => hook.result.current.fetchUserAnimations());

  expect(names(hook.result.current.allAnimations).slice(0, 16)).toEqual(CLIPS);
  expect(names(hook.result.current.defaultAnimations).slice(0, 16)).toEqual(CLIPS);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps local clips first even when a server clip reuses a local name", async () => {
  fetchFeaturedMediaItems.mockResolvedValue({
    status: "success",
    mediaItems: [clip("m_srv_jab", "Jab"), clip("m_srv_roll", "Roll")],
  });
  fetchUserMediaItems.mockResolvedValue({ status: "success", mediaItems: [clip("m_my_jab", "Jab")] });
  const hook = await setup({ getCurrentUserToken: () => "t", showToast: vi.fn() });

  await act(async () => hook.result.current.fetchUserAnimations());

  const all = hook.result.current.allAnimations;
  expect(all.slice(0, 16).every((i) => i.media_id.startsWith("Local::"))).toBe(true);
  expect(names(all.slice(0, 16))).toEqual(CLIPS);
  expect(all.slice(16).map((i) => i.media_id)).toEqual(["m_my_jab", "m_srv_jab", "m_srv_roll"]);
});
