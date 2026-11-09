pub mod add_remove;
pub mod import;
pub mod list;

#[cfg(test)]
mod tests {
  const LIB_RS: &str = include_str!("../../../lib.rs");
  const COMMANDS: [&str; 4] = ["list_favorites", "add_favorite", "remove_favorite", "import_favorite_files"];

  #[test]
  fn commands_are_registered_in_the_invoke_handler() {
    let handler = handler_block();
    for command in COMMANDS {
      let registered = handler.lines().any(|line| line.trim().trim_end_matches(',') == command);
      assert!(registered, "{} is not in generate_handler!", command);
    }
  }

  #[test]
  fn commands_are_imported_in_lib_rs() {
    assert!(LIB_RS.contains("core::commands::favorites::add_remove::{add_favorite, remove_favorite}"));
    assert!(LIB_RS.contains("core::commands::favorites::list::list_favorites"));
    assert!(LIB_RS.contains("core::commands::favorites::import::import_favorite_files"));
  }

  fn handler_block() -> &'static str {
    let start = LIB_RS.find("generate_handler![").expect("generate_handler! not found");
    let rest = &LIB_RS[start..];
    &rest[..rest.find(']').expect("generate_handler! is not closed")]
  }
}
