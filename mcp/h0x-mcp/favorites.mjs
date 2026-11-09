// Favorites shared with the H0x app (FAV-1): `~/Artcraft/settings/favorites.json`,
// a JSON array of { path, added_at } where added_at is RFC 3339 UTC.
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Same extensions as the app's store; anything else is not listed by the app.
const KINDS = { ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".mp4": "video", ".webm": "video", ".mov": "video" };
const WINDOWS = process.platform === "win32";

export function favoritesFile(libraryDir) {
  return path.join(path.dirname(libraryDir), "settings", "favorites.json");
}

export async function listFavorites(file) {
  const favorites = await load(file);
  return Promise.all(
    favorites
      .filter((f) => kindOf(f.path))
      .map(async (f) => ({ path: f.path, kind: kindOf(f.path), missing: !(await isFile(f.path)) })),
  );
}

/// Adds an existing image or video. A file outside libraryDir is copied into libraryDir/favorites first.
/// Returns { path, added, copied }; a path that is already a favorite is a no-op (added: false).
export async function addFavorite(file, libraryDir, source) {
  let target = normalize(String(source ?? "").trim());
  if (!path.isAbsolute(target)) throw new Error(`Path must be absolute: ${source}`);
  if (!kindOf(target)) throw new Error(`Only images and videos can be favorited: ${target}`);
  if (!(await isFile(target))) throw new Error(`File not found: ${target}`);

  const favorites = await load(file);
  const known = new Set(favorites.map((f) => key(f.path)));
  if (known.has(key(target))) return { path: target, added: false, copied: false };

  const copied = !inside(libraryDir, target);
  if (copied) {
    target = await copyIntoFavorites(target, path.join(libraryDir, "favorites"));
    if (known.has(key(target))) return { path: target, added: false, copied };
  }
  favorites.push({ path: target, added_at: new Date().toISOString() });
  await write(file, favorites);
  return { path: target, added: true, copied };
}

/// A missing file is an empty list. A corrupt file is kept as favorites.json.bak (like the app).
async function load(file) {
  let json;
  try {
    json = await readFile(file, "utf8");
  } catch {
    return [];
  }
  try {
    const favorites = JSON.parse(json);
    const valid = (f) => typeof f?.path === "string" && typeof f.added_at === "string" && !Number.isNaN(Date.parse(f.added_at));
    if (Array.isArray(favorites) && favorites.every(valid)) return favorites;
  } catch {}
  await rename(file, `${file}.bak`);
  return [];
}

async function write(file, favorites) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(favorites, null, 2));
  await rename(temp, file);
}

/// Copies without overwriting: a name clash gets a -1, -2 suffix (FAV-2's rule).
async function copyIntoFavorites(source, dir) {
  await mkdir(dir, { recursive: true });
  const { name, ext } = path.parse(source);
  for (let n = 0; ; n++) {
    const dest = path.join(dir, n ? `${name}-${n}${ext}` : `${name}${ext}`);
    try {
      await copyFile(source, dest, constants.COPYFILE_EXCL);
      return dest;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
}

function inside(dir, file) {
  const rel = path.relative(key(dir), key(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function kindOf(file) {
  return KINDS[path.extname(file).toLowerCase()];
}

async function isFile(file) {
  return (await stat(file).catch(() => null))?.isFile() ?? false;
}

function normalize(file) {
  return WINDOWS ? file.replaceAll("/", "\\") : file;
}

/// One key per file: Windows paths are case-insensitive and accept either separator.
function key(file) {
  return WINDOWS ? normalize(file).toLowerCase() : file;
}
