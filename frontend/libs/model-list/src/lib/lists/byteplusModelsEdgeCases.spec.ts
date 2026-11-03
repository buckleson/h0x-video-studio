// @vitest-environment jsdom
// R2-6 edge cases: the BytePlus Seedance/Seedream entries must survive key
// normalization, listing hydration, family/creator lookups and option
// resolution, and must not collide with or alter the existing Seedance/Seedream
// entries.
import { describe, expect, it } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { GenerationProvider as CommonGenerationProvider } from "@storyteller/common";
import { IMAGE_MODELS, IMAGE_MODELS_BY_ID } from "./ImageModels.js";
import { VIDEO_MODELS, VIDEO_MODELS_BY_ID } from "./VideoModels.js";
import { ALL_MODELS_LIST } from "./AllModels.js";
import { findModelByKey } from "./AllModelsById.js";
import {
  buildImageModelsFromListing,
  buildVideoModelsFromListing,
} from "../loader/buildModelsFromListing.js";
import { imageModelForProvider } from "../classes/imageModelForProvider.js";
import { ModelCreator } from "../classes/metadata/ModelCreator.js";
import { getCreatorIconPath } from "../classes/metadata/ModelCreatorIcons.js";
import { getCreatorIconPathForModelId } from "../classes/metadata/ModelCreatorIconForId.js";
import { getModelFamilyName } from "../classes/metadata/ModelFamilies.js";
import {
  effectivePromptMaxLength,
  isSeedanceVideoModelId,
} from "../classes/metadata/ModelMapping.js";
import {
  resolveVideoDuration,
  videoDurationRange,
  videoResolutionValue,
} from "../classes/videoOptions.js";
import type { VideoModel } from "../classes/VideoModel.js";
import type { ImageModel } from "../classes/ImageModel.js";

const SEEDANCE_IDS = ["seedance-1-0-pro-250528", "seedance-1-0-pro-fast-251015"];
const SEEDREAM_ID = "seedream-4-5-251128";
const ALL_BYTEPLUS_IDS = [...SEEDANCE_IDS, SEEDREAM_ID];

const BRAND_LEAKS = [
  /artcraft/i,
  /getartcraft/i,
  /storyteller/i,
  /fakeyou/i,
  /\bLTX\b/i,
  /lightricks/i,
];

const video = (id: string): VideoModel => {
  const model = VIDEO_MODELS_BY_ID.get(id);
  if (!model) throw new Error(`missing video model ${id}`);
  return model;
};

const image = (id: string): ImageModel => {
  const model = IMAGE_MODELS_BY_ID.get(id);
  if (!model) throw new Error(`missing image model ${id}`);
  return model;
};

describe("BytePlus provider enums", () => {
  it("both frontend enums expose the same provider values", () => {
    expect(new Set(Object.values(CommonGenerationProvider))).toEqual(
      new Set(Object.values(GenerationProvider)),
    );
  });

  it("'byteplus' appears exactly once in each enum", () => {
    expect(Object.values(GenerationProvider).filter((v) => v === "byteplus")).toHaveLength(1);
    expect(
      Object.values(CommonGenerationProvider).filter((v) => v === "byteplus"),
    ).toHaveLength(1);
  });

  it("the enum value is lowercase with no separator", () => {
    expect(GenerationProvider.BytePlus).toMatch(/^[a-z]+$/);
    expect(GenerationProvider.BytePlus).not.toBe("byte_plus");
  });
});

describe("BytePlus model identity", () => {
  it("each new id appears exactly once across all model lists", () => {
    for (const id of ALL_BYTEPLUS_IDS) {
      expect(ALL_MODELS_LIST.filter((m) => m.id === id), id).toHaveLength(1);
      expect(ALL_MODELS_LIST.filter((m) => m.tauriId === id), id).toHaveLength(1);
    }
  });

  it("Seedance entries are video-only and Seedream is image-only", () => {
    const imageIds = new Set(IMAGE_MODELS.map((m) => m.tauriId));
    const videoIds = new Set(VIDEO_MODELS.map((m) => m.tauriId));
    for (const id of SEEDANCE_IDS) {
      expect(videoIds.has(id), id).toBe(true);
      expect(imageIds.has(id), id).toBe(false);
      expect(video(id).category).toBe("video");
    }
    expect(imageIds.has(SEEDREAM_ID)).toBe(true);
    expect(videoIds.has(SEEDREAM_ID)).toBe(false);
    expect(image(SEEDREAM_ID).category).toBe("image");
  });

  it("all new entries are created by Bytedance", () => {
    for (const id of SEEDANCE_IDS) expect(video(id).creator).toBe(ModelCreator.Bytedance);
    expect(image(SEEDREAM_ID).creator).toBe(ModelCreator.Bytedance);
  });

  it("BytePlus is used only by the three new entries", () => {
    const byteplusIds = ALL_MODELS_LIST.filter((m) =>
      m.getProviders().includes(GenerationProvider.BytePlus),
    ).map((m) => m.tauriId);
    expect(byteplusIds.sort()).toEqual([...ALL_BYTEPLUS_IDS].sort());
  });

  it("the Pro and Pro Fast entries are distinct models", () => {
    const [pro, fast] = SEEDANCE_IDS.map(video);
    expect(pro).not.toBe(fast);
    expect(pro.fullName).not.toBe(fast.fullName);
  });
});

describe("findModelByKey with BytePlus ids", () => {
  it.each(ALL_BYTEPLUS_IDS)("resolves %s by its exact id", (id) => {
    expect(findModelByKey(id)?.tauriId).toBe(id);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(findModelByKey("  SEEDANCE-1-0-PRO-250528 ")?.tauriId).toBe(
      "seedance-1-0-pro-250528",
    );
    expect(findModelByKey("Seedream-4-5-251128")?.tauriId).toBe(SEEDREAM_ID);
  });

  it("does not resolve partial, truncated or underscore variants", () => {
    expect(findModelByKey("seedance-1-0-pro")).toBeUndefined();
    expect(findModelByKey("seedance-1-0-pro-fast")).toBeUndefined();
    expect(findModelByKey("seedance_1_0_pro_250528")).toBeUndefined();
    expect(findModelByKey("seedream-4-5")).toBeUndefined();
  });

  it("keeps the older Seedream 4.5 key pointing at the old entry", () => {
    const old = findModelByKey("seedream_4p5");
    expect(old).toBeDefined();
    expect(old?.tauriId).toBe("seedream_4p5");
    expect(old?.getProviders()).not.toContain(GenerationProvider.BytePlus);
  });
});

describe("BytePlus Seedance options", () => {
  it.each(SEEDANCE_IDS)("%s defaults sit inside its option lists", (id) => {
    const model = video(id);
    expect(model.defaultDuration).toBe(5);
    expect(model.durationOptions).toContain(model.defaultDuration);
    expect(model.defaultResolution).toBe("720p");
    expect(model.resolutionOptions).toContain(model.defaultResolution);
  });

  it.each(SEEDANCE_IDS)("%s takes an optional start frame but no end frame", (id) => {
    const model = video(id);
    expect(model.startFrame).toBe(true);
    expect(model.endFrame).toBe(false);
    expect(model.requiresImage).toBe(false);
  });

  it.each(SEEDANCE_IDS)("%s duration range is 5..10", (id) => {
    expect(videoDurationRange(video(id), false)).toEqual({ min: 5, max: 10 });
  });

  it.each(SEEDANCE_IDS)("%s snaps out-of-range durations to 5 or 10", (id) => {
    const model = video(id);
    expect(resolveVideoDuration(model, null, false)).toBe(5);
    expect(resolveVideoDuration(model, 0, false)).toBe(5);
    expect(resolveVideoDuration(model, -3, false)).toBe(5);
    expect(resolveVideoDuration(model, 6, false)).toBe(5);
    expect(resolveVideoDuration(model, 9, false)).toBe(10);
    expect(resolveVideoDuration(model, 60, false)).toBe(10);
  });

  it.each(SEEDANCE_IDS)("%s resolutions map to known API values", (id) => {
    expect(video(id).resolutionOptions?.map(videoResolutionValue)).toEqual([
      "seven_twenty_p",
      "ten_eighty_p",
    ]);
  });

  it.each(SEEDANCE_IDS)("%s is treated as a Seedance id for the CJK prompt waiver", (id) => {
    expect(isSeedanceVideoModelId(id)).toBe(true);
    expect(effectivePromptMaxLength(id, 3000, "a cat")).toBe(3000);
    expect(effectivePromptMaxLength(id, 3000, "一只猫")).toBe(Infinity);
  });

  it("does not apply the Seedance waiver to the Seedream image id", () => {
    expect(isSeedanceVideoModelId(SEEDREAM_ID)).toBe(false);
    expect(effectivePromptMaxLength(SEEDREAM_ID, 4000, "一只猫")).toBe(4000);
  });
});

describe("BytePlus picker grouping and icons", () => {
  it("groups the new ids with their existing families", () => {
    for (const id of SEEDANCE_IDS) expect(getModelFamilyName(id)).toBe("Seedance");
    expect(getModelFamilyName(SEEDREAM_ID)).toBe("Seedream");
  });

  it("uses the Bytedance creator icon for each new id", () => {
    const bytedance = getCreatorIconPath(ModelCreator.Bytedance);
    for (const id of ALL_BYTEPLUS_IDS) {
      expect(getCreatorIconPathForModelId(id), id).toBe(bytedance);
    }
  });
});

describe("BytePlus listing hydration", () => {
  it("keeps the new entries as frontend-only models when the backend omits them", () => {
    const videos = buildVideoModelsFromListing(VIDEO_MODELS, []);
    const images = buildImageModelsFromListing(IMAGE_MODELS, []);
    for (const id of SEEDANCE_IDS) {
      const model = videos.find((m) => m.tauriId === id);
      expect(model, id).toBeDefined();
      expect(model?.getProviders()).toEqual([GenerationProvider.BytePlus]);
    }
    expect(
      images.find((m) => m.tauriId === SEEDREAM_ID)?.getProviders(),
    ).toEqual([GenerationProvider.BytePlus]);
  });

  it("keeps the BytePlus provider and id when the backend details the model", () => {
    const [model] = buildVideoModelsFromListing(VIDEO_MODELS, [
      { model: "seedance-1-0-pro-250528" },
    ]);
    expect(model.tauriId).toBe("seedance-1-0-pro-250528");
    expect(model.id).toBe("seedance-1-0-pro-250528");
    expect(model.getProviders()).toEqual([GenerationProvider.BytePlus]);
    expect(model.fullName).toBe("Seedance 1.0 Pro (BytePlus)");

    const [seedream] = buildImageModelsFromListing(IMAGE_MODELS, [{ model: SEEDREAM_ID }]);
    expect(seedream.id).toBe(SEEDREAM_ID);
    expect(seedream.getProviders()).toEqual([GenerationProvider.BytePlus]);
  });

  it("hides a model the backend marks disabled and does not offer", () => {
    const models = buildVideoModelsFromListing(VIDEO_MODELS, [
      { model: "seedance-1-0-pro-fast-251015", is_disabled: true },
    ]);
    expect(models.map((m) => m.tauriId)).not.toContain("seedance-1-0-pro-fast-251015");
    // The sibling Pro entry is unaffected.
    expect(models.map((m) => m.tauriId)).toContain("seedance-1-0-pro-250528");
  });

  it("returns the Seedream entry unchanged for the BytePlus provider", () => {
    const model = image(SEEDREAM_ID);
    expect(imageModelForProvider(model, GenerationProvider.BytePlus)).toBe(model);
  });
});

describe("BytePlus user-visible strings", () => {
  const visibleStrings = (): string[] => [
    ...SEEDANCE_IDS.flatMap((id) => {
      const m = video(id);
      return [m.fullName, m.selectorName, m.selectorDescription, ...(m.selectorBadges ?? [])];
    }),
    (() => {
      const m = image(SEEDREAM_ID);
      return [m.fullName, m.selectorName, m.selectorDescription, ...(m.selectorBadges ?? [])];
    })(),
  ].flat();

  it("have no empty names or descriptions", () => {
    for (const s of visibleStrings()) {
      expect(typeof s).toBe("string");
      expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("carry the (BytePlus) suffix in every display name", () => {
    for (const id of SEEDANCE_IDS) {
      expect(video(id).fullName).toMatch(/ \(BytePlus\)$/);
      expect(video(id).selectorName).toMatch(/ \(BytePlus\)$/);
    }
    expect(image(SEEDREAM_ID).selectorName).toMatch(/ \(BytePlus\)$/);
  });

  it("contain no upstream brand names", () => {
    for (const s of visibleStrings()) {
      for (const leak of BRAND_LEAKS) expect(s, s).not.toMatch(leak);
    }
  });
});
