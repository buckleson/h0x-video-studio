use crate::api::router_provider::RouterProvider;
use crate::errors::artcraft_router_error::ArtcraftRouterError;
use crate::generate::generate_video::video_generation_cost_estimate::VideoGenerationCostEstimate;
use crate::generate::generate_video::video_generation_draft_context::VideoGenerationDraftContext;
use crate::generate::generate_video::video_generation_request::VideoGenerationRequest;

/// Wrapper for all video generation draft requests.
///
/// Drafts hold validated/planned parameters that still need media
/// resolution before they can be sent. No current video provider needs a
/// draft phase, so this enum has no variants.
#[derive(Clone, Debug)]
pub enum VideoGenerationDraftRequest {}

impl VideoGenerationDraftRequest {
  pub fn get_provider(&self) -> RouterProvider {
    match *self {}
  }

  /// Return a cost estimate to fulfill the request.
  pub fn estimate_cost(&self) -> Result<VideoGenerationCostEstimate, ArtcraftRouterError> {
    match *self {}
  }

  /// Finalize the draft request before generation
  /// This may involve uploading media to the provider.
  pub async fn finalize(self, _draft_context: VideoGenerationDraftContext<'_>) -> Result<VideoGenerationRequest, ArtcraftRouterError> {
    match self {}
  }
}
