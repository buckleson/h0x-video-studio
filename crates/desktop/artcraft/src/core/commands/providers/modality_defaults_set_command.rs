use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::modality_defaults::{self, Modality};
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::{info, warn};
use serde_derive::{Deserialize, Serialize};
use tauri::State;

#[derive(Deserialize)]
pub struct ModalityDefaultsSetRequest {
  pub modality: Modality,
  pub provider_or_endpoint_id: Option<String>,
}

#[derive(Serialize)]
pub struct ModalityDefaultsSetResponse {}

impl SerializeMarker for ModalityDefaultsSetResponse {}

#[tauri::command]
pub async fn modality_defaults_set_command(
  request: ModalityDefaultsSetRequest,
  app_data_root: State<'_, AppDataRoot>,
) -> ResponseOrErrorMessage<ModalityDefaultsSetResponse> {
  info!("modality_defaults_set_command called for {:?}", request.modality);

  modality_defaults::set(&app_data_root, request.modality, request.provider_or_endpoint_id)
    .map_err(|err| {
      warn!("Failed to set modality default: {:?}", err);
      err.to_string()
    })?;

  Ok(ModalityDefaultsSetResponse {}.into())
}
