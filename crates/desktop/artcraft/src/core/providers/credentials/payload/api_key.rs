use std::error::Error;
use std::fmt::Display;
use std::path::Path;

#[derive(Clone)]
pub struct ApiKeyData(String);

impl ApiKeyData {
  pub fn from_str(s: &str) -> Self {
    Self(s.trim().to_string())
  }

  pub fn as_str(&self) -> &str {
    self.0.as_str()
  }

  /// The last 4 characters, safe to show in the UI. None for keys too short to reveal any part of.
  pub fn hint(&self) -> Option<String> {
    let chars: Vec<char> = self.0.chars().collect();
    if chars.len() < 8 {
      return None;
    }
    Some(chars[chars.len() - 4..].iter().collect())
  }

  pub fn load_from_file<P: AsRef<Path>>(file_path: P) -> Result<Self, ApiKeyDataError> {
    let contents = std::fs::read_to_string(file_path)
      .map_err(ApiKeyDataError::IoError)?;
    Ok(Self(contents.trim().to_string()))
  }

  pub fn save_to_file<P: AsRef<Path>>(&self, file_path: P) -> Result<(), ApiKeyDataError> {
    std::fs::write(file_path, self.0.trim())
      .map_err(ApiKeyDataError::IoError)?;
    Ok(())
  }
}

#[derive(Debug)]
pub enum ApiKeyDataError {
  IoError(std::io::Error),
}

impl Error for ApiKeyDataError {
  fn source(&self) -> Option<&(dyn Error + 'static)> {
    match self {
      ApiKeyDataError::IoError(e) => Some(e),
    }
  }
}

impl Display for ApiKeyDataError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      ApiKeyDataError::IoError(e) => write!(f, "IO error: {}", e),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::NamedTempFile;
  use std::io::Write;

  #[test]
  fn load_trims_whitespace() {
    let mut file = NamedTempFile::new().unwrap();
    write!(file, "  sk-abc123  \n").unwrap();

    let data = ApiKeyData::load_from_file(file.path()).unwrap();
    assert_eq!(data.as_str(), "sk-abc123");
  }

  #[test]
  fn load_trims_newlines() {
    let mut file = NamedTempFile::new().unwrap();
    write!(file, "\nmy_secret_key\n\n").unwrap();

    let data = ApiKeyData::load_from_file(file.path()).unwrap();
    assert_eq!(data.as_str(), "my_secret_key");
  }

  #[test]
  fn save_trims_whitespace() {
    let file = NamedTempFile::new().unwrap();
    let data = ApiKeyData::from_str("  sk-padded  ");
    data.save_to_file(file.path()).unwrap();

    let contents = std::fs::read_to_string(file.path()).unwrap();
    assert_eq!(contents, "sk-padded");
  }

  #[test]
  fn round_trip() {
    let file = NamedTempFile::new().unwrap();
    let original = ApiKeyData::from_str("sk-round-trip-test-key");
    original.save_to_file(file.path()).unwrap();

    let loaded = ApiKeyData::load_from_file(file.path()).unwrap();
    assert_eq!(loaded.as_str(), "sk-round-trip-test-key");
  }

  #[test]
  fn hint_is_last_four_chars() {
    assert_eq!(ApiKeyData::from_str("sk-abcdef1234").hint().as_deref(), Some("1234"));
    assert_eq!(ApiKeyData::from_str("kéy-✓✓✓✓x").hint().as_deref(), Some("✓✓✓x"));
  }

  #[test]
  fn short_keys_have_no_hint() {
    assert_eq!(ApiKeyData::from_str("1234567").hint(), None);
    assert_eq!(ApiKeyData::from_str("").hint(), None);
  }

  // R4-3a edge cases for the key hint shown in the UI.
  mod hint_tests {
    use super::*;

    #[test]
    fn exactly_eight_chars_reveal_only_the_last_four() {
      assert_eq!(ApiKeyData::from_str("abcd1234").hint().as_deref(), Some("1234"));
    }

    #[test]
    fn padding_does_not_count_toward_length() {
      assert_eq!(ApiKeyData::from_str("   1234567   ").hint(), None);
      assert_eq!(ApiKeyData::from_str("\t\n").hint(), None);
    }

    #[test]
    fn hint_comes_from_the_trimmed_key() {
      assert_eq!(ApiKeyData::from_str("sk-abcdef1234 \n").hint().as_deref(), Some("1234"));
    }

    #[test]
    fn hint_never_reveals_more_than_half_of_the_key() {
      for key in ["abcd1234", "sk-0123456789abcdef", "kéy-✓✓✓✓x"] {
        let data = ApiKeyData::from_str(key);
        let hint = data.hint().unwrap();
        assert_eq!(hint.chars().count(), 4, "{}", key);
        assert!(hint.chars().count() * 2 <= key.chars().count(), "{}", key);
        assert_ne!(hint, key);
      }
    }
  }

  #[test]
  fn load_nonexistent_file_returns_io_error() {
    let result = ApiKeyData::load_from_file("/tmp/nonexistent_api_key_file_12345.txt");
    assert!(result.is_err());
  }
}
