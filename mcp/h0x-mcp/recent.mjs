// Recent My Library media, scanned like the app's list_local_media: everything under the downloads dir, recursively.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

// Same extensions as list_local_media; anything else is skipped.
const KINDS = { ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".mp4": "video", ".webm": "video", ".mov": "video" };

/// The newest `limit` images and videos as { path, kind, created } (mtime, ISO 8601). A missing dir is an empty list.
export async function listRecent(libraryDir, limit = 8) {
  const files = await scan(libraryDir);
  files.sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, limit).map((f) => ({ path: f.path, kind: f.kind, created: new Date(f.mtime).toISOString() }));
}

async function scan(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(entries.map(async (e) => {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) return scan(file);
    const kind = KINDS[path.extname(e.name).toLowerCase()];
    if (!kind || !e.isFile()) return [];
    return [{ path: file, kind, mtime: (await stat(file)).mtimeMs }];
  }));
  return found.flat();
}
