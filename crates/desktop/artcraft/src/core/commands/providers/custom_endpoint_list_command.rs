use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::providers::custom_endpoints::{self, CustomEndpointListEntry};
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::{error, info};
use serde_derive::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct CustomEndpointListResponse {
  pub endpoints: Vec<CustomEndpointListEntry>,
}

impl SerializeMarker for CustomEndpointListResponse {}

#[tauri::command]
pub async fn custom_endpoint_list_command(
  app_data_root: State<'_, AppDataRoot>,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<CustomEndpointListResponse> {
  info!("custom_endpoint_list_command called");

  let endpoints = custom_endpoints::list(&app_data_root, &credential_cache)
    .map_err(|err| {
      error!("Failed to list custom endpoints: {:?}", err);
      "Failed to list custom endpoints"
    })?;

  Ok(CustomEndpointListResponse { endpoints }.into())
}
