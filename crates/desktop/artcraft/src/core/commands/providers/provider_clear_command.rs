use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

#[derive(Deserialize)]
pub struct ProviderClearRequest {
  pub provider: String,
}

#[derive(Serialize)]
pub struct ProviderClearResponse {}

impl SerializeMarker for ProviderClearResponse {}

#[tauri::command]
pub async fn provider_clear_command(
  request: ProviderClearRequest,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<ProviderClearResponse> {
  let key = ProviderCredentialKey::from_provider_id(&request.provider).ok_or("Unknown provider")?;

  info!("provider_clear_command called for key: {:?}", key);

  credential_cache.delete_credentials(key)
    .map_err(|err| {
      error!("Failed to clear provider credential: {:?}", err);
      "Failed to clear provider credential"
    })?;

  Ok(ProviderClearResponse {}.into())
}
