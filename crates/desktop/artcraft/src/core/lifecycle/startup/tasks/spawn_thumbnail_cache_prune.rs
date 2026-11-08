use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use log::{info, warn};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const MAX_CACHE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_CACHE_FILES: usize = 2000;

/// Prunes the thumbnail cache on a blocking thread so startup does not wait on disk I/O.
pub fn spawn_thumbnail_cache_prune(root: &AppDataRoot) {
  let thumbs_dir = root.temp_dir().path().join("thumbs");
  tauri::async_runtime::spawn_blocking(move || {
    match prune_thumbnail_cache(&thumbs_dir, MAX_CACHE_BYTES, MAX_CACHE_FILES) {
      Ok(0) => {}
      Ok(removed) => info!("Pruned {} thumbnails from the cache", removed),
      Err(err) => warn!("Thumbnail cache prune failed: {:?}", err),
    }
  });
}

/// Deletes the oldest-accessed files until the directory fits both limits. Returns how many were removed.
fn prune_thumbnail_cache(dir: &Path, max_bytes: u64, max_files: usize) -> std::io::Result<usize> {
  let entries = match fs::read_dir(dir) {
    Ok(entries) => entries,
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(0),
    Err(err) => return Err(err),
  };
  let mut files: Vec<(SystemTime, u64, PathBuf)> = entries
      .filter_map(|entry| entry.ok())
      .filter_map(|entry| {
        let metadata = entry.metadata().ok().filter(|m| m.is_file())?;
        let last_used = metadata.accessed().or_else(|_| metadata.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
        Some((last_used, metadata.len(), entry.path()))
      })
      .collect();
  files.sort_by_key(|(last_used, _, _)| *last_used);

  let mut total_bytes: u64 = files.iter().map(|(_, len, _)| len).sum();
  let mut remaining = files.len();
  let mut removed = 0;
  for (_, len, path) in files {
    if total_bytes <= max_bytes && remaining <= max_files {
      break;
    }
    if fs::remove_file(&path).is_ok() {
      total_bytes -= len;
      remaining -= 1;
      removed += 1;
    }
  }
  Ok(removed)
}


#[cfg(test)]
mod tests {
  use super::*;
  use std::fs::File;
  use std::time::Duration;

  const UNLIMITED_BYTES: u64 = u64::MAX;
  const UNLIMITED_FILES: usize = usize::MAX;

  #[test]
  fn limits_match_the_spec() {
    assert_eq!(MAX_CACHE_BYTES, 200 * 1024 * 1024);
    assert_eq!(MAX_CACHE_FILES, 2000);
  }

  mod no_op_tests {
    use super::*;

    #[test]
    fn missing_dir_is_a_no_op() {
      let dir = tempfile::tempdir().unwrap();
      assert_eq!(prune_thumbnail_cache(&dir.path().join("thumbs"), 10, 10).unwrap(), 0);
    }

    #[test]
    fn missing_dir_is_not_created() {
      let dir = tempfile::tempdir().unwrap();
      let thumbs = dir.path().join("thumbs");
      prune_thumbnail_cache(&thumbs, 0, 0).unwrap();
      assert!(!thumbs.exists());
    }

    #[test]
    fn empty_dir_is_a_no_op_even_with_zero_limits() {
      let dir = tempfile::tempdir().unwrap();
      assert_eq!(prune_thumbnail_cache(dir.path(), 0, 0).unwrap(), 0);
      assert!(dir.path().is_dir());
    }

    #[test]
    fn cache_within_limits_is_untouched() {
      let dir = tempfile::tempdir().unwrap();
      write_thumb(dir.path(), "a.jpg", 10, 30);
      write_thumb(dir.path(), "b.jpg", 10, 20);
      assert_eq!(prune_thumbnail_cache(dir.path(), 20, 2).unwrap(), 0);
      assert_eq!(file_count(dir.path()), 2);
    }

    #[test]
    fn subdirectories_are_ignored() {
      let dir = tempfile::tempdir().unwrap();
      let nested = dir.path().join("nested");
      fs::create_dir(&nested).unwrap();
      fs::write(nested.join("inner.jpg"), [0u8; 4]).unwrap();
      write_thumb(dir.path(), "a.jpg", 1, 10);
      assert_eq!(prune_thumbnail_cache(dir.path(), 0, 0).unwrap(), 1);
      assert!(nested.join("inner.jpg").is_file());
    }

    #[test]
    fn path_that_is_a_file_is_an_error_not_a_panic() {
      let dir = tempfile::tempdir().unwrap();
      let not_a_dir = write_thumb(dir.path(), "thumbs", 8, 10);
      assert!(prune_thumbnail_cache(&not_a_dir, 0, 0).is_err());
      assert!(not_a_dir.is_file());
    }
  }

  mod boundary_tests {
    use super::*;

    #[test]
    fn one_byte_over_the_size_limit_removes_only_the_oldest() {
      let dir = tempfile::tempdir().unwrap();
      let oldest = write_thumb(dir.path(), "a.jpg", 10, 30);
      let newest = write_thumb(dir.path(), "b.jpg", 10, 20);
      assert_eq!(prune_thumbnail_cache(dir.path(), 19, UNLIMITED_FILES).unwrap(), 1);
      assert!(!oldest.exists());
      assert!(newest.exists());
    }

    #[test]
    fn one_file_over_the_count_limit_removes_only_the_oldest() {
      let dir = tempfile::tempdir().unwrap();
      let oldest = write_thumb(dir.path(), "a.jpg", 1, 300);
      let middle = write_thumb(dir.path(), "b.jpg", 1, 200);
      let newest = write_thumb(dir.path(), "c.jpg", 1, 100);
      assert_eq!(prune_thumbnail_cache(dir.path(), UNLIMITED_BYTES, 2).unwrap(), 1);
      assert!(!oldest.exists());
      assert!(middle.exists());
      assert!(newest.exists());
    }

    #[test]
    fn zero_limits_remove_every_file() {
      let dir = tempfile::tempdir().unwrap();
      write_thumb(dir.path(), "a.jpg", 5, 30);
      write_thumb(dir.path(), "b.jpg", 5, 20);
      write_thumb(dir.path(), "c.jpg", 5, 10);
      assert_eq!(prune_thumbnail_cache(dir.path(), 0, 0).unwrap(), 3);
      assert_eq!(file_count(dir.path()), 0);
    }

    #[test]
    fn empty_files_still_count_toward_the_file_limit() {
      let dir = tempfile::tempdir().unwrap();
      write_thumb(dir.path(), "a.jpg", 0, 300);
      write_thumb(dir.path(), "b.jpg", 0, 200);
      let newest = write_thumb(dir.path(), "c.jpg", 0, 100);
      assert_eq!(prune_thumbnail_cache(dir.path(), 0, 1).unwrap(), 2);
      assert!(newest.exists());
    }

    #[test]
    fn single_file_larger_than_the_size_limit_is_removed() {
      let dir = tempfile::tempdir().unwrap();
      let big = write_thumb(dir.path(), "big.jpg", 1024, 10);
      assert_eq!(prune_thumbnail_cache(dir.path(), 1023, UNLIMITED_FILES).unwrap(), 1);
      assert!(!big.exists());
    }

    #[test]
    fn equal_access_times_still_meet_the_count_limit() {
      let dir = tempfile::tempdir().unwrap();
      write_thumb(dir.path(), "a.jpg", 1, 50);
      write_thumb(dir.path(), "b.jpg", 1, 50);
      write_thumb(dir.path(), "c.jpg", 1, 50);
      assert_eq!(prune_thumbnail_cache(dir.path(), UNLIMITED_BYTES, 1).unwrap(), 2);
      assert_eq!(file_count(dir.path()), 1);
    }
  }

  mod ordering_tests {
    use super::*;

    #[test]
    fn count_limit_removes_oldest_accessed_first() {
      let dir = tempfile::tempdir().unwrap();
      let oldest = write_thumb(dir.path(), "a.jpg", 1, 300);
      let middle = write_thumb(dir.path(), "b.jpg", 1, 200);
      let newest = write_thumb(dir.path(), "c.jpg", 1, 100);
      assert_eq!(prune_thumbnail_cache(dir.path(), UNLIMITED_BYTES, 1).unwrap(), 2);
      assert!(!oldest.exists());
      assert!(!middle.exists());
      assert!(newest.exists());
    }

    #[test]
    fn size_limit_removes_oldest_accessed_first() {
      let dir = tempfile::tempdir().unwrap();
      let oldest = write_thumb(dir.path(), "a.jpg", 100, 300);
      let middle = write_thumb(dir.path(), "b.jpg", 100, 200);
      let newest = write_thumb(dir.path(), "c.jpg", 100, 100);
      assert_eq!(prune_thumbnail_cache(dir.path(), 250, UNLIMITED_FILES).unwrap(), 1);
      assert!(!oldest.exists());
      assert!(middle.exists());
      assert!(newest.exists());
    }

    #[test]
    fn order_follows_access_time_not_file_name() {
      let dir = tempfile::tempdir().unwrap();
      let z_old = write_thumb(dir.path(), "z.jpg", 1, 300);
      let a_new = write_thumb(dir.path(), "a.jpg", 1, 100);
      assert_eq!(prune_thumbnail_cache(dir.path(), UNLIMITED_BYTES, 1).unwrap(), 1);
      assert!(!z_old.exists());
      assert!(a_new.exists());
    }

    #[test]
    fn access_time_wins_over_modified_time() {
      let dir = tempfile::tempdir().unwrap();
      // Written long ago but viewed recently: keep it.
      let recently_viewed = write_thumb_with_times(dir.path(), "a.jpg", 1, 10, 1000);
      // Written recently but not viewed for a long time: remove it.
      let stale = write_thumb_with_times(dir.path(), "b.jpg", 1, 1000, 10);
      assert_eq!(prune_thumbnail_cache(dir.path(), UNLIMITED_BYTES, 1).unwrap(), 1);
      assert!(recently_viewed.exists());
      assert!(!stale.exists());
    }

    #[test]
    fn count_and_size_limits_apply_together() {
      let dir = tempfile::tempdir().unwrap();
      let old_big = write_thumb(dir.path(), "a.jpg", 100, 400);
      let mid_big = write_thumb(dir.path(), "b.jpg", 100, 300);
      let small = write_thumb(dir.path(), "c.jpg", 1, 200);
      let newest = write_thumb(dir.path(), "d.jpg", 1, 100);
      // One removal meets the count limit; the size limit needs a second one.
      assert_eq!(prune_thumbnail_cache(dir.path(), 50, 3).unwrap(), 2);
      assert!(!old_big.exists());
      assert!(!mid_big.exists());
      assert!(small.exists());
      assert!(newest.exists());
    }

    #[test]
    fn stops_as_soon_as_both_limits_are_met() {
      let dir = tempfile::tempdir().unwrap();
      let oldest = write_thumb(dir.path(), "a.jpg", 300, 300);
      let middle = write_thumb(dir.path(), "b.jpg", 1, 200);
      let newest = write_thumb(dir.path(), "c.jpg", 1, 100);
      // Removing the big oldest file is enough; the newer small ones stay.
      assert_eq!(prune_thumbnail_cache(dir.path(), 10, 10).unwrap(), 1);
      assert!(!oldest.exists());
      assert!(middle.exists());
      assert!(newest.exists());
    }
  }

  mod path_tests {
    use super::*;

    #[test]
    fn names_with_spaces_unicode_and_leading_dots_are_pruned() {
      let dir = tempfile::tempdir().unwrap();
      let names = ["my thumb (1).jpg", "\u{7f29}\u{7565}\u{56fe} \u{e9}.webp", ".tmpAbC123", "no_extension"];
      for (i, name) in names.iter().enumerate() {
        write_thumb(dir.path(), name, 2, 10 * (i as u64 + 1));
      }
      assert_eq!(prune_thumbnail_cache(dir.path(), 0, 0).unwrap(), names.len());
      assert_eq!(file_count(dir.path()), 0);
    }

    #[test]
    fn dir_path_with_spaces_works() {
      let dir = tempfile::tempdir().unwrap();
      let thumbs = dir.path().join("App Data").join("temp dir").join("thumbs");
      fs::create_dir_all(&thumbs).unwrap();
      write_thumb(&thumbs, "a.jpg", 1, 20);
      let newest = write_thumb(&thumbs, "b.jpg", 1, 10);
      assert_eq!(prune_thumbnail_cache(&thumbs, UNLIMITED_BYTES, 1).unwrap(), 1);
      assert!(newest.exists());
    }
  }

  fn write_thumb(dir: &Path, name: &str, len: usize, age_secs: u64) -> PathBuf {
    write_thumb_with_times(dir, name, len, age_secs, age_secs)
  }

  fn write_thumb_with_times(dir: &Path, name: &str, len: usize, accessed_age_secs: u64, modified_age_secs: u64) -> PathBuf {
    let path = dir.join(name);
    fs::write(&path, vec![0u8; len]).unwrap();
    let now = SystemTime::now();
    let times = fs::FileTimes::new()
        .set_accessed(now - Duration::from_secs(accessed_age_secs))
        .set_modified(now - Duration::from_secs(modified_age_secs));
    File::options().write(true).open(&path).unwrap().set_times(times).unwrap();
    path
  }

  fn file_count(dir: &Path) -> usize {
    fs::read_dir(dir).unwrap()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .count()
  }
}
