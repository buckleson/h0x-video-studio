import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useSignals } from "@preact/signals-react/runtime";
import { HeartIcon, PlayIcon } from "@phosphor-icons/react";
import { LocalMediaThumbnail, type LocalMediaFile } from "@storyteller/tauri-api";
import { useGalleryViewStore } from "@storyteller/ui-generation-list";
import { favoritePaths, favoritesStore } from "./favoritesStore";

const TILE_CLASS = "aspect-square w-full bg-black/30 object-cover";
const MAX_PLAYING_PREVIEWS = 4;

// Visible video tiles that want to preview, in the order they came into view.
// Only the first MAX_PLAYING_PREVIEWS play; many decoders at once freeze the WebView.
const previewQueue: HTMLVideoElement[] = [];

const formatDuration = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

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
  const [duration, setDuration] = useState<number>();
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
          muted
          preload={isVisible ? "metadata" : "none"}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setDuration(d);
          }}
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
      {isVideo && (
        <>
          <span
            data-testid="play-badge"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
          >
            <PlayIcon size="1.2em" weight="fill" />
          </span>
          {duration !== undefined && (
            <span
              data-testid="duration-chip"
              className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white"
            >
              {formatDuration(duration)}
            </span>
          )}
        </>
      )}
      <FavoriteHeartButton path={file.path} />
    </div>
  );
};
