use crate::core::lifecycle::startup::tasks::bootstrap_task_database::bootstrap_task_database;
use crate::core::lifecycle::startup::tasks::initially_size_and_position_windows::initially_size_and_position_windows;
use crate::core::lifecycle::startup::tasks::load_provider_priority_state::load_provider_priority_state;
use crate::core::lifecycle::startup::tasks::set_app_log_level::set_app_log_level;
use crate::core::lifecycle::startup::tasks::spawn_discord_presence_thread::spawn_discord_presence_thread;
use crate::core::lifecycle::startup::tasks::spawn_main_window_thread::spawn_main_window_thread;
use crate::core::lifecycle::startup::tasks::spawn_storyteller_threads::spawn_storyteller_threads;
use crate::core::state::app_env_configs::app_env_configs::AppEnvConfigs;
use crate::core::state::artcraft_platform_info::ArtcraftPlatformInfo;
use crate::core::state::artcraft_usage_tracker::artcraft_usage_tracker::ArtcraftUsageTracker;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::services::storyteller::state::storyteller_credential_manager::StorytellerCredentialManager;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::threads::third_party_task_polling_thread::third_party_task_polling_thread::third_party_task_polling_thread;
use errors::AnyhowResult;
use tauri::{AppHandle, Manager};

pub async fn handle_tauri_startup(
  app: AppHandle,
  root: AppDataRoot,
  app_env_configs: AppEnvConfigs,
  artcraft_platform_info: ArtcraftPlatformInfo,
  artcraft_usage_tracker: ArtcraftUsageTracker,
  storyteller_creds_manager: StorytellerCredentialManager,
  credential_cache: ProviderCredentialLoadingCache,
) -> AnyhowResult<()> {

  set_app_log_level(
    &app,
    &root,
  )?;

  let task_database =
      bootstrap_task_database(&app, &root).await?;

  load_provider_priority_state(
    &app,
    &root,
  )?;

  spawn_main_window_thread(
    &app,
    &root,
    &storyteller_creds_manager,
  )?;

  spawn_storyteller_threads(
    &app,
    &app_env_configs,
    &artcraft_usage_tracker,
    &artcraft_platform_info,
    &task_database,
    &storyteller_creds_manager,
  )?;

  tauri::async_runtime::spawn(third_party_task_polling_thread(
    app.clone(),
    app_env_configs.clone(),
    root.clone(),
    task_database.clone(),
    storyteller_creds_manager.clone(),
    credential_cache,
  ));

  spawn_discord_presence_thread()?;

  initially_size_and_position_windows(&app, &root);

  Ok(())
}
