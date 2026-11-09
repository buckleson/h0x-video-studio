use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::anyhow;
use chrono::{DateTime, Utc};
use log::warn;
use serde_derive::{Deserialize, Serialize};

use crate::core::commands::media_files::list_local_media_command::LocalMediaKind;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;

/// Absolute path: `~/Artcraft/settings/favorites.json` (`<AppDataRoot>/settings/favorites.json`).
/// The MCP server (FAV-8) reads and writes this same file.
const FILENAME: &str = "favorites.json";

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Favorite {
  pub path: String,
  pub added_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct FavoriteListEntry {
  pub path: String,
  pub added_at: DateTime<Utc>,
  pub kind: LocalMediaKind,
  pub missing: bool,
}

pub fn list(root: &AppDataRoot) -> Vec<FavoriteListEntry> {
  let _guard = LOCK.lock().unwrap_or_else(|err| err.into_inner());
  load(root)
    .into_iter()
    .filter_map(|favorite| {
      let path = Path::new(&favorite.path);
      Some(FavoriteListEntry { kind: media_kind(path)?, missing: !path.is_file(), path: favorite.path, added_at: favorite.added_at })
    })
    .collect()
}

/// Adding a path that is already a favorite is a no-op.
pub fn add(root: &AppDataRoot, path: &str) -> anyhow::Result<()> {
  let path = normalize_separators(path.trim());
  if !Path::new(&path).is_absolute() {
    return Err(anyhow!("Path must be absolute"));
  }
  if media_kind(Path::new(&path)).is_none() {
    return Err(anyhow!("Only images and videos can be favorited"));
  }
  let _guard = LOCK.lock().unwrap_or_else(|err| err.into_inner());
  let mut favorites = load(root);
  let key = path_key(&path);
  if favorites.iter().any(|favorite| path_key(&favorite.path) == key) {
    return Ok(());
  }
  favorites.push(Favorite { path, added_at: Utc::now() });
  write(root, &favorites)
}

/// Only edits the list; the media file itself is never touched. Unknown paths are a no-op.
pub fn remove(root: &AppDataRoot, path: &str) -> anyhow::Result<()> {
  let _guard = LOCK.lock().unwrap_or_else(|err| err.into_inner());
  let mut favorites = load(root);
  let key = path_key(path.trim());
  let before = favorites.len();
  favorites.retain(|favorite| path_key(&favorite.path) != key);
  if favorites.len() == before {
    return Ok(());
  }
  write(root, &favorites)
}

/// A missing file is an empty list. A corrupt file is kept as `favorites.json.bak` and the list starts empty.
fn load(root: &AppDataRoot) -> Vec<Favorite> {
  let path = file_path(root);
  let Ok(json) = std::fs::read_to_string(&path) else {
    return Vec::new();
  };
  match serde_json::from_str(&json) {
    Ok(favorites) => favorites,
    Err(err) => {
      warn!("Corrupt {:?}, moving it to .bak: {:?}", path, err);
      if let Err(err) = std::fs::rename(&path, path.with_extension("json.bak")) {
        warn!("Can't back up {:?}: {:?}", path, err);
      }
      Vec::new()
    },
  }
}

fn write(root: &AppDataRoot, favorites: &[Favorite]) -> anyhow::Result<()> {
  let path = file_path(root);
  let temp = path.with_extension("json.tmp");
  std::fs::write(&temp, serde_json::to_string_pretty(favorites)?)?;
  std::fs::rename(&temp, &path)?;
  Ok(())
}

fn file_path(root: &AppDataRoot) -> PathBuf {
  root.settings_dir().path().join(FILENAME)
}

fn normalize_separators(path: &str) -> String {
  if cfg!(windows) {
    path.replace('/', "\\")
  } else {
    path.to_string()
  }
}

/// One key per file: Windows paths are case-insensitive and accept either separator.
fn path_key(path: &str) -> String {
  if cfg!(windows) {
    normalize_separators(path).to_lowercase()
  } else {
    path.to_string()
  }
}

fn media_kind(path: &Path) -> Option<LocalMediaKind> {
  let extension = path.extension()?.to_str()?.to_ascii_lowercase();
  match extension.as_str() {
    "mp4" | "webm" | "mov" => Some(LocalMediaKind::Video),
    "png" | "jpg" | "jpeg" | "webp" => Some(LocalMediaKind::Image),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::TempDir;

  fn setup() -> (TempDir, AppDataRoot) {
    let dir = TempDir::new().unwrap();
    let root = AppDataRoot::create_existing(dir.path()).unwrap();
    (dir, root)
  }

  fn media(dir: &TempDir, name: &str) -> String {
    let path = dir.path().join(name);
    std::fs::write(&path, b"media").unwrap();
    path.to_string_lossy().to_string()
  }

  fn json_path(dir: &TempDir) -> PathBuf {
    dir.path().join("settings").join(FILENAME)
  }

  #[test]
  fn missing_file_gives_empty_list() {
    let (_dir, root) = setup();
    assert!(list(&root).is_empty());
  }

  #[test]
  fn add_lists_kind_and_persists_across_restart() {
    let (dir, root) = setup();
    let image = media(&dir, "a.png");
    let video = media(&dir, "b.MP4");
    add(&root, &image).unwrap();
    add(&root, &video).unwrap();

    let reloaded = AppDataRoot::create_existing(dir.path()).unwrap();
    let entries = list(&reloaded);
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].path, image);
    assert_eq!(entries[0].kind, LocalMediaKind::Image);
    assert!(!entries[0].missing);
    assert_eq!(entries[1].kind, LocalMediaKind::Video);
  }

  #[test]
  fn file_format_is_array_of_path_and_rfc3339_added_at() {
    let (dir, root) = setup();
    let image = media(&dir, "a.png");
    add(&root, &image).unwrap();

    let value: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(json_path(&dir)).unwrap()).unwrap();
    let entry = &value.as_array().unwrap()[0];
    assert_eq!(entry["path"], image.as_str());
    let added_at = entry["added_at"].as_str().unwrap();
    assert!(DateTime::parse_from_rfc3339(added_at).is_ok());
    assert!(added_at.ends_with('Z'));
  }

  #[test]
  fn adding_twice_keeps_one_entry() {
    let (dir, root) = setup();
    let image = media(&dir, "a.png");
    add(&root, &image).unwrap();
    let added_at = list(&root)[0].added_at;
    add(&root, &image).unwrap();
    let entries = list(&root);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].added_at, added_at);
  }

  #[cfg(windows)]
  #[test]
  fn case_and_separator_variants_are_one_entry_on_windows() {
    let (dir, root) = setup();
    let image = media(&dir, "a.png");
    add(&root, &image).unwrap();
    add(&root, &image.to_uppercase()).unwrap();
    add(&root, &image.replace('\\', "/")).unwrap();
    assert_eq!(list(&root).len(), 1);

    remove(&root, &image.to_lowercase().replace('\\', "/")).unwrap();
    assert!(list(&root).is_empty());
  }

  #[test]
  fn remove_unknown_path_is_noop() {
    let (dir, root) = setup();
    let image = media(&dir, "a.png");
    add(&root, &image).unwrap();
    remove(&root, &dir.path().join("other.png").to_string_lossy()).unwrap();
    assert_eq!(list(&root).len(), 1);
  }

  #[test]
  fn remove_with_no_file_is_noop() {
    let (dir, root) = setup();
    remove(&root, &dir.path().join("a.png").to_string_lossy()).unwrap();
    assert!(!json_path(&dir).exists());
  }

  #[test]
  fn remove_never_touches_media_file() {
    let (dir, root) = setup();
    let image = media(&dir, "a.png");
    add(&root, &image).unwrap();
    remove(&root, &image).unwrap();
    assert!(list(&root).is_empty());
    assert_eq!(std::fs::read(&image).unwrap(), b"media");

    let reloaded = AppDataRoot::create_existing(dir.path()).unwrap();
    assert!(list(&reloaded).is_empty());
  }

  #[test]
  fn deleted_or_moved_file_is_listed_as_missing() {
    let (dir, root) = setup();
    let deleted = media(&dir, "a.png");
    let moved = media(&dir, "b.webm");
    add(&root, &deleted).unwrap();
    add(&root, &moved).unwrap();
    std::fs::remove_file(&deleted).unwrap();
    std::fs::rename(&moved, dir.path().join("c.webm")).unwrap();

    let entries = list(&root);
    assert_eq!(entries.len(), 2);
    assert!(entries.iter().all(|entry| entry.missing));
    assert_eq!(entries[1].kind, LocalMediaKind::Video);
  }

  #[test]
  fn corrupt_file_is_kept_as_bak_and_list_starts_empty() {
    let (dir, root) = setup();
    std::fs::write(json_path(&dir), "{ not json").unwrap();

    assert!(list(&root).is_empty());
    let bak = dir.path().join("settings").join("favorites.json.bak");
    assert_eq!(std::fs::read_to_string(bak).unwrap(), "{ not json");
    assert!(!json_path(&dir).exists());

    let image = media(&dir, "a.png");
    add(&root, &image).unwrap();
    assert_eq!(list(&root).len(), 1);
  }

  #[test]
  fn write_is_atomic_and_leaves_no_temp_file() {
    let (dir, root) = setup();
    let image = media(&dir, "a.png");
    add(&root, &image).unwrap();
    add(&root, &media(&dir, "b.png")).unwrap();
    assert!(json_path(&dir).exists());
    assert!(!dir.path().join("settings").join("favorites.json.tmp").exists());
    assert_eq!(list(&root).len(), 2);
  }

  #[test]
  fn rejects_relative_and_non_media_paths() {
    let (dir, root) = setup();
    assert!(add(&root, "a.png").is_err());
    assert!(add(&root, &media(&dir, "notes.txt")).is_err());
    assert!(!json_path(&dir).exists());
  }

  mod edge_case_tests {
    use super::*;

    const BRAND_WORDS: [&str; 4] = ["artcraft", "getartcraft", "storyteller", "fakeyou"];

    #[test]
    fn empty_and_whitespace_paths_are_rejected() {
      let (dir, root) = setup();
      assert!(add(&root, "").is_err());
      assert!(add(&root, "   ").is_err());
      assert!(!json_path(&dir).exists());
    }

    #[test]
    fn surrounding_whitespace_is_trimmed_on_add_and_remove() {
      let (dir, root) = setup();
      let image = media(&dir, "a.png");
      add(&root, &format!("  {}\t", image)).unwrap();
      let entries = list(&root);
      assert_eq!(entries.len(), 1);
      assert_eq!(entries[0].path, image);

      remove(&root, &format!(" {} ", image)).unwrap();
      assert!(list(&root).is_empty());
    }

    #[test]
    fn empty_file_is_treated_as_corrupt() {
      let (dir, root) = setup();
      std::fs::write(json_path(&dir), "").unwrap();
      assert!(list(&root).is_empty());
      assert!(dir.path().join("settings").join("favorites.json.bak").exists());
      assert!(!json_path(&dir).exists());
    }

    #[test]
    fn valid_json_with_wrong_shape_is_treated_as_corrupt() {
      for body in [r#"{"path":"x"}"#, r#"[{"path":"C:\\a.png"}]"#, r#"[{"path":"/a.png","added_at":"yesterday"}]"#] {
        let (dir, root) = setup();
        std::fs::write(json_path(&dir), body).unwrap();
        assert!(list(&root).is_empty(), "body {}", body);
        let bak = dir.path().join("settings").join("favorites.json.bak");
        assert_eq!(std::fs::read_to_string(bak).unwrap(), body);
      }
    }

    #[test]
    fn empty_array_is_valid_and_not_backed_up() {
      let (dir, root) = setup();
      std::fs::write(json_path(&dir), "[]").unwrap();
      assert!(list(&root).is_empty());
      assert!(json_path(&dir).exists());
      assert!(!dir.path().join("settings").join("favorites.json.bak").exists());
    }

    #[test]
    fn second_corruption_replaces_old_bak() {
      let (dir, root) = setup();
      let bak = dir.path().join("settings").join("favorites.json.bak");
      std::fs::write(json_path(&dir), "first").unwrap();
      assert!(list(&root).is_empty());
      std::fs::write(json_path(&dir), "second").unwrap();
      assert!(list(&root).is_empty());
      assert_eq!(std::fs::read_to_string(bak).unwrap(), "second");
    }

    #[test]
    fn stale_temp_file_from_a_crash_is_ignored_and_replaced() {
      let (dir, root) = setup();
      let temp = dir.path().join("settings").join("favorites.json.tmp");
      std::fs::write(&temp, "{ half written").unwrap();
      assert!(list(&root).is_empty());

      let image = media(&dir, "a.png");
      add(&root, &image).unwrap();
      assert!(!temp.exists());
      assert_eq!(list(&root).len(), 1);
    }

    #[test]
    fn failed_write_leaves_previous_file_intact() {
      let (dir, root) = setup();
      let first = media(&dir, "a.png");
      add(&root, &first).unwrap();
      let before = std::fs::read_to_string(json_path(&dir)).unwrap();

      // A directory where the temp file should go makes the temp write fail.
      std::fs::create_dir(dir.path().join("settings").join("favorites.json.tmp")).unwrap();
      assert!(add(&root, &media(&dir, "b.png")).is_err());

      assert_eq!(std::fs::read_to_string(json_path(&dir)).unwrap(), before);
      let entries = list(&root);
      assert_eq!(entries.len(), 1);
      assert_eq!(entries[0].path, first);
    }

    #[test]
    fn remove_keeps_order_of_the_rest_and_persists() {
      let (dir, root) = setup();
      let a = media(&dir, "a.png");
      let b = media(&dir, "b.jpg");
      let c = media(&dir, "c.mov");
      for path in [&a, &b, &c] {
        add(&root, path).unwrap();
      }
      remove(&root, &b).unwrap();
      remove(&root, &b).unwrap();

      let reloaded = AppDataRoot::create_existing(dir.path()).unwrap();
      let paths: Vec<String> = list(&reloaded).into_iter().map(|entry| entry.path).collect();
      assert_eq!(paths, vec![a, c]);
      assert!(Path::new(&b).is_file());
    }

    #[test]
    fn remove_works_for_a_favorite_whose_file_is_gone() {
      let (dir, root) = setup();
      let image = media(&dir, "a.png");
      add(&root, &image).unwrap();
      std::fs::remove_file(&image).unwrap();
      assert!(list(&root)[0].missing);

      remove(&root, &image).unwrap();
      assert!(list(&root).is_empty());
    }

    #[test]
    fn readding_a_missing_favorite_keeps_one_entry() {
      let (dir, root) = setup();
      let image = media(&dir, "a.png");
      add(&root, &image).unwrap();
      std::fs::remove_file(&image).unwrap();
      add(&root, &image).unwrap();
      assert_eq!(list(&root).len(), 1);
    }

    #[test]
    fn every_supported_extension_maps_to_the_right_kind() {
      let (dir, root) = setup();
      let cases = [("a.mp4", LocalMediaKind::Video), ("b.webm", LocalMediaKind::Video), ("c.MOV", LocalMediaKind::Video), ("d.png", LocalMediaKind::Image), ("e.JPG", LocalMediaKind::Image), ("f.jpeg", LocalMediaKind::Image), ("g.WebP", LocalMediaKind::Image)];
      for (name, _) in cases {
        add(&root, &media(&dir, name)).unwrap();
      }
      let entries = list(&root);
      assert_eq!(entries.len(), cases.len());
      for (entry, (name, kind)) in entries.iter().zip(cases) {
        assert_eq!(entry.kind, kind, "{}", name);
      }
    }

    #[test]
    fn non_media_and_extensionless_paths_are_rejected() {
      let (dir, root) = setup();
      for name in ["noext", "clip.mp4.txt", "archive.zip", "favorites.json"] {
        assert!(add(&root, &media(&dir, name)).is_err(), "{}", name);
      }
      assert!(add(&root, &dir.path().to_string_lossy()).is_err());
      assert!(!json_path(&dir).exists());
    }

    #[test]
    fn paths_with_spaces_and_unicode_round_trip() {
      let (dir, root) = setup();
      let image = media(&dir, "my clip \u{00e9}t\u{00e9} \u{65e5}\u{672c}.png");
      add(&root, &image).unwrap();
      let reloaded = AppDataRoot::create_existing(dir.path()).unwrap();
      let entries = list(&reloaded);
      assert_eq!(entries[0].path, image);
      assert!(!entries[0].missing);
    }

    #[test]
    fn list_entry_serializes_with_the_documented_shape() {
      let (dir, root) = setup();
      add(&root, &media(&dir, "a.png")).unwrap();
      add(&root, &dir.path().join("gone.mp4").to_string_lossy()).unwrap();

      let value = serde_json::to_value(list(&root)).unwrap();
      let entries = value.as_array().unwrap();
      assert_eq!(entries[0]["kind"], "image");
      assert_eq!(entries[0]["missing"], false);
      assert_eq!(entries[1]["kind"], "video");
      assert_eq!(entries[1]["missing"], true);
      for entry in entries {
        let keys: Vec<&String> = entry.as_object().unwrap().keys().collect();
        assert_eq!(keys.len(), 4);
        assert!(entry["path"].is_string());
        assert!(DateTime::parse_from_rfc3339(entry["added_at"].as_str().unwrap()).is_ok());
      }
    }

    #[test]
    fn concurrent_adds_lose_no_entries() {
      let (dir, root) = setup();
      let root = std::sync::Arc::new(root);
      let paths: Vec<String> = (0..8).map(|i| media(&dir, &format!("{}.png", i))).collect();
      let handles: Vec<_> = paths
        .iter()
        .cloned()
        .map(|path| {
          let root = root.clone();
          std::thread::spawn(move || add(&root, &path).unwrap())
        })
        .collect();
      for handle in handles {
        handle.join().unwrap();
      }
      assert_eq!(list(&root).len(), paths.len());
    }

    #[test]
    fn error_messages_have_no_brand_names() {
      let (dir, root) = setup();
      let errors = [add(&root, "a.png").unwrap_err(), add(&root, &media(&dir, "a.txt")).unwrap_err()];
      for err in errors {
        let message = err.to_string().to_lowercase();
        for word in BRAND_WORDS {
          assert!(!message.contains(word), "{:?} contains {}", message, word);
        }
      }
    }

    #[cfg(windows)]
    #[test]
    fn forward_slash_path_is_stored_with_backslashes_on_windows() {
      let (dir, root) = setup();
      let image = media(&dir, "a.png");
      add(&root, &image.replace('\\', "/")).unwrap();
      let entries = list(&root);
      assert_eq!(entries[0].path, image);
      assert!(!entries[0].missing);
    }

    #[cfg(windows)]
    #[test]
    fn first_spelling_is_kept_when_a_case_variant_is_added_on_windows() {
      let (dir, root) = setup();
      let image = media(&dir, "a.png");
      add(&root, &image).unwrap();
      add(&root, &image.to_uppercase()).unwrap();
      let reloaded = AppDataRoot::create_existing(dir.path()).unwrap();
      let entries = list(&reloaded);
      assert_eq!(entries.len(), 1);
      assert_eq!(entries[0].path, image);
    }

    #[cfg(not(windows))]
    #[test]
    fn case_variants_are_separate_entries_off_windows() {
      let (dir, root) = setup();
      add(&root, &media(&dir, "a.png")).unwrap();
      add(&root, &media(&dir, "A.png")).unwrap();
      assert_eq!(list(&root).len(), 2);
    }
  }
}
