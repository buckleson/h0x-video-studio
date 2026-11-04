// R3-3: bundled Local:: Fighter/Brute and fight clips lead the AssetModal
// lists, and nothing is fetched from the backend without a session token.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MediaItem } from "../../models/assets";
import { AssetModal } from "./AssetModal";
import { EngineContext } from "../../contexts/EngineContext/EngineContext";
import { usePageSceneStore } from "../../PageSceneStore";
import type Editor from "../../engine/editor";

vi.mock("../../contexts/EngineContext/EngineContext", async () => {
  const { createContext } = await import("react");
  return { EngineContext: createContext(null) };
});

// The real grid is virtualized (zero-size in jsdom); list names in order.
vi.mock("./shared/ItemElements", () => ({
  ItemElements: ({ items, debug }: { items: MediaItem[]; debug?: string }) => (
    <ul data-testid={debug}>
      {items.map((item, i) => (
        <li key={`${item.media_id}-${i}`}>{item.name}</li>
      ))}
    </ul>
  ),
}));

const CHARACTERS = ["Fighter", "Brute"];
const CLIPS = [
  "Jab", "Cross", "Hook", "Roundhouse kick", "Spin kick", "Cross slash",
  "Sword combo", "Dash", "Dodge left", "Dodge back", "Hit to head",
  "Knockback", "Death", "Sword idle", "Fight idle", "Roll",
];

const featuredRow = (token: string, title: string) => ({
  token,
  maybe_title: title,
  media_type: "glb",
  cover_image: { default_cover: { color_index: 0, image_index: 0 } },
});

const makeAdapter = (token: string | undefined) => ({
  getCurrentUserToken: () => token,
  listFeaturedMediaFiles: vi.fn().mockResolvedValue({
    success: true,
    data: [featuredRow("m_featured", "Featured Thing")],
  }),
  listUserMediaFiles: vi.fn().mockResolvedValue({
    success: true,
    data: [featuredRow("m_mine", "My Upload")],
  }),
  showToast: vi.fn(),
  getCdnUrl: () => "",
  renderAssetUploader: () => null,
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  usePageSceneStore.setState({ assetModalVisible: true });
});

afterEach(() => {
  cleanup();
  usePageSceneStore.setState({ assetModalVisible: false });
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

const renderModal = (adapter: ReturnType<typeof makeAdapter>) =>
  render(
    <EngineContext.Provider value={{ adapter } as unknown as Editor}>
      <AssetModal />
    </EngineContext.Provider>,
  );

const tabNames = (tab: string, debug: string): string[] => {
  fireEvent.click(screen.getByRole("button", { name: tab }));
  const names = within(screen.getByTestId(debug))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  return names as string[];
};

it("lists the local presets first and fetches nothing without a session", async () => {
  const adapter = makeAdapter(undefined);
  renderModal(adapter);
  await act(async () => {});

  expect(tabNames("Characters", "asset-modal-character").slice(0, 2)).toEqual(CHARACTERS);
  expect(tabNames("Animations", "asset-modal-animations").slice(0, 16)).toEqual(CLIPS);

  expect(adapter.listFeaturedMediaFiles).not.toHaveBeenCalled();
  expect(adapter.listUserMediaFiles).not.toHaveBeenCalled();
  expect(adapter.showToast).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps the local presets first once featured and user items load", async () => {
  const adapter = makeAdapter("user_token");
  renderModal(adapter);
  await waitFor(() => expect(adapter.listFeaturedMediaFiles).toHaveBeenCalled());
  await act(async () => {});

  const characters = tabNames("Characters", "asset-modal-character");
  expect(characters.slice(0, 2)).toEqual(CHARACTERS);
  expect(characters).toContain("Featured Thing");

  const clips = tabNames("Animations", "asset-modal-animations");
  expect(clips.slice(0, 16)).toEqual(CLIPS);
  expect(clips).toEqual(expect.arrayContaining(["My Upload", "Featured Thing"]));
  expect(fetchMock).not.toHaveBeenCalled();
});
