import { invoke } from "@tauri-apps/api/core";
import type { LocalMediaKind } from "../media_files/ListLocalMedia";

export interface FavoriteEntry {
  path: string;
  added_at: string;
  kind: LocalMediaKind;
  missing: boolean;
}

export interface ImportFavoriteResult {
  source: string;
  dest: string | null;
  error: string | null;
}

export const listFavorites = async (): Promise<FavoriteEntry[]> => {
  return await invoke<FavoriteEntry[]>("list_favorites");
};

export const addFavorite = async (path: string): Promise<void> => {
  await invoke("add_favorite", { path });
};

export const removeFavorite = async (path: string): Promise<void> => {
  await invoke("remove_favorite", { path });
};

export const importFavoriteFiles = async (paths: string[]): Promise<ImportFavoriteResult[]> => {
  return await invoke<ImportFavoriteResult[]>("import_favorite_files", { paths });
};
