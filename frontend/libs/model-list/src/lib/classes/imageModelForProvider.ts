import { GenerationProvider } from "@storyteller/api-enums";
import { ImageModel } from "./ImageModel.js";

export function imageModelForProvider(
  model: ImageModel | undefined,
  _provider: GenerationProvider | undefined,
): ImageModel | undefined {
  return model;
}
