use serde_derive::{Deserialize, Serialize};
use crate::core::providers::credentials::provider_credential_type::ProviderCredentialType;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderCredentialKey {

  // ========== API KEYS==========

  BytePlusApiKey,
  FalApiKey,
  ReplicateApiKey,

  // ========== WEB LOGINS ==========

  GrokWebLogin,
  HiggsfieldWebLogin,
  MidjourneyLogin,
  RunwayWebLogin,
}


impl ProviderCredentialKey {
  pub fn get_type(&self) -> ProviderCredentialType {
    match self {
      // Api keys
      Self::BytePlusApiKey => ProviderCredentialType::ApiKey,
      Self::FalApiKey => ProviderCredentialType::ApiKey,
      Self::ReplicateApiKey => ProviderCredentialType::ApiKey,
      // Web logins
      Self::GrokWebLogin => ProviderCredentialType::WebLogin,
      Self::HiggsfieldWebLogin => ProviderCredentialType::WebLogin,
      Self::MidjourneyLogin => ProviderCredentialType::WebLogin,
      Self::RunwayWebLogin => ProviderCredentialType::WebLogin,
    }
  }

  pub fn get_filename(&self) -> &'static str {
    match self {
      // Api keys
      ProviderCredentialKey::BytePlusApiKey => "byteplus.api_key.txt",
      ProviderCredentialKey::FalApiKey => "fal.api_key.txt",
      ProviderCredentialKey::ReplicateApiKey => "replicate.api_key.txt",
      // Web logins
      ProviderCredentialKey::GrokWebLogin => "grok.web_login.toml",
      ProviderCredentialKey::HiggsfieldWebLogin => "higgsfield.web_login.toml",
      ProviderCredentialKey::MidjourneyLogin => "midjourney.web_login.toml",
      ProviderCredentialKey::RunwayWebLogin => "runway.web_login.toml",
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const ALL_KEYS: [ProviderCredentialKey; 7] = [
    ProviderCredentialKey::BytePlusApiKey,
    ProviderCredentialKey::FalApiKey,
    ProviderCredentialKey::ReplicateApiKey,
    ProviderCredentialKey::GrokWebLogin,
    ProviderCredentialKey::HiggsfieldWebLogin,
    ProviderCredentialKey::MidjourneyLogin,
    ProviderCredentialKey::RunwayWebLogin,
  ];

  #[test]
  fn byteplus_maps_to_byteplus_api_key_file() {
    assert_eq!(ProviderCredentialKey::BytePlusApiKey.get_filename(), "byteplus.api_key.txt");
  }

  #[test]
  fn byteplus_is_an_api_key_type() {
    assert!(matches!(ProviderCredentialKey::BytePlusApiKey.get_type(), ProviderCredentialType::ApiKey));
  }

  #[test]
  fn byteplus_serde_round_trip() {
    let json = serde_json::to_string(&ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(json, "\"byte_plus_api_key\"");
    let back: ProviderCredentialKey = serde_json::from_str(&json).unwrap();
    assert_eq!(back, ProviderCredentialKey::BytePlusApiKey);
  }

  #[test]
  fn filenames_are_unique() {
    let mut names: Vec<&str> = ALL_KEYS.iter().map(|k| k.get_filename()).collect();
    names.sort();
    names.dedup();
    assert_eq!(names.len(), ALL_KEYS.len());
  }

  #[test]
  fn filenames_are_bare_names_without_path_parts() {
    for key in ALL_KEYS {
      let name = key.get_filename();
      assert!(!name.contains('/') && !name.contains('\\'), "{:?} -> {}", key, name);
      assert!(!name.contains(".."), "{:?} -> {}", key, name);
      assert!(!name.trim().is_empty());
    }
  }

  #[test]
  fn api_key_files_use_api_key_txt_suffix() {
    for key in ALL_KEYS {
      if matches!(key.get_type(), ProviderCredentialType::ApiKey) {
        assert!(key.get_filename().ends_with(".api_key.txt"), "{:?}", key);
      }
    }
  }

  #[test]
  fn byteplus_filename_has_no_brand_leak() {
    let name = ProviderCredentialKey::BytePlusApiKey.get_filename().to_lowercase();
    for banned in ["artcraft", "storyteller", "fakeyou"] {
      assert!(!name.contains(banned), "{} contains {}", name, banned);
    }
  }
}


