use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::providers::custom_endpoints::{self, CustomEndpointSaveRequest};
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::{info, warn};
use serde_derive::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct CustomEndpointSaveResponse {
  pub id: String,
}

impl SerializeMarker for CustomEndpointSaveResponse {}

#[tauri::command]
pub async fn custom_endpoint_save_command(
  request: CustomEndpointSaveRequest,
  app_data_root: State<'_, AppDataRoot>,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<CustomEndpointSaveResponse> {
  info!("custom_endpoint_save_command called (update: {})", request.id.is_some());

  let id = custom_endpoints::save(&app_data_root, &credential_cache, request)
    .map_err(|err| {
      warn!("Failed to save custom endpoint: {:?}", err);
      err.to_string()
    })?;

  Ok(CustomEndpointSaveResponse { id }.into())
}
