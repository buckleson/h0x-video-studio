// R4-4 edge cases: My Library local tiles load lazily inside GalleryModal.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import {
  FoldersApi,
  GalleryModalApi,
  TagsApi,
  UsersApi,
} from "@storyteller/api";

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

// --- helpers ---

type FakeObserver = { cb: IntersectionObserverCallback; targets: Element[] };
let observers: FakeObserver[] = [];

const converted = (path: string) => `asset://localhost/${encodeURIComponent(path)}`;

const observerFor = (el: Element) => observers.find((o) => o.targets.includes(el));

const reveal = (el: Element) =>
  act(() => observerFor(el)!.cb([{ isIntersecting: true, target: el } as any], {} as any));

const localCalls = () =>
  vi.mocked(invoke).mock.calls.filter((c) => c[0] === "list_local_media_command").length;

describe("GalleryModal lazy local tiles", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((cb: IntersectionObserverCallback) => {
        const o: FakeObserver = { cb, targets: [] };
        observers.push(o);
        return {
          observe: (el: Element) => o.targets.push(el),
          disconnect: vi.fn(),
          unobserve: vi.fn(),
        };
      }),
    );
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) =>
      cmd === "local_media_thumbnail_command" ? { thumb_path: `${args.path}.thumb.jpg` } : LOCAL_FILES);
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({ success: false } as any);
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders every local tile but requests no media until it is near the viewport", async () => {
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());

    const video = baseElement.querySelector("video")!;
    expect(video.getAttribute("src")).toBeNull();
    expect(video.getAttribute("preload")).toBe("none");
    expect(baseElement.querySelectorAll("img.aspect-square")).toHaveLength(1);
    expect(baseElement.querySelector('[src^="asset://"]')).toBeNull();
  });

  it("loads only the tile that scrolls into view", async () => {
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());

    const video = baseElement.querySelector("video")!;
    reveal(video);

    expect(video.getAttribute("src")).toBe(converted(WIN_VIDEO));
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(baseElement.querySelector(`img[src="${converted(WIN_IMAGE)}"]`)).toBeNull();
  });

  it("observes tiles with the 400px margin and a root that contains them", async () => {
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());

    const video = baseElement.querySelector("video")!;
    const idx = observers.findIndex((o) => o.targets.includes(video));
    const options = vi.mocked(IntersectionObserver).mock.calls[idx][1]!;
    expect(options.rootMargin).toBe("400px 0px");
    // A null root (viewport) is acceptable; a set root must be the gallery scroll container.
    if (options.root) expect((options.root as Element).contains(video)).toBe(true);
  });

  it("re-lists and shows tiles again after switching Online and back", async () => {
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);
    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    expect(localCalls()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Online" }));
    await waitFor(() => expect(baseElement.querySelector("video")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "On this computer" }));

    await waitFor(() => expect(localCalls()).toBe(2));
    await waitFor(() => expect(baseElement.querySelector("video")).not.toBeNull());
    expect(baseElement.querySelectorAll("video")).toHaveLength(1);
  });

  it("loads all tiles straight away when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);

    await waitFor(() =>
      expect(baseElement.querySelector(`video[src="${converted(WIN_VIDEO)}"]`)).not.toBeNull(),
    );
    expect(baseElement.querySelector(`img[src="${converted(WIN_IMAGE + ".thumb.jpg")}"]`)).not.toBeNull();
  });
});
