use std::path::PathBuf;

use anyhow::anyhow;
use serde_derive::{Deserialize, Serialize};
use uuid_utils::uuid::generate_random_uuid;

use crate::core::providers::credentials::payload::api_key::ApiKeyData;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;
use crate::core::providers::modality_defaults::Modality;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::data_dir::trait_data_subdir::DataSubdir;

const FILENAME: &str = "custom_endpoints.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CustomEndpointKind {
  OpenaiCompatible,
  Other,
}

/// What is stored in the settings JSON. API keys live in the credential store, never here.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CustomEndpoint {
  pub id: String,
  pub name: String,
  pub base_url: String,
  pub kind: CustomEndpointKind,
  pub modalities: Vec<Modality>,
}

#[derive(Serialize)]
pub struct CustomEndpointListEntry {
  pub id: String,
  pub name: String,
  pub base_url: String,
  pub kind: CustomEndpointKind,
  pub modalities: Vec<Modality>,
  pub has_key: bool,
  pub key_hint: Option<String>,
}

#[derive(Deserialize)]
pub struct CustomEndpointSaveRequest {
  pub id: Option<String>,
  pub name: String,
  pub base_url: String,
  pub api_key: Option<String>,
  pub kind: CustomEndpointKind,
  pub modalities: Vec<Modality>,
}

#[derive(Default, Serialize, Deserialize)]
struct CustomEndpointsFile {
  endpoints: Vec<CustomEndpoint>,
}

pub fn load(root: &AppDataRoot) -> anyhow::Result<Vec<CustomEndpoint>> {
  let path = file_path(root);
  if !path.exists() {
    return Ok(Vec::new());
  }
  let file: CustomEndpointsFile = serde_json::from_str(&std::fs::read_to_string(path)?)?;
  Ok(file.endpoints)
}

pub fn list(root: &AppDataRoot, cache: &ProviderCredentialLoadingCache) -> anyhow::Result<Vec<CustomEndpointListEntry>> {
  let mut entries = Vec::new();
  for endpoint in load(root)? {
    let maybe_key = cache.get_custom_endpoint_api_key(&endpoint.id)?;
    entries.push(CustomEndpointListEntry {
      has_key: maybe_key.is_some(),
      key_hint: maybe_key.and_then(|key| key.hint()),
      id: endpoint.id,
      name: endpoint.name,
      base_url: endpoint.base_url,
      kind: endpoint.kind,
      modalities: endpoint.modalities,
    });
  }
  Ok(entries)
}

/// Creates (no id) or updates (existing id) an endpoint and returns its id.
/// A missing or blank `api_key` keeps the stored key.
pub fn save(
  root: &AppDataRoot,
  cache: &ProviderCredentialLoadingCache,
  request: CustomEndpointSaveRequest,
) -> anyhow::Result<String> {
  let name = request.name.trim().to_string();
  if name.is_empty() {
    return Err(anyhow!("Name is required"));
  }
  let base_url = request.base_url.trim().to_string();
  let parsed = url::Url::parse(&base_url).map_err(|_| anyhow!("Base URL is not a valid URL"))?;
  if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
    return Err(anyhow!("Base URL must start with http:// or https://"));
  }

  let mut endpoints = load(root)?;
  let id = match request.id {
    Some(id) => {
      if !endpoints.iter().any(|endpoint| endpoint.id == id) {
        return Err(anyhow!("Unknown endpoint"));
      }
      id
    }
    None => generate_random_uuid(),
  };

  let endpoint = CustomEndpoint {
    id: id.clone(),
    name,
    base_url,
    kind: request.kind,
    modalities: request.modalities,
  };
  match endpoints.iter_mut().find(|existing| existing.id == id) {
    Some(existing) => *existing = endpoint,
    None => endpoints.push(endpoint),
  }

  if let Some(api_key) = request.api_key.as_deref().map(ApiKeyData::from_str) {
    if !api_key.as_str().is_empty() {
      cache.save_custom_endpoint_api_key(&id, &api_key)?;
    }
  }

  write(root, endpoints)?;
  Ok(id)
}

/// Removes the endpoint and its stored key. Unknown ids are a no-op.
pub fn delete(root: &AppDataRoot, cache: &ProviderCredentialLoadingCache, id: &str) -> anyhow::Result<()> {
  let mut endpoints = load(root)?;
  let before = endpoints.len();
  endpoints.retain(|endpoint| endpoint.id != id);
  if endpoints.len() == before {
    return Ok(());
  }
  // Only ids read back from the file reach the credential store, so a request id can't escape its directory.
  cache.delete_custom_endpoint_api_key(id)?;
  write(root, endpoints)
}

fn write(root: &AppDataRoot, endpoints: Vec<CustomEndpoint>) -> anyhow::Result<()> {
  let json = serde_json::to_string_pretty(&CustomEndpointsFile { endpoints })?;
  std::fs::write(file_path(root), json)?;
  Ok(())
}

fn file_path(root: &AppDataRoot) -> PathBuf {
  root.settings_dir().path().join(FILENAME)
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::TempDir;

  const SECRET: &str = "sk-custom-secret-9876";

  fn setup() -> (TempDir, AppDataRoot, ProviderCredentialLoadingCache) {
    let dir = TempDir::new().unwrap();
    let root = AppDataRoot::create_existing(dir.path()).unwrap();
    let cache = ProviderCredentialLoadingCache::new(root.clone());
    (dir, root, cache)
  }

  fn request(id: Option<String>, base_url: &str, api_key: Option<&str>) -> CustomEndpointSaveRequest {
    CustomEndpointSaveRequest {
      id,
      name: " My LLM ".to_string(),
      base_url: base_url.to_string(),
      api_key: api_key.map(|k| k.to_string()),
      kind: CustomEndpointKind::OpenaiCompatible,
      modalities: vec![Modality::Llm, Modality::Image],
    }
  }

  #[test]
  fn empty_when_no_file() {
    let (_dir, root, cache) = setup();
    assert!(load(&root).unwrap().is_empty());
    assert!(list(&root, &cache).unwrap().is_empty());
  }

  #[test]
  fn save_round_trips_and_lists_hint_only() {
    let (_dir, root, cache) = setup();
    let id = save(&root, &cache, request(None, " https://api.example.com/v1 ", Some(SECRET))).unwrap();

    let entries = list(&root, &cache).unwrap();
    assert_eq!(entries.len(), 1);
    let entry = &entries[0];
    assert_eq!(entry.id, id);
    assert_eq!(entry.name, "My LLM");
    assert_eq!(entry.base_url, "https://api.example.com/v1");
    assert_eq!(entry.kind, CustomEndpointKind::OpenaiCompatible);
    assert_eq!(entry.modalities, vec![Modality::Llm, Modality::Image]);
    assert!(entry.has_key);
    assert_eq!(entry.key_hint.as_deref(), Some("9876"));

    let listed = serde_json::to_string(&entries).unwrap();
    assert!(!listed.contains(SECRET));
  }

  #[test]
  fn key_is_never_written_to_the_settings_json() {
    let (dir, root, cache) = setup();
    let id = save(&root, &cache, request(None, "https://api.example.com", Some(SECRET))).unwrap();

    let json = std::fs::read_to_string(dir.path().join("settings").join(FILENAME)).unwrap();
    assert!(!json.contains(SECRET));
    assert!(!json.contains("api_key"));

    let key_file = dir.path().join("credentials").join(format!("custom_endpoint.{}.api_key.txt", id));
    assert_eq!(std::fs::read_to_string(key_file).unwrap(), SECRET);
  }

  #[test]
  fn update_keeps_id_and_existing_key_when_no_new_key() {
    let (_dir, root, cache) = setup();
    let id = save(&root, &cache, request(None, "https://a.example.com", Some(SECRET))).unwrap();
    let same = save(&root, &cache, request(Some(id.clone()), "http://b.example.com", Some("  "))).unwrap();
    assert_eq!(same, id);

    let entries = list(&root, &cache).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].base_url, "http://b.example.com");
    assert_eq!(entries[0].key_hint.as_deref(), Some("9876"));
  }

  #[test]
  fn update_replaces_key() {
    let (_dir, root, cache) = setup();
    let id = save(&root, &cache, request(None, "https://a.example.com", Some(SECRET))).unwrap();
    save(&root, &cache, request(Some(id), "https://a.example.com", Some("sk-new-key-1111"))).unwrap();
    assert_eq!(list(&root, &cache).unwrap()[0].key_hint.as_deref(), Some("1111"));
  }

  #[test]
  fn saving_without_key_has_no_key() {
    let (_dir, root, cache) = setup();
    save(&root, &cache, request(None, "http://localhost:8080", None)).unwrap();
    let entry = &list(&root, &cache).unwrap()[0];
    assert!(!entry.has_key);
    assert_eq!(entry.key_hint, None);
  }

  #[test]
  fn invalid_urls_are_rejected() {
    let (_dir, root, cache) = setup();
    for url in ["", "not a url", "ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "example.com"] {
      assert!(save(&root, &cache, request(None, url, Some(SECRET))).is_err(), "{}", url);
    }
    assert!(load(&root).unwrap().is_empty());
  }

  #[test]
  fn blank_name_is_rejected() {
    let (_dir, root, cache) = setup();
    let mut req = request(None, "https://api.example.com", None);
    req.name = "   ".to_string();
    assert!(save(&root, &cache, req).is_err());
  }

  #[test]
  fn unknown_id_on_update_is_rejected() {
    let (_dir, root, cache) = setup();
    assert!(save(&root, &cache, request(Some("../../evil".to_string()), "https://a.example.com", Some(SECRET))).is_err());
    assert!(load(&root).unwrap().is_empty());
  }

  #[test]
  fn delete_removes_entry_and_key() {
    let (dir, root, cache) = setup();
    let keep = save(&root, &cache, request(None, "https://keep.example.com", Some(SECRET))).unwrap();
    let gone = save(&root, &cache, request(None, "https://gone.example.com", Some(SECRET))).unwrap();

    delete(&root, &cache, &gone).unwrap();

    let ids: Vec<String> = load(&root).unwrap().into_iter().map(|e| e.id).collect();
    assert_eq!(ids, vec![keep.clone()]);
    let credentials = dir.path().join("credentials");
    assert!(!credentials.join(format!("custom_endpoint.{}.api_key.txt", gone)).exists());
    assert!(credentials.join(format!("custom_endpoint.{}.api_key.txt", keep)).exists());
  }

  #[test]
  fn delete_unknown_id_is_a_no_op() {
    let (_dir, root, cache) = setup();
    save(&root, &cache, request(None, "https://a.example.com", None)).unwrap();
    delete(&root, &cache, "missing").unwrap();
    assert_eq!(load(&root).unwrap().len(), 1);
  }

  #[test]
  fn kind_serializes_as_contract_strings() {
    assert_eq!(serde_json::to_string(&CustomEndpointKind::OpenaiCompatible).unwrap(), "\"openai_compatible\"");
    assert_eq!(serde_json::to_string(&CustomEndpointKind::Other).unwrap(), "\"other\"");
  }

  // R4-3a edge cases: URL validation, failed saves, key isolation, corrupt files and the request shape.
  mod edge_tests {
    use super::*;

    const OTHER_SECRET: &str = "sk-other-secret-5555";

    #[test]
    fn windows_paths_and_non_http_urls_are_rejected() {
      let (_dir, root, cache) = setup();
      let urls = [
        "C:\\models\\llm",
        "c:/models/llm",
        "\\\\server\\share\\llm",
        "file://C:/models/llm",
        "http://",
        "https://",
        "ws://example.com",
        "mailto:someone@example.com",
        "data:text/plain,hello",
        "   ",
      ];
      for url in urls {
        assert!(save(&root, &cache, request(None, url, Some(SECRET))).is_err(), "{}", url);
      }
      assert!(load(&root).unwrap().is_empty());
      assert!(credential_files(&root).is_empty());
    }

    #[test]
    fn local_ip_port_and_uppercase_scheme_urls_are_accepted() {
      let (_dir, root, cache) = setup();
      for url in ["http://127.0.0.1:8080/v1", "http://[::1]:11434", "HTTPS://API.EXAMPLE.COM/v1", "http://localhost"] {
        assert!(save(&root, &cache, request(None, url, None)).is_ok(), "{}", url);
      }
      assert_eq!(load(&root).unwrap().len(), 4);
    }

    #[test]
    fn rejected_update_keeps_the_stored_entry_and_key() {
      let (_dir, root, cache) = setup();
      let id = save(&root, &cache, request(None, "https://a.example.com", Some(SECRET))).unwrap();

      let result = save(&root, &cache, request(Some(id.clone()), "ftp://b.example.com", Some(OTHER_SECRET)));
      assert!(result.is_err());

      let entry = &list(&root, &cache).unwrap()[0];
      assert_eq!(entry.base_url, "https://a.example.com");
      assert_eq!(entry.key_hint.as_deref(), Some("9876"));
    }

    #[test]
    fn unknown_traversal_id_writes_no_key_file() {
      let (dir, root, cache) = setup();
      for id in ["../../evil", "..\\..\\evil", ""] {
        assert!(save(&root, &cache, request(Some(id.to_string()), "https://a.example.com", Some(SECRET))).is_err(), "{:?}", id);
      }
      assert!(credential_files(&root).is_empty());
      assert!(!dir.path().join("evil").exists());
      assert!(!dir.path().join("settings").join(FILENAME).exists());
    }

    #[test]
    fn key_is_trimmed_in_the_credential_file() {
      let (_dir, root, cache) = setup();
      let id = save(&root, &cache, request(None, "https://a.example.com", Some("  sk-padded-key-4321 \n"))).unwrap();
      let key = cache.get_custom_endpoint_api_key(&id).unwrap().unwrap();
      assert_eq!(key.as_str(), "sk-padded-key-4321");
      assert_eq!(list(&root, &cache).unwrap()[0].key_hint.as_deref(), Some("4321"));
    }

    #[test]
    fn new_endpoints_get_distinct_filename_safe_ids() {
      let (_dir, root, cache) = setup();
      let first = save(&root, &cache, request(None, "https://a.example.com", None)).unwrap();
      let second = save(&root, &cache, request(None, "https://a.example.com", None)).unwrap();
      assert_ne!(first, second);
      for id in [&first, &second] {
        assert!(!id.is_empty());
        assert!(!id.contains('/') && !id.contains('\\') && !id.contains(".."), "{}", id);
      }
    }

    #[test]
    fn updating_one_endpoint_leaves_the_other_key_alone() {
      let (_dir, root, cache) = setup();
      let first = save(&root, &cache, request(None, "https://a.example.com", Some(SECRET))).unwrap();
      let second = save(&root, &cache, request(None, "https://b.example.com", Some(OTHER_SECRET))).unwrap();

      save(&root, &cache, request(Some(first.clone()), "https://a.example.com", Some("sk-rotated-key-0000"))).unwrap();

      assert_eq!(cache.get_custom_endpoint_api_key(&first).unwrap().unwrap().as_str(), "sk-rotated-key-0000");
      assert_eq!(cache.get_custom_endpoint_api_key(&second).unwrap().unwrap().as_str(), OTHER_SECRET);
    }

    #[test]
    fn delete_of_unknown_id_never_touches_provider_keys() {
      let (dir, root, cache) = setup();
      let byteplus_file = dir.path().join("credentials").join("byteplus.api_key.txt");
      std::fs::write(&byteplus_file, "bp-key-12345678").unwrap();

      for id in ["../byteplus", "byteplus", "..\\byteplus", ""] {
        delete(&root, &cache, id).unwrap();
      }
      assert_eq!(std::fs::read_to_string(byteplus_file).unwrap(), "bp-key-12345678");
    }

    #[test]
    fn corrupt_settings_file_errors_and_is_not_overwritten() {
      let (dir, root, cache) = setup();
      let path = dir.path().join("settings").join(FILENAME);
      std::fs::write(&path, "{ not json").unwrap();

      assert!(load(&root).is_err());
      assert!(list(&root, &cache).is_err());
      assert!(save(&root, &cache, request(None, "https://a.example.com", Some(SECRET))).is_err());
      assert!(delete(&root, &cache, "anything").is_err());
      assert_eq!(std::fs::read_to_string(path).unwrap(), "{ not json");
      assert!(credential_files(&root).is_empty());
    }

    #[test]
    fn settings_json_holds_no_key_fields_after_many_saves() {
      let (dir, root, cache) = setup();
      let id = save(&root, &cache, request(None, "https://a.example.com", Some(SECRET))).unwrap();
      save(&root, &cache, request(Some(id), "https://a.example.com", Some(OTHER_SECRET))).unwrap();
      save(&root, &cache, request(None, "https://b.example.com", Some(SECRET))).unwrap();

      let json = std::fs::read_to_string(dir.path().join("settings").join(FILENAME)).unwrap();
      for banned in [SECRET, OTHER_SECRET, "api_key", "has_key", "key_hint"] {
        assert!(!json.contains(banned), "settings JSON contains {}", banned);
      }
    }

    #[test]
    fn list_entry_serializes_to_the_contract_fields_only() {
      let (_dir, root, cache) = setup();
      save(&root, &cache, request(None, "https://a.example.com", Some(SECRET))).unwrap();
      let value = serde_json::to_value(&list(&root, &cache).unwrap()[0]).unwrap();
      let mut fields: Vec<&str> = value.as_object().unwrap().keys().map(|k| k.as_str()).collect();
      fields.sort();
      assert_eq!(fields, vec!["base_url", "has_key", "id", "key_hint", "kind", "modalities", "name"]);
      assert_eq!(value["kind"], "openai_compatible");
      assert_eq!(value["modalities"], serde_json::json!(["llm", "image"]));
    }

    #[test]
    fn frontend_save_request_without_optional_fields_deserializes() {
      let req: CustomEndpointSaveRequest = serde_json::from_str(
        r#"{"name":"Local","base_url":"http://localhost:1234","kind":"other","modalities":["audio"]}"#,
      ).unwrap();
      assert_eq!(req.id, None);
      assert!(req.api_key.is_none());
      assert_eq!(req.kind, CustomEndpointKind::Other);
      assert_eq!(req.modalities, vec![Modality::Audio]);
    }

    #[test]
    fn save_request_rejects_unknown_kind_and_modality() {
      let bad_kind = r#"{"name":"x","base_url":"http://a.b","kind":"anthropic","modalities":[]}"#;
      let bad_modality = r#"{"name":"x","base_url":"http://a.b","kind":"other","modalities":["text"]}"#;
      assert!(serde_json::from_str::<CustomEndpointSaveRequest>(bad_kind).is_err());
      assert!(serde_json::from_str::<CustomEndpointSaveRequest>(bad_modality).is_err());
    }

    fn credential_files(root: &AppDataRoot) -> Vec<String> {
      let dir = root.credentials_dir().path();
      if !dir.exists() {
        return Vec::new();
      }
      std::fs::read_dir(dir).unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
        .collect()
    }
  }
}
