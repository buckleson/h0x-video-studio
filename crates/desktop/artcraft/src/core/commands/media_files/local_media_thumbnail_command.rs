use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use anyhow::{anyhow, bail};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use log::{error, info};
use once_cell::sync::Lazy;
use serde_derive::Serialize;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::State;
use tokio::sync::Semaphore;

const DEFAULT_MAX_EDGE: u32 = 384;
const JPEG_QUALITY: u8 = 80;

static GENERATION_PERMITS: Lazy<Semaphore> = Lazy::new(|| Semaphore::new(2));

#[derive(Serialize, Debug)]
pub struct LocalMediaThumbnail {
  pub thumb_path: PathBuf,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn local_media_thumbnail_command(
  path: PathBuf,
  max_edge: Option<u32>,
  app_data_root: State<'_, AppDataRoot>,
) -> Result<LocalMediaThumbnail, String> {
  info!("local_media_thumbnail_command called");
  let thumbs_dir = app_data_root.temp_dir().path().join("thumbs");
  let max_edge = max_edge.unwrap_or(DEFAULT_MAX_EDGE).max(1);
  local_media_thumbnail(app_data_root.downloads_dir().path(), &thumbs_dir, &path, max_edge)
      .await
      .map(|thumb_path| LocalMediaThumbnail { thumb_path })
      .map_err(|err| {
        error!("local_media_thumbnail_command failed for {:?}: {:?}", path, err);
        "thumbnail failed".to_string()
      })
}

async fn local_media_thumbnail(
  downloads_dir: &Path,
  thumbs_dir: &Path,
  path: &Path,
  max_edge: u32,
) -> anyhow::Result<PathBuf> {
  let (source, thumb_path) = cached_thumb_path(downloads_dir, thumbs_dir, path, max_edge)?;
  if thumb_path.is_file() {
    return Ok(thumb_path);
  }
  let _permit = GENERATION_PERMITS.acquire().await?;
  let result_path = thumb_path.clone();
  tokio::task::spawn_blocking(move || generate_thumbnail(&source, &thumb_path, max_edge)).await??;
  Ok(result_path)
}

/// Validates the source and returns its canonical path plus the cache file for it.
fn cached_thumb_path(
  downloads_dir: &Path,
  thumbs_dir: &Path,
  path: &Path,
  max_edge: u32,
) -> anyhow::Result<(PathBuf, PathBuf)> {
  let downloads_dir = downloads_dir.canonicalize()?;
  let source = path.canonicalize()?;
  if !source.starts_with(&downloads_dir) {
    bail!("path is outside the downloads directory");
  }
  if !is_image(&source) {
    bail!("not an image file");
  }
  let metadata = source.metadata()?;
  if !metadata.is_file() {
    bail!("not a file");
  }
  let mtime = metadata.modified()?.duration_since(UNIX_EPOCH)?.as_nanos();

  let mut hasher = DefaultHasher::new();
  source.hash(&mut hasher);
  mtime.hash(&mut hasher);
  metadata.len().hash(&mut hasher);
  max_edge.hash(&mut hasher);
  let thumb_path = thumbs_dir.join(format!("{:016x}.jpg", hasher.finish()));
  Ok((source, thumb_path))
}

fn is_image(path: &Path) -> bool {
  let Some(extension) = path.extension().and_then(|e| e.to_str()) else { return false };
  matches!(extension.to_ascii_lowercase().as_str(), "png" | "jpg" | "jpeg" | "webp")
}

fn generate_thumbnail(source: &Path, thumb_path: &Path, max_edge: u32) -> anyhow::Result<()> {
  if thumb_path.is_file() {
    return Ok(());
  }
  let mut image = image::open(source)?;
  if image.width() > max_edge || image.height() > max_edge {
    image = image.resize(max_edge, max_edge, FilterType::Triangle);
  }
  let thumbs_dir = thumb_path.parent().ok_or_else(|| anyhow!("thumbnail path has no parent"))?;
  std::fs::create_dir_all(thumbs_dir)?;
  // Write to a temp file and rename, so a reader never sees a partial thumbnail.
  let temp = tempfile::NamedTempFile::new_in(thumbs_dir)?;
  {
    let mut writer = BufWriter::new(temp.as_file());
    JpegEncoder::new_with_quality(&mut writer, JPEG_QUALITY).encode_image(&image.to_rgb8())?;
    writer.flush()?;
  }
  temp.persist(thumb_path)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use image::{ImageReader, RgbImage, RgbaImage};
  use std::fs::{self, File};
  use std::time::{Duration, SystemTime};

  struct Dirs {
    _root: tempfile::TempDir,
    downloads: PathBuf,
    thumbs: PathBuf,
    outside: PathBuf,
  }

  fn dirs() -> Dirs {
    let root = tempfile::tempdir().unwrap();
    let downloads = root.path().join("downloads");
    let outside = root.path().join("outside");
    fs::create_dir_all(&downloads).unwrap();
    fs::create_dir_all(&outside).unwrap();
    let thumbs = root.path().join("temp").join("thumbs");
    Dirs { _root: root, downloads, thumbs, outside }
  }

  fn write_png(path: &Path, width: u32, height: u32) {
    RgbImage::from_pixel(width, height, image::Rgb([200, 100, 50])).save(path).unwrap();
  }

  fn dimensions(path: &Path) -> (u32, u32) {
    ImageReader::open(path).unwrap().with_guessed_format().unwrap().into_dimensions().unwrap()
  }

  #[tokio::test]
  async fn cache_miss_creates_thumbnail_and_hit_reuses_it() {
    let d = dirs();
    let source = d.downloads.join("a.png");
    write_png(&source, 50, 40);

    let first = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
    assert!(first.starts_with(&d.thumbs));
    assert!(first.is_file());

    fs::write(&first, b"cached").unwrap();
    let second = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
    assert_eq!(second, first);
    assert_eq!(fs::read(&second).unwrap(), b"cached");
  }

  #[tokio::test]
  async fn mtime_change_invalidates_cache() {
    let d = dirs();
    let source = d.downloads.join("a.png");
    write_png(&source, 50, 40);
    let base = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
    File::options().write(true).open(&source).unwrap().set_modified(base).unwrap();
    let first = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();

    File::options().write(true).open(&source).unwrap()
        .set_modified(base + Duration::from_secs(60)).unwrap();
    let second = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();

    assert_ne!(first, second);
    assert!(second.is_file());
  }

  #[tokio::test]
  async fn max_edge_is_part_of_the_cache_key() {
    let d = dirs();
    let source = d.downloads.join("a.png");
    write_png(&source, 500, 300);
    let small = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 64).await.unwrap();
    let large = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 128).await.unwrap();
    assert_ne!(small, large);
  }

  #[tokio::test]
  async fn path_outside_downloads_is_rejected() {
    let d = dirs();
    let outside = d.outside.join("a.png");
    write_png(&outside, 10, 10);
    let traversal = d.downloads.join("..").join("outside").join("a.png");

    assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &outside, 384).await.is_err());
    assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &traversal, 384).await.is_err());
    assert!(!d.thumbs.exists());
  }

  #[tokio::test]
  async fn non_image_and_missing_files_are_rejected() {
    let d = dirs();
    let text = d.downloads.join("notes.txt");
    fs::write(&text, b"hello").unwrap();
    let video = d.downloads.join("clip.mp4");
    fs::write(&video, b"not really").unwrap();
    let folder = d.downloads.join("folder.png");
    fs::create_dir(&folder).unwrap();

    for path in [text, video, folder, d.downloads.join("missing.png")] {
      assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &path, 384).await.is_err(), "{:?}", path);
    }
    assert!(!d.thumbs.exists());
  }

  #[tokio::test]
  async fn corrupt_image_fails_without_leaving_a_cache_file() {
    let d = dirs();
    let source = d.downloads.join("broken.png");
    fs::write(&source, b"not a png").unwrap();
    assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.is_err());
    let (_, thumb) = cached_thumb_path(&d.downloads, &d.thumbs, &source, 384).unwrap();
    assert!(!thumb.exists());
  }

  #[tokio::test]
  async fn longest_edge_is_scaled_to_max_edge() {
    let d = dirs();
    let wide = d.downloads.join("wide.png");
    write_png(&wide, 400, 100);
    let tall = d.downloads.join("tall.png");
    write_png(&tall, 90, 300);

    let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &wide, 64).await.unwrap();
    assert_eq!(dimensions(&thumb), (64, 16));
    let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &tall, 64).await.unwrap();
    let (width, height) = dimensions(&thumb);
    assert_eq!(height, 64);
    assert!(width <= 64);
  }

  #[tokio::test]
  async fn small_images_are_not_upscaled() {
    let d = dirs();
    let source = d.downloads.join("small.png");
    write_png(&source, 30, 20);
    let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
    assert_eq!(dimensions(&thumb), (30, 20));
  }

  #[test]
  fn image_extensions_are_case_insensitive() {
    for name in ["a.png", "b.JPG", "c.Jpeg", "d.WEBP"] {
      assert!(is_image(Path::new(name)), "{}", name);
    }
    for name in ["a.gif", "b.mp4", "png", "c.png.txt"] {
      assert!(!is_image(Path::new(name)), "{}", name);
    }
  }

  mod path_edge_cases {
    use super::*;

    #[tokio::test]
    async fn sibling_dir_sharing_the_downloads_prefix_is_rejected() {
      let d = dirs();
      let evil_dir = d.downloads.with_file_name("downloads_evil");
      fs::create_dir_all(&evil_dir).unwrap();
      let evil = evil_dir.join("a.png");
      write_png(&evil, 10, 10);
      assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &evil, 384).await.is_err());
      assert!(!d.thumbs.exists());
    }

    #[tokio::test]
    async fn nested_file_inside_downloads_is_accepted() {
      let d = dirs();
      let nested = d.downloads.join("2026").join("11");
      fs::create_dir_all(&nested).unwrap();
      let source = nested.join("a.jpg");
      write_image_as(&source, 20, 10, image::ImageFormat::Jpeg);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
      assert!(thumb.is_file());
    }

    #[tokio::test]
    async fn different_spellings_of_one_file_share_a_cache_entry() {
      let d = dirs();
      fs::create_dir_all(d.downloads.join("sub")).unwrap();
      let source = d.downloads.join("a.png");
      write_png(&source, 20, 10);
      let dotted = d.downloads.join(".").join("sub").join("..").join("a.png");
      // Windows also accepts a forward slash; on Unix this is the same path.
      let slashed = PathBuf::from(format!("{}/a.png", d.downloads.display()));

      let plain = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
      let via_dots = local_media_thumbnail(&d.downloads, &d.thumbs, &dotted, 384).await.unwrap();
      let via_slash = local_media_thumbnail(&d.downloads, &d.thumbs, &slashed, 384).await.unwrap();
      assert_eq!(plain, via_dots);
      assert_eq!(plain, via_slash);
      assert_eq!(thumb_files(&d.thumbs).len(), 1);
    }

    #[tokio::test]
    async fn downloads_dir_itself_is_rejected() {
      let d = dirs();
      assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &d.downloads, 384).await.is_err());
    }

    #[tokio::test]
    async fn missing_downloads_dir_is_rejected() {
      let d = dirs();
      let source = d.outside.join("a.png");
      write_png(&source, 10, 10);
      let missing = d.downloads.join("does_not_exist");
      assert!(local_media_thumbnail(&missing, &d.thumbs, &source, 384).await.is_err());
    }

    #[tokio::test]
    async fn empty_path_is_rejected() {
      let d = dirs();
      assert!(local_media_thumbnail(&d.downloads, &d.thumbs, Path::new(""), 384).await.is_err());
    }

    #[tokio::test]
    async fn deleted_source_is_rejected_even_if_a_thumbnail_was_cached() {
      let d = dirs();
      let source = d.downloads.join("a.png");
      write_png(&source, 20, 10);
      local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
      fs::remove_file(&source).unwrap();
      assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.is_err());
    }

    #[test]
    fn outside_path_is_rejected_before_any_cache_key_is_built() {
      let d = dirs();
      let source = d.outside.join("a.png");
      write_png(&source, 10, 10);
      assert!(cached_thumb_path(&d.downloads, &d.thumbs, &source, 384).is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn symlink_escaping_downloads_is_rejected() {
      let d = dirs();
      let target = d.outside.join("secret.png");
      write_png(&target, 10, 10);
      let link = d.downloads.join("link.png");
      std::os::unix::fs::symlink(&target, &link).unwrap();
      assert!(local_media_thumbnail(&d.downloads, &d.thumbs, &link, 384).await.is_err());
      assert!(!d.thumbs.exists());
    }
  }

  mod cache_edge_cases {
    use super::*;

    #[tokio::test]
    async fn size_change_with_same_mtime_invalidates_cache() {
      let d = dirs();
      let source = d.downloads.join("a.png");
      let mtime = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
      write_png(&source, 20, 10);
      File::options().write(true).open(&source).unwrap().set_modified(mtime).unwrap();
      let first = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();

      write_png(&source, 200, 100);
      File::options().write(true).open(&source).unwrap().set_modified(mtime).unwrap();
      let second = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();

      assert_ne!(first, second);
      assert_eq!(dimensions(&second), (200, 100));
    }

    #[tokio::test]
    async fn cache_file_name_is_an_opaque_hash() {
      let d = dirs();
      let source = d.downloads.join("My Holiday Photo.png");
      write_png(&source, 20, 10);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
      let name = thumb.file_name().unwrap().to_str().unwrap();
      assert_eq!(name.len(), "0123456789abcdef.jpg".len(), "{}", name);
      assert!(name.ends_with(".jpg"), "{}", name);
      assert!(name[..16].chars().all(|c| c.is_ascii_hexdigit()), "{}", name);
      assert_eq!(thumb.parent().unwrap(), d.thumbs.as_path());
    }

    #[tokio::test]
    async fn successful_generation_leaves_no_temp_files() {
      let d = dirs();
      let source = d.downloads.join("a.png");
      write_png(&source, 300, 200);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 64).await.unwrap();
      assert_eq!(thumb_files(&d.thumbs), vec![thumb]);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_requests_for_one_file_agree_on_one_cache_entry() {
      let d = dirs();
      let source = d.downloads.join("a.png");
      write_png(&source, 300, 200);

      let handles: Vec<_> = (0..4)
          .map(|_| {
            let (downloads, thumbs, source) = (d.downloads.clone(), d.thumbs.clone(), source.clone());
            tokio::spawn(async move { local_media_thumbnail(&downloads, &thumbs, &source, 64).await })
          })
          .collect();
      let mut results = Vec::new();
      for handle in handles {
        results.push(handle.await.unwrap().unwrap());
      }
      assert!(results.iter().all(|r| *r == results[0]));
      assert_eq!(thumb_files(&d.thumbs), vec![results[0].clone()]);
      let (width, height) = dimensions(&results[0]);
      assert_eq!(width, 64);
      assert!((42..=43).contains(&height), "{}", height);
    }
  }

  mod output_edge_cases {
    use super::*;

    #[tokio::test]
    async fn output_is_a_jpeg_even_for_png_input_with_alpha() {
      let d = dirs();
      let source = d.downloads.join("alpha.png");
      RgbaImage::from_pixel(40, 30, image::Rgba([10, 20, 30, 0])).save(&source).unwrap();
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
      assert_eq!(&fs::read(&thumb).unwrap()[..3], &[0xFF, 0xD8, 0xFF]);
      let format = ImageReader::open(&thumb).unwrap().with_guessed_format().unwrap().format();
      assert_eq!(format, Some(image::ImageFormat::Jpeg));
    }

    #[tokio::test]
    async fn uppercase_jpeg_extension_is_accepted() {
      let d = dirs();
      let source = d.downloads.join("PHOTO.JPEG");
      write_image_as(&source, 500, 250, image::ImageFormat::Jpeg);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 100).await.unwrap();
      assert_eq!(dimensions(&thumb), (100, 50));
    }

    #[tokio::test]
    async fn webp_input_is_accepted() {
      let d = dirs();
      let source = d.downloads.join("a.webp");
      write_image_as(&source, 120, 60, image::ImageFormat::WebP);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 60).await.unwrap();
      assert_eq!(dimensions(&thumb), (60, 30));
    }

    #[tokio::test]
    async fn square_image_scales_both_edges_to_max_edge() {
      let d = dirs();
      let source = d.downloads.join("square.png");
      write_png(&source, 800, 800);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
      assert_eq!(dimensions(&thumb), (384, 384));
    }

    #[tokio::test]
    async fn image_exactly_max_edge_keeps_its_size() {
      let d = dirs();
      let source = d.downloads.join("exact.png");
      write_png(&source, 384, 200);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 384).await.unwrap();
      assert_eq!(dimensions(&thumb), (384, 200));
    }

    #[tokio::test]
    async fn ai_image_size_scales_down_to_default_edge() {
      let d = dirs();
      let source = d.downloads.join("ai.png");
      write_png(&source, 2848, 1600);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, DEFAULT_MAX_EDGE).await.unwrap();
      let (width, height) = dimensions(&thumb);
      assert_eq!(width, 384);
      assert!((215..=216).contains(&height), "{}x{}", width, height);
    }

    #[tokio::test]
    async fn max_edge_of_one_produces_a_one_pixel_edge() {
      let d = dirs();
      let source = d.downloads.join("a.png");
      write_png(&source, 40, 20);
      let thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &source, 1).await.unwrap();
      let (width, height) = dimensions(&thumb);
      assert_eq!(width, 1);
      assert!(height <= 1);
    }

    #[test]
    fn defaults_match_the_spec() {
      assert_eq!(DEFAULT_MAX_EDGE, 384);
      assert_eq!(JPEG_QUALITY, 80);
    }
  }

  mod concurrency {
    use super::*;

    #[test]
    fn generation_semaphore_never_exceeds_two_permits() {
      // Other tests may hold permits briefly, so this is an upper bound.
      assert!(GENERATION_PERMITS.available_permits() <= 2);
    }

    #[tokio::test]
    async fn cache_miss_waits_for_a_permit_but_cache_hit_does_not() {
      let d = dirs();
      let cached = d.downloads.join("cached.png");
      write_png(&cached, 50, 40);
      let cached_thumb = local_media_thumbnail(&d.downloads, &d.thumbs, &cached, 384).await.unwrap();
      let fresh = d.downloads.join("fresh.png");
      write_png(&fresh, 50, 40);
      let (_, fresh_thumb) = cached_thumb_path(&d.downloads, &d.thumbs, &fresh, 384).unwrap();

      let all_permits = GENERATION_PERMITS.acquire_many(2).await.unwrap();
      assert_eq!(GENERATION_PERMITS.available_permits(), 0);

      let (downloads, thumbs) = (d.downloads.clone(), d.thumbs.clone());
      let pending = tokio::spawn(async move { local_media_thumbnail(&downloads, &thumbs, &fresh, 384).await });
      for _ in 0..20 {
        tokio::task::yield_now().await;
      }
      assert!(!pending.is_finished(), "generation ran without a permit");
      assert!(!fresh_thumb.exists());

      let hit = local_media_thumbnail(&d.downloads, &d.thumbs, &cached, 384).await.unwrap();
      assert_eq!(hit, cached_thumb);

      drop(all_permits);
      assert_eq!(pending.await.unwrap().unwrap(), fresh_thumb);
      assert!(fresh_thumb.is_file());
    }
  }

  mod branding {
    use super::*;

    #[test]
    fn error_message_has_no_upstream_brand() {
      let source = include_str!("local_media_thumbnail_command.rs");
      let error_line = source.lines().find(|l| l.contains("\"thumbnail failed\"")).unwrap();
      for brand in ["ArtCraft", "Artcraft", "ARTCRAFT", "getartcraft", "storyteller", "fakeyou", "LTX", "Lightricks"] {
        assert!(!error_line.contains(brand), "{}", brand);
      }
    }
  }

  fn write_image_as(path: &Path, width: u32, height: u32, format: image::ImageFormat) {
    RgbImage::from_pixel(width, height, image::Rgb([200, 100, 50])).save_with_format(path, format).unwrap();
  }

  fn thumb_files(thumbs: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(thumbs).unwrap().map(|e| e.unwrap().path()).collect();
    files.sort();
    files
  }
}
