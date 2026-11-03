// R2-6b edge cases: BytePlus models send provider "byteplus" and the model id
// string; non-BytePlus models are untouched; stale store values are resolved to
// the BytePlus model's allowed options; guards still stop empty prompts.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import {
  IMAGE_MODELS,
  IMAGE_MODELS_BY_ID,
  VIDEO_MODELS,
  VIDEO_MODELS_BY_ID,
} from "@storyteller/model-list";
import { PromptBoxVideo } from "./PromptBoxVideo";
import { PromptBoxImage } from "./PromptBoxImage";
import { usePromptImageStore, usePromptVideoStore } from "./promptStore";

const SEEDANCE_PRO = "seedance-1-0-pro-250528";
const SEEDANCE_FAST = "seedance-1-0-pro-fast-251015";
const SEEDREAM = "seedream-4-5-251128";
const BRAND_LEAKS = [/artcraft/i, /storyteller\.ai/i, /fakeyou/i, /\bLTX\b/, /lightricks/i];

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
const initialVideo = usePromptVideoStore.getState();
const initialImage = usePromptImageStore.getState();

const hasBytePlus = (m: { getProviders(): GenerationProvider[] }) =>
  m.getProviders().includes(GenerationProvider.BytePlus);

beforeEach(() => {
  usePromptVideoStore.setState(initialVideo, true);
  usePromptImageStore.setState(initialImage, true);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  api.generateVideo.mockResolvedValue({ status: "success" });
  api.generateImage.mockResolvedValue({ status: "success" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function videoRequest(modelId: string, props: Record<string, unknown> = {}) {
  const model = VIDEO_MODELS_BY_ID.get(modelId) ?? VIDEO_MODELS.find((m) => m.id === modelId)!;
  render(<PromptBoxVideo useJobContext={useJobContext} selectedModel={model} {...props} />);
  fireEvent.click(screen.getByTestId("generate"));
  await waitFor(() => expect(api.generateVideo).toHaveBeenCalledTimes(1));
  return api.generateVideo.mock.calls[0][0];
}

async function imageRequest(modelId: string, props: Record<string, unknown> = {}) {
  const model = IMAGE_MODELS_BY_ID.get(modelId) ?? IMAGE_MODELS.find((m) => m.id === modelId)!;
  render(<PromptBoxImage useJobContext={useJobContext} selectedModel={model} {...props} />);
  fireEvent.click(screen.getByTestId("generate"));
  await waitFor(() => expect(api.generateImage).toHaveBeenCalledTimes(1));
  return api.generateImage.mock.calls[0][0];
}

describe("PromptBoxVideo BytePlus request", () => {
  it("Seedance Pro Fast sends provider byteplus and its id as a plain string", async () => {
    usePromptVideoStore.setState({ prompt: "waves at dusk" });
    const request = await videoRequest(SEEDANCE_FAST);
    expect(request.provider).toBe("byteplus");
    expect(typeof request.model).toBe("string");
    expect(request.model).toBe(SEEDANCE_FAST);
    expect(request.duration_seconds).toBe(5);
    expect(request.resolution).toBe("seven_twenty_p");
  });

  it("sends the user's 1080p and 10s picks", async () => {
    usePromptVideoStore.setState({ prompt: "city timelapse", resolution: "1080p", duration: 10 });
    const request = await videoRequest(SEEDANCE_PRO);
    expect(request.provider).toBe("byteplus");
    expect(request.duration_seconds).toBe(10);
    expect(request.resolution).toBe("ten_eighty_p");
  });

  it("replaces a stale resolution and duration with ones the BytePlus model allows", async () => {
    usePromptVideoStore.setState({ prompt: "rain on glass", resolution: "480p", duration: 7 });
    const request = await videoRequest(SEEDANCE_PRO);
    expect([5, 10]).toContain(request.duration_seconds);
    expect(["seven_twenty_p", "ten_eighty_p"]).toContain(request.resolution);
    expect(request.resolution).not.toBe("four_eighty_p");
  });

  it("overrides a different selectedProvider for a BytePlus model", async () => {
    usePromptVideoStore.setState({ prompt: "a fox" });
    const request = await videoRequest(SEEDANCE_PRO, { selectedProvider: GenerationProvider.Fal });
    expect(request.provider).toBe("byteplus");
    expect(request.model).toBe(SEEDANCE_PRO);
  });

  it("leaves a non-BytePlus model's provider and model object unchanged", async () => {
    const other = VIDEO_MODELS.find((m) => !hasBytePlus(m) && !m.requiresImage)!;
    expect(other).toBeDefined();
    usePromptVideoStore.setState({ prompt: "a fox" });
    const request = await videoRequest(other.id, { selectedProvider: GenerationProvider.Fal });
    expect(request.provider).toBe("fal");
    expect(request.model).toBe(other);
  });

  it("does not call GenerateVideo for a whitespace-only prompt", async () => {
    usePromptVideoStore.setState({ prompt: "   " });
    const model = VIDEO_MODELS_BY_ID.get(SEEDANCE_PRO)!;
    render(<PromptBoxVideo useJobContext={useJobContext} selectedModel={model} />);
    fireEvent.click(screen.getByTestId("generate"));
    await Promise.resolve();
    expect(api.generateVideo).not.toHaveBeenCalled();
  });

  it("survives a rejected GenerateVideo after sending the BytePlus request", async () => {
    api.generateVideo.mockRejectedValueOnce(new Error("offline"));
    usePromptVideoStore.setState({ prompt: "offline try" });
    const request = await videoRequest(SEEDANCE_PRO);
    expect(request.provider).toBe("byteplus");
    expect(screen.getByTestId("generate")).toBeTruthy();
  });

  it("renders no brand leaks for a BytePlus video model", () => {
    const model = VIDEO_MODELS_BY_ID.get(SEEDANCE_PRO)!;
    render(<PromptBoxVideo useJobContext={useJobContext} selectedModel={model} />);
    const text = document.body.textContent ?? "";
    for (const leak of BRAND_LEAKS) expect(text).not.toMatch(leak);
  });
});

describe("PromptBoxImage BytePlus request", () => {
  it("overrides a different selectedProvider and sends the id as a string", async () => {
    usePromptImageStore.setState({ prompt: "a red fox" });
    const request = await imageRequest(SEEDREAM, { selectedProvider: GenerationProvider.Fal });
    expect(request.provider).toBe("byteplus");
    expect(typeof request.model).toBe("string");
    expect(request.model).toBe(SEEDREAM);
  });

  it("leaves a non-BytePlus image model's provider and model object unchanged", async () => {
    const other = IMAGE_MODELS.find((m) => !hasBytePlus(m))!;
    expect(other).toBeDefined();
    usePromptImageStore.setState({ prompt: "a red fox" });
    const request = await imageRequest(other.id);
    expect(request.provider).not.toBe("byteplus");
    expect(request.model).toBe(other);
  });

  it("does not call GenerateImage for an empty prompt", async () => {
    usePromptImageStore.setState({ prompt: "" });
    const model = IMAGE_MODELS_BY_ID.get(SEEDREAM)!;
    render(<PromptBoxImage useJobContext={useJobContext} selectedModel={model} />);
    fireEvent.click(screen.getByTestId("generate"));
    await Promise.resolve();
    expect(api.generateImage).not.toHaveBeenCalled();
  });

  it("survives a rejected GenerateImage after sending the BytePlus request", async () => {
    api.generateImage.mockRejectedValueOnce(new Error("offline"));
    usePromptImageStore.setState({ prompt: "offline try" });
    const request = await imageRequest(SEEDREAM);
    expect(request.provider).toBe("byteplus");
    expect(request.model).toBe(SEEDREAM);
  });

  it("renders no brand leaks for Seedream 4.5", () => {
    const model = IMAGE_MODELS_BY_ID.get(SEEDREAM)!;
    render(<PromptBoxImage useJobContext={useJobContext} selectedModel={model} />);
    const text = document.body.textContent ?? "";
    for (const leak of BRAND_LEAKS) expect(text).not.toMatch(leak);
  });
});
