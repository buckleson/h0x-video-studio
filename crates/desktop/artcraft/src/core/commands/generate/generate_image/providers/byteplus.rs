use crate::core::commands::generate::generate_image::tauri_generate_image_request::TauriGenerateImageResponse;
use crate::core::commands::generate::generate_video::byteplus::image_to_data_url;
use crate::core::commands::generate::omni::dispatch::local_error;
use crate::core::commands::generate::omni::OmniRequest;
use crate::core::commands::response::failure_response_wrapper::{CommandErrorResponseWrapper, CommandErrorStatus};
use crate::core::commands::response::shorthand::Response;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use crate::core::state::task_database::TaskDatabase;
use crate::core::threads::third_party_task_polling_thread::events::notify_frontend_of_completion::{notify_frontend_of_completion, CompletionData};
use artcraft_client::utils::api_host::ApiHost;
use byteplus_client::{generate_image, ImageRequest};
use chrono::Local;
use enums::common::generation_provider::GenerationProvider;
use enums::tauri::tasks::task_media_file_class::TaskMediaFileClass;
use enums::tauri::tasks::task_status::TaskStatus;
use enums::tauri::tasks::task_type::TaskType;
use log::info;
use reqwest::Url;
use serde_json::Value;
use sqlite_tasks::queries::create_task::{create_task, CreateTaskArgs};
use sqlite_tasks::queries::task::Task;
use std::path::Path;
use tauri::{AppHandle, Manager};
use tokens::tokens::media_files::MediaFileToken;

const MODEL: &str = "seedream-4-5-251128";

pub async fn generate_image_byteplus(
  request: OmniRequest,
  app: &AppHandle,
  api_host: &ApiHost,
) -> Response<TauriGenerateImageResponse, String, ()> {
  let key = match app.state::<ProviderCredentialLoadingCache>().get_credentials(ProviderCredentialKey::BytePlusApiKey) {
    Ok(Some(ProviderCredentialPayload::ApiKey(key))) => key.as_str().to_string(),
    Ok(_) => return Err(CommandErrorResponseWrapper {
      status: CommandErrorStatus::Unauthorized,
      error_type: Some("needs_byteplus_api_key".into()),
      error_message: Some("You need to set a BytePlus API key".to_string()),
      error_details: None,
    }),
    Err(err) => return Err(local_error(format!("{:?}", err))),
  };

  let images = request.fields.get("image_media_tokens").and_then(Value::as_array).cloned().unwrap_or_default();
  let mut image_data_urls = Vec::with_capacity(images.len());
  for image in images.iter().filter_map(Value::as_str) {
    image_data_urls.push(image_to_data_url(image).await?);
  }

  let image_request = ImageRequest {
    model: MODEL.to_string(),
    prompt: request.fields.get("prompt").and_then(Value::as_str).unwrap_or_default().to_string(),
    image_data_urls,
    size: "2K".to_string(),
  };

  info!("Generating BytePlus image with model {}", MODEL);

  let image_url = generate_image(&key, &image_request).await.map_err(local_error)?;
  let url = Url::parse(&image_url).map_err(local_error)?;
  let bytes = reqwest::get(url.clone()).await
    .and_then(|response| response.error_for_status())
    .map_err(local_error)?
    .bytes().await
    .map_err(local_error)?;

  let extension = Path::new(url.path()).extension().and_then(|ext| ext.to_str()).unwrap_or("png");
  let filename = format!("seedream_{}.{}", Local::now().format("%Y%m%d_%H%M%S_%3f"), extension);
  let directory = app.state::<AppDataRoot>().downloads_dir().path().to_path_buf();
  tokio::fs::create_dir_all(&directory).await.map_err(local_error)?;
  let path = directory.join(filename);
  tokio::fs::write(&path, &bytes).await.map_err(local_error)?;
  let local_path = path.to_string_lossy().to_string();
  info!("Saved BytePlus image to {}", local_path);

  let database = app.state::<TaskDatabase>();
  let task_id = create_task(CreateTaskArgs {
    db: database.get_connection(),
    status: TaskStatus::CompleteSuccess,
    task_type: TaskType::ImageGeneration,
    model_type: None,
    provider: GenerationProvider::BytePlus,
    provider_job_id: Some(&local_path),
    queue_status_url: None,
    queue_response_url: None,
    prompt_token: None,
    frontend_caller: request.frontend_caller,
    frontend_subscriber_id: request.frontend_subscriber_id.as_deref(),
    frontend_subscriber_payload: request.frontend_subscriber_payload.as_deref(),
  }).await.map_err(local_error)?;

  let primary_media_file_token = MediaFileToken::new_from_str(task_id.as_str());
  let task = Task {
    id: task_id,
    status: TaskStatus::CompleteSuccess,
    task_type: TaskType::ImageGeneration,
    model_type: None,
    provider: GenerationProvider::BytePlus,
    provider_job_id: Some(local_path),
    queue_status_url: None,
    queue_response_url: None,
    prompt_token: None,
    frontend_caller: request.frontend_caller,
    frontend_subscriber_id: request.frontend_subscriber_id,
    frontend_subscriber_payload: request.frontend_subscriber_payload,
  };

  notify_frontend_of_completion(app, api_host, None, &task, &CompletionData {
    primary_media_file_token,
    maybe_cdn_url: None,
    maybe_thumbnail_url_template: None,
    maybe_batch_token: None,
    media_class: TaskMediaFileClass::Image,
  }).await;

  Ok(TauriGenerateImageResponse {}.into())
}
