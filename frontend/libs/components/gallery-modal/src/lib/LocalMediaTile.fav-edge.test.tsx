// FAV-4 edge cases: the heart button on My Library tiles.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

import { favoritePaths } from "./favoritesStore";
import { FavoriteHeartButton, LocalMediaTile } from "./LocalMediaTile";

// --- mocks ---

const toastError = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(),
}));
vi.mock("@storyteller/ui-toaster", () => ({ toast: { error: toastError } }));
// Expose the Phosphor weight so the filled/regular state is observable.
vi.mock("@phosphor-icons/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@phosphor-icons/react")>()),
  HeartIcon: ({ weight }: { weight?: string }) => <svg data-testid="heart-icon" data-weight={weight} />,
}));

// --- constants ---

const WIN_VIDEO = "C:\\Users\\Jane Doe\\Videos\\h0x\\clip one.mp4";
const WIN_IMAGE = "D:\\Médias\\über still (1).webp";
const UNIX_IMAGE = "/home/jane/h0x/still.png";
const BRAND_LEAKS = /artcraft|getartcraft|storyteller|fakeyou|ltx|lightricks/i;

// --- helpers ---

const file = (path: string, kind: "image" | "video") =>
  ({ path, kind, size_bytes: 1, created_at: "" }) as any;

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const heart = () => screen.getByRole("button", { name: /favorites$/ });
const pressed = (el: HTMLElement) => el.getAttribute("aria-pressed");
const favCalls = () =>
  vi.mocked(invoke).mock.calls.filter((c) => c[0] === "add_favorite" || c[0] === "remove_favorite");

describe("LocalMediaTile favorites edge cases", () => {
  beforeEach(() => {
    // Files share one fork; start from an empty body so stray nodes from other files never match.
    cleanup();
    document.body.innerHTML = "";
    favoritePaths.value = new Set();
    toastError.mockReset();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("uses a regular orange heart that fills when favorited", async () => {
    render(<LocalMediaTile file={file(WIN_IMAGE, "image")} scrollRoot={null} />);
    expect(heart().className).toContain("text-orange-500");
    expect(screen.getByTestId("heart-icon").getAttribute("data-weight")).toBe("regular");

    fireEvent.click(heart());
    await waitFor(() =>
      expect(screen.getByTestId("heart-icon").getAttribute("data-weight")).toBe("fill"),
    );
  });

  it("is a type=button so it never submits a surrounding form", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <LocalMediaTile file={file(WIN_IMAGE, "image")} scrollRoot={null} />
      </form>,
    );
    expect(heart().getAttribute("type")).toBe("button");
    fireEvent.click(heart());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not open a video tile when its heart is clicked", () => {
    const onOpen = vi.fn();
    render(<LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} onOpen={onOpen} />);
    fireEvent.click(heart());
    expect(onOpen).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("add_favorite", { path: WIN_VIDEO });
  });

  it("does not let the heart click reach an outer click handler", () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <LocalMediaTile file={file(WIN_IMAGE, "image")} scrollRoot={null} />
      </div>,
    );
    fireEvent.click(heart());
    expect(outer).not.toHaveBeenCalled();
  });

  it("passes Windows, unicode and unix paths to the command unchanged", async () => {
    for (const path of [WIN_VIDEO, WIN_IMAGE, UNIX_IMAGE]) {
      render(<FavoriteHeartButton path={path} />);
      fireEvent.click(heart());
      await waitFor(() => expect(pressed(heart())).toBe("true"));
      cleanup();
    }
    expect(favCalls().map((c) => c[1])).toEqual([
      { path: WIN_VIDEO },
      { path: WIN_IMAGE },
      { path: UNIX_IMAGE },
    ]);
  });

  it("only presses the heart of the tile that was favorited", async () => {
    render(
      <>
        <LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />
        <LocalMediaTile file={file(WIN_IMAGE, "image")} scrollRoot={null} />
      </>,
    );
    const [videoHeart, imageHeart] = screen.getAllByRole("button", { name: /favorites$/ });
    fireEvent.click(imageHeart);
    await waitFor(() => expect(pressed(imageHeart)).toBe("true"));
    expect(pressed(videoHeart)).toBe("false");
  });

  it("follows favorite changes made elsewhere in the app", () => {
    render(<LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />);
    expect(pressed(heart())).toBe("false");
    act(() => {
      favoritePaths.value = new Set([WIN_VIDEO]);
    });
    expect(pressed(heart())).toBe("true");
    expect(heart().getAttribute("aria-label")).toBe("Remove from favorites");
    act(() => {
      favoritePaths.value = new Set();
    });
    expect(pressed(heart())).toBe("false");
  });

  it("flips immediately, before the command resolves", async () => {
    const pending = deferred();
    vi.mocked(invoke).mockReturnValue(pending.promise as any);
    render(<LocalMediaTile file={file(WIN_IMAGE, "image")} scrollRoot={null} />);
    fireEvent.click(heart());
    expect(pressed(heart())).toBe("true");
    await act(async () => pending.resolve());
    expect(pressed(heart())).toBe("true");
  });

  it("ends unpressed after a quick double click", async () => {
    const add = deferred();
    const remove = deferred();
    vi.mocked(invoke).mockImplementation(((cmd: string) =>
      cmd === "add_favorite" ? add.promise : remove.promise) as any);
    render(<LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />);

    fireEvent.click(heart());
    fireEvent.click(heart());
    await act(async () => {
      add.resolve();
      remove.resolve();
    });

    expect(pressed(heart())).toBe("false");
    expect(favCalls().map((c) => c[0])).toEqual(["add_favorite", "remove_favorite"]);
  });

  it("stays pressed and shows an error when unfavoriting fails", async () => {
    favoritePaths.value = new Set([WIN_IMAGE]);
    vi.mocked(invoke).mockRejectedValue(new Error("favorites db locked"));
    render(<LocalMediaTile file={file(WIN_IMAGE, "image")} scrollRoot={null} />);

    fireEvent.click(heart());
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(pressed(heart())).toBe("true");
    expect(heart().getAttribute("aria-label")).toBe("Remove from favorites");
  });

  it("shows an error toast when favoriting fails offline", async () => {
    vi.mocked(invoke).mockRejectedValue("offline");
    render(<LocalMediaTile file={file(WIN_VIDEO, "video")} scrollRoot={null} />);
    fireEvent.click(heart());
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(pressed(heart())).toBe("false");
  });

  it("uses no brand names in either label", async () => {
    render(<LocalMediaTile file={file(WIN_IMAGE, "image")} scrollRoot={null} />);
    expect(heart().getAttribute("aria-label")).not.toMatch(BRAND_LEAKS);
    fireEvent.click(heart());
    await waitFor(() => expect(pressed(heart())).toBe("true"));
    expect(heart().getAttribute("aria-label")).not.toMatch(BRAND_LEAKS);
  });
});
