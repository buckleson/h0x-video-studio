// R3-3 edge cases: the bundled Local:: presets stay first in AssetModal for
// every "no session" shape, across reopen and search, ahead of server
// priority characters, and the modal never calls the backend without a token.
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
        <li key={`${item.media_id}-${i}`} data-media-id={item.media_id}>
          {item.name}
        </li>
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
const BRANDS =
  /artcraft|getartcraft|storyteller\.ai|fakeyou|\bltx\b|lightricks|mixamo|mesh2motion|quaternius/i;

const row = (token: string, title: string) => ({
  token,
  maybe_title: title,
  media_type: "glb",
  cover_image: { default_cover: { color_index: 0, image_index: 0 } },
});

type AdapterBase = Record<string, unknown>;
const makeAdapter = (base: AdapterBase, featured = [row("m_featured", "Featured Thing")]) => ({
  ...base,
  listFeaturedMediaFiles: vi.fn().mockResolvedValue({ success: true, data: featured }),
  listUserMediaFiles: vi.fn().mockResolvedValue({ success: true, data: [row("m_mine", "My Upload")] }),
  showToast: vi.fn(),
  getCdnUrl: () => "",
  renderAssetUploader: () => null,
});
type Adapter = ReturnType<typeof makeAdapter>;

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

const renderModal = (adapter: Adapter) =>
  render(
    <EngineContext.Provider value={{ adapter } as unknown as Editor}>
      <AssetModal />
    </EngineContext.Provider>,
  );

const listNames = (debug: string): string[] =>
  within(screen.getByTestId(debug))
    .getAllByRole("listitem")
    .map((li) => li.textContent ?? "");

const tabNames = (tab: string, debug: string): string[] => {
  fireEvent.click(screen.getByRole("button", { name: tab }));
  const names = listNames(debug);
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  return names;
};

const expectNoBackend = (adapter: Adapter) => {
  expect(adapter.listFeaturedMediaFiles).not.toHaveBeenCalled();
  expect(adapter.listUserMediaFiles).not.toHaveBeenCalled();
  expect(adapter.showToast).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
};

it.each<[string, AdapterBase]>([
  ["an empty-string token", { getCurrentUserToken: () => "" }],
  ["a null token", { getCurrentUserToken: () => null }],
  ["no getCurrentUserToken on the adapter", {}],
])("with %s it lists the local presets first and calls no backend", async (_l, base) => {
  const adapter = makeAdapter(base);
  renderModal(adapter);
  await act(async () => {});

  expect(tabNames("Characters", "asset-modal-character").slice(0, 2)).toEqual(CHARACTERS);
  expect(tabNames("Animations", "asset-modal-animations").slice(0, 16)).toEqual(CLIPS);
  expectNoBackend(adapter);
});

it("calls no backend when the modal is closed and reopened without a session", async () => {
  const adapter = makeAdapter({ getCurrentUserToken: () => "" });
  renderModal(adapter);
  await act(async () => {});
  for (let i = 0; i < 3; i++) {
    await act(async () => usePageSceneStore.setState({ assetModalVisible: false }));
    await act(async () => usePageSceneStore.setState({ assetModalVisible: true }));
  }

  expect(tabNames("Characters", "asset-modal-character").slice(0, 2)).toEqual(CHARACTERS);
  expectNoBackend(adapter);
});

it("puts Fighter and Brute ahead of server priority characters and same-named server items", async () => {
  const adapter = makeAdapter({ getCurrentUserToken: () => "user_token" }, [
    row("m_knight", "Knight"),
    row("m_server_fighter", "Fighter"),
    row("m_other", "Featured Thing"),
  ]);
  renderModal(adapter);
  await waitFor(() => expect(adapter.listFeaturedMediaFiles).toHaveBeenCalled());
  await act(async () => {});

  fireEvent.click(screen.getByRole("button", { name: "Characters" }));
  const items = within(screen.getByTestId("asset-modal-character")).getAllByRole("listitem");
  expect(items.slice(0, 2).map((li) => li.getAttribute("data-media-id"))).toEqual([
    "Local::/resources/3d/characters/fighter.glb",
    "Local::/resources/3d/characters/brute.glb",
  ]);
  const names = items.map((li) => li.textContent);
  expect(names.indexOf("Knight")).toBeGreaterThan(1);
  expect(names).toContain("Featured Thing");
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  ["fighter", "Fighter"],
  ["BRUTE", "Brute"],
  ["kick", "Roundhouse kick"],
  ["sword idle", "Sword idle"],
])("search %j finds the local preset %s without a session", async (term, expected) => {
  const adapter = makeAdapter({ getCurrentUserToken: () => undefined });
  renderModal(adapter);
  await act(async () => {});

  fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: term } });
  await act(async () => {});

  expect(listNames("asset-modal-all")).toContain(expected);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("search for an unknown term yields no local presets", async () => {
  const adapter = makeAdapter({ getCurrentUserToken: () => undefined });
  renderModal(adapter);
  await act(async () => {});

  fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "zzz-no-such-asset" } });
  await act(async () => {});

  const list = screen.getByTestId("asset-modal-all");
  expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("shows no brand or vendor names in the preset lists it renders", async () => {
  const adapter = makeAdapter({ getCurrentUserToken: () => undefined });
  renderModal(adapter);
  await act(async () => {});

  const shown = [
    ...tabNames("Characters", "asset-modal-character"),
    ...tabNames("Animations", "asset-modal-animations"),
  ];
  expect(shown.length).toBeGreaterThanOrEqual(18);
  for (const name of shown) expect(name).not.toMatch(BRANDS);
});
