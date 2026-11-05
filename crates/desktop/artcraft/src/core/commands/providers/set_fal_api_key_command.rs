use crate::core::commands::providers::provider_set_api_key_command::save_api_key;
use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use log::info;
use serde_derive::{Deserialize, Serialize};
use tauri::State;

#[derive(Deserialize)]
pub struct SetFalApiKeyRequest {
  pub key: String,
}

#[derive(Serialize)]
pub struct SetFalApiKeyResponse {}

impl SerializeMarker for SetFalApiKeyResponse {}

#[tauri::command]
pub async fn set_fal_api_key_command(
  request: SetFalApiKeyRequest,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<SetFalApiKeyResponse> {
  info!("set_fal_api_key_command called");

  save_api_key(&credential_cache, ProviderCredentialKey::FalApiKey, &request.key)?;

  Ok(SetFalApiKeyResponse {}.into())
}
