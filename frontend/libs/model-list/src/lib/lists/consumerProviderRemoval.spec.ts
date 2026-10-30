// @vitest-environment jsdom
// A3c: models that only worked through deleted consumer providers
// (Midjourney, Sora, Grok and WorldLabs consumer logins) are gone; every
// model reachable through fal, the router, the xAI API or the WorldLabs API stays.
import { describe, expect, it } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { IMAGE_MODELS } from "./ImageModels.js";
import { VIDEO_MODELS } from "./VideoModels.js";
import { SPLAT_MODELS } from "./SplatModels.js";
import { OBJECT_3D_MODELS } from "./Object3DModels.js";
import { ALL_MODELS_LIST } from "./AllModels.js";
import { findModelByKey } from "./AllModelsById.js";
import { getAllModels, lookupModelByTauriId } from "../legacy/Models.js";
import {
  buildImageModelsFromListing,
  buildVideoModelsFromListing,
} from "../loader/buildModelsFromListing.js";
import { imageModelForProvider } from "../classes/imageModelForProvider.js";
import {
  getProviderDisplayName,
  getProviderIconByName,
} from "../classes/metadata/ModelMapping.js";

const REMOVED_PROVIDER_VALUES = ["grok", "midjourney", "sora", "world_labs", "worldlabs"];
const KNOWN_PROVIDERS = new Set<string>(Object.values(GenerationProvider));

describe("static model lists", () => {
  it("only reference providers that still exist in the enum", () => {
    for (const model of ALL_MODELS_LIST) {
      for (const provider of model.getProviders()) {
        expect(provider, `${model.id} has an undefined provider`).toBeDefined();
        expect(KNOWN_PROVIDERS.has(provider), `${model.id} -> ${provider}`).toBe(true);
        expect(REMOVED_PROVIDER_VALUES).not.toContain(provider);
      }
    }
  });

  it("every model keeps at least one provider", () => {
    for (const model of ALL_MODELS_LIST) {
      expect(model.getProviders().length, model.id).toBeGreaterThan(0);
    }
  });

  it("drops the generic consumer-only Midjourney model", () => {
    expect(ALL_MODELS_LIST.map((m) => m.id)).not.toContain("midjourney");
    expect(ALL_MODELS_LIST.map((m) => m.tauriId)).not.toContain("midjourney");
    expect(findModelByKey("midjourney")).toBeUndefined();
    expect(findModelByKey("MIDJOURNEY ")).toBeUndefined();
  });

  it("keeps the API-reachable Grok, Sora, Marble and fal models", () => {
    const ids = new Set(ALL_MODELS_LIST.map((m) => m.tauriId));
    for (const id of [
      "grok_imagine_image",
      "grok_imagine_video",
      "grok_imagine_video_1p5",
      "sora_2",
      "sora_2_pro",
      "marble_0p1_mini",
      "marble_0p1_plus",
      "gpt_image_1",
      "flux_pro_1p1_ultra",
      "nano_banana_pro",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(
      IMAGE_MODELS.some((m) => m.getProviders().includes(GenerationProvider.Fal)),
    ).toBe(true);
    expect(SPLAT_MODELS).toHaveLength(2);
    expect(OBJECT_3D_MODELS.length).toBeGreaterThan(0);
  });

  it("still resolves backend dotted ids and empty keys after the removal", () => {
    expect(findModelByKey("kling_1.6_pro")?.tauriId).toBe("kling_1p6_pro");
    expect(findModelByKey(null)).toBeUndefined();
    expect(findModelByKey(undefined)).toBeUndefined();
    expect(findModelByKey("")).toBeUndefined();
  });
});

describe("legacy model configs", () => {
  it("no longer list the generic Midjourney entry", () => {
    expect(getAllModels().map((m) => m.id)).not.toContain("midjourney");
    expect(lookupModelByTauriId("midjourney")).toBeUndefined();
  });

  it("keep Grok and GPT image entries", () => {
    expect(lookupModelByTauriId("grok_image")).toBeDefined();
    expect(lookupModelByTauriId("gpt_image_1")).toBeDefined();
  });
});

describe("listing hydration", () => {
  it.each(["midjourney_7", "midjourney_7_niji", "midjourney_8"])(
    "keeps %s listing capabilities with router-only providers",
    (id) => {
      const [model] = buildImageModelsFromListing(
        [],
        [
          {
            model: id,
            batch_size_options: [1, 2, 4],
            batch_size_default: 1,
            image_refs_supported: true,
            image_refs_max: 4,
          },
        ],
      );
      expect(model.getProviders()).toEqual([GenerationProvider.Artcraft]);
      expect(model.predefinedGenerationCounts).toEqual([1, 2, 4]);
      expect(model.canUseImagePrompt).toBe(true);
    },
  );

  it("falls back to an overlay without the generic midjourney model or removed providers", () => {
    const fallback = [
      ...buildImageModelsFromListing(IMAGE_MODELS, []),
      ...buildVideoModelsFromListing(VIDEO_MODELS, []),
    ];
    expect(fallback.map((m) => m.tauriId)).not.toContain("midjourney");
    for (const model of fallback) {
      for (const provider of model.getProviders()) {
        expect(REMOVED_PROVIDER_VALUES).not.toContain(provider);
      }
    }
  });

  it("gives a backend-only generic midjourney entry no removed provider", () => {
    const models = buildImageModelsFromListing(IMAGE_MODELS, [{ model: "midjourney" }]);
    for (const model of models) {
      for (const provider of model.getProviders()) {
        expect(REMOVED_PROVIDER_VALUES).not.toContain(provider);
      }
    }
  });
});

describe("imageModelForProvider", () => {
  it("returns the same model instance for any provider", () => {
    const [model] = buildImageModelsFromListing([], [{ model: "midjourney_8" }]);
    expect(imageModelForProvider(model, GenerationProvider.Artcraft)).toBe(model);
    expect(imageModelForProvider(model, GenerationProvider.Fal)).toBe(model);
    expect(imageModelForProvider(model, undefined)).toBe(model);
    // A stale persisted provider from before the removal must not alter the model.
    expect(imageModelForProvider(model, "midjourney" as GenerationProvider)).toBe(model);
  });

  it("passes through undefined", () => {
    expect(imageModelForProvider(undefined, GenerationProvider.Artcraft)).toBeUndefined();
  });
});

describe("provider name and icon lookups", () => {
  it.each(REMOVED_PROVIDER_VALUES)("%s has no display name or icon mapping", (provider) => {
    expect(getProviderDisplayName(provider)).toBe(provider);
    expect(getProviderIconByName(provider)).toBeNull();
    expect(getProviderIconByName(provider.toUpperCase())).toBeNull();
  });

  it("still maps fal and handles empty input", () => {
    expect(getProviderDisplayName("fal")).toBe("FAL");
    expect(getProviderIconByName("FAL")).not.toBeNull();
    expect(getProviderDisplayName("")).toBe("");
    expect(getProviderIconByName("")).toBeNull();
    expect(getProviderIconByName(undefined as unknown as string)).toBeNull();
  });
});
