use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use anyhow::anyhow;
use chrono::Utc;
use errors::AnyhowResult;
use log::{error, info};
use std::path::{Path, PathBuf};
use tauri::State;

const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];

#[tauri::command]
pub fn save_scene_frame_command(
  png_bytes: Vec<u8>,
  app_data_root: State<'_, AppDataRoot>,
) -> Result<PathBuf, String> {
  info!("save_scene_frame_command called");
  let timestamp = Utc::now().format("%Y%m%d-%H%M%S%3f").to_string();
  save_scene_frame(app_data_root.downloads_dir().path(), &timestamp, &png_bytes)
      .map_err(|err| {
        error!("save_scene_frame_command failed: {:?}", err);
        err.to_string()
      })
}

fn scene_frame_path(downloads_dir: &Path, timestamp: &str) -> PathBuf {
  downloads_dir.join("3d-frames").join(format!("{}.png", timestamp))
}

fn save_scene_frame(downloads_dir: &Path, timestamp: &str, png_bytes: &[u8]) -> AnyhowResult<PathBuf> {
  if !png_bytes.starts_with(&PNG_SIGNATURE) {
    return Err(anyhow!("frame is not a PNG"));
  }
  let path = scene_frame_path(downloads_dir, timestamp);
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  std::fs::write(&path, png_bytes)?;
  Ok(path)
}

#[cfg(test)]
mod tests {
  use super::*;

  const LIB_RS: &str = include_str!("../../../lib.rs");
  const MOD_RS: &str = include_str!("mod.rs");
  const BRAND_WORDS: [&str; 6] = ["artcraft", "getartcraft", "storyteller.ai", "fakeyou", "ltx", "lightricks"];

  mod path_tests {
    use super::*;

    #[test]
    fn path_is_png_named_by_timestamp_in_3d_frames() {
      let dir = tempfile::tempdir().unwrap();
      assert_eq!(
        scene_frame_path(dir.path(), "20261103-120000123"),
        dir.path().join("3d-frames").join("20261103-120000123.png"),
      );
    }

    #[test]
    fn path_folder_and_extension_are_exact() {
      let path = scene_frame_path(Path::new("downloads"), "t1");
      assert_eq!(path.extension().unwrap(), "png");
      assert_eq!(path.file_name().unwrap(), "t1.png");
      assert_eq!(path.parent().unwrap().file_name().unwrap(), "3d-frames");
      assert_eq!(path.parent().unwrap().parent().unwrap(), Path::new("downloads"));
    }

    #[test]
    fn path_handles_windows_style_dir_with_spaces() {
      let dir = PathBuf::from(r"C:\Users\Some User\Downloads");
      let path = scene_frame_path(&dir, "20261103-120000123");
      assert!(path.starts_with(&dir));
      assert_eq!(path, dir.join("3d-frames").join("20261103-120000123.png"));
    }
  }

  mod write_tests {
    use super::*;

    #[test]
    fn writes_exact_bytes_and_creates_folder() {
      let dir = tempfile::tempdir().unwrap();
      let bytes = png(&[1, 2, 3, 4]);

      let path = save_scene_frame(dir.path(), "t1", &bytes).unwrap();

      assert_eq!(path, dir.path().join("3d-frames").join("t1.png"));
      assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn accepts_bare_signature_with_no_body() {
      let dir = tempfile::tempdir().unwrap();
      let path = save_scene_frame(dir.path(), "sig", &PNG_SIGNATURE).unwrap();
      assert_eq!(std::fs::read(&path).unwrap(), PNG_SIGNATURE.to_vec());
    }

    #[test]
    fn reuses_existing_3d_frames_folder_and_keeps_other_files() {
      let dir = tempfile::tempdir().unwrap();
      let frames = dir.path().join("3d-frames");
      std::fs::create_dir_all(&frames).unwrap();
      std::fs::write(frames.join("old.png"), png(&[9])).unwrap();

      let path = save_scene_frame(dir.path(), "new", &png(&[1])).unwrap();

      assert_eq!(std::fs::read(&path).unwrap(), png(&[1]));
      assert_eq!(std::fs::read(frames.join("old.png")).unwrap(), png(&[9]));
    }

    #[test]
    fn creates_missing_downloads_dir_too() {
      let dir = tempfile::tempdir().unwrap();
      let downloads = dir.path().join("not").join("yet");

      let path = save_scene_frame(&downloads, "t1", &png(&[7])).unwrap();

      assert_eq!(path, downloads.join("3d-frames").join("t1.png"));
      assert!(path.is_file());
    }

    #[test]
    fn different_timestamps_make_separate_files() {
      let dir = tempfile::tempdir().unwrap();
      let a = save_scene_frame(dir.path(), "a", &png(&[1])).unwrap();
      let b = save_scene_frame(dir.path(), "b", &png(&[2])).unwrap();

      assert_ne!(a, b);
      assert_eq!(std::fs::read(&a).unwrap(), png(&[1]));
      assert_eq!(std::fs::read(&b).unwrap(), png(&[2]));
      assert_eq!(png_count(dir.path()), 2);
    }

    #[test]
    fn same_timestamp_overwrites_with_latest_bytes() {
      let dir = tempfile::tempdir().unwrap();
      save_scene_frame(dir.path(), "same", &png(&[1, 1, 1, 1])).unwrap();
      let path = save_scene_frame(dir.path(), "same", &png(&[2])).unwrap();

      assert_eq!(std::fs::read(&path).unwrap(), png(&[2]));
      assert_eq!(png_count(dir.path()), 1);
    }

    #[test]
    fn writes_only_inside_3d_frames() {
      let dir = tempfile::tempdir().unwrap();
      save_scene_frame(dir.path(), "t1", &png(&[1])).unwrap();

      let top: Vec<_> = std::fs::read_dir(dir.path()).unwrap().flatten().map(|e| e.file_name()).collect();
      assert_eq!(top, vec![std::ffi::OsString::from("3d-frames")]);
    }

    #[test]
    fn fails_when_3d_frames_is_a_file() {
      let dir = tempfile::tempdir().unwrap();
      std::fs::write(dir.path().join("3d-frames"), b"not a folder").unwrap();

      assert!(save_scene_frame(dir.path(), "t1", &png(&[1])).is_err());
      assert_eq!(std::fs::read(dir.path().join("3d-frames")).unwrap(), b"not a folder");
    }
  }

  mod reject_tests {
    use super::*;

    #[test]
    fn rejects_non_png_bytes() {
      let dir = tempfile::tempdir().unwrap();
      for bytes in [vec![], b"GIF89a".to_vec(), PNG_SIGNATURE[..7].to_vec()] {
        assert!(save_scene_frame(dir.path(), "bad", &bytes).is_err());
      }
      assert!(!dir.path().join("3d-frames").exists());
    }

    #[test]
    fn rejects_jpeg_webp_and_corrupted_signature() {
      let dir = tempfile::tempdir().unwrap();
      let jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, b'J', b'F', b'I', b'F'];
      let webp = b"RIFF\0\0\0\0WEBPVP8 ".to_vec();
      let mut wrong_last = png(&[1, 2]);
      wrong_last[7] = 0;
      let mut wrong_first = png(&[1, 2]);
      wrong_first[0] = 0x88;

      for bytes in [jpeg, webp, wrong_last, wrong_first] {
        assert!(save_scene_frame(dir.path(), "bad", &bytes).is_err());
      }
      assert!(!dir.path().join("3d-frames").exists());
    }

    #[test]
    fn rejects_signature_that_is_not_at_the_start() {
      let dir = tempfile::tempdir().unwrap();
      let mut bytes = vec![0u8];
      bytes.extend_from_slice(&PNG_SIGNATURE);

      assert!(save_scene_frame(dir.path(), "bad", &bytes).is_err());
      assert!(!dir.path().join("3d-frames").exists());
    }

    #[test]
    fn rejection_keeps_existing_frame_untouched() {
      let dir = tempfile::tempdir().unwrap();
      let path = save_scene_frame(dir.path(), "keep", &png(&[5])).unwrap();

      assert!(save_scene_frame(dir.path(), "keep", b"GIF89a").is_err());
      assert_eq!(std::fs::read(&path).unwrap(), png(&[5]));
    }

    #[test]
    fn error_message_is_plain_and_unbranded() {
      let dir = tempfile::tempdir().unwrap();
      let message = save_scene_frame(dir.path(), "bad", b"nope").unwrap_err().to_string();

      assert_eq!(message, "frame is not a PNG");
      let lower = message.to_lowercase();
      for word in BRAND_WORDS {
        assert!(!lower.contains(word), "error message leaks {:?}", word);
      }
    }
  }

  mod wiring_tests {
    use super::*;

    #[test]
    fn module_is_declared_in_media_files_mod() {
      assert!(MOD_RS.lines().any(|line| line.trim() == "pub mod save_scene_frame_command;"));
    }

    #[test]
    fn command_is_registered_right_after_list_local_media() {
      let lines: Vec<&str> = LIB_RS.lines().map(str::trim).collect();
      let at = lines.iter().position(|line| *line == "list_local_media_command,")
          .expect("list_local_media_command is not in invoke_handler");
      assert_eq!(lines[at + 1], "save_scene_frame_command,");
      assert_eq!(lines.iter().filter(|line| **line == "save_scene_frame_command,").count(), 1);
    }

    #[test]
    fn command_is_imported_in_lib() {
      assert!(LIB_RS.contains(
        "use crate::core::commands::media_files::save_scene_frame_command::save_scene_frame_command;"
      ));
    }
  }

  fn png(body: &[u8]) -> Vec<u8> {
    let mut bytes = PNG_SIGNATURE.to_vec();
    bytes.extend_from_slice(body);
    bytes
  }

  fn png_count(downloads_dir: &Path) -> usize {
    std::fs::read_dir(downloads_dir.join("3d-frames"))
        .unwrap()
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "png"))
        .count()
  }
}
