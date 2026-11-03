//! This is an important enum.
//!
//! It's used in storyteller-web inference generation, the cost estimate handler,
//! the ArtCraft Tauri app, and more.
//!
//! Do not change the values here without cause or care.

use std::collections::BTreeSet;

use crate::error::enum_error::EnumError;
#[cfg(test)]
use strum::EnumCount;
#[cfg(test)]
use strum::EnumIter;
use utoipa::ToSchema;

/// NB: This will be used by a variety of tables (MySQL and sqlite)!
/// Keep the max length to 16 characters.
#[cfg_attr(test, derive(EnumIter, EnumCount))]
#[derive(Clone, Copy, PartialEq, Eq, Hash, Ord, PartialOrd, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum GenerationProvider {
  Artcraft,
  Fal,
  Grok,
  Midjourney,
  Sora,
  WorldLabs,
  Higgsfield,
  Krea,
  Leonardo,
  Magnific,
  Openart,
  Picsart,
  Pixverse,
  Runway,
  #[serde(rename = "byteplus")]
  BytePlus,
}

impl_enum_display_and_debug_using_to_str!(GenerationProvider);
impl_mysql_enum_coders!(GenerationProvider);
impl_mysql_from_row!(GenerationProvider);

// For Tauri
impl_sqlite_enum_coders!(GenerationProvider);

// NB: We can derive `sqlx::Type` instead of using `impl_mysql_enum_coders`

impl GenerationProvider {
  pub fn to_str(&self) -> &'static str {
    match self {
      Self::Artcraft => "artcraft",
      Self::Fal => "fal",
      Self::Grok => "grok",
      Self::Midjourney => "midjourney",
      Self::Sora => "sora",
      Self::WorldLabs => "world_labs",
      Self::Higgsfield => "higgsfield",
      Self::Krea => "krea",
      Self::Leonardo => "leonardo",
      Self::Magnific => "magnific",
      Self::Openart => "openart",
      Self::Picsart => "picsart",
      Self::Pixverse => "pixverse",
      Self::Runway => "runway",
      Self::BytePlus => "byteplus",
    }
  }

  pub fn from_str(value: &str) -> Result<Self, EnumError> {
    match value {
      "artcraft" => Ok(Self::Artcraft),
      "fal" => Ok(Self::Fal),
      "grok" => Ok(Self::Grok),
      "midjourney" => Ok(Self::Midjourney),
      "sora" => Ok(Self::Sora),
      "world_labs" => Ok(Self::WorldLabs),
      "higgsfield" => Ok(Self::Higgsfield),
      "krea" => Ok(Self::Krea),
      "leonardo" => Ok(Self::Leonardo),
      "magnific" => Ok(Self::Magnific),
      "openart" => Ok(Self::Openart),
      "picsart" => Ok(Self::Picsart),
      "pixverse" => Ok(Self::Pixverse),
      "runway" => Ok(Self::Runway),
      "byteplus" => Ok(Self::BytePlus),
      _ => Err(EnumError::CouldNotConvertFromString(value.to_string())),
    }
  }

  pub fn all_variants() -> BTreeSet<Self> {
    // NB: BTreeSet is sorted
    // NB: BTreeSet::from() isn't const, but not worth using LazyStatic, etc.
    BTreeSet::from([
      Self::Artcraft,
      Self::Fal,
      Self::Grok,
      Self::Midjourney,
      Self::Sora,
      Self::WorldLabs,
      Self::Higgsfield,
      Self::Krea,
      Self::Leonardo,
      Self::Magnific,
      Self::Openart,
      Self::Picsart,
      Self::Pixverse,
      Self::Runway,
      Self::BytePlus,
    ])
  }
}

#[cfg(test)]
mod tests {
  use crate::common::generation_provider::GenerationProvider;
  use crate::error::enum_error::EnumError;
  use crate::test_helpers::assert_serialization;

  mod explicit_checks {
    use super::*;

    #[test]
    fn test_serialization() {
      assert_serialization(GenerationProvider::Artcraft, "artcraft");
      assert_serialization(GenerationProvider::Fal, "fal");
      assert_serialization(GenerationProvider::Grok, "grok");
      assert_serialization(GenerationProvider::Midjourney, "midjourney");
      assert_serialization(GenerationProvider::Sora, "sora");
      assert_serialization(GenerationProvider::WorldLabs, "world_labs");
      assert_serialization(GenerationProvider::Higgsfield, "higgsfield");
      assert_serialization(GenerationProvider::Krea, "krea");
      assert_serialization(GenerationProvider::Leonardo, "leonardo");
      assert_serialization(GenerationProvider::Magnific, "magnific");
      assert_serialization(GenerationProvider::Openart, "openart");
      assert_serialization(GenerationProvider::Picsart, "picsart");
      assert_serialization(GenerationProvider::Pixverse, "pixverse");
      assert_serialization(GenerationProvider::Runway, "runway");
      assert_serialization(GenerationProvider::BytePlus, "byteplus");
    }

    #[test]
    fn to_str() {
      assert_eq!(GenerationProvider::Artcraft.to_str(), "artcraft");
      assert_eq!(GenerationProvider::Fal.to_str(), "fal");
      assert_eq!(GenerationProvider::Grok.to_str(), "grok");
      assert_eq!(GenerationProvider::Midjourney.to_str(), "midjourney");
      assert_eq!(GenerationProvider::Sora.to_str(), "sora");
      assert_eq!(GenerationProvider::WorldLabs.to_str(), "world_labs");
      assert_eq!(GenerationProvider::Higgsfield.to_str(), "higgsfield");
      assert_eq!(GenerationProvider::Krea.to_str(), "krea");
      assert_eq!(GenerationProvider::Leonardo.to_str(), "leonardo");
      assert_eq!(GenerationProvider::Magnific.to_str(), "magnific");
      assert_eq!(GenerationProvider::Openart.to_str(), "openart");
      assert_eq!(GenerationProvider::Picsart.to_str(), "picsart");
      assert_eq!(GenerationProvider::Pixverse.to_str(), "pixverse");
      assert_eq!(GenerationProvider::Runway.to_str(), "runway");
      assert_eq!(GenerationProvider::BytePlus.to_str(), "byteplus");
    }

    #[test]
    fn from_str() {
      assert_eq!(GenerationProvider::from_str("artcraft").unwrap(), GenerationProvider::Artcraft);
      assert_eq!(GenerationProvider::from_str("fal").unwrap(), GenerationProvider::Fal);
      assert_eq!(GenerationProvider::from_str("grok").unwrap(), GenerationProvider::Grok);
      assert_eq!(GenerationProvider::from_str("midjourney").unwrap(), GenerationProvider::Midjourney);
      assert_eq!(GenerationProvider::from_str("sora").unwrap(), GenerationProvider::Sora);
      assert_eq!(GenerationProvider::from_str("world_labs").unwrap(), GenerationProvider::WorldLabs);
      assert_eq!(GenerationProvider::from_str("higgsfield").unwrap(), GenerationProvider::Higgsfield);
      assert_eq!(GenerationProvider::from_str("krea").unwrap(), GenerationProvider::Krea);
      assert_eq!(GenerationProvider::from_str("leonardo").unwrap(), GenerationProvider::Leonardo);
      assert_eq!(GenerationProvider::from_str("magnific").unwrap(), GenerationProvider::Magnific);
      assert_eq!(GenerationProvider::from_str("openart").unwrap(), GenerationProvider::Openart);
      assert_eq!(GenerationProvider::from_str("picsart").unwrap(), GenerationProvider::Picsart);
      assert_eq!(GenerationProvider::from_str("pixverse").unwrap(), GenerationProvider::Pixverse);
      assert_eq!(GenerationProvider::from_str("runway").unwrap(), GenerationProvider::Runway);
      assert_eq!(GenerationProvider::from_str("byteplus").unwrap(), GenerationProvider::BytePlus);
    }

    #[test]
    fn byteplus_round_trip() {
      let variant = GenerationProvider::BytePlus;
      assert_eq!(GenerationProvider::from_str(variant.to_str()).unwrap(), variant);
      let json = serde_json::to_string(&variant).unwrap();
      assert_eq!(json, "\"byteplus\"");
      assert_eq!(serde_json::from_str::<GenerationProvider>(&json).unwrap(), variant);
    }

    #[test]
    fn from_str_err() {
      let result = GenerationProvider::from_str("asdf");
      assert!(result.is_err());
      if let Err(EnumError::CouldNotConvertFromString(value)) = result {
        assert_eq!(value, "asdf");
      } else {
        panic!("Expected EnumError::CouldNotConvertFromString");
      }
    }

    #[test]
    fn all_variants() {
      let mut variants = GenerationProvider::all_variants();
      assert_eq!(variants.len(), 15);
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Artcraft));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Fal));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Grok));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Midjourney));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Sora));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::WorldLabs));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Higgsfield));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Krea));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Leonardo));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Magnific));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Openart));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Picsart));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Pixverse));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::Runway));
      assert_eq!(variants.pop_first(), Some(GenerationProvider::BytePlus));
      assert_eq!(variants.pop_first(), None);
    }
  }

  mod byteplus_edge_cases {
    use super::*;

    const BYTEPLUS: &str = "byteplus";

    const REJECTED_SPELLINGS: [&str; 9] = [
      "byte_plus",
      "BytePlus",
      "Byteplus",
      "BYTEPLUS",
      "byte-plus",
      " byteplus",
      "byteplus ",
      "byteplu",
      "",
    ];

    #[test]
    fn value_is_exact_and_fits_database_column() {
      assert_eq!(GenerationProvider::BytePlus.to_str(), BYTEPLUS);
      assert_eq!(BYTEPLUS.len(), 8);
      assert!(BYTEPLUS.len() <= 16);
    }

    #[test]
    fn display_and_debug_use_wire_value() {
      assert_eq!(format!("{}", GenerationProvider::BytePlus), BYTEPLUS);
      assert_eq!(format!("{:?}", GenerationProvider::BytePlus), BYTEPLUS);
    }

    #[test]
    fn serde_does_not_use_snake_case_default() {
      let json = serde_json::to_string(&GenerationProvider::BytePlus).unwrap();
      assert_ne!(json, "\"byte_plus\"");
      assert_eq!(json, format!("\"{}\"", BYTEPLUS));
    }

    #[test]
    fn serde_value_matches_to_str() {
      let json = serde_json::to_string(&GenerationProvider::BytePlus).unwrap();
      assert_eq!(json.trim_matches('"'), GenerationProvider::BytePlus.to_str());
    }

    #[test]
    fn from_str_rejects_near_miss_spellings() {
      for value in REJECTED_SPELLINGS {
        match GenerationProvider::from_str(value) {
          Err(EnumError::CouldNotConvertFromString(err_value)) => assert_eq!(err_value, value),
          _ => panic!("expected from_str({:?}) to fail", value),
        }
      }
    }

    #[test]
    fn serde_rejects_near_miss_spellings() {
      for value in REJECTED_SPELLINGS {
        let json = serde_json::to_string(value).unwrap();
        assert!(
          serde_json::from_str::<GenerationProvider>(&json).is_err(),
          "expected serde to reject {:?}", value
        );
      }
    }

    #[test]
    fn serde_rejects_non_string_json() {
      assert!(serde_json::from_str::<GenerationProvider>("null").is_err());
      assert!(serde_json::from_str::<GenerationProvider>("14").is_err());
      assert!(serde_json::from_str::<GenerationProvider>("{}").is_err());
      assert_eq!(
        serde_json::from_str::<GenerationProvider>("{\"byteplus\":null}").unwrap(),
        GenerationProvider::BytePlus
      );
    }

    #[test]
    fn round_trips_inside_struct_and_option() {
      #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
      struct Wrapper {
        provider: Option<GenerationProvider>,
      }
      let wrapper = Wrapper { provider: Some(GenerationProvider::BytePlus) };
      let json = serde_json::to_string(&wrapper).unwrap();
      assert_eq!(json, "{\"provider\":\"byteplus\"}");
      assert_eq!(serde_json::from_str::<Wrapper>(&json).unwrap(), wrapper);
    }

    #[test]
    fn listed_in_all_variants() {
      assert!(GenerationProvider::all_variants().contains(&GenerationProvider::BytePlus));
    }

    #[test]
    fn wire_values_are_unique_across_variants() {
      let variants = GenerationProvider::all_variants();
      let values: std::collections::BTreeSet<&str> = variants.iter().map(|v| v.to_str()).collect();
      assert_eq!(values.len(), variants.len());
    }

    #[test]
    fn serde_and_to_str_agree_for_every_variant() {
      for variant in GenerationProvider::all_variants() {
        let json = serde_json::to_string(&variant).unwrap();
        assert_eq!(json, format!("\"{}\"", variant.to_str()), "mismatch for {:?}", variant);
      }
    }

    #[test]
    fn wire_value_has_no_brand_leak() {
      let value = GenerationProvider::BytePlus.to_str().to_lowercase();
      for banned in ["artcraft", "storyteller", "fakeyou", "ltx", "lightricks"] {
        assert!(!value.contains(banned), "byteplus value contains {:?}", banned);
      }
    }
  }

  mod mechanical_checks {
    use super::*;

    #[test]
    fn variant_length() {
      use strum::IntoEnumIterator;
      assert_eq!(GenerationProvider::all_variants().len(), GenerationProvider::iter().len());
    }

    #[test]
    fn round_trip() {
      for variant in GenerationProvider::all_variants() {
        // Test to_str(), from_str(), Display, and Debug.
        assert_eq!(variant, GenerationProvider::from_str(variant.to_str()).unwrap());
        assert_eq!(variant, GenerationProvider::from_str(&format!("{}", variant)).unwrap());
        assert_eq!(variant, GenerationProvider::from_str(&format!("{:?}", variant)).unwrap());
      }
    }

    #[test]
    fn serialized_length_ok_for_database() {
      const MAX_LENGTH : usize = 16;
      for variant in GenerationProvider::all_variants() {
        let serialized = variant.to_str();
        assert!(serialized.len() > 0, "variant {:?} is too short", variant);
        assert!(serialized.len() <= MAX_LENGTH, "variant {:?} is too long", variant);
      }
    }
  }
}
