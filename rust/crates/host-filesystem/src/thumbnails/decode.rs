//! Static image decode + fit + webp encode.
//!
//! See `decode.test.rs` for the contract.

use image::{DynamicImage, ImageReader, RgbaImage};
use std::io::Cursor;

use ab_glyph::{Font, FontVec, PxScale, ScaleFont};
use imageproc::drawing::draw_text_mut;

#[cfg(test)]
#[path = "decode.test.rs"]
mod tests;

/// Outcome of decoding a single source file.
///
/// `Static` is one still `RgbaImage`. `Animated` carries every frame for
/// animated formats (currently GIF). `SvgSource` keeps the raw SVG markup
/// for downstream rasterization — SVG decoding is handled separately by
/// `resvg`, not by `image`.
#[derive(Debug)]
pub enum DecodedImage {
    Static(RgbaImage),
    Animated { frames: Vec<RgbaImage> },
    SvgSource(String),
}

/// Errors returned by [`decode_static_image`].
#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("image decode: {0}")]
    Image(#[from] image::ImageError),
    #[error("unsupported format")]
    Unsupported,
    #[error("gif has no frames")]
    EmptyGif,
}

impl From<std::io::Error> for DecodeError {
    fn from(e: std::io::Error) -> Self {
        DecodeError::Image(image::ImageError::IoError(e))
    }
}

/// Errors returned by [`encode_webp`].
#[derive(Debug, thiserror::Error)]
pub enum EncodeError {
    #[error("webp encode: {0}")]
    Webp(#[from] image::ImageError),
}

/// Errors returned by [`decode_svg_to_thumbnail`].
#[derive(Debug, thiserror::Error)]
pub enum SvgError {
    #[error("resvg: {0}")]
    Resvg(#[from] resvg::usvg::Error),
    #[error("render: {0}")]
    Render(String),
}

/// Maximum side length of a generated thumbnail (long side).
pub const THUMBNAIL_MAX_SIDE: u32 = 256;

/// Target WebP encoding quality.
///
/// `image` crate 0.25.x ships a lossless-only WebP encoder
/// (`image-webp` 0.2.x exposes only VP8L via `WebPEncoder::new_lossless`).
/// The acceptance criteria for ADR-003 call for lossy WebP at quality
/// 80 — once a lossy encoder is available in `image` (or a separate
/// libwebp FFI crate like `webp` is introduced), this constant is the
/// single source of truth for the target bitrate. Until then
/// [`encode_webp`] accepts the value for interface stability but
/// silently ignores it; the resulting thumbnails are still WebP-encoded
/// (lossless), so the panel-side render path remains a cache URL.
pub const WEBP_QUALITY: f32 = 80.0;

/// Decode a single image source. Returns a [`DecodedImage`] describing the
/// payload:
///
/// - GIF (animated) → `Animated` with every frame as an `RgbaImage`.
/// - SVG / SVGZ     → `SvgSource` carrying the raw markup (rasterized by
///                    a later step via `resvg`).
/// - Anything else  → `Static` as a single `RgbaImage`.
///
/// Returns [`DecodeError::Unsupported`] when the format cannot be guessed.
pub fn decode_static_image(bytes: &[u8]) -> Result<DecodedImage, DecodeError> {
    if looks_like_svg(bytes) {
        return Ok(DecodedImage::SvgSource(
            String::from_utf8_lossy(bytes).into_owned(),
        ));
    }
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    match reader.format() {
        Some(image::ImageFormat::Gif) => decode_gif_frames(bytes),
        Some(_) => {
            let img = reader.decode()?;
            Ok(DecodedImage::Static(img.to_rgba8()))
        }
        None => Err(DecodeError::Unsupported),
    }
}

/// Cheap SVG detection: looks for an SVG/XML signature at the start of the
/// payload. `image` 0.25.6 does not advertise an `Svg`/`Svgz` format, so we
/// sniff by content instead.
fn looks_like_svg(bytes: &[u8]) -> bool {
    let head = bytes
        .iter()
        .take_while(|&&b| b == b' ' || b == b'\t' || b == b'\n' || b == b'\r')
        .count();
    let trimmed = &bytes[head..];
    trimmed.starts_with(b"<?xml") || trimmed.starts_with(b"<svg")
}

fn decode_gif_frames(bytes: &[u8]) -> Result<DecodedImage, DecodeError> {
    use image::AnimationDecoder;
    let decoder = image::codecs::gif::GifDecoder::new(Cursor::new(bytes))?;
    let frames: Vec<RgbaImage> = decoder
        .into_frames()
        .filter_map(|f| f.ok().map(|f| f.into_buffer()))
        .collect();
    if frames.is_empty() {
        return Err(DecodeError::EmptyGif);
    }
    if frames.len() == 1 {
        Ok(DecodedImage::Static(
            frames.into_iter().next().expect("non-empty"),
        ))
    } else {
        Ok(DecodedImage::Animated { frames })
    }
}

/// Resize `img` so its long side equals `max_side`, preserving aspect ratio.
///
/// If the image is already at or below `max_side` on both dimensions, the
/// input is returned unchanged.
pub fn fit_to_thumbnail(img: &RgbaImage, max_side: u32) -> RgbaImage {
    let (w, h) = img.dimensions();
    if w <= max_side && h <= max_side {
        return img.clone();
    }
    let scale = max_side as f32 / w.max(h) as f32;
    let nw = ((w as f32) * scale).round() as u32;
    let nh = ((h as f32) * scale).round() as u32;
    let dyn_img = DynamicImage::ImageRgba8(img.clone());
    dyn_img
        .resize_exact(nw.max(1), nh.max(1), image::imageops::FilterType::Lanczos3)
        .to_rgba8()
}

/// Encode `img` as a WebP image.
///
/// The `quality` parameter is the target bitrate. The current
/// implementation uses the lossless encoder shipped with `image`
/// 0.25.x — see [`WEBP_QUALITY`] for the rationale. Once a lossy
/// encoder is wired up, this function should switch to it and pass
/// `quality` through.
pub fn encode_webp(img: &RgbaImage, quality: f32) -> Result<Vec<u8>, EncodeError> {
    use image::ImageEncoder;
    // `quality` is accepted for interface stability; the lossless encoder
    // ignores it (see WEBP_QUALITY doc comment).
    let _ = quality;
    let mut out = Vec::new();
    image::codecs::webp::WebPEncoder::new_lossless(&mut out).write_image(
        img.as_raw(),
        img.width(),
        img.height(),
        image::ExtendedColorType::Rgba8,
    )?;
    Ok(out)
}

/// Rasterize an SVG payload to a thumbnail-sized `RgbaImage`.
///
/// The SVG is scaled so its long side equals `max_side`, preserving aspect
/// ratio. SVGs smaller than the bounding box are never upscaled.
pub fn decode_svg_to_thumbnail(svg: &str, max_side: u32) -> Result<RgbaImage, SvgError> {
    let tree = resvg::usvg::Tree::from_str(svg, &resvg::usvg::Options::default())?;
    let pixmap_size = tree.size();
    let scale = (max_side as f32 / pixmap_size.width().max(pixmap_size.height())).min(1.0);
    let w = ((pixmap_size.width() * scale).round() as u32).max(1);
    let h = ((pixmap_size.height() * scale).round() as u32).max(1);
    let mut pixmap =
        resvg::tiny_skia::Pixmap::new(w, h).ok_or_else(|| SvgError::Render("pixmap".into()))?;
    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    let bytes = pixmap.data().to_vec();
    let img = image::RgbaImage::from_raw(w, h, bytes)
        .ok_or_else(|| SvgError::Render("from_raw".into()))?;
    Ok(img)
}

/// Replicate a static first frame into a sequence of `n` `RgbaImage`s, where
/// `n` is clamped to `[1, 8]`.
///
/// The actual file scan that discovers the sibling frames
/// (`foo.0001.png`, `foo.0002.png`, ...) is owned by the pipeline
/// (THB-PIPE-001). This function only fixes the in-process replication
/// contract used to seed the hover rotation frames.
pub fn decode_image_sequence(first_frame: &RgbaImage, total_frames: usize) -> Vec<RgbaImage> {
    let n = total_frames.clamp(1, 8);
    vec![first_frame.clone(); n]
}

/// Errors returned by [`decode_font_preview`].
#[derive(Debug, thiserror::Error)]
pub enum FontError {
    #[error("font parse: {0}")]
    Parse(#[from] ab_glyph::InvalidFont),
    #[error("image: {0}")]
    Image(#[from] image::ImageError),
}

/// Render a sample string in the given font at `point_size` (px) onto a
/// white-background, black-text RGBA image.
///
/// Layout uses 8 px text padding on every side plus 8 px outer padding so
/// the drawn glyphs sit comfortably inside the 256×256 thumbnail bounding
/// box. The caller is responsible for fitting this output into the bounding
/// box with [`fit_to_thumbnail`].
pub fn decode_font_preview(
    font_bytes: &[u8],
    sample: &str,
    point_size: f32,
) -> Result<RgbaImage, FontError> {
    let font = FontVec::try_from_vec(font_bytes.to_vec())?;
    let scale = PxScale::from(point_size);
    let scaled = font.as_scaled(scale);
    let width = sample
        .chars()
        .map(|c| scaled.h_advance(font.glyph_id(c)))
        .sum::<f32>()
        .ceil() as u32
        + 16;
    let height = (scaled.ascent() - scaled.descent()).ceil() as u32 + 16;
    let mut img = image::RgbaImage::from_pixel(
        width.max(64),
        height.max(64),
        image::Rgba([255, 255, 255, 255]),
    );
    draw_text_mut(
        &mut img,
        image::Rgba([0, 0, 0, 255]),
        8,
        8_i32,
        scale,
        &font,
        sample,
    );
    Ok(img)
}

/// Errors returned by [`decode_text_preview`].
#[derive(Debug, thiserror::Error)]
pub enum TextError {
    #[error("font parse: {0}")]
    Parse(#[from] ab_glyph::InvalidFont),
}

// Note: imageproc 0.25's `draw_text_mut` is infallible (returns `()`), so
// this enum intentionally has no `Imageproc` variant. If a future imageproc
// upgrade reintroduces a fallible draw API, a `DrawingError` variant can be
// added without breaking the `?` operator against the remaining variants.

/// Render up to `max_lines` of `text` in the given font at `point_size` (px)
/// onto a white-background, black-text RGBA image.
///
/// Line height is `point_size * 1.4` (rounded up). The output width is fixed
/// at 512 px and the height scales with line count (clamped to 64 px min).
/// The caller is responsible for fitting this output into the 256×256
/// thumbnail bounding box with [`fit_to_thumbnail`].
pub fn decode_text_preview(
    text: &str,
    font_bytes: &[u8],
    point_size: f32,
    max_lines: usize,
) -> Result<RgbaImage, TextError> {
    let font = FontVec::try_from_vec(font_bytes.to_vec())?;
    let scale = PxScale::from(point_size);
    let line_height = (point_size * 1.4).ceil() as i32;
    let lines: Vec<&str> = text.lines().take(max_lines).collect();
    let height = (lines.len() as i32 * line_height + 16).max(64) as u32;
    let width = 512_u32;
    let mut img = image::RgbaImage::from_pixel(width, height, image::Rgba([255, 255, 255, 255]));
    for (i, line) in lines.iter().enumerate() {
        draw_text_mut(
            &mut img,
            image::Rgba([0, 0, 0, 255]),
            8,
            8 + (i as i32) * line_height,
            scale,
            &font,
            line,
        );
    }
    Ok(img)
}
