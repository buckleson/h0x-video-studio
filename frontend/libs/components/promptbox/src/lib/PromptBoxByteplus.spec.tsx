import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IMAGE_MODELS_BY_ID, VIDEO_MODELS_BY_ID } from "@storyteller/model-list";
import { PromptBoxVideo } from "./PromptBoxVideo";
import { PromptBoxImage } from "./PromptBoxImage";
import { usePromptImageStore, usePromptVideoStore } from "./promptStore";

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
  api.generateVideo.mockResolvedValue({ status: "success" });
  api.generateImage.mockResolvedValue({ status: "success" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("sends provider byteplus, the model id, duration and resolution for a BytePlus video model", async () => {
  const model = VIDEO_MODELS_BY_ID.get("seedance-1-0-pro-250528")!;
  usePromptVideoStore.setState({ prompt: "a cat surfing" });
  render(<PromptBoxVideo useJobContext={useJobContext} selectedModel={model} />);

  fireEvent.click(screen.getByTestId("generate"));

  await waitFor(() => expect(api.generateVideo).toHaveBeenCalledTimes(1));
  const request = api.generateVideo.mock.calls[0][0];
  expect(request.provider).toBe("byteplus");
  expect(request.model).toBe("seedance-1-0-pro-250528");
  expect(request.duration_seconds).toBe(5);
  expect(request.resolution).toBe("seven_twenty_p");
});

it("sends provider byteplus and the model id for Seedream 4.5", async () => {
  const model = IMAGE_MODELS_BY_ID.get("seedream-4-5-251128")!;
  usePromptImageStore.setState({ prompt: "a red fox" });
  render(<PromptBoxImage useJobContext={useJobContext} selectedModel={model} />);

  fireEvent.click(screen.getByTestId("generate"));

  await waitFor(() => expect(api.generateImage).toHaveBeenCalledTimes(1));
  const request = api.generateImage.mock.calls[0][0];
  expect(request.provider).toBe("byteplus");
  expect(request.model).toBe("seedream-4-5-251128");
});
