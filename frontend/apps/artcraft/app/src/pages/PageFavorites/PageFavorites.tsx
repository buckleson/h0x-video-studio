import { useEffect, useState } from "react";
import { useSignals } from "@preact/signals-react/runtime";
import { open } from "@tauri-apps/plugin-dialog";
import { PlusIcon } from "@phosphor-icons/react";
import {
  importFavoriteFiles,
  listFavorites,
  type LocalMediaFile,
} from "@storyteller/tauri-api";
import {
  favoritePaths,
  favoritesStore,
  LocalMediaTile,
} from "@storyteller/ui-gallery-modal";

const MEDIA_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm", "mkv"];

const addVideos = async () => {
  const picked = await open({
    multiple: true,
    filters: [{ name: "Images and videos", extensions: MEDIA_EXTENSIONS }],
  });
  if (!picked || picked.length === 0) return;
  await importFavoriteFiles(picked);
  await favoritesStore.refresh();
};

export const PageFavorites = () => {
  useSignals();
  const paths = favoritePaths.value;
  const [files, setFiles] = useState<LocalMediaFile[]>([]);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    favoritesStore.load();
  }, []);

  // Re-list whenever the store's favorite set changes (heart toggles, imports).
  useEffect(() => {
    let cancelled = false;
    listFavorites()
      .then((entries) => {
        if (cancelled) return;
        setFiles(
          entries
            .filter((entry) => !entry.missing)
            .sort((a, b) => b.added_at.localeCompare(a.added_at))
            .map((entry) => ({
              path: entry.path,
              kind: entry.kind,
              size_bytes: 0,
              created_at: entry.added_at,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [paths]);

  return (
    <div
      ref={setScrollRoot}
      className="fixed inset-0 overflow-y-auto bg-ui-background pt-[56px] text-base-fg"
    >
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl tracking-tight">Favorites</h1>
          <button
            type="button"
            onClick={addVideos}
            className="flex items-center gap-2 rounded-lg border border-ui-border bg-ui-panel px-3 py-2 text-sm hover:border-primary/30"
          >
            <PlusIcon weight="bold" />
            Add videos
          </button>
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-base-fg/70">No favorites yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {files.map((file) => (
              <LocalMediaTile key={file.path} file={file} scrollRoot={scrollRoot} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PageFavorites;
