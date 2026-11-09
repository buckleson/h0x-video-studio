import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSignals } from "@preact/signals-react/runtime";
import { ArrowRightIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { ListLocalMedia, type LocalMediaFile } from "@storyteller/tauri-api";
import {
  favoritesStore,
  galleryModalLightboxImage,
  galleryModalLightboxMediaId,
  galleryModalLightboxNavNext,
  galleryModalLightboxNavPrev,
  galleryModalLightboxVisible,
  galleryModalVisibleDuringDrag,
  galleryModalVisibleViewMode,
  libraryRefreshTick,
  LocalMediaTile,
} from "@storyteller/ui-gallery-modal";

const MAX_ITEMS = 8;

const openPreview = (file: LocalMediaFile) => {
  const url = convertFileSrc(file.path);
  galleryModalLightboxNavPrev.value = null;
  galleryModalLightboxNavNext.value = null;
  galleryModalLightboxMediaId.value = file.path;
  galleryModalLightboxImage.value = {
    id: file.path,
    label: file.path.split(/[\\/]/).pop() ?? "",
    thumbnail: url,
    fullImage: url,
    createdAt: file.created_at,
    mediaClass: file.kind,
  };
  galleryModalLightboxVisible.value = true;
};

const openLibrary = () => {
  galleryModalVisibleViewMode.value = true;
  galleryModalVisibleDuringDrag.value = true;
};

export const RecentGenerations = () => {
  useSignals();
  const tick = libraryRefreshTick.value;
  const [files, setFiles] = useState<LocalMediaFile[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    favoritesStore.load();
    const unlisten = listen("generation-complete-event", () =>
      setReload((n) => n + 1),
    );
    return () => {
      unlisten.then((fn) => fn()).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    ListLocalMedia()
      .then((all) => {
        if (cancelled) return;
        setFiles(
          all
            .filter((f) => f.kind === "image" || f.kind === "video")
            .slice(0, MAX_ITEMS),
        );
      })
      .catch(() => !cancelled && setFiles([]));
    return () => {
      cancelled = true;
    };
  }, [tick, reload]);

  return (
    <section className="col-span-full rounded-tile border border-ui-border bg-ui-panel p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="hud-label flex items-center gap-2 text-base-fg/70">
          <ClockCounterClockwiseIcon weight="duotone" className="text-primary" />
          Recent generations
        </h2>
        <button
          type="button"
          onClick={openLibrary}
          className="flex items-center gap-1 text-sm text-base-fg/70 transition-colors hover:text-primary"
        >
          View all
          <ArrowRightIcon weight="bold" className="h-4 w-4" />
        </button>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-base-fg/70">
          Nothing here yet. Generate an image or video to see it here.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {files.map((file) => (
            <div key={file.path} className="overflow-hidden rounded-xl">
              <LocalMediaTile file={file} scrollRoot={null} onOpen={openPreview} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
