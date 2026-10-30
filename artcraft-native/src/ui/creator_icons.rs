//! One neutral model-creator icon (Font Awesome Free, CC BY 4.0), rasterized once into a
//! white-on-transparent texture so it can be tinted like the webapp's `icon-auto-contrast`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use egui::{ColorImage, TextureHandle, TextureOptions};

/// Rasterized side, in pixels (crisp up to ~32 pt at 2x).
const RASTER_SIDE: u32 = 64;

/// The same neutral icon for every `ModelCreator`.
fn svg_for_creator(_creator: &str) -> &'static [u8] {
  include_bytes!("../../assets/creator-generic.svg")
}

#[derive(Clone, Default)]
struct Cache(Arc<Mutex<HashMap<String, TextureHandle>>>);

/// A white logo for `creator`, to be tinted when drawn.
pub fn texture(ctx: &egui::Context, creator: &str) -> TextureHandle {
  let cache: Cache = ctx.data_mut(|d| d.get_temp_mut_or_default::<Cache>(egui::Id::new("creator-icons")).clone());
  let mut map = cache.0.lock().unwrap_or_else(|e| e.into_inner());
  if let Some(texture) = map.get(creator) {
    return texture.clone();
  }
  let image = rasterize_mask(svg_for_creator(creator)).unwrap_or_else(|| ColorImage::filled([1, 1], egui::Color32::TRANSPARENT));
  let texture = ctx.load_texture(format!("creator-{creator}"), image, TextureOptions::LINEAR);
  map.insert(creator.to_owned(), texture.clone());
  texture
}

/// Renders an SVG and keeps only its coverage: every pixel becomes white at the original alpha.
fn rasterize_mask(svg: &[u8]) -> Option<ColorImage> {
  let tree = resvg::usvg::Tree::from_data(svg, &resvg::usvg::Options::default()).ok()?;
  let size = tree.size();
  let scale = RASTER_SIDE as f32 / size.width().max(size.height());
  let mut pixmap = resvg::tiny_skia::Pixmap::new(RASTER_SIDE, RASTER_SIDE)?;
  let dx = (RASTER_SIDE as f32 - size.width() * scale) / 2.0;
  let dy = (RASTER_SIDE as f32 - size.height() * scale) / 2.0;
  resvg::render(&tree, resvg::tiny_skia::Transform::from_row(scale, 0.0, 0.0, scale, dx, dy), &mut pixmap.as_mut());
  let pixels = pixmap.pixels().iter().map(|p| egui::Color32::from_white_alpha(p.alpha())).collect();
  Some(ColorImage::new([RASTER_SIDE as usize, RASTER_SIDE as usize], pixels))
}
