use std::collections::HashMap;
use std::error::Error;
use std::fmt::Display;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use log::{info, warn};

use crate::core::providers::credentials::payload::api_key::{ApiKeyData, ApiKeyDataError};
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::payload::web_login::{WebLoginData, WebLoginDataError};
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_type::ProviderCredentialType;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;

struct CacheEntry {
  payload: ProviderCredentialPayload,
  loaded_at: Instant,
}

#[derive(Clone)]
pub struct ProviderCredentialLoadingCache {
  inner: Arc<RwLock<HashMap<ProviderCredentialKey, CacheEntry>>>,
  app_data_root: AppDataRoot,
  ttl: Duration,
}

impl ProviderCredentialLoadingCache {
  pub fn new(app_data_root: AppDataRoot) -> Self {
    Self {
      inner: Arc::new(RwLock::new(HashMap::new())),
      app_data_root,
      ttl: Duration::from_secs(300), // 5 minutes
    }
  }

  pub fn new_with_ttl(app_data_root: AppDataRoot, ttl: Duration) -> Self {
    Self {
      inner: Arc::new(RwLock::new(HashMap::new())),
      app_data_root,
      ttl,
    }
  }

  pub fn get_credentials(
    &self,
    key: ProviderCredentialKey,
  ) -> Result<Option<ProviderCredentialPayload>, ProviderCredentialLoadingCacheError> {
    // Check cache first.
    {
      let cache = self.inner.read()
        .map_err(|_| ProviderCredentialLoadingCacheError::LockPoisoned)?;

      if let Some(entry) = cache.get(&key) {
        if entry.loaded_at.elapsed() < self.ttl {
          return Ok(Some(entry.payload.clone()));
        }
      }
    }

    // Cache miss or expired — load from disk.
    let file_path = self.app_data_root.credentials_dir().path().join(key.get_filename());

    if !file_path.exists() {
      if key == ProviderCredentialKey::BytePlusApiKey {
        if let Ok(value) = std::env::var("BYTEPLUS_API_KEY") {
          if !value.trim().is_empty() {
            return Ok(Some(ProviderCredentialPayload::ApiKey(ApiKeyData::from_str(&value))));
          }
        }
      }
      return Ok(None);
    }

    info!("Loading credential from disk: {:?}", file_path);

    let payload = match key.get_type() {
      ProviderCredentialType::ApiKey => {
        let data = ApiKeyData::load_from_file(&file_path)
          .map_err(ProviderCredentialLoadingCacheError::ApiKeyError)?;
        ProviderCredentialPayload::ApiKey(data)
      }
      ProviderCredentialType::WebLogin => {
        let data = WebLoginData::load_from_file(&file_path)
          .map_err(ProviderCredentialLoadingCacheError::WebLoginError)?;
        ProviderCredentialPayload::WebLogin(data)
      }
    };

    // Store in cache.
    {
      let mut cache = self.inner.write()
        .map_err(|_| ProviderCredentialLoadingCacheError::LockPoisoned)?;

      cache.insert(key, CacheEntry {
        payload: payload.clone(),
        loaded_at: Instant::now(),
      });
    }

    Ok(Some(payload))
  }

  pub fn save_credentials(
    &self,
    key: ProviderCredentialKey,
    payload: ProviderCredentialPayload,
  ) -> Result<(), ProviderCredentialLoadingCacheError> {
    let file_path = self.app_data_root.credentials_dir().path().join(key.get_filename());

    info!("Saving credential to disk: {:?}", file_path);

    match (&payload, key.get_type()) {
      (ProviderCredentialPayload::ApiKey(data), ProviderCredentialType::ApiKey) => {
        data.save_to_file(&file_path)
          .map_err(ProviderCredentialLoadingCacheError::ApiKeyError)?;
      }
      (ProviderCredentialPayload::WebLogin(data), ProviderCredentialType::WebLogin) => {
        data.save_to_file(&file_path)
          .map_err(ProviderCredentialLoadingCacheError::WebLoginError)?;
      }
      _ => {
        warn!("Credential type mismatch for key {:?}", key);
        return Err(ProviderCredentialLoadingCacheError::TypeMismatch);
      }
    }

    // Update cache.
    {
      let mut cache = self.inner.write()
        .map_err(|_| ProviderCredentialLoadingCacheError::LockPoisoned)?;

      cache.insert(key, CacheEntry {
        payload,
        loaded_at: Instant::now(),
      });
    }

    Ok(())
  }

  /// Invalidate a cached entry, forcing a re-read from disk on next access.
  pub fn invalidate(&self, key: ProviderCredentialKey) {
    if let Ok(mut cache) = self.inner.write() {
      cache.remove(&key);
    }
  }
  
  pub fn delete_credentials(&self, key: ProviderCredentialKey) -> Result<(), ProviderCredentialLoadingCacheError> {
    let file_path = self.app_data_root.credentials_dir().path().join(key.get_filename());
    
    if file_path.exists() {
      std::fs::remove_file(file_path)
          .map_err(|e| ProviderCredentialLoadingCacheError::IoError(e))?;
    }
    
    self.invalidate(key);

    Ok(())
  }

  /// Custom endpoint keys are not cached. Endpoint ids must be filename-safe (see custom_endpoints).
  pub fn get_custom_endpoint_api_key(&self, endpoint_id: &str) -> Result<Option<ApiKeyData>, ProviderCredentialLoadingCacheError> {
    let file_path = self.custom_endpoint_key_path(endpoint_id);
    if !file_path.exists() {
      return Ok(None);
    }
    ApiKeyData::load_from_file(&file_path)
      .map(Some)
      .map_err(ProviderCredentialLoadingCacheError::ApiKeyError)
  }

  pub fn save_custom_endpoint_api_key(&self, endpoint_id: &str, api_key: &ApiKeyData) -> Result<(), ProviderCredentialLoadingCacheError> {
    api_key.save_to_file(self.custom_endpoint_key_path(endpoint_id))
      .map_err(ProviderCredentialLoadingCacheError::ApiKeyError)
  }

  pub fn delete_custom_endpoint_api_key(&self, endpoint_id: &str) -> Result<(), ProviderCredentialLoadingCacheError> {
    let file_path = self.custom_endpoint_key_path(endpoint_id);
    if file_path.exists() {
      std::fs::remove_file(file_path)
        .map_err(ProviderCredentialLoadingCacheError::IoError)?;
    }
    Ok(())
  }

  fn custom_endpoint_key_path(&self, endpoint_id: &str) -> std::path::PathBuf {
    let filename = format!("custom_endpoint.{}.api_key.txt", endpoint_id);
    self.app_data_root.credentials_dir().path().join(filename)
  }
}

#[derive(Debug)]
pub enum ProviderCredentialLoadingCacheError {
  IoError(std::io::Error),
  ApiKeyError(ApiKeyDataError),
  WebLoginError(WebLoginDataError),
  TypeMismatch,
  LockPoisoned,
}

impl Error for ProviderCredentialLoadingCacheError {
  fn source(&self) -> Option<&(dyn Error + 'static)> {
    match self {
      Self::IoError(err) => Some(err),
      Self::ApiKeyError(err) => Some(err),
      Self::WebLoginError(err) => Some(err),
      _ => None,
    }
  }
}

impl Display for ProviderCredentialLoadingCacheError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::IoError(e) => write!(f, "IO error: {}", e),
      Self::ApiKeyError(e) => write!(f, "API key error: {}", e),
      Self::WebLoginError(e) => write!(f, "Web login error: {}", e),
      Self::TypeMismatch => write!(f, "Credential type does not match key type"),
      Self::LockPoisoned => write!(f, "Internal lock poisoned"),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serial_test::serial;
  use tempfile::TempDir;

  const ENV_VAR: &str = "BYTEPLUS_API_KEY";

  #[test]
  #[serial(byteplus_env)]
  fn missing_file_falls_back_to_env_var() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, Some("bp-env-key"));

    let payload = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(api_key_of(payload).as_deref(), Some("bp-env-key"));
  }

  #[test]
  #[serial(byteplus_env)]
  fn env_value_is_trimmed() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, Some("  bp-padded \r\n"));

    let payload = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(api_key_of(payload).as_deref(), Some("bp-padded"));
  }

  #[test]
  #[serial(byteplus_env)]
  fn file_wins_over_env_var() {
    let (dir, cache) = new_cache();
    write_key_file(&dir, "bp-file-key\n");
    let _env = EnvGuard::set(ENV_VAR, Some("bp-env-key"));

    let payload = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(api_key_of(payload).as_deref(), Some("bp-file-key"));
  }

  #[test]
  #[serial(byteplus_env)]
  fn missing_file_and_unset_env_is_none() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, None);

    let payload = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert!(payload.is_none());
  }

  #[test]
  #[serial(byteplus_env)]
  fn empty_env_var_is_none() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, Some(""));

    let payload = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert!(payload.is_none());
  }

  #[test]
  #[serial(byteplus_env)]
  fn whitespace_only_env_var_is_none() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, Some("  \t \n"));

    let payload = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert!(payload.is_none());
  }

  #[test]
  #[serial(byteplus_env)]
  fn env_fallback_does_not_apply_to_other_keys() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, Some("bp-env-key"));

    for key in [
      ProviderCredentialKey::FalApiKey,
      ProviderCredentialKey::ReplicateApiKey,
      ProviderCredentialKey::RunwayWebLogin,
    ] {
      assert!(cache.get_credentials(key).unwrap().is_none(), "{:?}", key);
    }
  }

  #[test]
  #[serial(byteplus_env)]
  fn env_sourced_key_is_not_cached() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, Some("bp-first"));
    let first = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(api_key_of(first).as_deref(), Some("bp-first"));

    std::env::set_var(ENV_VAR, "bp-second");
    let second = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(api_key_of(second).as_deref(), Some("bp-second"));

    std::env::remove_var(ENV_VAR);
    let third = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert!(third.is_none());
  }

  #[test]
  #[serial(byteplus_env)]
  fn deleting_saved_file_reverts_to_env_var() {
    let (_dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, Some("bp-env-key"));

    cache.save_credentials(
      ProviderCredentialKey::BytePlusApiKey,
      ProviderCredentialPayload::ApiKey(ApiKeyData::from_str("bp-saved")),
    ).unwrap();
    let saved = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(api_key_of(saved).as_deref(), Some("bp-saved"));

    cache.delete_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    let after = cache.get_credentials(ProviderCredentialKey::BytePlusApiKey).unwrap();
    assert_eq!(api_key_of(after).as_deref(), Some("bp-env-key"));
  }

  #[test]
  #[serial(byteplus_env)]
  fn saved_byteplus_key_lands_in_credentials_dir_file() {
    let (dir, cache) = new_cache();
    let _env = EnvGuard::set(ENV_VAR, None);

    cache.save_credentials(
      ProviderCredentialKey::BytePlusApiKey,
      ProviderCredentialPayload::ApiKey(ApiKeyData::from_str(" bp-saved ")),
    ).unwrap();

    let path = dir.path().join("credentials").join("byteplus.api_key.txt");
    assert_eq!(std::fs::read_to_string(path).unwrap(), "bp-saved");
  }

  #[test]
  fn production_log_macros_never_format_key_values() {
    let source = include_str!("provider_credential_loading_cache.rs");
    let production = source.split("#[cfg(test)]").next().unwrap();
    let macros = ["info!", "warn!", "error!", "debug!", "trace!", "println!", "eprintln!", "format!", "anyhow!"];
    let secrets = ["value", "as_str", "payload", "data", "BYTEPLUS_API_KEY", "env::var"];
    for line in production.lines().filter(|l| macros.iter().any(|m| l.contains(m))) {
      for secret in secrets {
        assert!(!line.contains(secret), "log line may leak a secret ({}): {}", secret, line.trim());
      }
    }
  }

  // ========== Helpers ==========

  fn new_cache() -> (TempDir, ProviderCredentialLoadingCache) {
    let dir = TempDir::new().unwrap();
    let root = AppDataRoot::create_existing(dir.path()).unwrap();
    (dir, ProviderCredentialLoadingCache::new(root))
  }

  fn write_key_file(dir: &TempDir, contents: &str) {
    let path = dir.path().join("credentials").join(ProviderCredentialKey::BytePlusApiKey.get_filename());
    std::fs::write(path, contents).unwrap();
  }

  fn api_key_of(payload: Option<ProviderCredentialPayload>) -> Option<String> {
    match payload {
      Some(ProviderCredentialPayload::ApiKey(data)) => Some(data.as_str().to_string()),
      Some(ProviderCredentialPayload::WebLogin(_)) => panic!("expected an API key payload"),
      None => None,
    }
  }

  /// Restores the previous env value on drop so tests stay independent.
  struct EnvGuard {
    name: &'static str,
    previous: Option<String>,
  }

  impl EnvGuard {
    fn set(name: &'static str, value: Option<&str>) -> Self {
      let previous = std::env::var(name).ok();
      match value {
        Some(v) => std::env::set_var(name, v),
        None => std::env::remove_var(name),
      }
      Self { name, previous }
    }
  }

  impl Drop for EnvGuard {
    fn drop(&mut self) {
      match &self.previous {
        Some(v) => std::env::set_var(self.name, v),
        None => std::env::remove_var(self.name),
      }
    }
  }
}
