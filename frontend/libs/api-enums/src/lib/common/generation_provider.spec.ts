// A3c: consumer-only provider values are gone from both enum copies and from
// the task model enum; values Rust still sends through the API stay.
import { describe, expect, it } from "vitest";
import { GenerationProvider } from "./generation_provider.js";
import { TaskModelType } from "../tauri/tasks/task_model_type.js";
import { GenerationProvider as CommonGenerationProvider } from "../../../../common/src/lib/enums/GenerationProvider.js";

const REMOVED_VALUES = ["grok", "midjourney", "sora", "world_labs"];
const REMOVED_KEYS = ["Grok", "Midjourney", "Sora", "WorldLabs"];

describe("GenerationProvider (api-enums)", () => {
  it("drops the consumer provider values and keys", () => {
    const values: string[] = Object.values(GenerationProvider);
    for (const value of REMOVED_VALUES) expect(values).not.toContain(value);
    for (const key of REMOVED_KEYS) expect(Object.keys(GenerationProvider)).not.toContain(key);
  });

  it("keeps artcraft and fal", () => {
    expect(GenerationProvider.Artcraft).toBe("artcraft");
    expect(GenerationProvider.Fal).toBe("fal");
  });

  it("has unique values", () => {
    const values = Object.values(GenerationProvider);
    expect(new Set(values).size).toBe(values.length);
  });

  it("matches the common GenerationProvider copy exactly", () => {
    expect({ ...CommonGenerationProvider }).toEqual({ ...GenerationProvider });
  });
});

describe("TaskModelType", () => {
  it("drops the generic Midjourney value", () => {
    expect(Object.keys(TaskModelType)).not.toContain("Midjourney");
    expect(Object.values(TaskModelType)).not.toContain("midjourney");
  });

  it("keeps Sora 2 and GPT Image 1, which still route through the API", () => {
    expect(TaskModelType.Sora2).toBe("sora_2");
    expect(TaskModelType.GptImage1).toBe("gpt_image_1");
  });
});
