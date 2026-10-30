// A3a: consumer-login providers (Sora/ChatGPT, Midjourney, Grok, WorldLabs) are gone
// from the generation event enums.
import { describe, expect, it } from "vitest";
import { GenerationAction, GenerationModel, GenerationServiceProvider } from "./common";

const CONSUMER = /sora|chatgpt|midjourney|grok|world_?labs/i;

describe("generation event enums", () => {
  it("GenerationServiceProvider holds only fal", () => {
    expect({ ...GenerationServiceProvider }).toEqual({ Fal: "fal" });
  });

  it.each([
    ["GenerationServiceProvider", GenerationServiceProvider],
    ["GenerationModel", GenerationModel],
    ["GenerationAction", GenerationAction],
  ])("%s has no consumer-login keys or values", (_name, e) => {
    for (const [k, v] of Object.entries(e)) {
      expect(k).not.toMatch(CONSUMER);
      expect(String(v)).not.toMatch(CONSUMER);
    }
  });

  it.each([
    ["GenerationServiceProvider", GenerationServiceProvider],
    ["GenerationModel", GenerationModel],
    ["GenerationAction", GenerationAction],
  ])("%s values are unique and non-empty", (_name, e) => {
    const values = Object.values(e);
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(String(v).trim()).not.toBe("");
  });

  it("keeps the generation actions other events rely on", () => {
    expect(GenerationAction.GenerateImage).toBe("generate_image");
    expect(GenerationAction.GenerateVideo).toBe("generate_video");
    expect(GenerationAction.ImageInpaintEdit).toBe("image_inpaint_edit");
  });
});
