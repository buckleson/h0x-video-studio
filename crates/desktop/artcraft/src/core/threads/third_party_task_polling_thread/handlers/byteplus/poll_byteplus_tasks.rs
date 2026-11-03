use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::generation_events::common::{GenerationAction, GenerationServiceProvider};
use crate::core::events::generation_events::generation_failed_event::GenerationFailedEvent;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::state::app_env_configs::app_env_configs::AppEnvConfigs;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use crate::core::state::task_database::TaskDatabase;
use crate::core::threads::third_party_task_polling_thread::events::notify_frontend_of_completion::{
  notify_frontend_of_completion, CompletionData,
};
use crate::core::utils::auto_download::{auto_download_task_urls, clear_auto_download_checkpoint};
use crate::core::utils::download_url_to_user_download_dir::download_url_with_filename;
use anyhow::{anyhow, Result};
use byteplus_client::{get_video_task, TaskStatus, VideoTaskStatus};
use enums::tauri::tasks::task_media_file_class::TaskMediaFileClass;
use enums::tauri::tasks::task_status::TaskStatus as DbTaskStatus;
use log::{error, info, warn};
use sqlite_tasks::queries::task::Task;
use sqlite_tasks::queries::update_successful_task_status_with_metadata::{
  update_successful_task_status_with_metadata, UpdateSuccessfulTaskArgs,
};
use sqlite_tasks::queries::update_task_status_with_rich_failure::{
  update_task_status_with_rich_failure, UpdateTaskWithRichFailureArgs,
};
use tauri::AppHandle;
use tokens::tokens::media_files::MediaFileToken;
use url::Url;

#[derive(Debug, PartialEq, Eq)]
enum PollAction {
  Wait,
  Complete(String),
  Fail(&'static str),
}

pub async fn poll_byteplus_tasks(
  app_handle: &AppHandle,
  app_env_configs: &AppEnvConfigs,
  app_data_root: &AppDataRoot,
  task_database: &TaskDatabase,
  credential_cache: &ProviderCredentialLoadingCache,
  byteplus_tasks: &[&Task],
) {
  let api_key = match credential_cache.get_credentials(ProviderCredentialKey::BytePlusApiKey) {
    Ok(Some(ProviderCredentialPayload::ApiKey(key))) => key.as_str().to_string(),
    _ => {
      warn!("[BytePlusPolling] No BytePlus API key configured, skipping poll");
      return;
    }
  };

  for task in byteplus_tasks {
    let result = poll_single_byteplus_task(
      app_handle,
      app_env_configs,
      app_data_root,
      task_database,
      &api_key,
      task,
    ).await;

    if let Err(err) = result {
      error!("[BytePlusPolling] Error processing task {}: {:?}", task.id.as_str(), err);
    }
  }
}

async fn poll_single_byteplus_task(
  app_handle: &AppHandle,
  app_env_configs: &AppEnvConfigs,
  app_data_root: &AppDataRoot,
  task_database: &TaskDatabase,
  api_key: &str,
  task: &Task,
) -> Result<()> {
  let action = match task.provider_job_id.as_deref() {
    Some(job_id) => action_for_status(get_video_task(api_key, job_id).await?),
    None => PollAction::Fail("No BytePlus task id to check"),
  };

  match action {
    PollAction::Wait => info!("[BytePlusPolling] Task {} still in progress", task.id.as_str()),
    PollAction::Fail(reason) => mark_failed(app_handle, task_database, task, reason).await?,
    PollAction::Complete(video_url) => {
      complete(app_handle, app_env_configs, app_data_root, task_database, task, &video_url).await?
    }
  }

  Ok(())
}

fn action_for_status(status: TaskStatus) -> PollAction {
  match (status.status, status.video_url) {
    (VideoTaskStatus::Queued | VideoTaskStatus::Running, _) => PollAction::Wait,
    (VideoTaskStatus::Succeeded, Some(url)) => PollAction::Complete(url),
    (VideoTaskStatus::Succeeded, None) => PollAction::Fail("BytePlus finished without a video"),
    (VideoTaskStatus::Failed, _) => PollAction::Fail("BytePlus video generation failed"),
  }
}

async fn complete(
  app_handle: &AppHandle,
  app_env_configs: &AppEnvConfigs,
  app_data_root: &AppDataRoot,
  task_database: &TaskDatabase,
  task: &Task,
  video_url: &str,
) -> Result<()> {
  let url = Url::parse(video_url)?;
  auto_download_task_urls(app_handle, task, &[url.clone()]).await?;

  let filename = format!("{}.mp4", task.id.as_str());
  let local_path = download_url_with_filename(&url, app_data_root.downloads_dir().path(), &filename)
    .await
    .map_err(|err| anyhow!("{}", err))?;
  let local_path_str = local_path.to_string_lossy();

  let updated = update_successful_task_status_with_metadata(UpdateSuccessfulTaskArgs {
    db: task_database.get_connection(),
    task_id: &task.id,
    maybe_batch_token: None,
    maybe_primary_media_file_token: None,
    maybe_primary_media_file_class: Some(TaskMediaFileClass::Video),
    maybe_primary_media_file_cdn_url: Some(&local_path_str),
    maybe_primary_media_file_thumbnail_url_template: None,
  }).await?;

  if updated {
    clear_auto_download_checkpoint(app_handle, task);
    let completion = CompletionData {
      primary_media_file_token: MediaFileToken::new_from_str(task.id.as_str()),
      maybe_cdn_url: Url::from_file_path(&local_path).ok(),
      maybe_thumbnail_url_template: None,
      maybe_batch_token: None,
      media_class: TaskMediaFileClass::Video,
    };
    notify_frontend_of_completion(app_handle, &app_env_configs.storyteller_host, None, task, &completion).await;
  }

  info!("[BytePlusPolling] Task {} saved to {}", task.id.as_str(), local_path_str);
  Ok(())
}

async fn mark_failed(app_handle: &AppHandle, task_database: &TaskDatabase, task: &Task, reason: &str) -> Result<()> {
  info!("[BytePlusPolling] Marking task {} as failed: {}", task.id.as_str(), reason);

  update_task_status_with_rich_failure(UpdateTaskWithRichFailureArgs {
    db: task_database.get_connection(),
    task_id: &task.id,
    status: DbTaskStatus::CompleteFailure,
    maybe_failure_type: None,
    maybe_failure_message: Some(reason),
  }).await?;

  GenerationFailedEvent {
    action: GenerationAction::GenerateVideo,
    service: GenerationServiceProvider::BytePlus,
    model: None,
    reason: Some(reason.to_string()),
  }.send_infallible(app_handle);

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn status(status: VideoTaskStatus, video_url: Option<&str>) -> TaskStatus {
    TaskStatus { status, video_url: video_url.map(str::to_string) }
  }

  #[test]
  fn queued_and_running_wait() {
    assert_eq!(action_for_status(status(VideoTaskStatus::Queued, None)), PollAction::Wait);
    assert_eq!(action_for_status(status(VideoTaskStatus::Running, None)), PollAction::Wait);
  }

  #[test]
  fn succeeded_with_url_completes() {
    let action = action_for_status(status(VideoTaskStatus::Succeeded, Some("https://example.com/v.mp4")));
    assert_eq!(action, PollAction::Complete("https://example.com/v.mp4".to_string()));
  }

  #[test]
  fn succeeded_without_url_fails() {
    assert!(matches!(action_for_status(status(VideoTaskStatus::Succeeded, None)), PollAction::Fail(_)));
  }

  #[test]
  fn failed_fails_with_message() {
    assert_eq!(
      action_for_status(status(VideoTaskStatus::Failed, None)),
      PollAction::Fail("BytePlus video generation failed"),
    );
  }
}
