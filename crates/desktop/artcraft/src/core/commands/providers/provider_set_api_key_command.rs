use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::payload::api_key::ApiKeyData;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::providers::credentials::provider_credential_type::ProviderCredentialType;
use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

/// Send `provider` (a provider id such as "byteplus"). Old callers send `provider_credential` ("byte_plus_api_key").
#[derive(Deserialize)]
pub struct ProviderSetApiKeyRequest {
  pub provider: Option<String>,
  pub provider_credential: Option<ProviderCredentialKey>,
  pub api_key: String,
}

#[derive(Serialize)]
pub struct ProviderSetApiKeyResponse {}

impl SerializeMarker for ProviderSetApiKeyResponse {}

#[tauri::command]
pub async fn provider_set_api_key_command(
  request: ProviderSetApiKeyRequest,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<ProviderSetApiKeyResponse> {
  let key = match (request.provider_credential, request.provider.as_deref()) {
    (Some(key), _) => key,
    (None, Some(id)) => ProviderCredentialKey::from_provider_id(id).ok_or("Unknown provider")?,
    (None, None) => return Err("Missing provider".into()),
  };

  info!("provider_set_api_key_command called for provider: {:?}", key);

  save_api_key(&credential_cache, key, &request.api_key)?;

  Ok(ProviderSetApiKeyResponse {}.into())
}

/// Trims and stores an API key. Shared with the fal/OpenAI wrapper commands.
pub fn save_api_key(
  credential_cache: &ProviderCredentialLoadingCache,
  key: ProviderCredentialKey,
  api_key: &str,
) -> Result<(), &'static str> {
  if key.get_type() != ProviderCredentialType::ApiKey {
    return Err("This provider does not use an API key");
  }

  let api_key_data = ApiKeyData::from_str(api_key);
  if api_key_data.as_str().is_empty() {
    return Err("API key is empty");
  }

  credential_cache.save_credentials(key, ProviderCredentialPayload::ApiKey(api_key_data))
    .map_err(|err| {
      error!("Failed to save API key: {:?}", err);
      "Failed to save API key"
    })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::state::data_dir::app_data_root::AppDataRoot;
  use tempfile::TempDir;

  const SECRET: &str = "sk-provider-secret-1357";

  mod request_tests {
    use super::*;

    #[test]
    fn old_byteplus_callers_still_deserialize() {
      let req: ProviderSetApiKeyRequest =
        serde_json::from_str(r#"{"provider_credential":"byte_plus_api_key","api_key":"k"}"#).unwrap();
      assert_eq!(req.provider_credential, Some(ProviderCredentialKey::BytePlusApiKey));
      assert_eq!(req.provider, None);
    }

    #[test]
    fn new_callers_send_a_provider_id() {
      let req: ProviderSetApiKeyRequest = serde_json::from_str(r#"{"provider":"fal","api_key":"k"}"#).unwrap();
      assert_eq!(req.provider.as_deref(), Some("fal"));
      assert_eq!(req.provider_credential, None);
    }

    #[test]
    fn missing_api_key_or_bad_legacy_name_fails_to_deserialize() {
      assert!(serde_json::from_str::<ProviderSetApiKeyRequest>(r#"{"provider":"fal"}"#).is_err());
      assert!(serde_json::from_str::<ProviderSetApiKeyRequest>(r#"{"provider_credential":"byteplus","api_key":"k"}"#).is_err());
    }
  }

  mod save_api_key_tests {
    use super::*;

    #[test]
    fn every_api_key_provider_round_trips_trimmed() {
      let (dir, cache) = new_cache();
      for key in ProviderCredentialKey::ALL {
        if key.get_type() != ProviderCredentialType::ApiKey {
          continue;
        }
        save_api_key(&cache, key, &format!("  {}  \n", SECRET)).unwrap();
        let on_disk = std::fs::read_to_string(dir.path().join("credentials").join(key.get_filename())).unwrap();
        assert_eq!(on_disk, SECRET, "{:?}", key);
        assert_eq!(api_key_of(&cache, key).as_deref(), Some(SECRET), "{:?}", key);
      }
    }

    #[test]
    fn byteplus_key_lands_in_the_file_generation_reads() {
      let (dir, cache) = new_cache();
      save_api_key(&cache, ProviderCredentialKey::BytePlusApiKey, SECRET).unwrap();
      let file = dir.path().join("credentials").join("byteplus.api_key.txt");
      assert_eq!(std::fs::read_to_string(file).unwrap(), SECRET);
      assert_eq!(api_key_of(&cache, ProviderCredentialKey::BytePlusApiKey).as_deref(), Some(SECRET));
    }

    #[test]
    fn empty_or_whitespace_keys_are_rejected_and_nothing_is_written() {
      let (dir, cache) = new_cache();
      for value in ["", "   ", "\n\t "] {
        assert!(save_api_key(&cache, ProviderCredentialKey::FalApiKey, value).is_err(), "{:?}", value);
      }
      assert!(!dir.path().join("credentials").join("fal.api_key.txt").exists());
    }

    #[test]
    fn blank_key_does_not_wipe_a_stored_key() {
      let (_dir, cache) = new_cache();
      save_api_key(&cache, ProviderCredentialKey::OpenAiApiKey, SECRET).unwrap();
      assert!(save_api_key(&cache, ProviderCredentialKey::OpenAiApiKey, "  ").is_err());
      assert_eq!(api_key_of(&cache, ProviderCredentialKey::OpenAiApiKey).as_deref(), Some(SECRET));
    }

    #[test]
    fn web_logins_refuse_api_keys() {
      let (dir, cache) = new_cache();
      for key in ProviderCredentialKey::ALL {
        if key.get_type() == ProviderCredentialType::WebLogin {
          assert!(save_api_key(&cache, key, SECRET).is_err(), "{:?}", key);
          assert!(!dir.path().join("credentials").join(key.get_filename()).exists(), "{:?}", key);
        }
      }
    }

    #[test]
    fn error_messages_never_echo_the_key() {
      let (_dir, cache) = new_cache();
      let err = save_api_key(&cache, ProviderCredentialKey::GrokWebLogin, SECRET).unwrap_err();
      assert!(!err.contains(SECRET));
    }
  }

  // ========== Helpers ==========

  fn new_cache() -> (TempDir, ProviderCredentialLoadingCache) {
    let dir = TempDir::new().unwrap();
    let root = AppDataRoot::create_existing(dir.path()).unwrap();
    (dir, ProviderCredentialLoadingCache::new(root))
  }

  fn api_key_of(cache: &ProviderCredentialLoadingCache, key: ProviderCredentialKey) -> Option<String> {
    match cache.get_credentials(key).unwrap() {
      Some(ProviderCredentialPayload::ApiKey(data)) => Some(data.as_str().to_string()),
      _ => None,
    }
  }
}
