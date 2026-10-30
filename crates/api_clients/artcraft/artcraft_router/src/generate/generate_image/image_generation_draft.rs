use crate::api::router_provider::RouterProvider;
use crate::errors::artcraft_router_error::ArtcraftRouterError;
use crate::generate::generate_image::image_generation_cost_estimate::ImageGenerationCostEstimate;
use crate::generate::generate_image::image_generation_draft_context::ImageGenerationDraftContext;
use crate::generate::generate_image::image_generation_request::ImageGenerationRequest;

/// Wrapper for all image generation draft requests.
///
/// Drafts hold validated/planned parameters that still need media
/// resolution before they can be sent. No current image provider needs a
/// draft phase, so this enum has no variants.
#[derive(Clone, Debug)]
pub enum ImageGenerationDraftRequest {}

impl ImageGenerationDraftRequest {
  pub fn get_provider(&self) -> RouterProvider {
    match *self {}
  }

  /// Return a cost estimate to fulfill the request.
  pub fn estimate_cost(&self) -> Result<ImageGenerationCostEstimate, ArtcraftRouterError> {
    match *self {}
  }

  /// Finalize the draft request before generation
  /// This may involve uploading media to the provider.
  pub async fn finalize(self, _draft_context: ImageGenerationDraftContext<'_>) -> Result<ImageGenerationRequest, ArtcraftRouterError> {
    match self {}
  }
}
