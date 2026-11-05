use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::modality_defaults::{self, ModalityDefaults};
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::{error, info};
use tauri::State;

impl SerializeMarker for ModalityDefaults {}

#[tauri::command]
pub async fn modality_defaults_get_command(
  app_data_root: State<'_, AppDataRoot>,
) -> ResponseOrErrorMessage<ModalityDefaults> {
  info!("modality_defaults_get_command called");

  let defaults = modality_defaults::load(&app_data_root)
    .map_err(|err| {
      error!("Failed to load modality defaults: {:?}", err);
      "Failed to load modality defaults"
    })?;

  Ok(defaults.into())
}
