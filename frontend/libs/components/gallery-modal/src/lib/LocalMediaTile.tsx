import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LocalMediaThumbnail, type LocalMediaFile } from "@storyteller/tauri-api";
import { useGalleryViewStore } from "@storyteller/ui-generation-list";

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

export interface LocalMediaTileProps {
  file: LocalMediaFile;
  /** The scroll container used as IntersectionObserver root. */
  scrollRoot: HTMLDivElement | null;
}

// Requests the media only once the tile comes within 400px of the viewport.
// Images then keep their cached thumbnail; videos release their source again
// when they leave.
export const LocalMediaTile = ({ file, scrollRoot }: LocalMediaTileProps) => {
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

  return isVideo ? (
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
  );
};
