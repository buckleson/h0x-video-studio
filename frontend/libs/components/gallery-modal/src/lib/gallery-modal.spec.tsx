import { render, screen, waitFor } from "@testing-library/react";
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
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

const LOCAL_FILES = [
  {
    path: "C:/dl/clip.mp4",
    kind: "video",
    size_bytes: 10,
    created_at: "2026-11-01T00:00:00Z",
  },
  {
    path: "C:/dl/still.png",
    kind: "image",
    size_bytes: 5,
    created_at: "2026-10-31T00:00:00Z",
  },
];

describe("GalleryModal", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(LOCAL_FILES);
    vi.spyOn(FoldersApi.prototype, "ListAllFolders").mockResolvedValue({
      success: true,
      data: [],
    } as any);
    vi.spyOn(TagsApi.prototype, "ListTags").mockResolvedValue({
      success: true,
      data: [],
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render successfully", () => {
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
      success: false,
    } as any);
    const { baseElement } = render(<GalleryModal mode="view" />);
    expect(baseElement).toBeTruthy();
  });

  it("selects the local source and renders local media when there is no session", async () => {
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
      success: false,
    } as any);
    const { baseElement } = render(<GalleryModal mode="select" isOpen />);

    await waitFor(() =>
      expect(baseElement.querySelector("video")).not.toBeNull(),
    );
    expect(invoke).toHaveBeenCalledWith("list_local_media_command");
    expect(baseElement.querySelector("video")?.getAttribute("src")).toBe(
      "asset://localhost/C:/dl/clip.mp4",
    );
    expect(
      baseElement.querySelector('img[src="asset://localhost/C:/dl/still.png"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "On this computer" }).className,
    ).toContain("bg-ui-controls ");
  });

  it("keeps the vendor source when there is a session", async () => {
    vi.spyOn(UsersApi.prototype, "GetSession").mockResolvedValue({
      success: true,
      data: { user: { username: "alice" } },
    } as any);
    const listUserMediaFiles = vi
      .spyOn(GalleryModalApi.prototype, "listUserMediaFiles")
      .mockResolvedValue({ success: true, data: [] } as any);
    render(<GalleryModal mode="select" isOpen />);

    await waitFor(() =>
      expect(listUserMediaFiles).toHaveBeenCalledWith(
        expect.objectContaining({ username: "alice" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Online" }).className).toContain(
      "bg-ui-controls ",
    );
    expect(invoke).not.toHaveBeenCalledWith("list_local_media_command");
    expect(await screen.findByText("No items yet")).toBeTruthy();
  });
});
