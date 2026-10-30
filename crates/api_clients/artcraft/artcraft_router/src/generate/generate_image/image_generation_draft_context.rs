use std::collections::HashMap;
use std::fmt::Debug;

use tokens::tokens::media_files::MediaFileToken;

use crate::client::router_client::RouterClient;

/// Context passed when finalizing an image draft into a concrete request.
///
/// Drafts only exist for providers that need to upload assets before
/// sending the request. Current providers (Artcraft, Fal) accept image
/// inputs directly and skip the draft phase entirely.
#[derive(Clone, Default)]
pub struct ImageGenerationDraftContext<'a> {
  /// Optional: the router client, needed for providers that require
  /// authenticated calls.
  pub client: Option<&'a RouterClient>,

  /// Optional: a map of Media File Tokens to their ArtCraft URLs.
  /// Required only when the draft has unresolved `MediaFileToken` image
  /// inputs that must be downloaded from ArtCraft and re-uploaded to the
  /// target provider's CDN.
  pub media_file_to_artcraft_url_map: Option<&'a HashMap<MediaFileToken, String>>,
}

impl Debug for ImageGenerationDraftContext<'_> {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("ImageGenerationDraftContext")
      .field("client", &self.client.is_some())
      .field("media_file_to_artcraft_url_map", &self.media_file_to_artcraft_url_map.map(|m| m.len()))
      .finish()
  }
}
