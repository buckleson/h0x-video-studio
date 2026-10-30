use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum DownloadError {
  BadStatus {
    url: String,
    status_code: u16,
  },

  ReqwestDownload {
    url: String,
    error: reqwest::Error,
    maybe_status: Option<reqwest::StatusCode>,
  },
}

impl Error for DownloadError {}

impl Display for DownloadError {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::BadStatus { url, status_code } => {
        write!(f, "Download failed for {} with status {}", url, status_code)
      }
      Self::ReqwestDownload { url, error, maybe_status } => {
        write!(f, "Reqwest download error for {}: {} (status: {:?})", url, error, maybe_status)
      }
    }
  }
}
