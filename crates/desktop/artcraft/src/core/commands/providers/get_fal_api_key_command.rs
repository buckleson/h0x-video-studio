use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use log::{error, info};
use serde_derive::Serialize;
use tauri::State;

/// Only reports whether a key is stored; the key never goes back to the frontend.
#[derive(Serialize)]
pub struct GetFalApiKeyResponse {
  pub has_key: bool,
}

impl SerializeMarker for GetFalApiKeyResponse {}

#[tauri::command]
pub async fn get_fal_api_key_command(
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<GetFalApiKeyResponse> {
  info!("get_fal_api_key_command called");

  let maybe_payload = credential_cache.get_credentials(ProviderCredentialKey::FalApiKey)
    .map_err(|err| {
      error!("Failed to read API key: {:?}", err);
      "Failed to read API key"
    })?;

  Ok(GetFalApiKeyResponse { has_key: maybe_payload.is_some() }.into())
}
