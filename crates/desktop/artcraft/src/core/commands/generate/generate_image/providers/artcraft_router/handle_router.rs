use enums::common::generation_provider::GenerationProvider;
use log::info;

use crate::core::commands::enqueue::generate_error::{GenerateError, MissingCredentialsReason};
use crate::core::commands::enqueue::task_enqueue_success::TaskEnqueueSuccess;
use crate::core::commands::generate::generate_image::providers::artcraft_router::handle_api_providers::handle_api_key_provider;
use crate::core::commands::generate::generate_image::providers::artcraft_router::handle_web_login_providers::handle_web_login_provider;
use crate::core::commands::generate::generate_image::tauri_generate_image_request::TauriGenerateImageRequest;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::state::app_env_configs::app_env_configs::AppEnvConfigs;
use crate::services::storyteller::state::storyteller_credential_manager::StorytellerCredentialManager;

/// Dispatch an image generation request to a third-party provider via the router.
///
/// This handles providers that authenticate with the user's own credentials
/// (API key or web login) rather than going through the Artcraft backend.
pub async fn handle_router(
  request: &TauriGenerateImageRequest,
  provider: GenerationProvider,
  app_env_configs: &AppEnvConfigs,
  credential_cache: &ProviderCredentialLoadingCache,
  storyteller_creds_manager: &StorytellerCredentialManager,
) -> Result<TaskEnqueueSuccess, GenerateError> {
  let credential_key = map_provider_to_credential_key(provider)?;

  info!("handle_router: provider={:?}, credential_key={:?}", provider, credential_key);

  let payload = credential_cache.get_credentials(credential_key)
    .map_err(|err| {
      GenerateError::AnyhowError(anyhow::anyhow!("Failed to load credentials: {:?}", err))
    })?
    .ok_or_else(|| map_provider_to_missing_credentials_error(provider))?;

  match payload {
    ProviderCredentialPayload::ApiKey(api_key_data) => {
      handle_api_key_provider(request, provider, api_key_data.as_str(), app_env_configs, storyteller_creds_manager).await
    }
    ProviderCredentialPayload::WebLogin(web_login_data) => {
      handle_web_login_provider(request, provider, &web_login_data).await
    }
  }
}

// ── Helpers ──

fn map_provider_to_credential_key(
  provider: GenerationProvider,
) -> Result<ProviderCredentialKey, GenerateError> {
  match provider {
    GenerationProvider::Fal => Ok(ProviderCredentialKey::FalApiKey),
    GenerationProvider::BytePlus => Ok(ProviderCredentialKey::BytePlusApiKey),
    _ => Err(GenerateError::NotYetImplemented(
      format!("Provider {:?} does not have a mapped credential key yet", provider),
    )),
  }
}

fn map_provider_to_missing_credentials_error(provider: GenerationProvider) -> GenerateError {
  match provider {
    GenerationProvider::Fal => GenerateError::MissingCredentials(MissingCredentialsReason::NeedsFalApiKey),
    GenerationProvider::Grok => GenerateError::MissingCredentials(MissingCredentialsReason::NeedsGrokCredentials),
    GenerationProvider::Midjourney => GenerateError::MissingCredentials(MissingCredentialsReason::NeedsMidjourneyCredentials),
    GenerationProvider::Sora => GenerateError::MissingCredentials(MissingCredentialsReason::NeedsSoraCredentials),
    GenerationProvider::WorldLabs => GenerateError::MissingCredentials(MissingCredentialsReason::NeedsWorldLabsCredentials),
    _ => GenerateError::NoProviderAvailable,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn byteplus_maps_to_byteplus_api_key() {
    assert_eq!(
      map_provider_to_credential_key(GenerationProvider::BytePlus).unwrap(),
      ProviderCredentialKey::BytePlusApiKey
    );
  }

  #[test]
  fn fal_mapping_is_unchanged() {
    assert_eq!(
      map_provider_to_credential_key(GenerationProvider::Fal).unwrap(),
      ProviderCredentialKey::FalApiKey
    );
  }

  #[test]
  fn unmapped_provider_is_not_yet_implemented() {
    let err = map_provider_to_credential_key(GenerationProvider::Higgsfield).unwrap_err();
    assert!(matches!(err, GenerateError::NotYetImplemented(_)), "{:?}", err);
  }

  /// No BytePlus-specific MissingCredentialsReason exists yet, so it falls through.
  #[test]
  fn byteplus_missing_credentials_falls_through_to_no_provider() {
    let err = map_provider_to_missing_credentials_error(GenerationProvider::BytePlus);
    assert!(matches!(err, GenerateError::NoProviderAvailable), "{:?}", err);
  }
}
