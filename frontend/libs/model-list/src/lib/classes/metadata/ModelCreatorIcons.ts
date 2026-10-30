import React, { ReactNode } from "react";
import { ModelCreator } from "./ModelCreator.js";

const toDataUri = (svg: string): string =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

// Font Awesome Free 7.0.0 "sitemap" glyph (CC BY 4.0), used when no initials apply.
export const GENERIC_ICON_PATH = toDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M64 144C64 117.5 85.5 96 112 96L208 96C234.5 96 256 117.5 256 144L256 160L384 160L384 144C384 117.5 405.5 96 432 96L528 96C554.5 96 576 117.5 576 144L576 240C576 266.5 554.5 288 528 288L432 288C405.5 288 384 266.5 384 240L384 224L256 224L256 240C256 247.3 254.3 254.3 251.4 260.5L320 352L400 352C426.5 352 448 373.5 448 400L448 496C448 522.5 426.5 544 400 544L304 544C277.5 544 256 522.5 256 496L256 400C256 392.7 257.7 385.7 260.6 379.5L192 288L112 288C85.5 288 64 266.5 64 240L64 144z"/></svg>',
);

// Neutral monogram badge: up to two capitals of `name` ("BlackForestLabs" -> "BF").
export const getInitialsIconPath = (name: string): string => {
  const initials = (name.match(/[A-Z0-9]/g) ?? [name.charAt(0).toUpperCase()])
    .slice(0, 2)
    .join("");
  if (!initials) return GENERIC_ICON_PATH;
  return toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="black" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" font-family="sans-serif" font-size="${initials.length > 1 ? 9 : 11}" font-weight="700" fill="black">${initials}</text></svg>`,
  );
};

export const getCreatorIconPath = (creator: ModelCreator): string =>
  getInitialsIconPath(creator);

export const getCreatorIcon = (
  creator: ModelCreator,
  className = "h-4 w-4 icon-auto-contrast"
): ReactNode | null => {
  const path = getCreatorIconPath(creator);
  return React.createElement("img", {
    src: path,
    alt: `${creator} logo`,
    className,
  });
};

// Row icon for model picker lists.
export const getCreatorListIcon = (creator: ModelCreator): ReactNode =>
  getCreatorIcon(creator);
