//! Generating through another provider (`ClassyModelSelector`'s "Select Provider"): fal with
//! the user's API key, instead of ArtCraft. Images only;
//! video always runs on ArtCraft. Jobs are tracked here (they aren't ArtCraft jobs) and their
//! results uploaded into the user's library, like the Tauri app.

pub mod accounts;
pub mod jobs;
pub mod submit;
pub mod worker;

use serde::{Deserialize, Serialize};

use crate::models::ModelInfo;

/// Who runs a generation.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
  #[default]
  Artcraft,
  Fal,
}

impl Provider {
  /// The picker's name (`getProviderDisplayName`).
  pub fn label(self) -> &'static str {
    match self {
      Provider::Artcraft => "ArtCraft",
      Provider::Fal => "FAL",
    }
  }

  /// The logo's key in the creator icons.
  pub fn icon(self) -> &'static str {
    match self {
      Provider::Artcraft => "artcraft",
      Provider::Fal => "fal",
    }
  }

  /// The providers `model_id` can run on, the default first (`ImageModels.ts`,
  /// `buildModelsFromListing.ts`): fal for four ArtCraft models.
  pub fn for_model(model_id: &str) -> &'static [Provider] {
    match model_id {
      "flux_1_dev" | "flux_1_schnell" | "nano_banana_2" | "nano_banana_pro" => &[Provider::Artcraft, Provider::Fal],
      _ => &[Provider::Artcraft],
    }
  }

  /// `picked` if `model_id` runs there, else the model's default.
  pub fn resolve(model_id: &str, picked: Option<Provider>) -> Provider {
    let allowed = Provider::for_model(model_id);
    picked.filter(|p| allowed.contains(p)).unwrap_or(allowed[0])
  }

  /// What the model can do on this provider (`imageModelForProvider`): the same everywhere.
  pub fn adapt(self, model: &ModelInfo) -> ModelInfo {
    model.clone()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn models_offer_their_providers_default_first() {
    assert_eq!(Provider::for_model("nano_banana_pro"), [Provider::Artcraft, Provider::Fal]);
    assert_eq!(Provider::for_model("midjourney_8"), [Provider::Artcraft]);
    assert_eq!(Provider::for_model("seedream_4"), [Provider::Artcraft]);
    assert_eq!(Provider::resolve("seedream_4", Some(Provider::Fal)), Provider::Artcraft, "a pick the model can't use falls back");
    assert_eq!(Provider::resolve("flux_1_dev", Some(Provider::Fal)), Provider::Fal);
  }
}
