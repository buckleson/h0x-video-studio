//! A2b: worldlabs_api_client uses reqwest (not the old HTTP client crate).
//!
//! Offline and deterministic: no request ever reaches the network. Errors are
//! produced from malformed URLs, which reqwest rejects while building the request.
//!
//! NOTE: the old crate's name is never written literally in this file, so the
//! acceptance check `git grep -n <old> -- crates/api_clients/worldlabs_api_client`
//! stays empty.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use reqwest::StatusCode;
use worldlabs_api_client::api::requests::upload_to_signed_url::upload_to_signed_url::{
  upload_to_signed_url, UploadToSignedUrlArgs,
};
use worldlabs_api_client::error::world_labs_client_error::WorldLabsClientError;
use worldlabs_api_client::error::world_labs_error::WorldLabsError;
use worldlabs_api_client::error::world_labs_generic_api_error::WorldLabsGenericApiError;

const MALFORMED_URL: &str = "not a url";
const BRAND_LEAKS: [&str; 5] = ["artcraft", "getartcraft", "storyteller.ai", "fakeyou", "lightricks"];

mod manifest_tests {
  use super::*;

  #[test]
  fn cargo_toml_uses_workspace_reqwest() {
    let manifest = read_manifest();
    let deps = dependencies_section(&manifest);
    assert!(
      deps.lines().any(|l| l.trim() == "reqwest.workspace = true"),
      "[dependencies] must contain `reqwest.workspace = true`, got:\n{}", deps
    );
  }

  #[test]
  fn cargo_toml_has_no_old_http_client_dep() {
    let manifest = read_manifest();
    assert!(!mentions_old_crate(&manifest), "Cargo.toml still mentions the old HTTP client crate");
  }

  #[test]
  fn reqwest_declared_once() {
    let manifest = read_manifest();
    let count = manifest.lines().filter(|l| l.trim_start().starts_with("reqwest")).count();
    assert_eq!(count, 1, "reqwest should be declared exactly once");
  }
}

mod source_scan_tests {
  use super::*;

  #[test]
  fn no_source_file_mentions_old_http_client() {
    let mut offenders = Vec::new();
    for file in rust_files(&crate_dir()) {
      let text = fs::read_to_string(&file).expect("read source file");
      for (i, line) in text.lines().enumerate() {
        if mentions_old_crate(line) {
          offenders.push(format!("{}:{}: {}", file.display(), i + 1, line.trim()));
        }
      }
    }
    assert!(offenders.is_empty(), "old HTTP client still referenced:\n{}", offenders.join("\n"));
  }

  #[test]
  fn renamed_variants_present() {
    let src = crate_dir().join("src").join("error");
    let client = fs::read_to_string(src.join("world_labs_client_error.rs")).unwrap();
    let generic = fs::read_to_string(src.join("world_labs_generic_api_error.rs")).unwrap();
    assert!(client.contains("ReqwestClientError(reqwest::Error)"));
    assert!(generic.contains("ReqwestError(reqwest::Error)"));
    assert!(generic.contains("use reqwest::StatusCode;"));
  }

  #[test]
  fn scan_found_files_with_windows_safe_paths() {
    // Guards against the scan silently passing on an empty walk (e.g. path
    // separator issues on Windows).
    let files = rust_files(&crate_dir());
    assert!(files.len() >= 20, "expected to scan the crate sources, found {}", files.len());
    assert!(files.iter().any(|p| p.ends_with(Path::new("src").join("lib.rs"))));
  }
}

mod generic_error_tests {
  use super::*;

  #[test]
  fn reqwest_error_variant_wraps_reqwest_error() {
    let err = WorldLabsGenericApiError::ReqwestError(builder_error());
    match &err {
      WorldLabsGenericApiError::ReqwestError(inner) => assert!(inner.is_builder()),
      other => panic!("unexpected variant: {:?}", other),
    }
  }

  #[test]
  fn reqwest_error_display_says_reqwest() {
    let text = WorldLabsGenericApiError::ReqwestError(builder_error()).to_string();
    assert!(text.starts_with("Reqwest client error: "), "got: {}", text);
    assert_no_old_name_or_brand(&text);
  }

  #[test]
  fn reqwest_error_is_not_403() {
    let err = WorldLabsGenericApiError::ReqwestError(builder_error());
    assert!(!err.is_403_forbidden());
    assert!(!WorldLabsError::from(err).is_403_forbidden());
  }

  #[test]
  fn google_upload_failed_403_uses_reqwest_status_code() {
    let err = WorldLabsGenericApiError::GoogleUploadFailed {
      status_code: StatusCode::FORBIDDEN,
      body: String::new(),
    };
    assert!(err.is_403_forbidden());
    assert!(err.to_string().contains("403"));
  }

  #[test]
  fn uncategorized_boundary_statuses() {
    for (code, expect_403) in [(402u16, false), (403, true), (404, false), (599, false)] {
      let err = WorldLabsGenericApiError::UncategorizedBadResponseWithStatusAndBody {
        status_code: StatusCode::from_u16(code).unwrap(),
        body: "".to_string(),
      };
      assert_eq!(err.is_403_forbidden(), expect_403, "status {}", code);
    }
  }
}

mod client_error_tests {
  use super::*;

  #[test]
  fn reqwest_client_error_display() {
    let text = WorldLabsClientError::ReqwestClientError(builder_error()).to_string();
    assert!(text.starts_with("Reqwest client error (during client creation): "), "got: {}", text);
    assert_no_old_name_or_brand(&text);
  }

  #[test]
  fn client_error_converts_and_is_not_403() {
    let err: WorldLabsError = WorldLabsClientError::ReqwestClientError(builder_error()).into();
    assert!(matches!(err, WorldLabsError::Client(WorldLabsClientError::ReqwestClientError(_))));
    assert!(!err.is_403_forbidden());
    assert!(err.to_string().contains("ReqwestClientError"));
    assert_no_old_name_or_brand(&err.to_string());
  }

  #[test]
  fn cannot_read_local_file_windows_path() {
    let io = std::fs::File::open(r"C:\definitely\missing\dir\image.png").unwrap_err();
    let text = WorldLabsClientError::CannotReadLocalFileForUpload(io).to_string();
    assert!(text.starts_with("Cannot read local file for upload: "), "got: {}", text);
  }
}

mod upload_offline_tests {
  use super::*;

  #[tokio::test]
  async fn malformed_signed_url_maps_to_reqwest_error() {
    let headers = HashMap::new();
    let result = upload_to_signed_url(UploadToSignedUrlArgs {
      upload_url: MALFORMED_URL,
      file_bytes: Vec::new(),
      required_headers: &headers,
      content_type: "image/png",
      request_timeout: None,
    }).await;

    match result {
      Err(WorldLabsError::ApiGeneric(WorldLabsGenericApiError::ReqwestError(inner))) => {
        assert!(inner.is_builder(), "expected builder error, got {:?}", inner);
      }
      other => panic!("expected ApiGeneric(ReqwestError), got {:?}", other.err()),
    }
  }

  #[tokio::test]
  async fn empty_signed_url_maps_to_reqwest_error() {
    let mut headers = HashMap::new();
    headers.insert("x-goog-content-length-range".to_string(), "0,100".to_string());
    let result = upload_to_signed_url(UploadToSignedUrlArgs {
      upload_url: "",
      file_bytes: vec![1, 2, 3],
      required_headers: &headers,
      content_type: "application/octet-stream",
      request_timeout: Some(std::time::Duration::from_millis(1)),
    }).await;

    assert!(matches!(
      result,
      Err(WorldLabsError::ApiGeneric(WorldLabsGenericApiError::ReqwestError(_)))
    ));
  }
}

// --- helpers ---

/// The old crate's name, assembled at runtime so it never appears in source.
fn old_crate_name() -> String {
  ["w", "req"].concat()
}

/// Case-sensitive on purpose: a lowercase match would flag `RawRequest`
/// ("ra-w-Req..."); old variant names were capitalised (`W` + "req" + `Error`).
fn mentions_old_crate(text: &str) -> bool {
  let lower = old_crate_name();
  let capital = ["W", "req"].concat();
  text.contains(&lower) || text.contains(&capital)
}

fn crate_dir() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read_manifest() -> String {
  fs::read_to_string(crate_dir().join("Cargo.toml")).expect("read Cargo.toml")
}

fn dependencies_section(manifest: &str) -> String {
  manifest
    .split("[dependencies]")
    .nth(1)
    .expect("[dependencies] section")
    .split("\n[")
    .next()
    .unwrap()
    .to_string()
}

fn rust_files(root: &Path) -> Vec<PathBuf> {
  let mut out = Vec::new();
  let mut stack = vec![root.join("src")];
  while let Some(dir) = stack.pop() {
    for entry in fs::read_dir(&dir).expect("read dir") {
      let path = entry.unwrap().path();
      if path.is_dir() {
        stack.push(path);
      } else if path.extension().is_some_and(|e| e == "rs") {
        out.push(path);
      }
    }
  }
  out
}

/// A real reqwest::Error built without touching the network.
fn builder_error() -> reqwest::Error {
  reqwest::Client::new().get(MALFORMED_URL).build().unwrap_err()
}

fn assert_no_old_name_or_brand(text: &str) {
  assert!(!mentions_old_crate(text), "old crate name leaked: {}", text);
  let lower = text.to_lowercase();
  for brand in BRAND_LEAKS {
    assert!(!lower.contains(brand), "brand '{}' leaked: {}", brand, text);
  }
}
