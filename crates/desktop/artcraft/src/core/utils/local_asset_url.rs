use reqwest::Url;
use std::path::Path;

/// The URL the webview loads a local file from, matching the frontend's
/// `convertFileSrc` (Tauri asset protocol): `http://asset.localhost/<path>`
/// on Windows, `asset://localhost/<path>` elsewhere, with the path encoded
/// like `encodeURIComponent`.
pub fn local_asset_url(path: &Path) -> Url {
  let base = if cfg!(windows) { "http://asset.localhost/" } else { "asset://localhost/" };
  let encoded = encode_uri_component(&path.to_string_lossy());
  Url::parse(&format!("{}{}", base, encoded)).expect("asset URL from an encoded path is always valid")
}

fn encode_uri_component(value: &str) -> String {
  let mut out = String::with_capacity(value.len() * 3);
  for byte in value.bytes() {
    match byte {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => {
        out.push(byte as char)
      }
      _ => out.push_str(&format!("%{:02X}", byte)),
    }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn encodes_like_encode_uri_component() {
    assert_eq!(encode_uri_component("C:\\Users\\hp\\Artcraft\\downloads\\a b.png"),
      "C%3A%5CUsers%5Chp%5CArtcraft%5Cdownloads%5Ca%20b.png");
    assert_eq!(encode_uri_component("/home/u/Artcraft/downloads/x.png"), "%2Fhome%2Fu%2FArtcraft%2Fdownloads%2Fx.png");
    assert_eq!(encode_uri_component("é"), "%C3%A9");
    assert_eq!(encode_uri_component("seedream_20261105_101010_123.png"), "seedream_20261105_101010_123.png");
  }

  #[test]
  fn asset_url_uses_the_platform_asset_host() {
    let url = local_asset_url(Path::new("downloads/seedream_1.png"));
    if cfg!(windows) {
      assert_eq!(url.as_str(), "http://asset.localhost/downloads%2Fseedream_1.png");
    } else {
      assert_eq!(url.as_str(), "asset://localhost/downloads%2Fseedream_1.png");
    }
  }
}
