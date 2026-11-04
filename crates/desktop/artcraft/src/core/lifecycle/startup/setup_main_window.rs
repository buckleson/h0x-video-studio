use crate::core::windows::main_window::constants::MAIN_WINDOW_NAME;
use errors::AnyhowResult;
use tauri::window::Color;
use tauri::{AppHandle, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

/// Preferred window size on large screens (logical pixels).
const PREFERRED_SIZE: (f64, f64) = (2400.0, 1300.0);

/// Share of the monitor the window may cover, so it never opens wider than the screen.
const SCREEN_SHARE: f64 = 0.9;

/// Window size that fits a monitor of `screen` logical pixels.
fn fit_window_size(screen: Option<(f64, f64)>) -> (f64, f64) {
  match screen {
    Some((w, h)) if w > 0.0 && h > 0.0 => (
      (w * SCREEN_SHARE).min(PREFERRED_SIZE.0).round(),
      (h * SCREEN_SHARE).min(PREFERRED_SIZE.1).round(),
    ),
    _ => (1280.0, 800.0),
  }
}

pub async fn setup_main_window(
  app: &AppHandle,
) -> AnyhowResult<()> {

  let screen = app.primary_monitor().ok().flatten().map(|m| {
    let logical = m.size().to_logical::<f64>(m.scale_factor());
    (logical.width, logical.height)
  });
  let (width, height) = fit_window_size(screen);

  let win_builder =
      WebviewWindowBuilder::new(app, MAIN_WINDOW_NAME, WebviewUrl::default())
          .title("H0x Video Studio")
          .resizable(true)
          .fullscreen(false)
          .background_color(Color(0, 0, 0, 0))
          .enable_clipboard_access()
          .inner_size(width, height)
          .center();

  #[cfg(target_os = "macos")]
  let win_builder = win_builder
      .decorations(true) // NB: Mac requires decorations. Tons of capabilities disappear otherwise.
      .title_bar_style(TitleBarStyle::Overlay)
      .hidden_title(true)
      .accept_first_mouse(true) // https://github.com/tauri-apps/tauri/issues/11605#issuecomment-2460112096
      .focusable(true)
      .focused(true);

  // NB: Setting decorations(false) "breaks" Mac, though I never documented how/why.
  // NB: On Linux, setting decorations(false) will cause the window to be unable to be
  // resized, despite the arrow cursor indicating resize is possible. This might be
  // fixable another way, but for now it seems fine to disable this. There also seem to
  // be some performance loss with decorations(false), but I might be imagining it.
  #[cfg(target_os = "windows")]
  let win_builder = win_builder
      .decorations(false); // NB: This breaks Mac! (And breaks resize on Linux)

  // On macOS, Cmd+A/C/V/X/Z and friends are dispatched by AppKit through the application
  // menu. Without an Edit submenu containing the standard predefined items, these
  // shortcuts never reach the WKWebView and text inputs behave as if Cmd is unmapped.
  #[cfg(target_os = "macos")]
  install_macos_app_menu(app)?;

  let _window = win_builder.build()?;

  Ok(())
}

#[cfg(target_os = "macos")]
fn install_macos_app_menu(app: &AppHandle) -> AnyhowResult<()> {
  use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

  let app_submenu = Submenu::with_items(
    app,
    "H0x Video Studio",
    true,
    &[
      &PredefinedMenuItem::about(app, None, None)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::services(app, None)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::hide(app, None)?,
      &PredefinedMenuItem::hide_others(app, None)?,
      &PredefinedMenuItem::show_all(app, None)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::quit(app, None)?,
    ],
  )?;

  let edit_submenu = Submenu::with_items(
    app,
    "Edit",
    true,
    &[
      &PredefinedMenuItem::undo(app, None)?,
      &PredefinedMenuItem::redo(app, None)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::cut(app, None)?,
      &PredefinedMenuItem::copy(app, None)?,
      &PredefinedMenuItem::paste(app, None)?,
      &PredefinedMenuItem::select_all(app, None)?,
    ],
  )?;

  let window_submenu = Submenu::with_items(
    app,
    "Window",
    true,
    &[
      &PredefinedMenuItem::minimize(app, None)?,
      &PredefinedMenuItem::maximize(app, None)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::close_window(app, None)?,
    ],
  )?;

  let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])?;
  app.set_menu(menu)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn laptop_screen_gets_ninety_percent() {
    assert_eq!(fit_window_size(Some((1536.0, 864.0))), (1382.0, 778.0));
  }

  #[test]
  fn large_screen_is_capped_at_preferred_size() {
    assert_eq!(fit_window_size(Some((3840.0, 2160.0))), PREFERRED_SIZE);
  }

  #[test]
  fn never_wider_or_taller_than_the_screen() {
    for (w, h) in [(1280.0, 720.0), (1366.0, 768.0), (1920.0, 1080.0), (2560.0, 1440.0)] {
      let (fw, fh) = fit_window_size(Some((w, h)));
      assert!(fw <= w && fh <= h, "{w}x{h} -> {fw}x{fh}");
    }
  }

  #[test]
  fn unknown_monitor_falls_back_to_safe_size() {
    assert_eq!(fit_window_size(None), (1280.0, 800.0));
    assert_eq!(fit_window_size(Some((0.0, 0.0))), (1280.0, 800.0));
  }
}
