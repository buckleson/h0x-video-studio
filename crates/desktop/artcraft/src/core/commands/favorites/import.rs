use std::fs::{File, OpenOptions};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use anyhow::anyhow;
use log::{error, info};
use serde_derive::Serialize;
use tauri::State;

use crate::core::favorites::store;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;

const FAVORITES_SUBDIR: &str = "favorites";

#[derive(Debug, Serialize)]
pub struct ImportFavoriteResult {
  pub source: String,
  #[serde(rename = "dest")]
  pub maybe_dest: Option<String>,
  #[serde(rename = "error")]
  pub maybe_error: Option<String>,
}

/// Copies images and videos into `<downloads>/favorites/` and favorites the copies. Sources are never changed.
#[tauri::command]
pub async fn import_favorite_files(paths: Vec<String>, app_data_root: State<'_, AppDataRoot>) -> Result<Vec<ImportFavoriteResult>, String> {
  info!("import_favorite_files called with {} paths", paths.len());
  let root = app_data_root.inner().clone();
  tokio::task::spawn_blocking(move || import_files(&root, &paths)).await.map_err(|err| {
    error!("import_favorite_files failed: {:?}", err);
    err.to_string()
  })
}

fn import_files(root: &AppDataRoot, paths: &[String]) -> Vec<ImportFavoriteResult> {
  let dir = root.downloads_dir().path().join(FAVORITES_SUBDIR);
  paths
    .iter()
    .map(|source| match import_file(root, &dir, Path::new(source.trim())) {
      Ok(dest) => ImportFavoriteResult { source: source.clone(), maybe_dest: Some(dest.to_string_lossy().to_string()), maybe_error: None },
      Err(err) => {
        error!("Failed to import {:?}: {:?}", source, err);
        ImportFavoriteResult { source: source.clone(), maybe_dest: None, maybe_error: Some(err.to_string()) }
      },
    })
    .collect()
}

fn import_file(root: &AppDataRoot, dir: &Path, source: &Path) -> anyhow::Result<PathBuf> {
  if !is_media(source) {
    return Err(anyhow!("Only images and videos can be imported"));
  }
  if !source.is_file() {
    return Err(anyhow!("File not found"));
  }
  std::fs::create_dir_all(dir)?;
  let (dest, mut file) = create_unique(dir, source)?;
  let copied = File::open(source).and_then(|mut input| std::io::copy(&mut input, &mut file));
  drop(file);
  if let Err(err) = copied {
    let _ = std::fs::remove_file(&dest);
    return Err(err.into());
  }
  store::add(root, &dest.to_string_lossy())?;
  Ok(dest)
}

/// Creates `name.ext`, else `name-1.ext`, `name-2.ext`, ...; an existing file is never opened for writing.
fn create_unique(dir: &Path, source: &Path) -> anyhow::Result<(PathBuf, File)> {
  let stem = source.file_stem().unwrap_or_default().to_string_lossy();
  let extension = source.extension().unwrap_or_default().to_string_lossy();
  for suffix in 0.. {
    let name = if suffix == 0 { format!("{}.{}", stem, extension) } else { format!("{}-{}.{}", stem, suffix, extension) };
    let dest = dir.join(name);
    match OpenOptions::new().write(true).create_new(true).open(&dest) {
      Ok(file) => return Ok((dest, file)),
      Err(err) if err.kind() == ErrorKind::AlreadyExists => continue,
      Err(err) => return Err(err.into()),
    }
  }
  unreachable!()
}

fn is_media(path: &Path) -> bool {
  let extension = path.extension().and_then(|extension| extension.to_str()).unwrap_or_default().to_ascii_lowercase();
  matches!(extension.as_str(), "mp4" | "webm" | "mov" | "png" | "jpg" | "jpeg" | "webp")
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::commands::media_files::list_local_media_command::LocalMediaKind;
  use tempfile::TempDir;

  const BRAND_WORDS: [&str; 6] = ["artcraft", "storyteller", "fakeyou", "getartcraft", "ltx", "lightricks"];

  #[test]
  fn images_and_videos_are_copied_and_favorited() {
    let (_data, sources, root) = setup();
    let image = source(&sources, "a.png", b"image");
    let video = source(&sources, "b.MP4", b"video");

    let results = import_files(&root, &[image.clone(), video.clone()]);

    assert!(results.iter().all(|result| result.maybe_error.is_none()));
    let dests: Vec<PathBuf> = results.iter().map(|result| PathBuf::from(result.maybe_dest.clone().unwrap())).collect();
    assert_eq!(dests[0], favorites_dir(&root).join("a.png"));
    assert_eq!(dests[1], favorites_dir(&root).join("b.MP4"));
    assert_eq!(std::fs::read(&dests[0]).unwrap(), b"image");
    assert_eq!(std::fs::read(&dests[1]).unwrap(), b"video");

    let favorites: Vec<PathBuf> = store::list(&root).into_iter().map(|entry| PathBuf::from(entry.path)).collect();
    assert_eq!(favorites, dests);
  }

  #[test]
  fn other_types_are_rejected_and_the_rest_still_import() {
    let (_data, sources, root) = setup();
    let text = source(&sources, "notes.txt", b"text");
    let image = source(&sources, "a.jpg", b"image");
    let missing = sources.path().join("gone.png").to_string_lossy().to_string();

    let results = import_files(&root, &[text.clone(), image.clone(), missing.clone()]);

    assert_eq!(results[0].source, text);
    assert!(results[0].maybe_dest.is_none());
    assert!(results[0].maybe_error.is_some());
    assert!(results[1].maybe_error.is_none());
    assert_eq!(results[2].source, missing);
    assert!(results[2].maybe_error.is_some());
    assert!(!favorites_dir(&root).join("notes.txt").exists());
    assert_eq!(store::list(&root).len(), 1);
  }

  #[test]
  fn name_clash_gets_numbered_suffix_and_nothing_is_overwritten() {
    let (_data, sources, root) = setup();
    std::fs::create_dir_all(favorites_dir(&root)).unwrap();
    std::fs::write(favorites_dir(&root).join("a.png"), b"existing").unwrap();
    let image = source(&sources, "a.png", b"new");

    let results = import_files(&root, &[image.clone(), image.clone()]);

    let dests: Vec<String> = results.into_iter().map(|result| result.maybe_dest.unwrap()).collect();
    assert_eq!(PathBuf::from(&dests[0]), favorites_dir(&root).join("a-1.png"));
    assert_eq!(PathBuf::from(&dests[1]), favorites_dir(&root).join("a-2.png"));
    assert_eq!(std::fs::read(favorites_dir(&root).join("a.png")).unwrap(), b"existing");
    assert_eq!(std::fs::read(&dests[1]).unwrap(), b"new");
  }

  #[test]
  fn source_files_are_unchanged() {
    let (_data, sources, root) = setup();
    let image = source(&sources, "a.webp", b"image");
    let before = std::fs::metadata(&image).unwrap().modified().unwrap();

    import_files(&root, &[image.clone()]);

    assert_eq!(std::fs::read(&image).unwrap(), b"image");
    assert_eq!(std::fs::metadata(&image).unwrap().modified().unwrap(), before);
    assert_eq!(std::fs::read_dir(sources.path()).unwrap().count(), 1);
  }

  #[test]
  fn imported_files_are_inside_the_library_downloads_dir() {
    let (_data, sources, root) = setup();
    let video = source(&sources, "clip.mov", b"video");

    let dest = PathBuf::from(import_files(&root, &[video]).remove(0).maybe_dest.unwrap());

    assert!(dest.starts_with(root.downloads_dir().path()));
    assert!(is_media(&dest));
  }

  mod batch_tests {
    use super::*;

    #[test]
    fn empty_batch_returns_no_results_and_creates_nothing() {
      let (_data, _sources, root) = setup();

      let results = import_files(&root, &[]);

      assert!(results.is_empty());
      assert!(!favorites_dir(&root).exists());
      assert!(store::list(&root).is_empty());
    }

    #[test]
    fn results_keep_input_order_and_length() {
      let (_data, sources, root) = setup();
      let paths = vec![source(&sources, "1.txt", b"x"), source(&sources, "2.png", b"x"), String::new(), source(&sources, "3.mp4", b"x")];

      let results = import_files(&root, &paths);

      let returned: Vec<&String> = results.iter().map(|result| &result.source).collect();
      assert_eq!(returned, paths.iter().collect::<Vec<_>>());
      let ok: Vec<bool> = results.iter().map(|result| result.maybe_dest.is_some()).collect();
      assert_eq!(ok, vec![false, true, false, true]);
    }

    #[test]
    fn every_result_has_exactly_one_of_dest_or_error() {
      let (_data, sources, root) = setup();
      let paths = vec![source(&sources, "a.png", b"x"), source(&sources, "b.gif", b"x"), sources.path().join("none.webm").to_string_lossy().to_string()];

      for result in import_files(&root, &paths) {
        assert!(result.maybe_dest.is_some() != result.maybe_error.is_some(), "{:?}", result);
      }
    }

    #[test]
    fn importing_the_same_file_twice_favorites_both_copies() {
      let (_data, sources, root) = setup();
      let image = source(&sources, "same.jpeg", b"x");

      let results = import_files(&root, &[image.clone(), image.clone()]);

      assert_eq!(results.len(), 2);
      assert_ne!(results[0].maybe_dest, results[1].maybe_dest);
      assert_eq!(store::list(&root).len(), 2);
    }

    #[test]
    fn rejected_files_leave_nothing_in_the_library() {
      let (_data, sources, root) = setup();
      let paths = vec![source(&sources, "doc.pdf", b"x"), source(&sources, "song.mp3", b"x"), source(&sources, "anim.gif", b"x"), source(&sources, "ok.webp", b"x")];

      import_files(&root, &paths);

      assert_eq!(library_files(&root), vec![favorites_dir(&root).join("ok.webp")]);
      assert_eq!(store::list(&root).len(), 1);
    }

    #[test]
    fn favorites_dir_blocked_by_a_file_fails_every_import_without_favoriting() {
      let (_data, sources, root) = setup();
      std::fs::write(favorites_dir(&root), b"not a folder").unwrap();
      let paths = vec![source(&sources, "a.png", b"x"), source(&sources, "b.mp4", b"x")];

      let results = import_files(&root, &paths);

      assert!(results.iter().all(|result| result.maybe_dest.is_none() && result.maybe_error.is_some()));
      assert!(store::list(&root).is_empty());
      assert_eq!(std::fs::read(favorites_dir(&root)).unwrap(), b"not a folder");
    }
  }

  mod type_filter_tests {
    use super::*;

    #[test]
    fn every_supported_extension_in_any_case_is_imported() {
      let (_data, sources, root) = setup();
      let names = ["a.mp4", "b.WEBM", "c.Mov", "d.png", "e.JPG", "f.jpeg", "g.WebP"];
      let paths: Vec<String> = names.iter().map(|name| source(&sources, name, b"x")).collect();

      let results = import_files(&root, &paths);

      for (name, result) in names.iter().zip(&results) {
        assert!(result.maybe_error.is_none(), "{} was rejected: {:?}", name, result.maybe_error);
        assert_eq!(PathBuf::from(result.maybe_dest.clone().unwrap()), favorites_dir(&root).join(name));
      }
      assert_eq!(store::list(&root).len(), names.len());
    }

    #[test]
    fn unsupported_or_misleading_names_are_rejected() {
      let (_data, sources, root) = setup();
      let names = ["notes.txt", "README", "photo.png.txt", "anim.gif", "clip.mkv", ".png"];
      let paths: Vec<String> = names.iter().map(|name| source(&sources, name, b"x")).collect();

      let results = import_files(&root, &paths);

      for (name, result) in names.iter().zip(&results) {
        assert!(result.maybe_dest.is_none(), "{} was imported", name);
        assert!(result.maybe_error.is_some(), "{} has no error", name);
      }
      assert!(library_files(&root).is_empty());
      assert!(store::list(&root).is_empty());
    }

    #[test]
    fn double_extension_uses_last_segment_and_keeps_full_name() {
      let (_data, sources, root) = setup();
      let video = source(&sources, "clip.txt.mp4", b"x");

      let result = import_files(&root, &[video]).remove(0);

      assert_eq!(PathBuf::from(result.maybe_dest.unwrap()), favorites_dir(&root).join("clip.txt.mp4"));
    }

    #[test]
    fn rejection_reason_names_the_problem() {
      let (_data, sources, root) = setup();
      let text = source(&sources, "notes.txt", b"x");
      let missing = sources.path().join("gone.png").to_string_lossy().to_string();

      let results = import_files(&root, &[text, missing]);

      assert!(results[0].maybe_error.clone().unwrap().contains("images and videos"));
      assert!(results[1].maybe_error.clone().unwrap().contains("not found"));
    }

    #[test]
    fn rejection_reasons_have_no_brand_names() {
      let (_data, sources, root) = setup();
      let paths = vec![source(&sources, "notes.txt", b"x"), sources.path().join("gone.png").to_string_lossy().to_string(), String::new()];

      for result in import_files(&root, &paths) {
        let error = result.maybe_error.unwrap().to_lowercase();
        for word in BRAND_WORDS {
          assert!(!error.contains(word), "error {:?} contains {:?}", error, word);
        }
      }
    }
  }

  mod path_input_tests {
    use super::*;

    #[test]
    fn empty_and_blank_paths_are_rejected() {
      let (_data, _sources, root) = setup();

      let results = import_files(&root, &[String::new(), "   ".to_string()]);

      assert!(results.iter().all(|result| result.maybe_error.is_some()));
      assert!(store::list(&root).is_empty());
    }

    #[test]
    fn directory_named_like_media_is_rejected() {
      let (_data, sources, root) = setup();
      let folder = sources.path().join("folder.png");
      std::fs::create_dir(&folder).unwrap();

      let result = import_files(&root, &[folder.to_string_lossy().to_string()]).remove(0);

      assert!(result.maybe_dest.is_none());
      assert!(result.maybe_error.unwrap().contains("not found"));
      assert!(library_files(&root).is_empty());
    }

    #[test]
    fn surrounding_whitespace_is_trimmed_but_source_is_echoed_as_given() {
      let (_data, sources, root) = setup();
      let padded = format!("  {}\t", source(&sources, "a.png", b"x"));

      let result = import_files(&root, &[padded.clone()]).remove(0);

      assert_eq!(result.source, padded);
      assert_eq!(PathBuf::from(result.maybe_dest.unwrap()), favorites_dir(&root).join("a.png"));
    }

    #[test]
    fn forward_slash_source_paths_import() {
      let (_data, sources, root) = setup();
      let image = source(&sources, "a.png", b"x").replace('\\', "/");

      let result = import_files(&root, &[image.clone()]).remove(0);

      assert_eq!(result.source, image);
      assert_eq!(PathBuf::from(result.maybe_dest.unwrap()), favorites_dir(&root).join("a.png"));
    }

    #[test]
    fn names_with_spaces_and_unicode_keep_their_name() {
      let (_data, sources, root) = setup();
      let image = source(&sources, "my photo café 日本.jpg", b"x");

      let result = import_files(&root, &[image]).remove(0);

      assert_eq!(PathBuf::from(result.maybe_dest.unwrap()), favorites_dir(&root).join("my photo café 日本.jpg"));
    }

    #[test]
    fn empty_file_is_copied_as_empty() {
      let (_data, sources, root) = setup();
      let image = source(&sources, "empty.png", b"");

      let dest = import_files(&root, &[image]).remove(0).maybe_dest.unwrap();

      assert_eq!(std::fs::metadata(dest).unwrap().len(), 0);
    }

    #[test]
    fn source_in_a_nested_folder_lands_flat_in_favorites() {
      let (_data, sources, root) = setup();
      std::fs::create_dir_all(sources.path().join("deep").join("er")).unwrap();
      let image = source(&sources, "deep/er/a.png", b"x");

      let dest = PathBuf::from(import_files(&root, &[image]).remove(0).maybe_dest.unwrap());

      assert_eq!(dest, favorites_dir(&root).join("a.png"));
    }
  }

  mod name_clash_tests {
    use super::*;

    #[test]
    fn suffix_skips_numbers_already_taken() {
      let (_data, sources, root) = setup();
      std::fs::create_dir_all(favorites_dir(&root)).unwrap();
      for name in ["a.png", "a-1.png", "a-2.png"] {
        std::fs::write(favorites_dir(&root).join(name), name.as_bytes()).unwrap();
      }
      let image = source(&sources, "a.png", b"new");

      let dest = PathBuf::from(import_files(&root, &[image]).remove(0).maybe_dest.unwrap());

      assert_eq!(dest, favorites_dir(&root).join("a-3.png"));
      for name in ["a.png", "a-1.png", "a-2.png"] {
        assert_eq!(std::fs::read(favorites_dir(&root).join(name)).unwrap(), name.as_bytes());
      }
    }

    #[test]
    fn suffix_goes_before_the_extension_of_a_name_that_already_ends_in_a_number() {
      let (_data, sources, root) = setup();
      std::fs::create_dir_all(favorites_dir(&root)).unwrap();
      std::fs::write(favorites_dir(&root).join("a-1.mp4"), b"existing").unwrap();
      let video = source(&sources, "a-1.mp4", b"new");

      let dest = PathBuf::from(import_files(&root, &[video]).remove(0).maybe_dest.unwrap());

      assert_eq!(dest, favorites_dir(&root).join("a-1-1.mp4"));
      assert_eq!(std::fs::read(favorites_dir(&root).join("a-1.mp4")).unwrap(), b"existing");
    }

    #[test]
    fn suffix_keeps_the_original_extension_case() {
      let (_data, sources, root) = setup();
      std::fs::create_dir_all(favorites_dir(&root)).unwrap();
      std::fs::write(favorites_dir(&root).join("b.MOV"), b"existing").unwrap();
      let video = source(&sources, "b.MOV", b"new");

      let dest = PathBuf::from(import_files(&root, &[video]).remove(0).maybe_dest.unwrap());

      assert_eq!(dest, favorites_dir(&root).join("b-1.MOV"));
    }

    #[test]
    fn reimporting_a_file_from_the_favorites_folder_makes_a_copy() {
      let (_data, sources, root) = setup();
      let first = import_files(&root, &[source(&sources, "a.png", b"x")]).remove(0).maybe_dest.unwrap();

      let second = import_files(&root, &[first.clone()]).remove(0).maybe_dest.unwrap();

      assert_eq!(PathBuf::from(&second), favorites_dir(&root).join("a-1.png"));
      assert_eq!(std::fs::read(&first).unwrap(), b"x");
      assert_eq!(std::fs::read(&second).unwrap(), b"x");
      assert_eq!(store::list(&root).len(), 2);
    }

    #[cfg(windows)]
    #[test]
    fn names_differing_only_in_case_clash_on_windows() {
      let (_data, sources, root) = setup();
      std::fs::create_dir_all(favorites_dir(&root)).unwrap();
      std::fs::write(favorites_dir(&root).join("a.png"), b"existing").unwrap();
      let image = source(&sources, "A.PNG", b"new");

      let dest = PathBuf::from(import_files(&root, &[image]).remove(0).maybe_dest.unwrap());

      assert_eq!(dest, favorites_dir(&root).join("A-1.PNG"));
      assert_eq!(std::fs::read(favorites_dir(&root).join("a.png")).unwrap(), b"existing");
    }
  }

  mod library_tests {
    use super::*;

    #[test]
    fn imported_files_are_found_by_a_recursive_scan_of_downloads() {
      let (_data, sources, root) = setup();
      let paths = vec![source(&sources, "a.png", b"x"), source(&sources, "b.webm", b"x")];

      let dests: Vec<PathBuf> = import_files(&root, &paths).into_iter().map(|result| PathBuf::from(result.maybe_dest.unwrap())).collect();

      assert_eq!(library_files(&root), dests);
    }

    #[test]
    fn favorites_list_reports_kind_and_present_file() {
      let (_data, sources, root) = setup();
      let paths = vec![source(&sources, "a.jpg", b"x"), source(&sources, "b.mp4", b"x")];

      import_files(&root, &paths);

      let entries = store::list(&root);
      assert_eq!(entries.len(), 2);
      assert!(entries.iter().all(|entry| !entry.missing));
      assert!(matches!(entries[0].kind, LocalMediaKind::Image));
      assert!(matches!(entries[1].kind, LocalMediaKind::Video));
    }
  }

  mod serialization_tests {
    use super::*;

    #[test]
    fn success_serializes_with_dest_and_null_error() {
      let result = ImportFavoriteResult { source: "s.png".to_string(), maybe_dest: Some("d.png".to_string()), maybe_error: None };

      let json = serde_json::to_value(&result).unwrap();

      assert_eq!(json, serde_json::json!({ "source": "s.png", "dest": "d.png", "error": null }));
    }

    #[test]
    fn failure_serializes_with_error_and_null_dest() {
      let result = ImportFavoriteResult { source: "s.txt".to_string(), maybe_dest: None, maybe_error: Some("bad".to_string()) };

      let json = serde_json::to_value(&result).unwrap();

      assert_eq!(json, serde_json::json!({ "source": "s.txt", "dest": null, "error": "bad" }));
    }
  }

  fn setup() -> (TempDir, TempDir, AppDataRoot) {
    let data = TempDir::new().unwrap();
    let sources = TempDir::new().unwrap();
    let root = AppDataRoot::create_existing(data.path()).unwrap();
    (data, sources, root)
  }

  fn source(dir: &TempDir, name: &str, bytes: &[u8]) -> String {
    let path = dir.path().join(name);
    std::fs::write(&path, bytes).unwrap();
    path.to_string_lossy().to_string()
  }

  fn favorites_dir(root: &AppDataRoot) -> PathBuf {
    root.downloads_dir().path().join(FAVORITES_SUBDIR)
  }

  /// Every media file under the downloads dir, found the way `list_local_media` scans it (recursive, by extension), sorted by path.
  fn library_files(root: &AppDataRoot) -> Vec<PathBuf> {
    let mut files = Vec::new();
    scan(root.downloads_dir().path(), &mut files);
    files.sort();
    files
  }

  fn scan(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
      return;
    };
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_dir() {
        scan(&path, files);
      } else if is_media(&path) {
        files.push(path);
      }
    }
  }
}
