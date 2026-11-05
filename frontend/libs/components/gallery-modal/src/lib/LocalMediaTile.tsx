import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { LocalMediaFile } from "@storyteller/tauri-api";

const TILE_CLASS = "aspect-square w-full bg-black/30 object-cover";

export interface LocalMediaTileProps {
  file: LocalMediaFile;
  /** The scroll container used as IntersectionObserver root. */
  scrollRoot: HTMLDivElement | null;
}

// Requests the media only once the tile comes within 400px of the viewport,
// then keeps it loaded.
export const LocalMediaTile = ({ file, scrollRoot }: LocalMediaTileProps) => {
  const ref = useRef<HTMLImageElement & HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(
    typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;
    if (isVisible || !el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { root: scrollRoot, rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, scrollRoot]);

  const src = isVisible ? convertFileSrc(file.path) : undefined;

  return file.kind === "video" ? (
    <video
      ref={ref}
      src={src}
      className={TILE_CLASS}
      controls
      muted
      preload={isVisible ? "metadata" : "none"}
    />
  ) : (
    <img
      ref={ref}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={TILE_CLASS}
    />
  );
};
