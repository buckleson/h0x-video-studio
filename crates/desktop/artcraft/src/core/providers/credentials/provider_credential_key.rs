use serde_derive::{Deserialize, Serialize};
use crate::core::providers::credentials::provider_credential_type::ProviderCredentialType;
use crate::core::providers::modality_defaults::Modality;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderCredentialKey {

  // ========== API KEYS==========

  BytePlusApiKey,
  OpenAiApiKey,
  AnthropicApiKey,
  GeminiApiKey,
  HiggsfieldApiKey,
  FalApiKey,
  ReplicateApiKey,
  HuggingFaceApiKey,
  OpenRouterApiKey,
  MinimaxApiKey,
  KlingApiKey,
  RunwayApiKey,
  LumaApiKey,
  ElevenLabsApiKey,

  // ========== WEB LOGINS ==========

  GrokWebLogin,
  HiggsfieldWebLogin,
  MidjourneyLogin,
  RunwayWebLogin,
}


impl ProviderCredentialKey {
  pub const ALL: [ProviderCredentialKey; 18] = [
    Self::BytePlusApiKey,
    Self::OpenAiApiKey,
    Self::AnthropicApiKey,
    Self::GeminiApiKey,
    Self::HiggsfieldApiKey,
    Self::FalApiKey,
    Self::ReplicateApiKey,
    Self::HuggingFaceApiKey,
    Self::OpenRouterApiKey,
    Self::MinimaxApiKey,
    Self::KlingApiKey,
    Self::RunwayApiKey,
    Self::LumaApiKey,
    Self::ElevenLabsApiKey,
    Self::GrokWebLogin,
    Self::HiggsfieldWebLogin,
    Self::MidjourneyLogin,
    Self::RunwayWebLogin,
  ];

  pub fn from_provider_id(id: &str) -> Option<Self> {
    Self::ALL.into_iter().find(|key| key.provider_id() == id)
  }

  /// Stable id the frontend uses (`provider` in requests, `id` in listings).
  pub fn provider_id(&self) -> &'static str {
    match self {
      Self::BytePlusApiKey => "byteplus",
      Self::OpenAiApiKey => "openai",
      Self::AnthropicApiKey => "anthropic",
      Self::GeminiApiKey => "gemini",
      Self::HiggsfieldApiKey => "higgsfield",
      Self::FalApiKey => "fal",
      Self::ReplicateApiKey => "replicate",
      Self::HuggingFaceApiKey => "huggingface",
      Self::OpenRouterApiKey => "openrouter",
      Self::MinimaxApiKey => "minimax",
      Self::KlingApiKey => "kling",
      Self::RunwayApiKey => "runway",
      Self::LumaApiKey => "luma",
      Self::ElevenLabsApiKey => "elevenlabs",
      Self::GrokWebLogin => "grok_web_login",
      Self::HiggsfieldWebLogin => "higgsfield_web_login",
      Self::MidjourneyLogin => "midjourney_login",
      Self::RunwayWebLogin => "runway_web_login",
    }
  }

  pub fn display_name(&self) -> &'static str {
    match self {
      Self::BytePlusApiKey => "BytePlus",
      Self::OpenAiApiKey => "OpenAI",
      Self::AnthropicApiKey => "Anthropic",
      Self::GeminiApiKey => "Google Gemini",
      Self::HiggsfieldApiKey => "Higgsfield",
      Self::FalApiKey => "fal",
      Self::ReplicateApiKey => "Replicate",
      Self::HuggingFaceApiKey => "Hugging Face",
      Self::OpenRouterApiKey => "OpenRouter",
      Self::MinimaxApiKey => "MiniMax",
      Self::KlingApiKey => "Kling",
      Self::RunwayApiKey => "Runway",
      Self::LumaApiKey => "Luma",
      Self::ElevenLabsApiKey => "ElevenLabs",
      Self::GrokWebLogin => "Grok (web login)",
      Self::HiggsfieldWebLogin => "Higgsfield (web login)",
      Self::MidjourneyLogin => "Midjourney (web login)",
      Self::RunwayWebLogin => "Runway (web login)",
    }
  }

  pub fn modalities(&self) -> &'static [Modality] {
    use Modality::*;
    match self {
      Self::BytePlusApiKey => &[Image, Video],
      Self::OpenAiApiKey => &[Llm, Image, Audio],
      Self::AnthropicApiKey => &[Llm],
      Self::GeminiApiKey => &[Llm, Image, Video],
      Self::HiggsfieldApiKey => &[Image, Video],
      Self::FalApiKey => &[Image, Video, Audio],
      Self::ReplicateApiKey => &[Image, Video, Audio],
      Self::HuggingFaceApiKey => &[Llm, Image],
      Self::OpenRouterApiKey => &[Llm],
      Self::MinimaxApiKey => &[Llm, Video, Audio],
      Self::KlingApiKey => &[Image, Video],
      Self::RunwayApiKey => &[Video],
      Self::LumaApiKey => &[Image, Video],
      Self::ElevenLabsApiKey => &[Audio],
      Self::GrokWebLogin => &[Image, Video],
      Self::HiggsfieldWebLogin => &[Image, Video],
      Self::MidjourneyLogin => &[Image],
      Self::RunwayWebLogin => &[Video],
    }
  }

  pub fn get_type(&self) -> ProviderCredentialType {
    match self {
      Self::GrokWebLogin
      | Self::HiggsfieldWebLogin
      | Self::MidjourneyLogin
      | Self::RunwayWebLogin => ProviderCredentialType::WebLogin,
      _ => ProviderCredentialType::ApiKey,
    }
  }

  pub fn get_filename(&self) -> &'static str {
    match self {
      // Api keys
      ProviderCredentialKey::BytePlusApiKey => "byteplus.api_key.txt",
      ProviderCredentialKey::OpenAiApiKey => "openai.api_key.txt",
      ProviderCredentialKey::AnthropicApiKey => "anthropic.api_key.txt",
      ProviderCredentialKey::GeminiApiKey => "gemini.api_key.txt",
      ProviderCredentialKey::HiggsfieldApiKey => "higgsfield.api_key.txt",
      ProviderCredentialKey::FalApiKey => "fal.api_key.txt",
      ProviderCredentialKey::ReplicateApiKey => "replicate.api_key.txt",
      ProviderCredentialKey::HuggingFaceApiKey => "huggingface.api_key.txt",
      ProviderCredentialKey::OpenRouterApiKey => "openrouter.api_key.txt",
      ProviderCredentialKey::MinimaxApiKey => "minimax.api_key.txt",
      ProviderCredentialKey::KlingApiKey => "kling.api_key.txt",
      ProviderCredentialKey::RunwayApiKey => "runway.api_key.txt",
      ProviderCredentialKey::LumaApiKey => "luma.api_key.txt",
      ProviderCredentialKey::ElevenLabsApiKey => "elevenlabs.api_key.txt",
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

  const ALL_KEYS: [ProviderCredentialKey; 18] = ProviderCredentialKey::ALL;

  #[test]
  fn contract_provider_ids_resolve_to_api_keys() {
    let ids = [
      "byteplus", "openai", "anthropic", "gemini", "higgsfield", "fal", "replicate",
      "huggingface", "openrouter", "minimax", "kling", "runway", "luma", "elevenlabs",
    ];
    for id in ids {
      let key = ProviderCredentialKey::from_provider_id(id).unwrap_or_else(|| panic!("{} missing", id));
      assert_eq!(key.provider_id(), id);
      assert!(matches!(key.get_type(), ProviderCredentialType::ApiKey), "{}", id);
    }
  }

  #[test]
  fn provider_ids_are_unique_and_round_trip() {
    let mut ids: Vec<&str> = ALL_KEYS.iter().map(|k| k.provider_id()).collect();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), ALL_KEYS.len());
    for key in ALL_KEYS {
      assert_eq!(ProviderCredentialKey::from_provider_id(key.provider_id()), Some(key));
    }
  }

  #[test]
  fn unknown_and_legacy_serde_names_are_not_provider_ids() {
    assert_eq!(ProviderCredentialKey::from_provider_id("byte_plus_api_key"), None);
    assert_eq!(ProviderCredentialKey::from_provider_id(""), None);
    assert_eq!(ProviderCredentialKey::from_provider_id("BytePlus"), None);
  }

  #[test]
  fn every_provider_has_a_name_and_a_modality() {
    for key in ALL_KEYS {
      assert!(!key.display_name().trim().is_empty(), "{:?}", key);
      assert!(!key.modalities().is_empty(), "{:?}", key);
    }
  }

  #[test]
  fn web_logins_keep_their_type() {
    for key in [
      ProviderCredentialKey::GrokWebLogin,
      ProviderCredentialKey::HiggsfieldWebLogin,
      ProviderCredentialKey::MidjourneyLogin,
      ProviderCredentialKey::RunwayWebLogin,
    ] {
      assert!(matches!(key.get_type(), ProviderCredentialType::WebLogin), "{:?}", key);
    }
  }

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

  // R4-3a edge cases: the id list matches the contract exactly and ids are safe to show and store.
  mod contract_tests {
    use super::*;

    const CONTRACT_API_KEY_IDS: [&str; 14] = [
      "byteplus", "openai", "anthropic", "gemini", "higgsfield", "fal", "replicate",
      "huggingface", "openrouter", "minimax", "kling", "runway", "luma", "elevenlabs",
    ];
    const WEB_LOGIN_IDS: [&str; 4] = ["grok_web_login", "higgsfield_web_login", "midjourney_login", "runway_web_login"];
    const BANNED_BRANDS: [&str; 6] = ["artcraft", "storyteller", "fakeyou", "getartcraft", "ltx", "lightricks"];

    #[test]
    fn all_ids_are_exactly_the_contract_plus_web_logins() {
      let mut actual: Vec<&str> = ALL_KEYS.iter().map(|k| k.provider_id()).collect();
      let mut expected: Vec<&str> = CONTRACT_API_KEY_IDS.iter().chain(WEB_LOGIN_IDS.iter()).copied().collect();
      actual.sort();
      expected.sort();
      assert_eq!(actual, expected);
    }

    #[test]
    fn web_login_ids_equal_their_old_serde_names() {
      for id in WEB_LOGIN_IDS {
        let key = ProviderCredentialKey::from_provider_id(id).unwrap();
        assert_eq!(serde_json::to_string(&key).unwrap(), format!("\"{}\"", id));
      }
    }

    #[test]
    fn ids_are_lowercase_and_filename_safe() {
      for key in ALL_KEYS {
        let id = key.provider_id();
        assert!(!id.is_empty());
        assert!(id.chars().all(|c| c.is_ascii_lowercase() || c == '_'), "{}", id);
      }
    }

    #[test]
    fn lookup_is_exact_and_does_not_trim() {
      for id in [" byteplus", "byteplus ", "BYTEPLUS", "Fal", "open_ai", "byteplus\n"] {
        assert_eq!(ProviderCredentialKey::from_provider_id(id), None, "{:?}", id);
      }
    }

    #[test]
    fn display_names_have_no_brand_leak() {
      for key in ALL_KEYS {
        let name = key.display_name().to_lowercase();
        for banned in BANNED_BRANDS {
          assert!(!name.contains(banned), "{:?} name {} contains {}", key, name, banned);
        }
      }
    }

    #[test]
    fn modalities_have_no_duplicates() {
      for key in ALL_KEYS {
        let modalities = key.modalities();
        for (i, modality) in modalities.iter().enumerate() {
          assert!(!modalities[i + 1..].contains(modality), "{:?} repeats {:?}", key, modality);
        }
      }
    }

    #[test]
    fn existing_byteplus_file_name_is_unchanged() {
      let key = ProviderCredentialKey::from_provider_id("byteplus").unwrap();
      assert_eq!(key, ProviderCredentialKey::BytePlusApiKey);
      assert_eq!(key.get_filename(), "byteplus.api_key.txt");
    }

    #[test]
    fn kind_serializes_as_contract_strings() {
      assert_eq!(serde_json::to_string(&ProviderCredentialType::ApiKey).unwrap(), "\"api_key\"");
      assert_eq!(serde_json::to_string(&ProviderCredentialType::WebLogin).unwrap(), "\"web_login\"");
    }
  }
}


