use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::providers::custom_endpoints;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::{error, info};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

#[derive(Deserialize)]
pub struct CustomEndpointDeleteRequest {
  pub id: String,
}

#[derive(Serialize)]
pub struct CustomEndpointDeleteResponse {}

impl SerializeMarker for CustomEndpointDeleteResponse {}

#[tauri::command]
pub async fn custom_endpoint_delete_command(
  request: CustomEndpointDeleteRequest,
  app_data_root: State<'_, AppDataRoot>,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<CustomEndpointDeleteResponse> {
  info!("custom_endpoint_delete_command called");

  custom_endpoints::delete(&app_data_root, &credential_cache, &request.id)
    .map_err(|err| {
      error!("Failed to delete custom endpoint: {:?}", err);
      "Failed to delete custom endpoint"
    })?;

  Ok(CustomEndpointDeleteResponse {}.into())
}
