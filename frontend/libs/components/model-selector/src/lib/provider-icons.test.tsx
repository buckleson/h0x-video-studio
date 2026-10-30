// A3d: provider icons are neutral inline badges or the generic glyph; no <img>
// points at the deleted images/services folder, and providers removed from
// the enum (stale persisted values) fall back to the generic icon.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GenerationProvider } from "@storyteller/api-enums";
import { GENERIC_ICON_PATH } from "@storyteller/model-list";
import { getProviderDisplayName, getProviderIcon } from "./provider-icons";

// --- constants ---

const ALL_PROVIDERS = Object.values(GenerationProvider);
const REMOVED_PROVIDERS = ["sora", "midjourney", "grok", "world_labs", "worldlabs"];
const FORBIDDEN_SRC = /images[\\/]services|images%2Fservices|\.svg$|\.png$/i;

// --- helpers ---

const renderIcon = (provider: string, className?: string) => {
  const { container } = render(
    <>{getProviderIcon(provider as GenerationProvider, className)}</>,
  );
  const img = container.querySelector("img");
  expect(img).not.toBeNull();
  return img!;
};

afterEach(cleanup);

describe("getProviderIcon", () => {
  it.each(ALL_PROVIDERS)("%s renders an inline data: icon", (provider) => {
    const img = renderIcon(provider);
    const src = img.getAttribute("src")!;
    expect(src.startsWith("data:image/svg+xml,")).toBe(true);
    expect(src).not.toMatch(FORBIDDEN_SRC);
  });

  it.each(REMOVED_PROVIDERS)("removed provider %j falls back to the generic icon", (provider) => {
    const img = renderIcon(provider);
    expect(img.getAttribute("src")).toBe(GENERIC_ICON_PATH);
    expect(img.getAttribute("alt")).toBe("generic logo");
  });

  it.each(["", "C:\\x\\images\\services\\fal.svg"])("odd value %j falls back to the generic icon", (value) => {
    expect(renderIcon(value).getAttribute("src")).toBe(GENERIC_ICON_PATH);
  });

  it("mapped providers get a distinct badge, not the generic glyph", () => {
    for (const p of [GenerationProvider.Fal, GenerationProvider.Krea, GenerationProvider.Runway]) {
      expect(renderIcon(p).getAttribute("src")).not.toBe(GENERIC_ICON_PATH);
    }
  });

  it("passes className through on both the mapped and the fallback path", () => {
    expect(renderIcon(GenerationProvider.Fal, "size-6").className).toBe("size-6");
    expect(renderIcon("sora", "size-6").className).toBe("size-6");
  });

  it("no rendered alt or src mentions LTX or Lightricks", () => {
    for (const p of [...ALL_PROVIDERS, ...REMOVED_PROVIDERS]) {
      const img = renderIcon(p);
      const visible = `${img.getAttribute("alt")} ${decodeURIComponent(img.getAttribute("src")!)}`;
      expect(visible).not.toMatch(/LTX|Lightricks/i);
      cleanup();
    }
  });
});

describe("getProviderDisplayName", () => {
  it.each(ALL_PROVIDERS)("%s has a real display name", (provider) => {
    expect(getProviderDisplayName(provider)).not.toBe("Unknown Provider");
  });

  it.each(REMOVED_PROVIDERS)("removed provider %j shows as Unknown Provider", (provider) => {
    expect(getProviderDisplayName(provider as GenerationProvider)).toBe("Unknown Provider");
  });
});
