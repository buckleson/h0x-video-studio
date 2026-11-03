use crate::core::events::generation_events::common::GenerationServiceProvider;
use enums::common::generation_provider::GenerationProvider;

// TODO(bt,2025-07-15): Get rid of GenerationServiceProvider
pub fn to_generation_service_provider(provider: GenerationProvider) -> GenerationServiceProvider {
  match provider {
    GenerationProvider::Artcraft => GenerationServiceProvider::Artcraft,
    GenerationProvider::Fal => GenerationServiceProvider::Fal,
    GenerationProvider::Grok => GenerationServiceProvider::Grok,
    GenerationProvider::Midjourney => GenerationServiceProvider::Midjourney,
    GenerationProvider::Sora => GenerationServiceProvider::Sora,
    GenerationProvider::WorldLabs => GenerationServiceProvider::WorldLabs,
    GenerationProvider::Higgsfield => GenerationServiceProvider::Higgsfield,
    GenerationProvider::Krea => GenerationServiceProvider::Krea,
    GenerationProvider::Leonardo => GenerationServiceProvider::Leonardo,
    GenerationProvider::Magnific => GenerationServiceProvider::Magnific,
    GenerationProvider::Openart => GenerationServiceProvider::Openart,
    GenerationProvider::Picsart => GenerationServiceProvider::Picsart,
    GenerationProvider::Pixverse => GenerationServiceProvider::Pixverse,
    GenerationProvider::Runway => GenerationServiceProvider::Runway,
    GenerationProvider::BytePlus => GenerationServiceProvider::BytePlus,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::commands::enqueue::task_enqueue_success::TaskEnqueueSuccess;
  use enums::tauri::tasks::task_type::TaskType;

  const ALL_PROVIDERS: [GenerationProvider; 15] = [
    GenerationProvider::Artcraft,
    GenerationProvider::Fal,
    GenerationProvider::Grok,
    GenerationProvider::Midjourney,
    GenerationProvider::Sora,
    GenerationProvider::WorldLabs,
    GenerationProvider::Higgsfield,
    GenerationProvider::Krea,
    GenerationProvider::Leonardo,
    GenerationProvider::Magnific,
    GenerationProvider::Openart,
    GenerationProvider::Picsart,
    GenerationProvider::Pixverse,
    GenerationProvider::Runway,
    GenerationProvider::BytePlus,
  ];

  #[test]
  fn byteplus_converts_to_byteplus_service() {
    assert!(matches!(
      to_generation_service_provider(GenerationProvider::BytePlus),
      GenerationServiceProvider::BytePlus
    ));
  }

  #[test]
  fn task_enqueue_success_maps_byteplus_to_byteplus_service() {
    let success = enqueue_success(GenerationProvider::BytePlus);
    assert!(matches!(success.to_frontend_event_service(), GenerationServiceProvider::BytePlus));
  }

  #[test]
  fn task_enqueue_success_agrees_with_conversion_for_every_provider() {
    for provider in ALL_PROVIDERS {
      let from_success = service_name(enqueue_success(provider).to_frontend_event_service());
      let from_util = service_name(to_generation_service_provider(provider));
      assert_eq!(from_success, from_util, "{:?}", provider);
    }
  }

  #[test]
  fn conversion_never_collapses_two_providers_into_one_service() {
    let mut names: Vec<String> = ALL_PROVIDERS.iter()
      .map(|p| service_name(to_generation_service_provider(*p)))
      .collect();
    names.sort();
    names.dedup();
    assert_eq!(names.len(), ALL_PROVIDERS.len());
  }

  /// The frontend sees GenerationProvider as "byteplus"; the event payload should use the same wire name.
  #[test]
  fn byteplus_service_wire_name_matches_generation_provider() {
    let provider_name = serde_json::to_value(GenerationProvider::BytePlus).unwrap();
    let service_name = serde_json::to_value(GenerationServiceProvider::BytePlus).unwrap();
    assert_eq!(service_name, provider_name);
  }

  // ========== Helpers ==========

  fn service_name(service: GenerationServiceProvider) -> String {
    serde_json::to_value(service).unwrap().as_str().unwrap().to_string()
  }

  fn enqueue_success(provider: GenerationProvider) -> TaskEnqueueSuccess {
    TaskEnqueueSuccess {
      task_type: TaskType::VideoGeneration,
      model: None,
      provider,
      provider_job_id: None,
      maybe_queue_status_url: None,
      maybe_queue_response_url: None,
      maybe_prompt_token: None,
    }
  }
}
