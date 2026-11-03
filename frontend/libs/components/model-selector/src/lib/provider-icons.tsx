import {
  GENERIC_ICON_PATH,
  getCreatorIcon,
  ModelCreator,
} from "@storyteller/model-list";
import { GenerationProvider } from "@storyteller/api-enums";
import { ReactNode } from "react";

const GENERATION_PROVIDER_TO_CREATOR: Partial<Record<GenerationProvider, ModelCreator>> = {
  [GenerationProvider.Artcraft]: ModelCreator.ArtCraft,
  [GenerationProvider.Fal]: ModelCreator.Fal,
  [GenerationProvider.Higgsfield]: ModelCreator.Higgsfield,
  [GenerationProvider.Krea]: ModelCreator.Krea,
  [GenerationProvider.Openart]: ModelCreator.OpenArt,
  [GenerationProvider.Runway]: ModelCreator.Runway,
};

export const getProviderIcon = (
  provider: GenerationProvider,
  className = "h-4 w-4 icon-auto-contrast"
): ReactNode => {
  const creator = GENERATION_PROVIDER_TO_CREATOR[provider];
  if (creator) return getCreatorIcon(creator, className);
  return (
    <img
      src={GENERIC_ICON_PATH}
      alt="generic logo"
      className={className}
    />
  );
};

export const getProviderDisplayName = (provider: GenerationProvider): string => {
  switch (provider) {
    case GenerationProvider.Artcraft:
      return "H0x Video Studio";
    case GenerationProvider.BytePlus:
      return "BytePlus";
    case GenerationProvider.Fal:
      return "FAL";
    case GenerationProvider.Higgsfield:
      return "Higgsfield";
    case GenerationProvider.Krea:
      return "Krea";
    case GenerationProvider.Leonardo:
      return "Leonardo";
    case GenerationProvider.Magnific:
      return "Magnific";
    case GenerationProvider.Openart:
      return "OpenArt";
    case GenerationProvider.Picsart:
      return "Picsart";
    case GenerationProvider.Pixverse:
      return "PixVerse";
    case GenerationProvider.Runway:
      return "Runway";
    default:
      return "Unknown Provider";
  }
};
