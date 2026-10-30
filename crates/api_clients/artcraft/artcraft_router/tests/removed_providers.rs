//! A2a: the kinovi and midjourney provider clients are gone from the router,
//! and download errors no longer depend on the old scraper HTTP client.
//!
//! These tests read the crate's own sources from disk (no network) and check
//! that the `KinoviWeb` / `Midjourney` providers, which are still accepted as
//! `RouterProvider` values, now fall through to the "unsupported" error.

use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

use artcraft_router::api::router_audio_model::RouterAudioModel;
use artcraft_router::api::router_image_model::RouterImageModel;
use artcraft_router::api::router_provider::RouterProvider;
use artcraft_router::api::router_video_model::RouterVideoModel;
use artcraft_router::client::request_mismatch_mitigation_strategy::RequestMismatchMitigationStrategy;
use artcraft_router::errors::artcraft_router_error::ArtcraftRouterError;
use artcraft_router::errors::download_error::DownloadError;
use artcraft_router::generate::generate_audio::generate_audio_request_builder::GenerateAudioRequestBuilder;
use artcraft_router::generate::generate_image::generate_image_request_builder::GenerateImageRequestBuilder;
use artcraft_router::generate::generate_video::generate_video_request_builder::GenerateVideoRequestBuilder;

// Built by concatenation so this file never matches its own scan.
fn forbidden_crate_names() -> [String; 3] {
  [
    ["kinovi", "_web_client"].concat(),
    ["midjourney", "_client"].concat(),
    ["w", "req"].concat(),
  ]
}

const DELETED_PATHS: &[&str] = &[
  "src/client/router_kinovi_web_client.rs",
  "src/client/router_midjourney_client.rs",
  "src/generate/generate_audio/providers/kinovi",
  "src/generate/generate_image/providers/kinovi",
  "src/generate/generate_image/providers/midjourney",
  "src/generate/generate_video/providers/kinovi",
];

mod source_scan_tests {
  use super::*;

  #[test]
  fn no_rust_source_references_removed_crates() {
    let mut hits = Vec::new();
    for file in rust_files(&crate_root().join("src")) {
      let text = fs::read_to_string(&file).expect("read source file");
      for (line_no, line) in text.lines().enumerate() {
        for name in forbidden_crate_names() {
          if line.contains(&name) {
            hits.push(format!("{}:{}: {}", file.display(), line_no + 1, line.trim()));
          }
        }
      }
    }
    assert!(hits.is_empty(), "removed crates still referenced:\n{}", hits.join("\n"));
  }

  #[test]
  fn cargo_toml_has_no_removed_dependencies() {
    let toml = fs::read_to_string(crate_root().join("Cargo.toml")).expect("read Cargo.toml");
    let dep_names: Vec<&str> = toml
      .lines()
      .map(str::trim)
      .filter(|l| !l.starts_with('#') && !l.starts_with('['))
      .filter_map(|l| l.split(['.', '=', ' ']).next())
      .filter(|n| !n.is_empty())
      .collect();
    for name in forbidden_crate_names().iter().chain([["w", "req-util"].concat()].iter()) {
      assert!(!dep_names.contains(&name.as_str()), "Cargo.toml still depends on `{name}`");
      assert!(!toml.contains(name.as_str()), "Cargo.toml still mentions `{name}`");
    }
  }

  #[test]
  fn deleted_provider_paths_do_not_exist() {
    for rel in DELETED_PATHS {
      let path = crate_root().join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
      assert!(!path.exists(), "expected `{rel}` to be deleted");
    }
  }

  #[test]
  fn provider_mod_files_do_not_declare_removed_modules() {
    for kind in ["generate_audio", "generate_image", "generate_video"] {
      let path = crate_root().join("src").join("generate").join(kind).join("providers").join("mod.rs");
      let text = fs::read_to_string(&path).expect("read providers/mod.rs");
      for line in text.lines().map(str::trim) {
        assert!(
          !(line.contains("mod kinovi") || line.contains("mod midjourney")),
          "{} still declares `{line}`",
          path.display(),
        );
      }
    }
  }

  #[test]
  fn client_mod_does_not_declare_removed_clients() {
    let text = fs::read_to_string(crate_root().join("src").join("client").join("mod.rs")).expect("read client/mod.rs");
    assert!(!text.contains("router_kinovi_web_client"));
    assert!(!text.contains("router_midjourney_client"));
  }

  #[test]
  fn removed_kinovi_price_comparison_tests_are_gone() {
    for model in ["seedream_5p0_pro", "seedream_5p0_pro_ultra"] {
      let path = crate_root()
        .join("src").join("generate").join("generate_image").join("providers")
        .join("artcraft").join(model).join("cost.rs");
      let text = fs::read_to_string(&path).expect("read cost.rs");
      assert!(!text.contains("price_covers_kinovi_cost"), "{model}/cost.rs still has the kinovi test");
      assert!(text.contains("#[test]"), "{model}/cost.rs lost all of its other tests");
    }
  }

  #[test]
  fn seedance_common_defines_billing_bounds_locally() {
    let path = crate_root()
      .join("src").join("generate").join("generate_video").join("providers")
      .join("artcraft").join("seedance_common.rs");
    let text = fs::read_to_string(&path).expect("read seedance_common.rs");
    assert!(text.contains("const MIN_BILLED_INPUT_SECONDS: u8 = 4;"));
    assert!(text.contains("const MAX_BILLED_INPUT_SECONDS: u8 = 30;"));
  }
}

mod download_error_tests {
  use super::*;

  #[test]
  fn bad_status_display_includes_url_and_status() {
    let err = DownloadError::BadStatus { url: "https://example.test/a.mp4".to_string(), status_code: 404 };
    assert_eq!(err.to_string(), "Download failed for https://example.test/a.mp4 with status 404");
  }

  #[test]
  fn bad_status_display_handles_empty_url_and_windows_path() {
    let empty = DownloadError::BadStatus { url: String::new(), status_code: 0 };
    assert_eq!(empty.to_string(), "Download failed for  with status 0");

    let windows = DownloadError::BadStatus { url: r"C:\Users\me\clip.mp4".to_string(), status_code: 500 };
    assert!(windows.to_string().contains(r"C:\Users\me\clip.mp4"));
  }

  #[test]
  fn is_a_std_error_with_no_source() {
    let err: Box<dyn Error> = Box::new(DownloadError::BadStatus { url: "u".to_string(), status_code: 503 });
    assert!(err.source().is_none());
  }

  #[test]
  fn only_reqwest_and_status_variants_remain() {
    // Exhaustive match: adding back a non-reqwest transport variant breaks this.
    fn variant_name(err: &DownloadError) -> &'static str {
      match err {
        DownloadError::BadStatus { .. } => "bad_status",
        DownloadError::ReqwestDownload { .. } => "reqwest",
      }
    }
    let err = DownloadError::BadStatus { url: "u".to_string(), status_code: 418 };
    assert_eq!(variant_name(&err), "bad_status");
  }
}

mod removed_provider_dispatch_tests {
  use super::*;

  #[test]
  fn image_models_via_removed_providers_are_unsupported() {
    for provider in [RouterProvider::KinoviWeb, RouterProvider::Midjourney] {
      for model in [
        RouterImageModel::Midjourney7,
        RouterImageModel::Midjourney7Niji,
        RouterImageModel::Midjourney8,
        RouterImageModel::Seedream5p0Pro,
        RouterImageModel::NanoBanana,
      ] {
        let result = image_builder(provider, model).build2();
        assert!(
          matches!(result, Err(ArtcraftRouterError::UnsupportedProviderAndModelForNewApi(_))),
          "expected unsupported error for {provider:?} + {model:?}",
        );
      }
    }
  }

  #[test]
  fn artcraft_midjourney_models_still_dispatch() {
    // The ArtCraft-hosted Midjourney models are not the removed provider.
    for model in [RouterImageModel::Midjourney7, RouterImageModel::Midjourney7Niji, RouterImageModel::Midjourney8] {
      let result = image_builder(RouterProvider::Artcraft, model).build2();
      assert!(
        !matches!(result, Err(ArtcraftRouterError::UnsupportedProviderAndModelForNewApi(_))),
        "Artcraft + {model:?} should still be routed",
      );
    }
  }

  #[test]
  fn video_models_via_removed_providers_are_unsupported() {
    for provider in [RouterProvider::KinoviWeb, RouterProvider::Midjourney] {
      for model in [
        RouterVideoModel::Seedance2p0,
        RouterVideoModel::Seedance2p5,
        RouterVideoModel::Seedance2p5Ultra,
        RouterVideoModel::Kling3p0Pro,
      ] {
        let result = GenerateVideoRequestBuilder {
          provider,
          model,
          prompt: Some("a corgi on a skateboard".to_string()),
          duration_seconds: Some(5),
          ..Default::default()
        }
        .build2();
        assert!(
          matches!(result, Err(ArtcraftRouterError::UnsupportedProviderAndModelForNewApi(_))),
          "expected unsupported error for {provider:?} + {model:?}",
        );
      }
    }
  }

  #[test]
  fn audio_models_via_removed_providers_are_unsupported() {
    for provider in [RouterProvider::KinoviWeb, RouterProvider::Midjourney] {
      for model in [
        RouterAudioModel::SunoMusic,
        RouterAudioModel::SunoRemix,
        RouterAudioModel::SunoSounds,
        RouterAudioModel::SunoSample,
        RouterAudioModel::SeedAudio1p0,
      ] {
        let label = format!("{provider:?} + {model:?}");
        let result = GenerateAudioRequestBuilder {
          provider,
          model,
          prompt: Some("a song about corgis".to_string()),
          ..Default::default()
        }
        .build2();
        assert!(
          matches!(result, Err(ArtcraftRouterError::UnsupportedProviderAndModelForNewApi(_))),
          "expected unsupported error for {label}",
        );
      }
    }
  }

  #[test]
  fn unsupported_error_message_names_the_provider() {
    let result = image_builder(RouterProvider::KinoviWeb, RouterImageModel::Midjourney7).build2();
    match result {
      Err(ArtcraftRouterError::UnsupportedProviderAndModelForNewApi(msg)) => {
        assert!(msg.contains("KinoviWeb"), "message: {msg}");
        assert!(msg.contains("Midjourney7"), "message: {msg}");
      }
      _ => panic!("expected UnsupportedProviderAndModelForNewApi"),
    }
  }
}

// ── Helpers ──

fn crate_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn rust_files(dir: &Path) -> Vec<PathBuf> {
  let mut out = Vec::new();
  let mut stack = vec![dir.to_path_buf()];
  while let Some(d) = stack.pop() {
    for entry in fs::read_dir(&d).expect("read_dir") {
      let path = entry.expect("dir entry").path();
      if path.is_dir() {
        stack.push(path);
      } else if path.extension().is_some_and(|e| e == "rs") {
        out.push(path);
      }
    }
  }
  assert!(!out.is_empty(), "no .rs files found under {}", dir.display());
  out
}

fn image_builder(provider: RouterProvider, model: RouterImageModel) -> GenerateImageRequestBuilder {
  GenerateImageRequestBuilder {
    model,
    provider,
    prompt: Some("a corgi wearing a hat".to_string()),
    image_inputs: None,
    resolution: None,
    aspect_ratio: None,
    quality: None,
    image_batch_count: None,
    horizontal_angle: None,
    vertical_angle: None,
    zoom: None,
    request_mismatch_mitigation_strategy: RequestMismatchMitigationStrategy::PayMoreUpgrade,
    generation_mode_mismatch_strategy: None,
    idempotency_token: None,
  }
}
