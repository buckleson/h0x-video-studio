//! Finishing provider jobs in the background (the Tauri app's `poll_fal_tasks`): fal's queue is
//! polled. Finished results are downloaded and uploaded into the user's library as one batch,
//! resuming where they left off after a failure or restart.

use std::sync::mpsc::Sender;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use artcraft_client::credentials::storyteller_credential_set::StorytellerCredentialSet;
use artcraft_client::endpoints::media_files::upload_image_media_file_from_file::{UploadImageFromFileArgs, upload_image_media_file_from_file_with_idempotency_token};
use artcraft_client::utils::api_host::ApiHost;
use enums::common::generation_provider::GenerationProvider;
use fal_client::creds::fal_api_key::FalApiKey;
use fal_client::polling::poll_job_response::poll_job_response::{PollJobResponseArgs, poll_job_response};
use fal_client::polling::poll_job_response::success_case_extractors::PollResponseExtractedContents;
use fal_client::polling::poll_job_status::poll_job_status::{FalJobStatus, PollJobStatusArgs, poll_job_status};
use log::{info, warn};
use tokens::tokens::batch_generations::BatchGenerationToken;
use tokens::tokens::prompts::PromptToken;
use tokio::time::timeout;

use super::Provider;
use super::accounts::ProviderAccounts;
use super::jobs::{JobStore, ProviderJob};
use crate::backend::Event;
use crate::backend::session::Credentials;

/// How often jobs are checked (fal's poll interval).
const TICK: Duration = Duration::from_secs(2);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// Each download and upload of a result.
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(60);

pub struct Worker {
  pub host: ApiHost,
  pub creds: Arc<RwLock<Option<Credentials>>>,
  pub http: reqwest::Client,
  pub accounts: ProviderAccounts,
  pub jobs: JobStore,
  pub tx: Sender<Event>,
  pub ctx: egui::Context,
}

impl Worker {
  pub async fn run(self) {
    loop {
      self.tick().await;
      tokio::time::sleep(TICK).await;
    }
  }

  async fn tick(&self) {
    let fal = self.jobs.all();
    // Results go into the library: nothing can finish until someone's signed in.
    let Some(creds) = self.creds.read().ok().and_then(|c| c.as_ref().map(Credentials::to_set)) else {
      return;
    };
    if !fal.is_empty() {
      if let Some(key) = self.accounts.fal_key().map(|k| FalApiKey::from_str(&k)) {
        for job in fal {
          self.poll_fal(job, &key, &creds).await;
        }
      }
    }
  }

  async fn poll_fal(&self, job: ProviderJob, key: &FalApiKey, creds: &StorytellerCredentialSet) {
    let Some(status_url) = job.maybe_status_url.clone() else {
      return self.fail(&job, "No queue status URL to check");
    };
    let status = match timeout(REQUEST_TIMEOUT, poll_job_status(PollJobStatusArgs { status_url: &status_url, api_key: key })).await {
      Ok(Ok(status)) => status,
      other => return warn!("Polling FAL job {} failed: {other:?}", job.provider_job_id),
    };
    if status.status != FalJobStatus::Completed {
      return;
    }
    let Some(response_url) = job.maybe_response_url.clone().or(status.response_url) else {
      return self.fail(&job, "Job completed but no response URL available");
    };
    let response = match timeout(REQUEST_TIMEOUT, poll_job_response(PollJobResponseArgs { response_url: &response_url, api_key: key })).await {
      Ok(Ok(response)) => response,
      other => return warn!("Fetching FAL results for {} failed (will retry): {other:?}", job.provider_job_id),
    };
    let urls = image_urls(response.extracted_contents.as_ref());
    if urls.is_empty() {
      return self.fail(&job, "FAL returned no images");
    }
    if let Err(err) = self.finish(job, urls, creds).await {
      warn!("Uploading FAL results failed (will retry): {err}");
    }
  }

  /// Uploads the results not uploaded yet, then reports the job done.
  async fn finish(&self, mut job: ProviderJob, urls: Vec<String>, creds: &StorytellerCredentialSet) -> anyhow::Result<()> {
    let provider = match job.provider {
      Provider::Fal => GenerationProvider::Fal,
      Provider::Artcraft => GenerationProvider::Artcraft,
    };
    let prompt = job.maybe_prompt_token.as_deref().map(PromptToken::new_from_str);
    let batch = BatchGenerationToken::new_from_str(&job.batch_token);
    for (index, url) in urls.iter().enumerate().skip(job.uploaded.len()) {
      let bytes = timeout(TRANSFER_TIMEOUT, self.download(url)).await??;
      let mut file = tempfile::Builder::new().prefix("artcraft-provider-").suffix(&format!(".{}", image_extension(url))).tempfile()?;
      std::io::Write::write_all(&mut file, &bytes)?;
      // The token is saved before the upload, so a retry can't upload the same result twice.
      let token = job.upload_token(index);
      self.jobs.put(job.clone());
      let args = UploadImageFromFileArgs { api_host: &self.host, maybe_creds: Some(creds), path: file.path(), is_intermediate_system_file: false, maybe_prompt_token: prompt.as_ref(), maybe_generation_provider: Some(provider), maybe_batch_token: Some(&batch) };
      let uploaded = timeout(TRANSFER_TIMEOUT, upload_image_media_file_from_file_with_idempotency_token(args, &token)).await??;
      job.uploaded.push(uploaded.media_file_token.to_string());
      self.jobs.put(job.clone());
    }
    info!("{:?} job {} finished with {} results", job.provider, job.provider_job_id, job.uploaded.len());
    self.jobs.remove(&job.id);
    self.send(Event::ProviderJobFinished { job_id: job.id, batch_token: job.batch_token });
    Ok(())
  }

  async fn download(&self, url: &str) -> anyhow::Result<Vec<u8>> {
    Ok(self.http.get(url).send().await?.error_for_status()?.bytes().await?.to_vec())
  }

  fn fail(&self, job: &ProviderJob, reason: &str) {
    warn!("{:?} job {} failed: {reason}", job.provider, job.provider_job_id);
    self.jobs.remove(&job.id);
    self.send(Event::ProviderJobFailed { job_id: job.id.clone(), reason: reason.to_owned() });
  }

  fn send(&self, event: Event) {
    let _ = self.tx.send(event);
    self.ctx.request_repaint();
  }
}

/// A fal job's image links: the batch, else the single image.
fn image_urls(extracted: Option<&PollResponseExtractedContents>) -> Vec<String> {
  let Some(extracted) = extracted else {
    return Vec::new();
  };
  let batch: Vec<String> = extracted.images.iter().flatten().filter_map(|i| i.url.clone()).collect();
  if !batch.is_empty() {
    return batch;
  }
  extracted.image.as_ref().and_then(|i| i.url.clone()).into_iter().collect()
}

/// The file extension a result URL ends in (PNG when it doesn't say).
fn image_extension(url: &str) -> &'static str {
  let path = url.split(['?', '#']).next().unwrap_or_default().to_ascii_lowercase();
  ["jpg", "jpeg", "webp", "png"].into_iter().find(|ext| path.ends_with(&format!(".{ext}"))).unwrap_or("png")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn results_keep_their_file_type() {
    assert_eq!(image_extension("https://fal.media/files/a/b.jpeg?x=1"), "jpeg");
    assert_eq!(image_extension("https://fal.media/files/a/b.webp"), "webp");
    assert_eq!(image_extension("https://fal.media/files/a/b"), "png");
  }

  #[test]
  fn fal_results_prefer_the_batch() {
    let contents = fal_client::polling::poll_job_response::success_case_extractors::extract_contents_from_response(&serde_json::json!({ "images": [{ "url": "https://fal/1.png" }, { "url": "https://fal/2.png" }] }));
    assert_eq!(image_urls(contents.as_ref()), ["https://fal/1.png", "https://fal/2.png"]);
    let single = fal_client::polling::poll_job_response::success_case_extractors::extract_contents_from_response(&serde_json::json!({ "image": { "url": "https://fal/one.png" } }));
    assert_eq!(image_urls(single.as_ref()), ["https://fal/one.png"]);
    assert!(image_urls(None).is_empty());
  }
}
