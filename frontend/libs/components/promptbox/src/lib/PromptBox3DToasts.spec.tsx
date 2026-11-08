// R4-T1: enqueueing from PromptBox3D no longer shows "Image added to queue";
// the over-limit error path still shows toast.error.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraAspectRatio } from "@storyteller/common";
import { PromptBox3D } from "./PromptBox3D";
import { usePrompt3DStore } from "./promptStore";

const m = vi.hoisted(() => ({
  isDesktop: true,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
  generateImage: vi.fn(),
  uploadSceneSnapshot: vi.fn(),
  omniGenerate: vi.fn(),
}));

vi.mock("@storyteller/ui-toaster", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: m.toast,
}));
vi.mock("@storyteller/tauri-utils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  IsDesktopApp: () => m.isDesktop,
}));
vi.mock("@storyteller/tauri-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GenerateImage: m.generateImage,
}));
vi.mock("@storyteller/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PromptsApi: class {
    uploadSceneSnapshot = m.uploadSceneSnapshot;
  },
  OmniGenApi: class {
    generateImage = m.omniGenerate;
  },
}));
vi.mock("@storyteller/ui-button", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GenerateButton: ({ onClick }: { onClick: () => void }) => (
    <button data-testid="generate" onClick={onClick} />
  ),
}));

const initial = usePrompt3DStore.getState();
const noop = () => {};

function fakeModel(overrides: Record<string, unknown> = {}) {
  return {
    id: "seedream-4-5-251128",
    tauriId: "seedream_4p5",
    maxPromptLength: 1000,
    canUseImagePrompt: false,
    supportsNewAspectRatio: () => false,
    ...overrides,
  } as never;
}

function renderBox(props: Record<string, unknown> = {}) {
  return render(
    <PromptBox3D
      cameras={[]}
      cameraAspectRatio={CameraAspectRatio.HORIZONTAL_3_2}
      disableHotkeyInput={noop}
      enableHotkeyInput={noop}
      gridVisibility={false}
      setGridVisibility={noop}
      selectedCameraId=""
      deleteCamera={noop}
      focalLengthDragging={{ isDragging: false, focalLength: 35 } as never}
      setFocalLengthDragging={noop}
      isPromptBoxFocused={false}
      setIsPromptBoxFocused={noop}
      uploadImage={async () => {}}
      handleCameraSelect={noop}
      handleAddCamera={noop}
      handleCameraNameChange={noop}
      handleCameraFocalLengthChange={noop}
      onAspectRatioSelect={noop}
      setEnginePrompt={noop}
      selectedImageModel={fakeModel()}
      snapshotCurrentFrame={() => ({ base64Snapshot: "", file: new File(["x"], "f.png") })}
      {...props}
    />,
  );
}

beforeEach(() => {
  usePrompt3DStore.setState(initial, true);
  m.isDesktop = true;
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  m.uploadSceneSnapshot.mockResolvedValue({ success: true, data: "snap_token" });
  m.generateImage.mockResolvedValue({ status: "success" });
  m.omniGenerate.mockResolvedValue({ success: true, inference_job_token: "job_1" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ADDED = /image added to queue/i;
const successCalls = () => m.toast.success.mock.calls.flat().map(String);

describe("PromptBox3D enqueue toasts", () => {
  it.each([
    ["success", { status: "success" }],
    ["error status", { status: "error", error_type: "ServerError" }],
  ])("desktop enqueue (%s) shows no success toast", async (_name, response) => {
    m.generateImage.mockResolvedValueOnce(response);
    usePrompt3DStore.setState({ prompt: "a red fox" });
    renderBox();
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(m.generateImage).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(m.toast.success).not.toHaveBeenCalled();
    expect(successCalls().some((s) => ADDED.test(s))).toBe(false);
  });

  it.each(["byteplus", "fal", "artcraft", "unknown"])(
    "desktop enqueue with provider %s shows no success toast",
    async (provider) => {
      usePrompt3DStore.setState({ prompt: "a red fox" });
      renderBox({ selectedProvider: provider });
      fireEvent.click(screen.getByTestId("generate"));
      await waitFor(() => expect(m.generateImage).toHaveBeenCalledTimes(1));
      expect(m.generateImage.mock.calls[0][0].provider).toBe(provider);
      expect(m.toast.success).not.toHaveBeenCalled();
    },
  );

  it("web enqueue shows no success toast", async () => {
    m.isDesktop = false;
    usePrompt3DStore.setState({ prompt: "a red fox" });
    renderBox();
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(m.omniGenerate).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("a failed snapshot upload on web shows no success toast", async () => {
    m.isDesktop = false;
    m.uploadSceneSnapshot.mockResolvedValueOnce({ success: false, errorMessage: "offline" });
    usePrompt3DStore.setState({ prompt: "offline try" });
    renderBox();
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(m.uploadSceneSnapshot).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(m.omniGenerate).not.toHaveBeenCalled();
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it.each([true, false])("over-limit prompt (desktop=%s) still shows toast.error and does not enqueue", async (desktop) => {
    m.isDesktop = desktop;
    usePrompt3DStore.setState({ prompt: "abcdefghij" });
    renderBox({ selectedImageModel: fakeModel({ maxPromptLength: 5 }) });
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledTimes(1));
    expect(m.toast.error).toHaveBeenCalledWith("Prompt exceeds the 5 character limit for this model");
    expect(m.toast.success).not.toHaveBeenCalled();
    expect(m.generateImage).not.toHaveBeenCalled();
    expect(m.omniGenerate).not.toHaveBeenCalled();
  });

  it("a rejected desktop GenerateImage shows one toast.error and no success toast", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    m.generateImage.mockRejectedValueOnce(new Error("boom"));
    usePrompt3DStore.setState({ prompt: "a red fox" });
    renderBox();
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(m.toast.error).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(m.toast.success).not.toHaveBeenCalled();
  });

  it("whitespace-only prompt neither enqueues nor toasts", async () => {
    usePrompt3DStore.setState({ prompt: "   " });
    renderBox();
    fireEvent.click(screen.getByTestId("generate"));
    await Promise.resolve();
    expect(m.generateImage).not.toHaveBeenCalled();
    expect(m.toast.success).not.toHaveBeenCalled();
    expect(m.toast.error).not.toHaveBeenCalled();
  });
});

describe("PromptBox3D source guard", () => {
  const src = readFileSync(join(__dirname, "PromptBox3D.tsx"), "utf8");

  it("has no 'Image added to queue' toast", () => {
    expect(src).not.toMatch(ADDED);
  });

  it("keeps toast.error and the prompted 'Scene update saved' toast", () => {
    expect(src).toMatch(/toast\.error\(/);
    expect(src).toMatch(/toast\.success\("Scene update saved/);
    expect(src.match(/toast\.success\(/g)?.length).toBe(1);
  });
});
