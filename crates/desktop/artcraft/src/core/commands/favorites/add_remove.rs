use crate::core::favorites::store;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::{error, info};
use tauri::State;

#[tauri::command]
pub fn add_favorite(path: String, app_data_root: State<'_, AppDataRoot>) -> Result<(), String> {
  info!("add_favorite called");
  store::add(&app_data_root, &path).map_err(|err| {
    error!("Failed to add favorite: {:?}", err);
    err.to_string()
  })
}

/// Removes the path from favorites only; the media file is never deleted or moved.
#[tauri::command]
pub fn remove_favorite(path: String, app_data_root: State<'_, AppDataRoot>) -> Result<(), String> {
  info!("remove_favorite called");
  store::remove(&app_data_root, &path).map_err(|err| {
    error!("Failed to remove favorite: {:?}", err);
    err.to_string()
  })
}
