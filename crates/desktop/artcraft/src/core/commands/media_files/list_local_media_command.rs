use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use chrono::{DateTime, Utc};
use log::{info, warn};
use serde_derive::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum LocalMediaKind {
  Video,
  Image,
}

#[derive(Serialize, Debug)]
pub struct LocalMediaFile {
  pub path: PathBuf,
  pub kind: LocalMediaKind,
  pub size_bytes: u64,
  pub created_at: DateTime<Utc>,
}

#[tauri::command]
pub fn list_local_media_command(
  app_data_root: State<'_, AppDataRoot>,
) -> Vec<LocalMediaFile> {
  info!("list_local_media_command called");
  list_local_media(app_data_root.downloads_dir().path())
}

fn list_local_media(dir: &Path) -> Vec<LocalMediaFile> {
  let mut files = Vec::new();
  scan_dir(dir, &mut files);
  files.sort_by(|a, b| b.created_at.cmp(&a.created_at));
  files
}

fn scan_dir(dir: &Path, files: &mut Vec<LocalMediaFile>) {
  let entries = match std::fs::read_dir(dir) {
    Ok(entries) => entries,
    Err(err) => {
      if dir.exists() {
        warn!("Can't read directory {:?}: {:?}", dir, err);
      }
      return;
    }
  };

  for entry in entries.flatten() {
    let path = entry.path();
    let metadata = match entry.metadata() {
      Ok(metadata) => metadata,
      Err(_) => continue,
    };
    if metadata.is_dir() {
      scan_dir(&path, files);
      continue;
    }
    let Some(kind) = media_kind(&path) else { continue };
    let Ok(created) = metadata.modified() else { continue };
    files.push(LocalMediaFile {
      path,
      kind,
      size_bytes: metadata.len(),
      created_at: created.into(),
    });
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
  use std::fs::{self, File};
  use std::time::{Duration, SystemTime};

  fn touch(path: &Path, created: SystemTime) {
    File::create(path).unwrap().set_modified(created).unwrap();
  }

  #[test]
  fn filters_classifies_and_sorts_newest_first() {
    let dir = tempfile::tempdir().unwrap();
    let nested = dir.path().join("nested");
    fs::create_dir(&nested).unwrap();
    let base = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);

    touch(&dir.path().join("old.PNG"), base);
    touch(&nested.join("newest.Mp4"), base + Duration::from_secs(200));
    touch(&dir.path().join("middle.jpeg"), base + Duration::from_secs(100));
    touch(&dir.path().join("notes.txt"), base + Duration::from_secs(300));
    touch(&dir.path().join("noext"), base + Duration::from_secs(300));

    let files = list_local_media(dir.path());

    let names: Vec<_> = files.iter()
        .map(|f| f.path.file_name().unwrap().to_str().unwrap().to_string())
        .collect();
    assert_eq!(names, vec!["newest.Mp4", "middle.jpeg", "old.PNG"]);
    let kinds: Vec<_> = files.iter().map(|f| f.kind).collect();
    assert_eq!(kinds, vec![LocalMediaKind::Video, LocalMediaKind::Image, LocalMediaKind::Image]);
  }

  #[test]
  fn missing_directory_returns_empty_list() {
    let dir = tempfile::tempdir().unwrap();
    assert!(list_local_media(&dir.path().join("missing")).is_empty());
  }

  mod filter_tests {
    use super::*;

    #[test]
    fn every_supported_extension_in_any_case_is_classified() {
      let cases = [
        ("a.mp4", LocalMediaKind::Video),
        ("b.WEBM", LocalMediaKind::Video),
        ("c.MoV", LocalMediaKind::Video),
        ("d.png", LocalMediaKind::Image),
        ("e.JPG", LocalMediaKind::Image),
        ("f.JPEG", LocalMediaKind::Image),
        ("g.WebP", LocalMediaKind::Image),
      ];
      for (name, expected) in cases {
        assert_eq!(media_kind(Path::new(name)), Some(expected), "{}", name);
      }
    }

    #[test]
    fn unsupported_or_misleading_names_are_excluded() {
      for name in [
        "clip.mp4.txt", "photo.gif", "movie.mkv", "image.bmp", "anim.avi",
        "noext", ".png", "trailing.", "mp4", "clip.mp4.part",
      ] {
        assert_eq!(media_kind(Path::new(name)), None, "{:?}", name);
      }
    }

    #[test]
    fn double_extension_uses_last_segment() {
      assert_eq!(media_kind(Path::new("archive.txt.png")), Some(LocalMediaKind::Image));
    }

    #[test]
    fn directory_named_like_media_is_recursed_not_listed() {
      let dir = tempfile::tempdir().unwrap();
      let fake = dir.path().join("folder.mp4");
      fs::create_dir(&fake).unwrap();
      touch(&fake.join("inside.webp"), at(0));

      let files = list_local_media(dir.path());

      assert_eq!(names(&files), vec!["inside.webp"]);
      assert!(files.iter().all(|f| f.path.is_file()));
    }
  }

  mod scan_tests {
    use super::*;

    #[test]
    fn empty_directory_returns_empty_list() {
      let dir = tempfile::tempdir().unwrap();
      assert!(list_local_media(dir.path()).is_empty());
    }

    #[test]
    fn directory_with_only_unsupported_files_returns_empty_list() {
      let dir = tempfile::tempdir().unwrap();
      touch(&dir.path().join("readme.txt"), at(0));
      touch(&dir.path().join("download.part"), at(0));
      assert!(list_local_media(dir.path()).is_empty());
    }

    #[test]
    fn path_that_is_a_file_returns_empty_list() {
      let dir = tempfile::tempdir().unwrap();
      let file = dir.path().join("downloads");
      touch(&file, at(0));
      assert!(list_local_media(&file).is_empty());
    }

    #[test]
    fn deeply_nested_files_are_found() {
      let dir = tempfile::tempdir().unwrap();
      let deep = dir.path().join("a").join("b").join("c").join("d");
      fs::create_dir_all(&deep).unwrap();
      touch(&deep.join("deep.mov"), at(5));
      fs::create_dir_all(dir.path().join("empty").join("sub")).unwrap();

      let files = list_local_media(dir.path());

      assert_eq!(files.len(), 1);
      assert_eq!(files[0].path, deep.join("deep.mov"));
      assert_eq!(files[0].kind, LocalMediaKind::Video);
    }

    #[test]
    fn windows_style_names_with_spaces_and_unicode_are_found() {
      let dir = tempfile::tempdir().unwrap();
      let sub = dir.path().join("My Downloads (1)").join("caf\u{e9} \u{65e5}\u{672c}");
      fs::create_dir_all(&sub).unwrap();
      let file = sub.join("Final Cut v2.MP4");
      touch(&file, at(0));

      let files = list_local_media(dir.path());

      assert_eq!(files.len(), 1);
      assert_eq!(files[0].path, file);
    }

    #[test]
    fn size_bytes_matches_file_length_including_empty_files() {
      let dir = tempfile::tempdir().unwrap();
      write_file(&dir.path().join("big.png"), &[7u8; 1234], at(10));
      write_file(&dir.path().join("empty.jpg"), &[], at(0));

      let files = list_local_media(dir.path());

      assert_eq!(names(&files), vec!["big.png", "empty.jpg"]);
      assert_eq!(files[0].size_bytes, 1234);
      assert_eq!(files[1].size_bytes, 0);
    }

    #[test]
    fn created_at_reflects_modified_time() {
      let dir = tempfile::tempdir().unwrap();
      touch(&dir.path().join("a.webm"), at(42));

      let files = list_local_media(dir.path());

      let expected: DateTime<Utc> = at(42).into();
      assert_eq!(files[0].created_at, expected);
    }

    #[test]
    fn sort_is_newest_first_across_folders_and_kinds() {
      let dir = tempfile::tempdir().unwrap();
      let x = dir.path().join("x");
      let y = dir.path().join("y");
      fs::create_dir(&x).unwrap();
      fs::create_dir(&y).unwrap();
      touch(&y.join("t1.png"), at(1));
      touch(&x.join("t4.mp4"), at(4));
      touch(&dir.path().join("t3.webp"), at(3));
      touch(&y.join("t5.mov"), at(5));
      touch(&x.join("t2.jpg"), at(2));

      let files = list_local_media(dir.path());

      assert_eq!(names(&files), vec!["t5.mov", "t4.mp4", "t3.webp", "t2.jpg", "t1.png"]);
      assert!(files.windows(2).all(|w| w[0].created_at >= w[1].created_at));
    }
  }

  mod serialization_tests {
    use super::*;

    #[test]
    fn kind_serializes_lowercase() {
      assert_eq!(serde_json::to_value(LocalMediaKind::Video).unwrap(), "video");
      assert_eq!(serde_json::to_value(LocalMediaKind::Image).unwrap(), "image");
    }

    #[test]
    fn file_serializes_with_expected_snake_case_fields() {
      let file = LocalMediaFile {
        path: PathBuf::from("clip.mp4"),
        kind: LocalMediaKind::Video,
        size_bytes: 99,
        created_at: at(0).into(),
      };

      let value = serde_json::to_value(&file).unwrap();
      let object = value.as_object().unwrap();

      let mut keys: Vec<_> = object.keys().map(String::as_str).collect();
      keys.sort();
      assert_eq!(keys, vec!["created_at", "kind", "path", "size_bytes"]);
      assert_eq!(object["path"], "clip.mp4");
      assert_eq!(object["kind"], "video");
      assert_eq!(object["size_bytes"], 99);
      assert!(object["created_at"].as_str().unwrap().starts_with("2023-11-14T22:13:20"));
    }
  }

  fn at(offset_secs: u64) -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000 + offset_secs)
  }

  fn write_file(path: &Path, bytes: &[u8], modified: SystemTime) {
    fs::write(path, bytes).unwrap();
    File::options().write(true).open(path).unwrap().set_modified(modified).unwrap();
  }

  fn names(files: &[LocalMediaFile]) -> Vec<String> {
    files.iter()
        .map(|f| f.path.file_name().unwrap().to_str().unwrap().to_string())
        .collect()
  }
}
