import { invoke } from "@tauri-apps/api/core";

// Returns the path of a cached, downscaled copy of a local media file.
export const LocalMediaThumbnail = async (path: string): Promise<string> => {
  const { thumb_path } = await invoke<{ thumb_path: string }>(
    "local_media_thumbnail_command",
    { path },
  );
  return thumb_path;
};
