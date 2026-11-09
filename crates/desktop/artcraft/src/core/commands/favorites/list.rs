use crate::core::favorites::store::{self, FavoriteListEntry};
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use log::info;
use tauri::State;

#[tauri::command]
pub fn list_favorites(app_data_root: State<'_, AppDataRoot>) -> Vec<FavoriteListEntry> {
  info!("list_favorites called");
  store::list(&app_data_root)
}
