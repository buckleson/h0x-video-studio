use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::providers::credentials::provider_credential_type::ProviderCredentialType;
use crate::core::providers::modality_defaults::Modality;
use log::{info, warn};
use serde_derive::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct ProviderListResponse {
  pub providers: Vec<ProviderListEntry>,
}

impl SerializeMarker for ProviderListResponse {}

/// Never carries the key itself: only whether one is stored and its last 4 characters.
#[derive(Serialize)]
pub struct ProviderListEntry {
  pub id: &'static str,
  pub name: &'static str,
  pub kind: ProviderCredentialType,
  pub modalities: &'static [Modality],
  pub has_key: bool,
  pub key_hint: Option<String>,
}

#[tauri::command]
pub async fn provider_list_command(
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<ProviderListResponse> {
  info!("provider_list_command called");

  let providers = ProviderCredentialKey::ALL.into_iter()
    .map(|key| {
      let maybe_payload = credential_cache.get_credentials(key).unwrap_or_else(|err| {
        warn!("Error checking credential for {:?}: {:?}", key, err);
        None
      });
      let key_hint = match &maybe_payload {
        Some(ProviderCredentialPayload::ApiKey(api_key)) => api_key.hint(),
        _ => None,
      };
      ProviderListEntry {
        id: key.provider_id(),
        name: key.display_name(),
        kind: key.get_type(),
        modalities: key.modalities(),
        has_key: maybe_payload.is_some(),
        key_hint,
      }
    })
    .collect();

  Ok(ProviderListResponse { providers }.into())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn entry_serializes_to_the_contract_fields_only() {
    let key = ProviderCredentialKey::FalApiKey;
    let entry = ProviderListEntry {
      id: key.provider_id(),
      name: key.display_name(),
      kind: key.get_type(),
      modalities: key.modalities(),
      has_key: true,
      key_hint: Some("1234".to_string()),
    };
    let value = serde_json::to_value(&entry).unwrap();
    let mut fields: Vec<&str> = value.as_object().unwrap().keys().map(|k| k.as_str()).collect();
    fields.sort();
    assert_eq!(fields, vec!["has_key", "id", "key_hint", "kind", "modalities", "name"]);
    assert_eq!(value["id"], "fal");
    assert_eq!(value["kind"], "api_key");
    assert_eq!(value["modalities"], serde_json::json!(["image", "video", "audio"]));
  }

  #[test]
  fn web_login_entry_has_web_login_kind_and_null_hint() {
    let key = ProviderCredentialKey::RunwayWebLogin;
    let entry = ProviderListEntry {
      id: key.provider_id(),
      name: key.display_name(),
      kind: key.get_type(),
      modalities: key.modalities(),
      has_key: false,
      key_hint: None,
    };
    let value = serde_json::to_value(&entry).unwrap();
    assert_eq!(value["kind"], "web_login");
    assert!(value["key_hint"].is_null());
  }
}
