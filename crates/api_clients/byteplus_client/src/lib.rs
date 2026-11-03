use anyhow::{Result, anyhow, bail};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const BASE_URL: &str = "https://ark.ap-southeast.bytepluses.com/api/v3";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoTaskStatus {
  Queued,
  Running,
  Succeeded,
  Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskStatus {
  pub status: VideoTaskStatus,
  pub video_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct VideoTaskRequest {
  pub model: String,
  pub prompt: String,
  /// Must be a `data:` URL.
  pub maybe_first_frame_data_url: Option<String>,
  pub duration: u32,
  pub resolution: String,
  pub ratio: String,
}

#[derive(Debug, Clone)]
pub struct ImageRequest {
  pub model: String,
  pub prompt: String,
  /// Each must be a `data:` URL.
  pub image_data_urls: Vec<String>,
  pub size: String,
}

#[derive(Deserialize)]
struct CreateTaskResponse {
  id: String,
}

#[derive(Deserialize)]
struct GetTaskResponse {
  status: VideoTaskStatus,
  content: Option<GetTaskContent>,
}

#[derive(Deserialize)]
struct GetTaskContent {
  video_url: Option<String>,
}

#[derive(Deserialize)]
struct ImageResponse {
  data: Vec<ImageData>,
}

#[derive(Deserialize)]
struct ImageData {
  url: String,
}

pub async fn create_video_task(key: &str, req: &VideoTaskRequest) -> Result<String> {
  let body = video_task_body(req)?;
  let text = post_json(key, &format!("{BASE_URL}/contents/generations/tasks"), &body).await?;
  parse_create_task(&text)
}

pub async fn get_video_task(key: &str, id: &str) -> Result<TaskStatus> {
  let response = Client::new()
    .get(format!("{BASE_URL}/contents/generations/tasks/{id}"))
    .bearer_auth(key)
    .send()
    .await?;
  let text = checked_text(response).await?;
  parse_get_task(&text)
}

pub async fn generate_image(key: &str, req: &ImageRequest) -> Result<String> {
  let body = image_body(req)?;
  let text = post_json(key, &format!("{BASE_URL}/images/generations"), &body).await?;
  parse_image(&text)
}

fn video_task_body(req: &VideoTaskRequest) -> Result<Value> {
  let mut content = vec![json!({ "type": "text", "text": req.prompt })];
  if let Some(url) = &req.maybe_first_frame_data_url {
    require_data_url(url)?;
    content.push(json!({
      "type": "image_url",
      "image_url": { "url": url },
      "role": "first_frame",
    }));
  }
  Ok(json!({
    "model": req.model,
    "content": content,
    "duration": req.duration,
    "resolution": req.resolution,
    "ratio": req.ratio,
    "watermark": false,
  }))
}

fn image_body(req: &ImageRequest) -> Result<Value> {
  for url in &req.image_data_urls {
    require_data_url(url)?;
  }
  let mut body = json!({
    "model": req.model,
    "prompt": req.prompt,
    "size": req.size,
    "response_format": "url",
    "watermark": false,
  });
  if !req.image_data_urls.is_empty() {
    body["image"] = json!(req.image_data_urls);
  }
  Ok(body)
}

fn require_data_url(url: &str) -> Result<()> {
  if !url.starts_with("data:") {
    bail!("image input must be a data URL");
  }
  Ok(())
}

async fn post_json<T: Serialize>(key: &str, url: &str, body: &T) -> Result<String> {
  let response = Client::new().post(url).bearer_auth(key).json(body).send().await?;
  checked_text(response).await
}

async fn checked_text(response: reqwest::Response) -> Result<String> {
  let status = response.status();
  let text = response.text().await?;
  if !status.is_success() {
    bail!("BytePlus request failed ({status}): {text}");
  }
  Ok(text)
}

fn parse_create_task(text: &str) -> Result<String> {
  Ok(serde_json::from_str::<CreateTaskResponse>(text)?.id)
}

fn parse_get_task(text: &str) -> Result<TaskStatus> {
  let response: GetTaskResponse = serde_json::from_str(text)?;
  Ok(TaskStatus {
    status: response.status,
    video_url: response.content.and_then(|content| content.video_url),
  })
}

fn parse_image(text: &str) -> Result<String> {
  let response: ImageResponse = serde_json::from_str(text)?;
  response
    .data
    .into_iter()
    .next()
    .map(|data| data.url)
    .ok_or_else(|| anyhow!("BytePlus image response has no data"))
}

#[cfg(test)]
mod tests {
  use super::*;

  const DATA_URL: &str = "data:image/png;base64,iVBORw0KGgo=";

  mod request_tests {
    use super::*;

    #[test]
    fn video_task_body_has_text_first_frame_and_options() {
      let body = video_task_body(&video_request(Some(DATA_URL.to_string()))).unwrap();
      assert_eq!(body, json!({
        "model": "seedance-1-0-pro-250528",
        "content": [
          { "type": "text", "text": "a cat surfing" },
          { "type": "image_url", "image_url": { "url": DATA_URL }, "role": "first_frame" },
        ],
        "duration": 5,
        "resolution": "1080p",
        "ratio": "16:9",
        "watermark": false,
      }));
    }

    #[test]
    fn video_task_body_without_image_has_only_text() {
      let body = video_task_body(&video_request(None)).unwrap();
      assert_eq!(body["content"], json!([{ "type": "text", "text": "a cat surfing" }]));
    }

    #[test]
    fn video_task_body_rejects_non_data_url() {
      let req = video_request(Some("https://example.com/a.png".to_string()));
      assert!(video_task_body(&req).is_err());
    }

    #[test]
    fn image_body_uses_data_urls() {
      let req = ImageRequest {
        model: "seedream-4-0-250828".to_string(),
        prompt: "a lighthouse".to_string(),
        image_data_urls: vec![DATA_URL.to_string()],
        size: "2K".to_string(),
      };
      assert_eq!(image_body(&req).unwrap(), json!({
        "model": "seedream-4-0-250828",
        "prompt": "a lighthouse",
        "size": "2K",
        "response_format": "url",
        "watermark": false,
        "image": [DATA_URL],
      }));
    }
  }

  mod response_tests {
    use super::*;

    #[test]
    fn parses_create_task() {
      let text = include_str!("../tests/fixtures/create_video_task_response.json");
      assert_eq!(parse_create_task(text).unwrap(), "cgt-20251103123456-abcde");
    }

    #[test]
    fn parses_succeeded_task() {
      let text = include_str!("../tests/fixtures/get_video_task_succeeded.json");
      assert_eq!(parse_get_task(text).unwrap(), TaskStatus {
        status: VideoTaskStatus::Succeeded,
        video_url: Some("https://example.com/output/video.mp4".to_string()),
      });
    }

    #[test]
    fn parses_running_task() {
      let text = include_str!("../tests/fixtures/get_video_task_running.json");
      assert_eq!(parse_get_task(text).unwrap(), TaskStatus {
        status: VideoTaskStatus::Running,
        video_url: None,
      });
    }

    #[test]
    fn parses_queued_and_failed_status() {
      let queued = parse_get_task(r#"{"status":"queued"}"#).unwrap();
      let failed = parse_get_task(r#"{"status":"failed"}"#).unwrap();
      assert_eq!(queued.status, VideoTaskStatus::Queued);
      assert_eq!(failed.status, VideoTaskStatus::Failed);
    }

    #[test]
    fn parses_image_url() {
      let text = include_str!("../tests/fixtures/generate_image_response.json");
      assert_eq!(parse_image(text).unwrap(), "https://example.com/output/image.jpeg");
    }

    #[test]
    fn image_without_data_is_error() {
      assert!(parse_image(r#"{"data":[]}"#).is_err());
    }
  }

  mod edge_case_tests {
    use super::*;

    const BRAND_LEAKS: [&str; 6] = ["ltx", "lightricks", "artcraft", "getartcraft", "storyteller", "fakeyou"];

    #[test]
    fn base_url_is_https_without_trailing_slash() {
      assert!(BASE_URL.starts_with("https://"));
      assert!(!BASE_URL.ends_with('/'));
      assert!(BASE_URL.ends_with("/api/v3"));
    }

    #[test]
    fn video_body_text_item_comes_before_image_item() {
      let body = video_task_body(&video_request(Some(DATA_URL.to_string()))).unwrap();
      let content = body["content"].as_array().unwrap();
      assert_eq!(content.len(), 2);
      assert_eq!(content[0]["type"], "text");
      assert_eq!(content[1]["type"], "image_url");
      assert_eq!(content[1]["role"], "first_frame");
    }

    #[test]
    fn video_body_watermark_is_json_bool_and_duration_is_number() {
      let body = video_task_body(&video_request(None)).unwrap();
      assert_eq!(body["watermark"], Value::Bool(false));
      assert!(body["duration"].is_u64());
    }

    #[test]
    fn video_body_preserves_unicode_and_quotes_in_prompt() {
      let mut req = video_request(None);
      req.prompt = "a \"cat\" \u{1F431} on a wave\nnew line".to_string();
      let body = video_task_body(&req).unwrap();
      assert_eq!(body["content"][0]["text"], req.prompt.as_str());
    }

    #[test]
    fn video_body_allows_empty_prompt() {
      let mut req = video_request(None);
      req.prompt = String::new();
      let body = video_task_body(&req).unwrap();
      assert_eq!(body["content"][0]["text"], "");
    }

    #[test]
    fn video_body_rejects_empty_windows_and_file_inputs() {
      for bad in INVALID_IMAGE_INPUTS {
        let req = video_request(Some(bad.to_string()));
        assert!(video_task_body(&req).is_err(), "accepted {bad:?}");
      }
    }

    #[test]
    fn image_body_without_images_omits_image_key() {
      let body = image_body(&image_request(vec![])).unwrap();
      assert!(body.get("image").is_none());
      assert_eq!(body["watermark"], Value::Bool(false));
      assert_eq!(body["response_format"], "url");
    }

    #[test]
    fn image_body_keeps_order_of_several_data_urls() {
      let second = "data:image/jpeg;base64,/9j/4AAQ";
      let body = image_body(&image_request(vec![DATA_URL.to_string(), second.to_string()])).unwrap();
      assert_eq!(body["image"], json!([DATA_URL, second]));
    }

    #[test]
    fn image_body_rejects_if_any_input_is_not_data_url() {
      for bad in INVALID_IMAGE_INPUTS {
        let req = image_request(vec![DATA_URL.to_string(), bad.to_string()]);
        assert!(image_body(&req).is_err(), "accepted {bad:?}");
      }
    }

    #[test]
    fn create_task_missing_id_is_error() {
      assert!(parse_create_task(r#"{"error":{"code":"InvalidParameter"}}"#).is_err());
    }

    #[test]
    fn create_task_malformed_or_empty_body_is_error() {
      assert!(parse_create_task("").is_err());
      assert!(parse_create_task("<html>502</html>").is_err());
      assert!(parse_create_task(r#"{"id":"#).is_err());
    }

    #[test]
    fn get_task_succeeded_with_null_or_missing_video_url_is_none() {
      let null_url = parse_get_task(r#"{"status":"succeeded","content":{"video_url":null}}"#).unwrap();
      let empty_content = parse_get_task(r#"{"status":"succeeded","content":{}}"#).unwrap();
      let null_content = parse_get_task(r#"{"status":"succeeded","content":null}"#).unwrap();
      assert_eq!(null_url.video_url, None);
      assert_eq!(empty_content.video_url, None);
      assert_eq!(null_content.video_url, None);
    }

    #[test]
    fn get_task_failed_with_error_object_parses() {
      let text = r#"{"id":"cgt-1","status":"failed","error":{"code":"OutputVideoSensitiveContentDetected","message":"x"}}"#;
      assert_eq!(parse_get_task(text).unwrap(), TaskStatus {
        status: VideoTaskStatus::Failed,
        video_url: None,
      });
    }

    #[test]
    fn get_task_unknown_or_wrong_case_status_is_error() {
      // Current contract: only the four lowercase statuses are accepted.
      assert!(parse_get_task(r#"{"status":"cancelled"}"#).is_err());
      assert!(parse_get_task(r#"{"status":"Succeeded"}"#).is_err());
      assert!(parse_get_task(r#"{"status":""}"#).is_err());
    }

    #[test]
    fn get_task_missing_status_or_malformed_is_error() {
      assert!(parse_get_task(r#"{"content":{"video_url":"https://example.com/v.mp4"}}"#).is_err());
      assert!(parse_get_task("").is_err());
      assert!(parse_get_task("null").is_err());
    }

    #[test]
    fn image_returns_first_of_several_results() {
      let text = r#"{"data":[{"url":"https://example.com/1.jpeg"},{"url":"https://example.com/2.jpeg"}]}"#;
      assert_eq!(parse_image(text).unwrap(), "https://example.com/1.jpeg");
    }

    #[test]
    fn image_missing_data_or_url_is_error() {
      assert!(parse_image(r#"{}"#).is_err());
      assert!(parse_image(r#"{"data":null}"#).is_err());
      assert!(parse_image(r#"{"data":[{"b64_json":"abc"}]}"#).is_err());
      assert!(parse_image("").is_err());
    }

    #[test]
    fn error_messages_have_no_brand_leaks() {
      let messages = [
        video_task_body(&video_request(Some("https://example.com/a.png".to_string())))
          .unwrap_err()
          .to_string(),
        image_body(&image_request(vec!["C:\\a.png".to_string()])).unwrap_err().to_string(),
        parse_image(r#"{"data":[]}"#).unwrap_err().to_string(),
      ];
      for message in messages {
        let lower = message.to_lowercase();
        for leak in BRAND_LEAKS {
          assert!(!lower.contains(leak), "{message:?} contains {leak:?}");
        }
      }
    }

    const INVALID_IMAGE_INPUTS: [&str; 7] = [
      "",
      "https://example.com/a.png",
      "C:\\Users\\me\\Pictures\\a.png",
      "C:/Users/me/Pictures/a.png",
      "file:///C:/Users/me/a.png",
      " data:image/png;base64,AAAA",
      "image/png;base64,AAAA",
    ];

    fn image_request(image_data_urls: Vec<String>) -> ImageRequest {
      ImageRequest {
        model: "seedream-4-0-250828".to_string(),
        prompt: "a lighthouse".to_string(),
        image_data_urls,
        size: "2K".to_string(),
      }
    }
  }

  fn video_request(maybe_first_frame_data_url: Option<String>) -> VideoTaskRequest {
    VideoTaskRequest {
      model: "seedance-1-0-pro-250528".to_string(),
      prompt: "a cat surfing".to_string(),
      maybe_first_frame_data_url,
      duration: 5,
      resolution: "1080p".to_string(),
      ratio: "16:9".to_string(),
    }
  }
}
