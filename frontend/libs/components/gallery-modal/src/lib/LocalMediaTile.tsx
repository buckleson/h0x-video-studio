import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useSignals } from "@preact/signals-react/runtime";
import { HeartIcon } from "@phosphor-icons/react";
import { LocalMediaThumbnail, type LocalMediaFile } from "@storyteller/tauri-api";
import { useGalleryViewStore } from "@storyteller/ui-generation-list";
import { favoritePaths, favoritesStore } from "./favoritesStore";

const TILE_CLASS = "aspect-square w-full bg-black/30 object-cover";
const MAX_PLAYING_PREVIEWS = 4;

// Visible video tiles that want to preview, in the order they came into view.
// Only the first MAX_PLAYING_PREVIEWS play; many decoders at once freeze the WebView.
const previewQueue: HTMLVideoElement[] = [];

const play = (video: HTMLVideoElement) => video.play()?.catch(() => undefined);

const syncPreviews = () =>
  previewQueue.forEach((video, i) => {
    if (i < MAX_PLAYING_PREVIEWS) play(video);
    else video.pause();
  });

export const FavoriteHeartButton = ({ path }: { path: string }) => {
  useSignals();
  const favorite = favoritePaths.value.has(path);
  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.stopPropagation();
        favoritesStore.toggle(path);
      }}
      className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/50 p-1.5 text-orange-500 transition-colors hover:bg-black/70"
    >
      <HeartIcon size="1.2em" weight={favorite ? "fill" : "regular"} />
    </button>
  );
};

export interface LocalMediaTileProps {
  file: LocalMediaFile;
  /** The scroll container used as IntersectionObserver root. */
  scrollRoot: HTMLDivElement | null;
  onOpen?: (file: LocalMediaFile) => void;
}

// Requests the media only once the tile comes within 400px of the viewport.
// Images then keep their cached thumbnail; videos release their source again
// when they leave.
export const LocalMediaTile = ({ file, scrollRoot, onOpen }: LocalMediaTileProps) => {
  const isVideo = file.kind === "video";
  const ref = useRef<HTMLImageElement & HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(
    typeof IntersectionObserver === "undefined",
  );
  const [imageSrc, setImageSrc] = useState<string>();
  const autoplayVideos = useGalleryViewStore((s) => s.autoplayVideos);
  const imageLoaded = isVisible && !isVideo;

  useEffect(() => {
    const el = ref.current;
    if (imageLoaded || !el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (isVideo) setIsVisible(entry.isIntersecting);
        else if (entry.isIntersecting) setIsVisible(true);
      },
      { root: scrollRoot, rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [imageLoaded, isVideo, scrollRoot]);

  useEffect(() => {
    if (!imageLoaded) return;
    let cancelled = false;
    LocalMediaThumbnail(file.path)
      .catch(() => file.path)
      .then((path) => {
        if (!cancelled) setImageSrc(convertFileSrc(path));
      });
    return () => {
      cancelled = true;
    };
  }, [imageLoaded, file.path]);

  useEffect(() => {
    const video = ref.current;
    if (!isVideo || !isVisible || !video) return;
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [isVideo, isVisible]);

  useEffect(() => {
    const video = ref.current;
    if (!isVideo || !isVisible || !autoplayVideos || !video) return;
    previewQueue.push(video);
    syncPreviews();
    return () => {
      previewQueue.splice(previewQueue.indexOf(video), 1);
      video.pause();
      syncPreviews();
    };
  }, [isVideo, isVisible, autoplayVideos]);

  return (
    <div className="relative cursor-pointer" onClick={() => onOpen?.(file)}>
      {isVideo ? (
        <video
          ref={ref}
          src={isVisible ? convertFileSrc(file.path) : undefined}
          className={TILE_CLASS}
          controls
          muted
          preload={isVisible ? "metadata" : "none"}
          onMouseEnter={autoplayVideos ? undefined : (e) => play(e.currentTarget)}
          onMouseLeave={autoplayVideos ? undefined : (e) => e.currentTarget.pause()}
        />
      ) : (
        <img
          ref={ref}
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className={TILE_CLASS}
        />
      )}
      <FavoriteHeartButton path={file.path} />
    </div>
  );
};
