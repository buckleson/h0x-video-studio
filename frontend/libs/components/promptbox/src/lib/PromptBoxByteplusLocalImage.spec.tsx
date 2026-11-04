// BytePlus models read reference images from this machine: an uploaded first
// frame is sent as a data URL, never as a vendor media token, and the deck
// never calls the vendor upload API for them.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploaderStates } from "@storyteller/common";
import { IMAGE_MODELS_BY_ID, VIDEO_MODELS_BY_ID } from "@storyteller/model-list";
import { PromptBoxVideo } from "./PromptBoxVideo";
import { PromptBoxImage } from "./PromptBoxImage";
import { usePromptImageStore, usePromptVideoStore, type RefImage } from "./promptStore";
import { fileToDataUrl, keepImageLocal, localImageSource } from "./common/localImage";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

const api = vi.hoisted(() => ({
  generateVideo: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock("@storyteller/tauri-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GenerateVideo: api.generateVideo,
  GenerateImage: api.generateImage,
}));

vi.mock("@storyteller/ui-button", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GenerateIconButton: ({ onClick }: { onClick: () => void }) => (
    <button data-testid="generate" onClick={onClick} />
  ),
}));

const useJobContext = () => ({}) as never;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  api.generateVideo.mockResolvedValue({ status: "success" });
  api.generateImage.mockResolvedValue({ status: "success" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  usePromptVideoStore.setState({ referenceImages: [] });
  usePromptImageStore.setState({ referenceImages: [] });
});

describe("localImage helpers", () => {
  it("reads a file into a data URL", async () => {
    expect(await fileToDataUrl(pngFile())).toBe(PNG_DATA_URL);
  });

  it("keepImageLocal reports success with the data URL", async () => {
    const states: { status: UploaderStates; data?: string }[] = [];
    await keepImageLocal({ title: "t", assetFile: pngFile(), progressCallback: (s) => states.push(s) });
    expect(states.at(-1)).toEqual({ status: UploaderStates.success, data: PNG_DATA_URL });
  });

  it("localImageSource prefers a data URL, then the file, then the token", async () => {
    expect(await localImageSource({ file: pngFile(), mediaToken: "data:image/png;base64,AA==" }))
      .toBe("data:image/png;base64,AA==");
    expect(await localImageSource({ file: pngFile(), mediaToken: "m_vendor123" })).toBe(PNG_DATA_URL);
    expect(await localImageSource({ file: new File([], "library-image"), mediaToken: "m_lib" })).toBe("m_lib");
  });
});

describe("Create Video first frame with BytePlus Seedance", () => {
  it("sends the uploaded first frame as a data URL, not the vendor token", async () => {
    const model = VIDEO_MODELS_BY_ID.get("seedance-1-0-pro-fast-251015")!;
    usePromptVideoStore.setState({ prompt: "a lattice glowing", referenceImages: [refImage("m_vendor123")] });
    render(<PromptBoxVideo useJobContext={useJobContext} selectedModel={model} />);

    fireEvent.click(screen.getByTestId("generate"));

    await waitFor(() => expect(api.generateVideo).toHaveBeenCalledTimes(1));
    const request = api.generateVideo.mock.calls[0][0];
    expect(request.provider).toBe("byteplus");
    expect(request.start_frame_image_media_token).toBe(PNG_DATA_URL);
  });

  it("does not call the vendor upload for a BytePlus first frame", async () => {
    const model = VIDEO_MODELS_BY_ID.get("seedance-1-0-pro-fast-251015")!;
    const vendorUpload = vi.fn();
    render(<PromptBoxVideo useJobContext={useJobContext} selectedModel={model} uploadImage={vendorUpload} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!;
    fireEvent.change(input, { target: { files: [pngFile()] } });

    await waitFor(() => expect(usePromptVideoStore.getState().referenceImages).toHaveLength(1));
    expect(usePromptVideoStore.getState().referenceImages[0].mediaToken).toBe(PNG_DATA_URL);
    expect(vendorUpload).not.toHaveBeenCalled();
  });

  it("keeps the vendor token for a non-BytePlus model", async () => {
    const model = [...VIDEO_MODELS_BY_ID.values()].find(
      (m) => !m.getProviders().includes("byteplus" as never) && !m.supportsReferenceMode,
    )!;
    usePromptVideoStore.setState({ prompt: "a cat", referenceImages: [refImage("m_vendor123")] });
    render(<PromptBoxVideo useJobContext={useJobContext} selectedModel={model} />);

    fireEvent.click(screen.getByTestId("generate"));

    await waitFor(() => expect(api.generateVideo).toHaveBeenCalledTimes(1));
    expect(api.generateVideo.mock.calls[0][0].start_frame_image_media_token).toBe("m_vendor123");
  });
});

describe("Create Image references with BytePlus Seedream", () => {
  it("sends uploaded reference images as data URLs", async () => {
    const model = IMAGE_MODELS_BY_ID.get("seedream-4-5-251128")!;
    usePromptImageStore.setState({ prompt: "a red fox", referenceImages: [refImage("m_vendor123")] });
    render(<PromptBoxImage useJobContext={useJobContext} selectedModel={model} />);

    fireEvent.click(screen.getByTestId("generate"));

    await waitFor(() => expect(api.generateImage).toHaveBeenCalledTimes(1));
    expect(api.generateImage.mock.calls[0][0].image_media_tokens).toEqual([PNG_DATA_URL]);
  });
});

// ========== Helpers ==========

function pngFile(): File {
  return new File([PNG_BYTES], "frame.png", { type: "image/png" });
}

function refImage(mediaToken: string): RefImage {
  return { id: "r1", url: "blob:preview", file: pngFile(), mediaToken } as RefImage;
}
