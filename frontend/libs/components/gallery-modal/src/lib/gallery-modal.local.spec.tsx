// R2-5c edge cases: the "On this computer" source in My Library.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import {
  FoldersApi,
  GalleryModalApi,
  TagsApi,
  UsersApi,
} from "@storyteller/api";

import { favoritePaths, favoritesStore } from "./favoritesStore";
import GalleryModal from "./gallery-modal";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

// --- constants ---

const WIN_VIDEO = "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4";
const WIN_IMAGE = "D:\\media\\still.webp";

const LOCAL_FILES = [
  { path: WIN_VIDEO, kind: "video", size_bytes: 10, created_at: "2026-11-01T00:00:00Z" },
  { path: WIN_IMAGE, kind: "image", size_bytes: 5, created_at: "2026-10-31T00:00:00Z" },
];

const EMPTY_LOCAL_TEXT = "No media on this computer yet";
const BRAND_LEAKS = /artcraft|getartcraft|storyteller\.ai|fakeyou|ltx|lightricks/i;

// --- helpers ---

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

const noSession = () =>
  vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({ success: false } as any);

const withSession = (username = "alice") =>
  vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
    success: true,
    data: { user: { username } },
  } as any);

const isSelected = (name: string) =>
  screen.getByRole("button", { name }).className.includes("bg-ui-controls ");

const localCalls = () =>
  vi.mocked(invoke).mock.calls.filter((c) => c[0] === "list_local_media_command").length;

describe("GalleryModal local source", () => {
  beforeEach(() => {
    // Files share one fork; start from an empty body so stray portals from other files never match.
    cleanup();
    document.body.innerHTML = "";
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "list_favorites") return [];
      return cmd === "local_media_thumbnail_command" ? { thumb_path: `${args.path}.thumb.jpg` } : LOCAL_FILES;
    });
    favoritePaths.value = new Set();
    vi.spyOn(favoritesStore, "load").mockResolvedValue();
    vi.spyOn(FoldersApi.prototype, "ListAllFolders").mockResolvedValue({
      success: true,
      data: [],
    } as any);
    vi.spyOn(TagsApi.prototype, "ListTags").mockResolvedValue({ success: true, data: [] } as any);
    vi.spyOn(GalleryModalApi.prototype, "listUserMediaFiles").mockResolvedValue({
      success: true,
      data: [],
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("passes Windows paths to convertFileSrc unchanged and picks the tag by kind", async () => {
    noSession();
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);

    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    const videos = baseElement.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0].getAttribute("src")).toBe(converted(WIN_VIDEO));
    expect(baseElement.querySelector(`img[src="${converted(WIN_IMAGE + ".thumb.jpg")}"]`)).not.toBeNull();
    expect(baseElement.querySelector(`video[src="${converted(WIN_IMAGE)}"]`)).toBeNull();
    expect(baseElement.querySelector(`img[src="${converted(WIN_VIDEO)}"]`)).toBeNull();
  });

  it("shows the empty state when there is no local media", async () => {
    noSession();
    vi.mocked(invoke).mockResolvedValue([]);
    render(<GalleryModal mode="select" isOpen />);

    expect(await screen.findByText(EMPTY_LOCAL_TEXT)).toBeTruthy();
    expect(isSelected("On this computer")).toBe(true);
  });

  it("falls back to the empty state when listing local media fails", async () => {
    noSession();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_favorites") return [];
      throw new Error("scan failed");
    });
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);

    expect(await screen.findByText(EMPTY_LOCAL_TEXT)).toBeTruthy();
    expect(baseElement.querySelector("video")).toBeNull();
  });

  it("selects the local source when GetSession throws", async () => {
    vi.spyOn(UsersApi.prototype, "GetSession").mockRejectedValue(new Error("offline"));
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);

    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    expect(isSelected("On this computer")).toBe(true);
  });

  it("selects the local source when the session has no user", async () => {
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
      success: true,
      data: { user: null },
    } as any);
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);

    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    expect(isSelected("On this computer")).toBe(true);
  });

  it("hides the Folders tab on the local source (All Assets is also a media filter label)", async () => {
    noSession();
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);

    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Folders" })).toBeNull();
  });

  it("does not list local media while the modal is closed", async () => {
    noSession();
    render(<GalleryModal mode="select" isOpen={false} />);
    await Promise.resolve();
    expect(localCalls()).toBe(0);
  });

  it("lists local media when a signed-in user switches to On this computer", async () => {
    withSession();
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() =>
      expect(GalleryModalApi.prototype.listUserMediaFiles).toHaveBeenCalled(),
    );
    expect(localCalls()).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "On this computer" }));

    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    expect(localCalls()).toBe(1);
    expect(isSelected("On this computer")).toBe(true);
    expect(isSelected("Online")).toBe(false);
  });

  it("restores the Folders tab when switching from local back to Online", async () => {
    noSession();
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Online" }));

    expect(await screen.findByRole("button", { name: "Folders" })).toBeTruthy();
    expect(baseElement.querySelector("video")).toBeNull();
    expect(screen.queryByText(EMPTY_LOCAL_TEXT)).toBeNull();
  });

  it("has no brand names in the source toggle or local empty state", async () => {
    noSession();
    vi.mocked(invoke).mockResolvedValue([]);
    render(<GalleryModal mode="select" isOpen />);

    const empty = await screen.findByText(EMPTY_LOCAL_TEXT);
    const texts = [
      screen.getByRole("button", { name: "On this computer" }).textContent ?? "",
      screen.getByRole("button", { name: "Online" }).textContent ?? "",
      empty.textContent ?? "",
    ];
    for (const t of texts) expect(t).not.toMatch(BRAND_LEAKS);
  });
});
