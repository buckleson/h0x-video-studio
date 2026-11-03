// @vitest-environment jsdom
// R2-6: Seedance and Seedream entries served through the user's BytePlus key.
import { describe, expect, it } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { GenerationProvider as CommonGenerationProvider } from "@storyteller/common";
import { IMAGE_MODELS_BY_ID } from "./ImageModels.js";
import { VIDEO_MODELS_BY_ID } from "./VideoModels.js";

describe("BytePlus provider enum", () => {
  it("is 'byteplus' in both frontend enums", () => {
    expect(GenerationProvider.BytePlus).toBe("byteplus");
    expect(CommonGenerationProvider.BytePlus).toBe("byteplus");
  });
});

describe("BytePlus video models", () => {
  it.each([
    ["seedance-1-0-pro-250528", "Seedance 1.0 Pro (BytePlus)"],
    ["seedance-1-0-pro-fast-251015", "Seedance 1.0 Pro Fast (BytePlus)"],
  ])("%s is listed as %s", (id, name) => {
    const model = VIDEO_MODELS_BY_ID.get(id);
    expect(model, id).toBeDefined();
    expect(model?.tauriId).toBe(id);
    expect(model?.fullName).toBe(name);
    expect(model?.selectorName).toBe(name);
    expect(model?.getProviders()).toEqual([GenerationProvider.BytePlus]);
    expect(model?.durationOptions).toEqual([5, 10]);
    expect(model?.resolutionOptions).toEqual(["720p", "1080p"]);
    expect(model?.startFrame).toBe(true);
  });
});

describe("BytePlus image models", () => {
  it("lists Seedream 4.5 (BytePlus)", () => {
    const model = IMAGE_MODELS_BY_ID.get("seedream-4-5-251128");
    expect(model).toBeDefined();
    expect(model?.tauriId).toBe("seedream-4-5-251128");
    expect(model?.fullName).toBe("Seedream 4.5 (BytePlus)");
    expect(model?.getProviders()).toEqual([GenerationProvider.BytePlus]);
    expect(model?.canUseImagePrompt).toBe(true);
  });

  it("leaves the existing Seedream 4.5 entry on its old provider", () => {
    expect(IMAGE_MODELS_BY_ID.get("seedream_4p5")?.getProviders()).not.toContain(
      GenerationProvider.BytePlus,
    );
  });
});
