use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::state::app_env_configs::app_env_configs::AppEnvConfigs;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::task_database::TaskDatabase;
use crate::core::threads::third_party_task_polling_thread::handlers::byteplus::poll_byteplus_tasks::poll_byteplus_tasks;
use crate::core::threads::third_party_task_polling_thread::handlers::fal::poll_fal_tasks::poll_fal_tasks;
use crate::core::utils::task_database_pending_statuses::TASK_DATABASE_PENDING_STATUSES;
use crate::services::storyteller::state::storyteller_credential_manager::StorytellerCredentialManager;
use enums::common::generation_provider::GenerationProvider;
use log::{error, info, warn};
use sqlite_tasks::queries::list_non_artcraft_pending_tasks::{
  list_non_artcraft_pending_tasks, ListNonArtcraftPendingTasksArgs,
};
use sqlite_tasks::queries::task::Task;
use std::time::Duration;
use tauri::AppHandle;

const SLEEP_NO_THIRD_PARTY_JOBS_SEEN: Duration = Duration::from_secs(10);
const SLEEP_THIRD_PARTY_JOBS_SEEN: Duration = Duration::from_secs(2);
const SLEEP_BETWEEN_FAL_POLLS: Duration = Duration::from_secs(1);
const SLEEP_ON_ERROR: Duration = Duration::from_secs(30);

pub async fn third_party_task_polling_thread(
  app_handle: AppHandle,
  app_env_configs: AppEnvConfigs,
  app_data_root: AppDataRoot,
  task_database: TaskDatabase,
  storyteller_creds_manager: StorytellerCredentialManager,
  credential_cache: ProviderCredentialLoadingCache,
) -> ! {
  let mut has_ever_seen_third_party_jobs = false;

  loop {
    let result = poll_iteration(
      &app_handle,
      &app_env_configs,
      &app_data_root,
      &task_database,
      &storyteller_creds_manager,
      &credential_cache,
      &mut has_ever_seen_third_party_jobs,
    ).await;

    if let Err(err) = result {
      error!("[ThirdPartyPolling] Error in polling loop: {:?}", err);
      tokio::time::sleep(SLEEP_ON_ERROR).await;
    }
  }
}

async fn poll_iteration(
  app_handle: &AppHandle,
  app_env_configs: &AppEnvConfigs,
  app_data_root: &AppDataRoot,
  task_database: &TaskDatabase,
  storyteller_creds_manager: &StorytellerCredentialManager,
  credential_cache: &ProviderCredentialLoadingCache,
  has_ever_seen_third_party_jobs: &mut bool,
) -> Result<(), PollError> {
  let task_list = list_non_artcraft_pending_tasks(ListNonArtcraftPendingTasksArgs {
    db: task_database.get_connection(),
    task_statuses: &TASK_DATABASE_PENDING_STATUSES,
  }).await?;

  let tasks = task_list.tasks;

  if tasks.is_empty() {
    let sleep_duration = if *has_ever_seen_third_party_jobs {
      SLEEP_THIRD_PARTY_JOBS_SEEN
    } else {
      SLEEP_NO_THIRD_PARTY_JOBS_SEEN
    };
    tokio::time::sleep(sleep_duration).await;
    return Ok(());
  }

  *has_ever_seen_third_party_jobs = true;

  let fal_tasks: Vec<&Task> = tasks.iter()
    .filter(|t| t.provider == GenerationProvider::Fal)
    .collect();

  let byteplus_tasks: Vec<&Task> = tasks.iter()
    .filter(|t| t.provider == GenerationProvider::BytePlus)
    .collect();

  let non_fal_tasks: Vec<&Task> = tasks.iter()
    .filter(|t| t.provider != GenerationProvider::Fal && t.provider != GenerationProvider::BytePlus)
    .collect();

  if !non_fal_tasks.is_empty() {
    for task in &non_fal_tasks {
      warn!(
        "[ThirdPartyPolling] Skipping non-FAL task: id={}, provider={:?}, type={:?}",
        task.id.as_str(),
        task.provider,
        task.task_type,
      );
    }
  }

  if !byteplus_tasks.is_empty() {
    info!("[ThirdPartyPolling] {} BytePlus job(s) ready to check", byteplus_tasks.len());
    poll_byteplus_tasks(
      app_handle,
      app_env_configs,
      app_data_root,
      task_database,
      credential_cache,
      &byteplus_tasks,
    ).await;
  }

  if fal_tasks.is_empty() {
    tokio::time::sleep(SLEEP_THIRD_PARTY_JOBS_SEEN).await;
    return Ok(());
  }

  info!("[ThirdPartyPolling] {} FAL job(s) ready to check", fal_tasks.len());

  poll_fal_tasks(
    app_handle,
    app_env_configs,
    app_data_root,
    task_database,
    storyteller_creds_manager,
    credential_cache,
    &fal_tasks,
  ).await;

  tokio::time::sleep(SLEEP_BETWEEN_FAL_POLLS).await;

  Ok(())
}

// ── Error ──

#[derive(Debug)]
enum PollError {
  SqliteTasksError(sqlite_tasks::error::SqliteTasksError),
}

impl From<sqlite_tasks::error::SqliteTasksError> for PollError {
  fn from(err: sqlite_tasks::error::SqliteTasksError) -> Self {
    Self::SqliteTasksError(err)
  }
}

impl std::fmt::Display for PollError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::SqliteTasksError(err) => write!(f, "SQLite error: {:?}", err),
    }
  }
}

#[cfg(test)]
mod tests {
  const SOURCE: &str = include_str!("third_party_task_polling_thread.rs");
  const HANDLERS_MOD: &str = include_str!("handlers/mod.rs");
  const BYTEPLUS_MOD: &str = include_str!("handlers/byteplus/mod.rs");

  #[test]
  fn byteplus_tasks_are_selected_by_provider() {
    assert!(production_source().contains(".filter(|t| t.provider == GenerationProvider::BytePlus)"));
  }

  #[test]
  fn byteplus_tasks_are_excluded_from_skipped_non_fal_branch() {
    let production = production_source();
    let start = position(production, "let non_fal_tasks");
    let filter = &production[start..start + position(&production[start..], ".collect()")];
    assert!(filter.contains("t.provider != GenerationProvider::Fal"));
    assert!(filter.contains("t.provider != GenerationProvider::BytePlus"));
  }

  #[test]
  fn byteplus_is_polled_before_fal_only_early_return() {
    let production = production_source();
    let byteplus_call = position(production, "poll_byteplus_tasks(");
    let fal_early_return = position(production, "if fal_tasks.is_empty()");
    assert!(byteplus_call < fal_early_return, "a BytePlus-only batch would never be polled");
  }

  #[test]
  fn byteplus_poll_gets_credential_cache_not_backend_creds() {
    let production = production_source();
    let start = position(production, "poll_byteplus_tasks(");
    let call = &production[start..start + position(&production[start..], ").await")];
    assert!(call.contains("credential_cache"));
    assert!(!call.contains("storyteller_creds_manager"));
  }

  #[test]
  fn handler_modules_are_declared() {
    assert!(HANDLERS_MOD.lines().any(|l| l.trim() == "pub mod byteplus;"));
    assert!(HANDLERS_MOD.lines().any(|l| l.trim() == "pub mod fal;"));
    assert!(BYTEPLUS_MOD.lines().any(|l| l.trim() == "pub mod poll_byteplus_tasks;"));
  }

  // ========== Helpers ==========

  fn production_source() -> &'static str {
    SOURCE.split("#[cfg(test)]").next().unwrap()
  }

  fn position(haystack: &str, needle: &str) -> usize {
    haystack.find(needle).unwrap_or_else(|| panic!("missing {:?}", needle))
  }
}
