//! Connecting provider accounts: the "Set up {provider}" dialog (`ProviderSetupModal`) and the
//! accounts rows in Settings.

use egui::{Id, Ui, vec2};

use crate::backend::providers::Provider;
use crate::overlays::account::text_field;
use crate::theme;
use crate::ui::icons::Icon;
use crate::ui::widgets;

/// What the setup dialog asks for.
#[derive(Debug, PartialEq)]
pub enum SetupAction {
  Close,
  SaveFalKey,
}

/// "Set up {provider}": fal takes an API key here (the Tauri app has no place for it yet).
pub fn setup_dialog(ctx: &egui::Context, provider: Provider, fal_key: &mut String) -> Option<SetupAction> {
  let name = provider.label();
  let mut action = None;
  let close = widgets::modal(ctx, Id::new("provider-setup"), 460.0, |ui| {
    ui.horizontal(|ui| {
      widgets::hud(ui, "Connect account", theme::FAINT);
      ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
        if widgets::ghost(ui, Icon::X, None, "Close", false).clicked() {
          action = Some(SetupAction::Close);
        }
      });
    });
    ui.add_space(6.0);
    ui.label(widgets::heading(&format!("Set up {name}"), 26.0));
    ui.add_space(4.0);
    ui.label(egui::RichText::new(format!("Add your {name} account to ArtCraft!")).size(14.0).family(theme::medium()));
    ui.add_space(10.0);
    let description = format!("Paste your {name} API key to generate with your own {name} account. You can add all of your AI accounts to ArtCraft to use them all in one place and build the ultimate AI art tool.");
    ui.label(egui::RichText::new(description).size(13.0).color(theme::MUTED));
    ui.add_space(16.0);
    text_field(ui, fal_key, true, "FAL API key");
    ui.add_space(10.0);
    let ready = !fal_key.trim().is_empty();
    if ui.add_enabled_ui(ready, |ui| widgets::button(ui, Some(Icon::ChevronRight), &format!("Set up {name}"), widgets::Kind::Primary, ui.available_width(), 40.0)).inner.clicked() {
      action = Some(SetupAction::SaveFalKey);
    }
  });
  if close && action.is_none() {
    action = Some(SetupAction::Close);
  }
  action
}

/// What the accounts rows in Settings show.
pub struct AccountsView {
  /// The saved fal key, masked.
  pub fal_key_hint: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum AccountAction {
  SaveFalKey,
  RemoveFalKey,
}

/// The provider accounts in Settings (the fal key).
pub fn accounts_section(ui: &mut Ui, view: &AccountsView, fal_key: &mut String) -> Option<AccountAction> {
  let mut action = None;
  match &view.fal_key_hint {
    Some(hint) => {
      if account_row(ui, "FAL API key", hint, |ui| widgets::button(ui, None, "Remove", widgets::Kind::Danger, 0.0, theme::CONTROL_H).clicked()) {
        action = Some(AccountAction::RemoveFalKey);
      }
    },
    None => {
      account_row(ui, "FAL API key", "Not set", |_| false);
      ui.add_space(6.0);
      ui.horizontal(|ui| {
        let save_w = 90.0;
        ui.allocate_ui(vec2(ui.available_width() - save_w - 8.0, theme::CONTROL_H), |ui| text_field(ui, fal_key, true, "Paste your FAL API key"));
        let enabled = !fal_key.trim().is_empty();
        if ui.add_enabled_ui(enabled, |ui| widgets::button(ui, None, "Save", widgets::Kind::Secondary, save_w, theme::CONTROL_H)).inner.clicked() {
          action = Some(AccountAction::SaveFalKey);
        }
      });
    },
  }
  action
}

/// A mono label over a detail line, with its button at the right. Returns the button's click.
fn account_row(ui: &mut Ui, label: &str, detail: &str, button: impl FnOnce(&mut Ui) -> bool) -> bool {
  ui.horizontal(|ui| {
    ui.vertical(|ui| {
      ui.set_width(300.0);
      widgets::hud(ui, label, theme::MUTED);
      ui.label(egui::RichText::new(detail).size(13.0));
    });
    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), button).inner
  })
  .inner
}
