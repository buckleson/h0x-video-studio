use crate::api::router_provider::RouterProvider;
use crate::errors::artcraft_router_error::ArtcraftRouterError;
use crate::generate::generate_audio::audio_generation_cost_estimate::AudioGenerationCostEstimate;
use crate::generate::generate_audio::audio_generation_draft_context::AudioGenerationDraftContext;
use crate::generate::generate_audio::audio_generation_request::AudioGenerationRequest;

/// Wrapper for all audio generation draft requests.
///
/// Drafts hold validated/planned parameters that still need media
/// resolution before they can be sent. No current audio provider needs a
/// draft phase, so this enum has no variants.
#[derive(Clone, Debug)]
pub enum AudioGenerationDraftRequest {}

impl AudioGenerationDraftRequest {
  pub fn get_provider(&self) -> RouterProvider {
    match *self {}
  }

  /// Return a cost estimate to fulfill the request.
  pub fn estimate_cost(&self) -> Result<AudioGenerationCostEstimate, ArtcraftRouterError> {
    match *self {}
  }

  /// Finalize the draft request before generation
  /// This may involve uploading media to the provider.
  pub async fn finalize(self, _draft_context: AudioGenerationDraftContext<'_>) -> Result<AudioGenerationRequest, ArtcraftRouterError> {
    match self {}
  }
}
