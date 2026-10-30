use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum WorldLabsClientError {

  /// An error was encountered in building the Reqwest client
  ReqwestClientError(reqwest::Error),

  /// Can't read a local file for uploading.
  CannotReadLocalFileForUpload(std::io::Error),
}

impl Error for WorldLabsClientError {}

impl Display for WorldLabsClientError {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::ReqwestClientError(err) => write!(f, "Reqwest client error (during client creation): {}", err),
      Self::CannotReadLocalFileForUpload(err) => write!(f, "Cannot read local file for upload: {}", err),
    }
  }
}
