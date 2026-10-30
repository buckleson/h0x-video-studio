use std::error::Error;
use std::fmt::{Display, Formatter};
use tokens::tokens::media_files::MediaFileToken;

#[derive(Debug, Clone, Copy)]
pub enum ClientType {
  Artcraft,
  Fal,
  GmiCloud,
  GrokApi,
  WorldLabs,
}

impl Display for ClientType {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Artcraft => write!(f, "Artcraft"),
      Self::Fal => write!(f, "Fal"),
      Self::GmiCloud => write!(f, "GmiCloud"),
      Self::GrokApi => write!(f, "GrokApi"),
      Self::WorldLabs => write!(f, "WorldLabs"),
    }
  }
}

#[derive(Debug)]
pub enum ClientError {
  /// A RouterClient was required but not provided on the draft context.
  RouterClientNotProvided,

  /// The requested client is not configured on the RouterClient.
  ClientNotConfigured(ClientType),

  /// The model does not support the given option value.
  /// `field` is the request field name, `value` is what was requested.
  ModelDoesNotSupportOption { field: &'static str, value: String },

  /// The caller requested zero generations, which is never valid.
  UserRequestedZeroGenerations,

  /// ArtCraft only accepts media tokens for image inputs, not raw URLs.
  ArtcraftOnlySupportsMediaTokens,

  /// Fal only accepts image URLs for image inputs, not media tokens.
  FalOnlySupportsUrls,

  /// The Fal endpoint requires a webhook URL but the caller built the client
  /// in polling/queue mode (no webhook URL). Returned by webhook-only
  /// endpoints (those whose fal_client wrapper has no `api::` queue variant).
  WebhookUrlRequired,
  
  /// The pre-dispatch context of media file token to URL map was not supplied.
  MediaFileToUrlMapNotProvided,

  /// A media file token was not found in the provided media-file-to-URL map.
  MediaFileTokenNotFoundInMap { token: MediaFileToken },
}

impl Error for ClientError {}

impl Display for ClientError {
  fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::RouterClientNotProvided => {
        write!(f, "A RouterClient is required but was not provided on the draft context")
      }
      Self::ClientNotConfigured(client_type) => {
        write!(f, "{} client is not configured on the RouterClient", client_type)
      }
      Self::ModelDoesNotSupportOption { field, value } => {
        write!(f, "Model does not support '{}' for field '{}'", value, field)
      }
      Self::UserRequestedZeroGenerations => {
        write!(f, "Cannot request zero generations")
      }
      Self::ArtcraftOnlySupportsMediaTokens => {
        write!(f, "ArtCraft only supports media tokens for image inputs; upload the image first to obtain a media token")
      }
      Self::FalOnlySupportsUrls => {
        write!(f, "Fal only supports image URLs for image inputs, not media tokens")
      }
      Self::WebhookUrlRequired => {
        write!(f, "This Fal endpoint only supports webhook dispatch; the caller built RouterFalClient in polling-only mode (no webhook URL)")
      }
      Self::MediaFileToUrlMapNotProvided => {
        write!(f, "Media file to URL map was not provided")
      }
      Self::MediaFileTokenNotFoundInMap { token } => {
        write!(f, "Media file token '{}' was not found in the provided URL map", token.as_str())
      }
    }
  }
}
