import { signal } from "@preact/signals-react";
import {
  addFavorite,
  commandErrorMessage,
  listFavorites,
  removeFavorite,
} from "@storyteller/tauri-api";
import { toast } from "@storyteller/ui-toaster";

export const favoritePaths = signal<ReadonlySet<string>>(new Set());

let loaded: Promise<void> | null = null;

const setFavorite = (path: string, favorite: boolean) => {
  const next = new Set(favoritePaths.value);
  if (favorite) {
    next.add(path);
  } else {
    next.delete(path);
  }
  favoritePaths.value = next;
};

const refresh = async (): Promise<void> => {
  try {
    const entries = await listFavorites();
    favoritePaths.value = new Set(entries.map((entry) => entry.path));
  } catch (error) {
    loaded = null;
    toast.error(commandErrorMessage(error, "Failed to load favorites."));
  }
};

const isFavorite = (path: string): boolean => favoritePaths.value.has(path);

export const favoritesStore = {
  // Loads once per session; later calls reuse the first load.
  load: (): Promise<void> => {
    loaded ??= refresh();
    return loaded;
  },
  refresh,
  isFavorite,
  toggle: async (path: string): Promise<void> => {
    const favorite = !isFavorite(path);
    setFavorite(path, favorite);
    try {
      await (favorite ? addFavorite(path) : removeFavorite(path));
    } catch (error) {
      setFavorite(path, !favorite);
      toast.error(commandErrorMessage(error, "Failed to update favorites."));
    }
  },
};
