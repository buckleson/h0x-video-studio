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
    PollAction::Complete(video_url) => match Url::parse(&video_url) {
      Ok(url) => complete(app_handle, app_env_configs, app_data_root, task_database, task, url).await?,
      // A bad URL never gets better, so fail the task instead of polling it forever.
      Err(_) => mark_failed(app_handle, task_database, task, "BytePlus returned an invalid video URL").await?,
    },
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
  url: Url,
) -> Result<()> {
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

  const SOURCE: &str = include_str!("poll_byteplus_tasks.rs");
  const SIGNED_URL: &str = "https://ark.example.com/out/v.mp4?X-Tos-Signature=abc%2F123&X-Tos-Expires=3600";
  const BRAND_LEAKS: [&str; 6] = ["ArtCraft", "Artcraft", "ARTCRAFT", "getartcraft", "storyteller.ai", "fakeyou"];

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

  #[test]
  fn local_download_path_converts_to_file_url() {
    let path = std::env::temp_dir().join("downloads").join("task_01abc.mp4");
    let url = Url::from_file_path(&path).expect("absolute temp path converts to a file URL");
    assert_eq!(url.scheme(), "file");
    assert!(url.path().ends_with("/downloads/task_01abc.mp4"), "{}", url);
  }

  mod status_mapping_edge_cases {
    use super::*;

    #[test]
    fn in_progress_with_early_url_still_waits() {
      assert_eq!(action_for_status(status(VideoTaskStatus::Queued, Some(SIGNED_URL))), PollAction::Wait);
      assert_eq!(action_for_status(status(VideoTaskStatus::Running, Some(SIGNED_URL))), PollAction::Wait);
    }

    #[test]
    fn failed_with_url_still_fails() {
      assert_eq!(
        action_for_status(status(VideoTaskStatus::Failed, Some(SIGNED_URL))),
        PollAction::Fail("BytePlus video generation failed"),
      );
    }

    #[test]
    fn signed_url_is_passed_through_verbatim() {
      assert_eq!(
        action_for_status(status(VideoTaskStatus::Succeeded, Some(SIGNED_URL))),
        PollAction::Complete(SIGNED_URL.to_string()),
      );
    }

    #[test]
    fn missing_video_and_provider_failure_have_distinct_messages() {
      let missing = action_for_status(status(VideoTaskStatus::Succeeded, None));
      let failed = action_for_status(status(VideoTaskStatus::Failed, None));
      assert_eq!(missing, PollAction::Fail("BytePlus finished without a video"));
      assert_ne!(missing, failed);
    }

    #[test]
    fn every_status_and_url_combination_maps_to_one_action() {
      let statuses = [VideoTaskStatus::Queued, VideoTaskStatus::Running, VideoTaskStatus::Succeeded, VideoTaskStatus::Failed];
      for s in statuses {
        for url in [None, Some(SIGNED_URL)] {
          let action = action_for_status(status(s.clone(), url));
          let expect_complete = s == VideoTaskStatus::Succeeded && url.is_some();
          let expect_wait = matches!(s, VideoTaskStatus::Queued | VideoTaskStatus::Running);
          assert_eq!(matches!(action, PollAction::Complete(_)), expect_complete, "{:?}/{:?}", s, url);
          assert_eq!(action == PollAction::Wait, expect_wait, "{:?}/{:?}", s, url);
          if let PollAction::Fail(reason) = action {
            assert!(!reason.trim().is_empty(), "empty failure message for {:?}", s);
          }
        }
      }
    }
  }

  mod source_checks {
    use super::*;

    #[test]
    fn no_backend_upload_or_backend_credentials() {
      for banned in ["upload_to_backend", "StorytellerCredential", "storyteller_creds", "maybe_creds"] {
        assert!(!production_source().contains(banned), "BytePlus polling must not use {}", banned);
      }
    }

    #[test]
    fn api_key_comes_only_from_the_credential_cache() {
      let production = production_source();
      assert!(production.contains("ProviderCredentialKey::BytePlusApiKey"));
      for banned in ["env::var", "BYTEPLUS_API_KEY", "\"bp-", "Bearer "] {
        assert!(!production.contains(banned), "hardcoded or env credential found: {}", banned);
      }
    }

    #[test]
    fn log_lines_never_include_the_api_key() {
      let macros = ["info!", "warn!", "error!", "debug!", "trace!", "anyhow!"];
      for line in production_source().lines().filter(|l| macros.iter().any(|m| l.contains(m))) {
        assert!(!line.contains("api_key"), "log line may leak the API key: {}", line.trim());
      }
    }

    #[test]
    fn video_is_saved_as_task_id_mp4_in_downloads_dir() {
      let production = production_source();
      assert!(production.contains("format!(\"{}.mp4\", task.id.as_str())"));
      assert!(production.contains("app_data_root.downloads_dir()"));
      assert!(production.contains("maybe_primary_media_file_cdn_url: Some(&local_path_str)"));
    }

    #[test]
    fn completion_runs_download_then_db_update_then_notify() {
      let production = production_source();
      let auto_download = position(production, "auto_download_task_urls(app_handle");
      let local_download = position(production, "download_url_with_filename(&url");
      let update = position(production, "update_successful_task_status_with_metadata(UpdateSuccessfulTaskArgs");
      let guard = position(production, "if updated {");
      let notify = position(production, "notify_frontend_of_completion(app_handle");
      assert!(auto_download < local_download);
      assert!(local_download < update);
      assert!(update < guard && guard < notify);
    }

    #[test]
    fn frontend_notification_carries_no_backend_credentials() {
      let line = production_source()
        .lines()
        .find(|l| l.contains("notify_frontend_of_completion(app_handle"))
        .expect("notify call");
      assert!(line.contains(", None, task,"), "expected no credentials passed: {}", line.trim());
    }

    #[test]
    fn failure_marks_complete_failure_with_reason() {
      let production = production_source();
      assert!(production.contains("status: DbTaskStatus::CompleteFailure"));
      assert!(production.contains("maybe_failure_message: Some(reason)"));
      assert!(production.contains("GenerationServiceProvider::BytePlus"));
    }

    #[test]
    fn missing_job_id_fails_instead_of_waiting_forever() {
      assert!(production_source().contains("None => PollAction::Fail("));
    }

    #[test]
    fn user_visible_failure_messages_have_no_brand_leaks() {
      let messages: Vec<&str> = production_source()
        .split("PollAction::Fail(\"")
        .skip(1)
        .map(|rest| rest.split('"').next().unwrap())
        .collect();
      assert_eq!(messages.len(), 3, "expected 3 failure messages, got {:?}", messages);
      for message in messages {
        for brand in BRAND_LEAKS {
          assert!(!message.contains(brand), "brand leak {:?} in {:?}", brand, message);
        }
      }
    }
  }

  // ========== Helpers ==========

  fn status(status: VideoTaskStatus, video_url: Option<&str>) -> TaskStatus {
    TaskStatus { status, video_url: video_url.map(str::to_string) }
  }

  fn production_source() -> &'static str {
    SOURCE.split("#[cfg(test)]").next().unwrap()
  }

  fn position(haystack: &str, needle: &str) -> usize {
    haystack.find(needle).unwrap_or_else(|| panic!("missing {:?}", needle))
  }
}
