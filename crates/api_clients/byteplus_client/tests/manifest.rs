//! Checks that the crate is wired into the workspace the crates/AGENTS.md way.

const CRATE_MANIFEST: &str = include_str!("../Cargo.toml");
const WORKSPACE_MANIFEST: &str = include_str!("../../../../Cargo.toml");
const CRATE_PATH: &str = "crates/api_clients/byteplus_client";

#[test]
fn crate_is_a_workspace_member() {
  let members = section_between(WORKSPACE_MANIFEST, "members = [", "]");
  assert!(members.contains(&format!("\"{CRATE_PATH}\"")), "not in workspace members");
}

#[test]
fn crate_is_a_workspace_dependency() {
  let line = format!("byteplus_client = {{ path = \"{CRATE_PATH}\" }}");
  assert!(WORKSPACE_MANIFEST.lines().any(|l| l.trim() == line), "missing [workspace.dependencies] entry");
}

#[test]
fn crate_uses_workspace_deps() {
  for dep in ["anyhow", "reqwest", "serde", "serde_json"] {
    let line = format!("{dep}.workspace = true");
    assert!(CRATE_MANIFEST.lines().any(|l| l.trim() == line), "{dep} is not a workspace dependency");
  }
}

#[test]
fn crate_does_not_pin_its_own_versions() {
  let deps = CRATE_MANIFEST.split("[dependencies]").nth(1).unwrap_or("");
  for l in deps.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
    if l.starts_with('[') {
      break;
    }
    assert!(l.contains("workspace = true"), "non-workspace dependency line: {l}");
  }
}

fn section_between<'a>(text: &'a str, start: &str, end: &str) -> &'a str {
  let after = text.split_once(start).map(|(_, rest)| rest).unwrap_or("");
  after.split_once(end).map(|(inside, _)| inside).unwrap_or("")
}
