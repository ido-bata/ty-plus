use super::*;
use crate::thumbnails::test_fixtures::fixture_bytes;

#[test]
fn decode_static_png_yields_single_rgba() {
    let bytes = fixture_bytes("sample_64x64.png");
    match decode_static_image(&bytes).unwrap() {
        DecodedImage::Static(img) => assert_eq!(img.dimensions(), (64, 64)),
        other => panic!("expected Static, got {other:?}"),
    }
}

#[test]
fn decode_animated_gif_yields_multiple_frames() {
    let bytes = fixture_bytes("sample_animated.gif");
    match decode_static_image(&bytes).unwrap() {
        DecodedImage::Animated { frames } => assert!(frames.len() >= 2),
        other => panic!("expected Animated, got {other:?}"),
    }
}

#[test]
fn fit_to_thumbnail_preserves_aspect_ratio() {
    let img = image::RgbaImage::from_pixel(800, 200, image::Rgba([255, 0, 0, 255]));
    let out = fit_to_thumbnail(&img, 256);
    assert_eq!(out.dimensions(), (256, 64));
}

#[test]
fn decode_svg_renders_to_thumbnail_dimensions() {
    let bytes = fixture_bytes("sample.svg");
    let svg = std::str::from_utf8(&bytes).unwrap();
    let img = decode_svg_to_thumbnail(svg, 256).unwrap();
    assert!(img.width() <= 256 && img.height() <= 256);
    assert!(img.width() > 0 && img.height() > 0);
}

#[test]
fn decode_image_sequence_replicates_first_frame_up_to_n() {
    let first = image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 0, 0, 255]));
    let seq = decode_image_sequence(&first, 4);
    assert_eq!(seq.len(), 4);
    for f in &seq {
        assert_eq!(f.dimensions(), (64, 64));
    }
}

#[test]
fn decode_image_sequence_caps_at_8() {
    let first = image::RgbaImage::from_pixel(64, 64, image::Rgba([0, 255, 0, 255]));
    let seq = decode_image_sequence(&first, 16);
    assert_eq!(seq.len(), 8);
}

#[test]
fn font_preview_dimensions_within_max_side() {
    let bytes = fixture_bytes("sample.ttf");
    let img = decode_font_preview(&bytes, "AaBb", 64.0).unwrap();
    assert!(img.width() <= 256 && img.height() <= 256);
    assert!(img.width() > 0 && img.height() > 0);
}

#[test]
fn text_preview_caps_at_max_lines_and_uses_embedded_font() {
    let long: String = "hello world\n".repeat(100);
    let img = decode_text_preview(&long, crate::DEJAVU_SANS_MONO_BYTES, 14.0, 16).unwrap();
    assert!(img.width() <= 512 && img.height() <= 512);
}

#[test]
fn text_preview_empty_returns_min_image() {
    let img = decode_text_preview("", crate::DEJAVU_SANS_MONO_BYTES, 14.0, 16).unwrap();
    assert!(img.width() >= 64 && img.height() >= 64);
}
