use crate::core::state::data_dir::trait_data_subdir::DataSubdir;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct AppCredentialsDir {
  path: PathBuf,
}

impl DataSubdir for AppCredentialsDir {
  const DIRECTORY_NAME: &'static str = "credentials";

  fn new_from<P: AsRef<Path>> (dir: P) -> Self {
    Self {
      path: dir.as_ref().to_path_buf(),
    }
  }

  fn path(&self) -> &Path {
    &self.path
  }
}

impl AppCredentialsDir {
  pub fn get_storyteller_avt_cookie_file_path(&self) -> PathBuf {
    self.path.join("artcraft_avt.txt")
  }
  
  pub fn get_storyteller_session_cookie_file_path(&self) -> PathBuf {
    self.path.join("artcraft_session.txt")
  }

  pub fn get_fal_api_key_file_path(&self) -> PathBuf {
    self.path.join("fal_api_key.txt")
  }
}
