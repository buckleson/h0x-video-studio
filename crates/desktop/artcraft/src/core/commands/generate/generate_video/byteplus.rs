use crate::core::commands::enqueue::task_enqueue_success::TaskEnqueueSuccess;
use crate::core::commands::generate::generate_video::request::TauriGenerateVideoResponse;
use crate::core::commands::generate::omni::OmniRequest;
use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::Response;
use crate::core::events::basic_sendable_event_trait::BasicSendableEvent;
use crate::core::events::generation_events::common::GenerationModel;
use crate::core::events::generation_events::generation_enqueue_success_event::GenerationEnqueueSuccessEvent;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::state::task_database::TaskDatabase;
use base64::prelude::BASE64_STANDARD;
use base64::Engine;
use byteplus_client::{create_video_task, VideoTaskRequest};
use enums::common::generation_provider::GenerationProvider;
use enums::tauri::tasks::task_type::TaskType;
use log::{error, info};
use mimetypes::mimetype_for_bytes::get_mimetype_for_bytes;
use serde_json::Value;
use tauri::{AppHandle, Manager};

const DEFAULT_MODEL: &str = "seedance-1-0-pro-250528";

type ByteplusError = CommandErrorResponseWrapper<String, ()>;

pub async fn generate_video_byteplus(
  request: OmniRequest,
  app: &AppHandle,
) -> Response<TauriGenerateVideoResponse, String, ()> {
  let key = load_api_key(app)?;

  let field = |name: &str| request.fields.get(name).and_then(Value::as_str);
  let maybe_image = field("start_frame_image_media_token").or_else(|| field("image_media_token"));
  let maybe_first_frame_data_url = match maybe_image {
    Some(image) => Some(image_to_data_url(image).await?),
    None => None,
  };

  let model = request.model().unwrap_or(DEFAULT_MODEL).to_string();
  let task_request = VideoTaskRequest {
    model: model.clone(),
    prompt: field("prompt").unwrap_or_default().to_string(),
    maybe_first_frame_data_url,
    duration: request.fields.get("duration_seconds").and_then(Value::as_u64).unwrap_or(5) as u32,
    resolution: match field("resolution") {
      Some("ten_eighty_p" | "1080p") => "1080p",
      _ => "720p",
    }.to_string(),
    ratio: match field("aspect_ratio") {
      Some("wide_sixteen_by_nine" | "16:9") => "16:9",
      _ => "adaptive",
    }.to_string(),
  };

  info!("Creating BytePlus video task with model {}", &model);

  let task_id = create_video_task(&key, &task_request)
    .await
    .map_err(|err| command_error(CommandErrorStatus::ServerError, "server_error", err.to_string()))?;

  let success = TaskEnqueueSuccess {
    task_type: TaskType::VideoGeneration,
    model: Some(GenerationModel::Unknown(model)),
    provider: GenerationProvider::BytePlus,
    provider_job_id: Some(task_id),
    maybe_queue_status_url: None,
    maybe_queue_response_url: None,
    maybe_prompt_token: None,
  };

  let database = app.state::<TaskDatabase>();
  if let Err(err) = success.insert_into_task_database_with_frontend_payload(
    &database,
    request.frontend_caller,
    request.frontend_subscriber_id.as_deref(),
    request.frontend_subscriber_payload.as_deref(),
  ).await {
    error!("Failed to create task in database: {:?}", err);
  }

  GenerationEnqueueSuccessEvent {
    action: success.to_frontend_event_action(),
    service: success.to_frontend_event_service(),
    model: success.model,
  }.send_infallible(app);

  Ok(TauriGenerateVideoResponse {}.into())
}

fn load_api_key(app: &AppHandle) -> Result<String, ByteplusError> {
  let cache = app.state::<ProviderCredentialLoadingCache>();
  match cache.get_credentials(ProviderCredentialKey::BytePlusApiKey) {
    Ok(Some(ProviderCredentialPayload::ApiKey(key))) => Ok(key.as_str().to_string()),
    Ok(_) => Err(command_error(
      CommandErrorStatus::Unauthorized,
      "needs_byteplus_api_key",
      "You need to set a BytePlus API key".to_string(),
    )),
    Err(err) => Err(command_error(CommandErrorStatus::ServerError, "server_error", format!("{:?}", err))),
  }
}

/// Accepts a `data:` URL as-is, otherwise reads the value as a local file path.
pub(crate) async fn image_to_data_url(image: &str) -> Result<String, ByteplusError> {
  if image.starts_with("data:") {
    return Ok(image.to_string());
  }
  let bytes = tokio::fs::read(image)
    .await
    .map_err(|err| command_error(CommandErrorStatus::BadRequest, "bad_input", format!("Cannot read image {}: {}", image, err)))?;
  let mimetype = get_mimetype_for_bytes(&bytes)
    .ok_or_else(|| command_error(CommandErrorStatus::BadRequest, "bad_input", "Cannot determine image type".to_string()))?;
  Ok(format!("data:{};base64,{}", mimetype, BASE64_STANDARD.encode(&bytes)))
}

fn command_error(status: CommandErrorStatus, kind: &str, message: String) -> ByteplusError {
  CommandErrorResponseWrapper { status, error_type: Some(kind.into()), error_message: Some(message), error_details: None }
}
