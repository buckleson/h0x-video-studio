// @vitest-environment jsdom
// A3d: third-party provider logos are replaced by neutral inline badges
// (provider initials) or the Font Awesome "sitemap" glyph. Every icon is an
// inline data: URI; nothing points at the deleted images/services folder.
import { describe, expect, it } from "vitest";
import { isValidElement, ReactElement } from "react";
import { ModelCreator } from "./ModelCreator.js";
import {
  GENERIC_ICON_PATH,
  getCreatorIcon,
  getCreatorIconPath,
  getCreatorListIcon,
  getInitialsIconPath,
} from "./ModelCreatorIcons.js";
import { getCreatorIconPathForModelId } from "./ModelCreatorIconForId.js";
import { ALL_MODELS_LIST } from "../../lists/AllModels.js";

// --- constants ---

const DATA_URI_PREFIX = "data:image/svg+xml,";
const ALL_CREATORS = Object.values(ModelCreator);
const FORBIDDEN = /images[\\/]services|images%2Fservices|\.svg$|\.png$/i;
const BRAND_LEAK = /LTX|Lightricks/i;

// --- helpers ---

const decode = (uri: string): string =>
  decodeURIComponent(uri.slice(DATA_URI_PREFIX.length));

const badgeText = (uri: string): string | null => {
  const doc = new DOMParser().parseFromString(decode(uri), "image/svg+xml");
  return doc.querySelector("text")?.textContent ?? null;
};

const isWellFormedSvg = (uri: string): boolean => {
  const doc = new DOMParser().parseFromString(decode(uri), "image/svg+xml");
  return (
    doc.getElementsByTagName("parsererror").length === 0 &&
    doc.documentElement.nodeName === "svg"
  );
};

const expectNeutralIcon = (uri: string) => {
  expect(uri.startsWith(DATA_URI_PREFIX)).toBe(true);
  expect(uri).not.toMatch(FORBIDDEN);
  expect(decode(uri)).not.toMatch(BRAND_LEAK);
  expect(isWellFormedSvg(uri)).toBe(true);
};

// --- GENERIC_ICON_PATH ---

describe("GENERIC_ICON_PATH", () => {
  it("is an inline, well-formed SVG with a path and no text", () => {
    expectNeutralIcon(GENERIC_ICON_PATH);
    expect(decode(GENERIC_ICON_PATH)).toContain("<path");
    expect(badgeText(GENERIC_ICON_PATH)).toBeNull();
  });

  it("does not embed any external reference", () => {
    expect(decode(GENERIC_ICON_PATH)).not.toMatch(/href=|url\(|https?:\/\/(?!www\.w3\.org)/);
  });
});

// --- getInitialsIconPath ---

describe("getInitialsIconPath", () => {
  it.each([
    ["BlackForestLabs", "BF"],
    ["OpenAi", "OA"],
    ["TensorArt", "TA"],
    ["Fal", "F"],
    ["Tripo", "T"],
  ])("%s renders the badge %s", (name, initials) => {
    const uri = getInitialsIconPath(name);
    expectNeutralIcon(uri);
    expect(badgeText(uri)).toBe(initials);
  });

  it("uses at most two characters for long CamelCase names", () => {
    expect(badgeText(getInitialsIconPath("AlphaBetaGammaDelta"))).toBe("AB");
  });

  it("upper-cases the first letter of an all-lowercase name", () => {
    expect(badgeText(getInitialsIconPath("krea"))).toBe("K");
  });

  it("counts digits as initials", () => {
    expect(badgeText(getInitialsIconPath("Hyper3D"))).toBe("H3");
  });

  it("falls back to the generic icon for an empty name", () => {
    expect(getInitialsIconPath("")).toBe(GENERIC_ICON_PATH);
  });

  it("is deterministic", () => {
    expect(getInitialsIconPath("Kling")).toBe(getInitialsIconPath("Kling"));
  });
});

// --- creator icons ---

describe("getCreatorIconPath", () => {
  it.each(ALL_CREATORS)("%s is a neutral inline badge", (creator) => {
    const uri = getCreatorIconPath(creator);
    expectNeutralIcon(uri);
    const text = badgeText(uri);
    expect(text).toMatch(/^[A-Z0-9]{1,2}$/);
    expect(text![0]).toBe(creator[0].toUpperCase());
  });
});

describe("getCreatorIcon / getCreatorListIcon", () => {
  it.each(ALL_CREATORS)("%s renders an img element with a data: src", (creator) => {
    const el = getCreatorIcon(creator) as ReactElement<{ src: string; alt: string; className: string }>;
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe("img");
    expectNeutralIcon(el.props.src);
    expect(el.props.alt).not.toMatch(BRAND_LEAK);
  });

  it("passes a custom className through", () => {
    const el = getCreatorIcon(ModelCreator.Fal, "size-8") as ReactElement<{ className: string }>;
    expect(el.props.className).toBe("size-8");
  });

  it("uses the auto-contrast class by default", () => {
    const el = getCreatorListIcon(ModelCreator.Google) as ReactElement<{ className: string }>;
    expect(el.props.className).toContain("icon-auto-contrast");
  });
});

// --- getCreatorIconPathForModelId ---

describe("getCreatorIconPathForModelId", () => {
  it("every listed model (by id and tauri id) resolves to its creator badge", () => {
    for (const model of ALL_MODELS_LIST) {
      const expected = getCreatorIconPath(model.creator);
      expect(getCreatorIconPathForModelId(model.id)).toBe(expected);
      if (model.tauriId) {
        expect(getCreatorIconPathForModelId(model.tauriId)).toBe(expected);
      }
    }
  });

  it.each([
    ["tripo_v2", "T"],
    ["meshy_6", "M"],
    ["rodin_gen2", "H3"],
  ])("3D brand id %s renders initials %s", (id, initials) => {
    const uri = getCreatorIconPathForModelId(id);
    expectNeutralIcon(uri);
    expect(badgeText(uri)).toBe(initials);
  });

  it.each([
    ["marble_unlisted", ModelCreator.WorldLabs],
    ["hunyuan_3d_unlisted", ModelCreator.Tencent],
    ["switch_x_unlisted", ModelCreator.ArtCraft],
  ])("legacy prefix %s maps to the %s badge", (id, creator) => {
    expect(getCreatorIconPathForModelId(id)).toBe(getCreatorIconPath(creator));
  });

  it.each(["", "unknown_model", "   ", "C:\\models\\flux.svg", "../images/services/x"])(
    "unknown id %j falls back to the generic icon",
    (id) => {
      expect(getCreatorIconPathForModelId(id)).toBe(GENERIC_ICON_PATH);
    },
  );

  it("never returns a file path for any input", () => {
    for (const id of ["flux_x", "sora_x", "grok_x", "midjourney_x", "zzz"]) {
      expectNeutralIcon(getCreatorIconPathForModelId(id));
    }
  });
});
