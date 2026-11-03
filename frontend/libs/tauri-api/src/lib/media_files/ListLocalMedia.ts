import { invoke } from "@tauri-apps/api/core";

export type LocalMediaKind = "video" | "image";

export interface LocalMediaFile {
  path: string;
  kind: LocalMediaKind;
  size_bytes: number;
  created_at: string;
}

export const ListLocalMedia = async (): Promise<LocalMediaFile[]> => {
  return await invoke<LocalMediaFile[]>("list_local_media_command");
};
