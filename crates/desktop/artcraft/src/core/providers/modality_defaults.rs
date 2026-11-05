use std::path::PathBuf;

use anyhow::anyhow;
use serde_derive::{Deserialize, Serialize};

use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::custom_endpoints;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;

const FILENAME: &str = "modality_defaults.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Modality {
  Llm,
  Image,
  Video,
  Audio,
}

/// The default provider id or custom endpoint id per modality.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ModalityDefaults {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub llm: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub image: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub video: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub audio: Option<String>,
}

pub fn load(root: &AppDataRoot) -> anyhow::Result<ModalityDefaults> {
  let path = file_path(root);
  if !path.exists() {
    return Ok(ModalityDefaults::default());
  }
  Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

/// Sets (or clears, for None or a blank id) the default for one modality.
pub fn set(
  root: &AppDataRoot,
  modality: Modality,
  maybe_provider_or_endpoint_id: Option<String>,
) -> anyhow::Result<ModalityDefaults> {
  let maybe_id = maybe_provider_or_endpoint_id
    .map(|id| id.trim().to_string())
    .filter(|id| !id.is_empty());

  if let Some(id) = &maybe_id {
    let is_provider = ProviderCredentialKey::from_provider_id(id).is_some();
    if !is_provider && !custom_endpoints::load(root)?.iter().any(|endpoint| &endpoint.id == id) {
      return Err(anyhow!("Unknown provider or endpoint: {}", id));
    }
  }

  let mut defaults = load(root)?;
  let slot = match modality {
    Modality::Llm => &mut defaults.llm,
    Modality::Image => &mut defaults.image,
    Modality::Video => &mut defaults.video,
    Modality::Audio => &mut defaults.audio,
  };
  *slot = maybe_id;

  std::fs::write(file_path(root), serde_json::to_string_pretty(&defaults)?)?;
  Ok(defaults)
}

fn file_path(root: &AppDataRoot) -> PathBuf {
  root.settings_dir().path().join(FILENAME)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::providers::custom_endpoints::{CustomEndpointKind, CustomEndpointSaveRequest};
  use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
  use tempfile::TempDir;

  fn new_root() -> (TempDir, AppDataRoot) {
    let dir = TempDir::new().unwrap();
    let root = AppDataRoot::create_existing(dir.path()).unwrap();
    (dir, root)
  }

  #[test]
  fn missing_file_is_empty_defaults() {
    let (_dir, root) = new_root();
    assert_eq!(load(&root).unwrap(), ModalityDefaults::default());
  }

  #[test]
  fn set_round_trips_through_the_json_file() {
    let (dir, root) = new_root();
    set(&root, Modality::Video, Some("byteplus".to_string())).unwrap();
    set(&root, Modality::Llm, Some(" anthropic ".to_string())).unwrap();

    let loaded = load(&root).unwrap();
    assert_eq!(loaded.video.as_deref(), Some("byteplus"));
    assert_eq!(loaded.llm.as_deref(), Some("anthropic"));
    assert_eq!(loaded.image, None);
    assert!(dir.path().join("settings").join(FILENAME).exists());
  }

  #[test]
  fn none_or_blank_clears_the_default() {
    let (_dir, root) = new_root();
    set(&root, Modality::Image, Some("fal".to_string())).unwrap();
    set(&root, Modality::Image, Some("  ".to_string())).unwrap();
    assert_eq!(load(&root).unwrap().image, None);

    set(&root, Modality::Image, Some("fal".to_string())).unwrap();
    set(&root, Modality::Image, None).unwrap();
    assert_eq!(load(&root).unwrap().image, None);
  }

  #[test]
  fn unknown_id_is_rejected_and_nothing_is_written() {
    let (_dir, root) = new_root();
    assert!(set(&root, Modality::Audio, Some("nope".to_string())).is_err());
    assert!(set(&root, Modality::Audio, Some("byte_plus_api_key".to_string())).is_err());
    assert!(!file_path(&root).exists());
  }

  #[test]
  fn custom_endpoint_id_is_accepted() {
    let (_dir, root) = new_root();
    let cache = ProviderCredentialLoadingCache::new(root.clone());
    let id = custom_endpoints::save(&root, &cache, CustomEndpointSaveRequest {
      id: None,
      name: "Local LLM".to_string(),
      base_url: "http://localhost:11434/v1".to_string(),
      api_key: None,
      kind: CustomEndpointKind::OpenaiCompatible,
      modalities: vec![Modality::Llm],
    }).unwrap();

    set(&root, Modality::Llm, Some(id.clone())).unwrap();
    assert_eq!(load(&root).unwrap().llm, Some(id));
  }

  #[test]
  fn modality_serializes_as_contract_strings() {
    let json = serde_json::to_string(&[Modality::Llm, Modality::Image, Modality::Video, Modality::Audio]).unwrap();
    assert_eq!(json, r#"["llm","image","video","audio"]"#);
  }

  #[test]
  fn unset_modalities_are_omitted_from_json() {
    let defaults = ModalityDefaults { video: Some("kling".to_string()), ..Default::default() };
    assert_eq!(serde_json::to_string(&defaults).unwrap(), r#"{"video":"kling"}"#);
  }

  // R4-3a edge cases: other slots preserved, legacy and case-variant ids, deleted endpoints, bad files.
  mod edge_tests {
    use super::*;

    const SECRET: &str = "sk-endpoint-secret-2468";

    #[test]
    fn setting_one_modality_keeps_the_others() {
      let (_dir, root) = new_root();
      set(&root, Modality::Llm, Some("openai".to_string())).unwrap();
      set(&root, Modality::Image, Some("fal".to_string())).unwrap();
      set(&root, Modality::Video, Some("byteplus".to_string())).unwrap();
      set(&root, Modality::Audio, Some("elevenlabs".to_string())).unwrap();
      set(&root, Modality::Image, None).unwrap();

      let loaded = load(&root).unwrap();
      assert_eq!(loaded.llm.as_deref(), Some("openai"));
      assert_eq!(loaded.image, None);
      assert_eq!(loaded.video.as_deref(), Some("byteplus"));
      assert_eq!(loaded.audio.as_deref(), Some("elevenlabs"));
    }

    #[test]
    fn legacy_serde_names_and_case_variants_are_rejected() {
      let (_dir, root) = new_root();
      for id in ["fal_api_key", "open_ai_api_key", "BYTEPLUS", "ByteP lus", "OpenAI", "../byteplus"] {
        assert!(set(&root, Modality::Video, Some(id.to_string())).is_err(), "{}", id);
      }
      assert!(!file_path(&root).exists());
    }

    #[test]
    fn rejected_set_keeps_the_existing_default() {
      let (_dir, root) = new_root();
      set(&root, Modality::Video, Some("kling".to_string())).unwrap();
      assert!(set(&root, Modality::Video, Some("nope".to_string())).is_err());
      assert_eq!(load(&root).unwrap().video.as_deref(), Some("kling"));
    }

    #[test]
    fn deleted_endpoint_id_can_no_longer_be_set() {
      let (_dir, root) = new_root();
      let cache = ProviderCredentialLoadingCache::new(root.clone());
      let id = save_endpoint(&root, &cache);
      custom_endpoints::delete(&root, &cache, &id).unwrap();
      assert!(set(&root, Modality::Llm, Some(id)).is_err());
    }

    #[test]
    fn defaults_file_never_contains_endpoint_keys() {
      let (dir, root) = new_root();
      let cache = ProviderCredentialLoadingCache::new(root.clone());
      let id = save_endpoint(&root, &cache);
      set(&root, Modality::Llm, Some(id.clone())).unwrap();

      let json = std::fs::read_to_string(dir.path().join("settings").join(FILENAME)).unwrap();
      assert!(json.contains(&id));
      assert!(!json.contains(SECRET));
      assert!(!json.contains("api_key"));
    }

    #[test]
    fn null_and_unknown_fields_in_the_file_still_load() {
      let (_dir, root) = new_root();
      std::fs::write(file_path(&root), r#"{"llm":null,"video":"kling","future_field":1}"#).unwrap();
      let loaded = load(&root).unwrap();
      assert_eq!(loaded.llm, None);
      assert_eq!(loaded.video.as_deref(), Some("kling"));
    }

    #[test]
    fn corrupt_file_errors_and_is_not_overwritten() {
      let (_dir, root) = new_root();
      for contents in ["", "{ not json", "\"llm\""] {
        std::fs::write(file_path(&root), contents).unwrap();
        assert!(load(&root).is_err(), "{:?}", contents);
        assert!(set(&root, Modality::Llm, Some("openai".to_string())).is_err(), "{:?}", contents);
        assert_eq!(std::fs::read_to_string(file_path(&root)).unwrap(), contents);
      }
    }

    #[test]
    fn unknown_modality_strings_do_not_deserialize() {
      for json in [r#""text""#, r#""LLM""#, r#""""#, r#""3d""#] {
        assert!(serde_json::from_str::<Modality>(json).is_err(), "{}", json);
      }
    }

    #[test]
    fn empty_defaults_serialize_to_an_empty_object() {
      assert_eq!(serde_json::to_string(&ModalityDefaults::default()).unwrap(), "{}");
    }

    fn save_endpoint(root: &AppDataRoot, cache: &ProviderCredentialLoadingCache) -> String {
      custom_endpoints::save(root, cache, CustomEndpointSaveRequest {
        id: None,
        name: "Local LLM".to_string(),
        base_url: "http://localhost:11434/v1".to_string(),
        api_key: Some(SECRET.to_string()),
        kind: CustomEndpointKind::OpenaiCompatible,
        modalities: vec![Modality::Llm],
      }).unwrap()
    }
  }
}
