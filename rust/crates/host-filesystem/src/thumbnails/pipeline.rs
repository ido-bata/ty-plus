//! End-to-end thumbnail orchestration: cache lookup → generate → persist.
//!
//! See `pipeline.test.rs` for the contract. The public entry point is
//! [`lookup_or_generate`], consumed by the IPC layer in later tasks.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::{context::SessionContext, DEJAVU_SANS_MONO_BYTES};

use super::{
    cache_root::{resolve_cache_root, source_dir, thumbnail_dir, CacheRootResolution},
    decode::{
        decode_font_preview, decode_image_sequence, decode_static_image, decode_svg_to_thumbnail,
        decode_text_preview, encode_webp, fit_to_thumbnail, DecodeError, DecodedImage, EncodeError,
        FontError, SvgError, TextError,
    },
    meta::{read_meta, write_meta, MetaMarker},
};

#[cfg(test)]
#[path = "pipeline.test.rs"]
mod tests;

/// Long-side length of a generated thumbnail (pixels).
const THUMBNAIL_MAX_SIDE: u32 = 256;
/// WebP encoding quality. The `image` 0.25.6 lossless encoder ignores this
/// value; kept for interface stability and future use.
const WEBP_QUALITY: f32 = 80.0;
/// Maximum lines rendered into a `text` thumbnail.
const TEXT_MAX_LINES: usize = 16;
/// Point size for the `text` decoder.
const TEXT_POINT_SIZE: f32 = 14.0;
/// Point size for the `font` preview glyph rasterization.
const FONT_POINT_SIZE: f32 = 64.0;
/// Frame count produced for an `image-sequence` thumbnail (capped by
/// `decode_image_sequence` at 8).
const SEQUENCE_FRAMES: usize = 8;

/// Placeholder timestamp emitted into [`MetaMarker::generated_at`].
///
/// `chrono` is not a direct dependency of `host-filesystem` (it is a
/// transitive dep through `ty-plus-online` and `ty-plus-storage`, but the
/// pipeline must not pull it in directly). A deterministic constant keeps
/// the meta marker reproducible across runs without adding a dependency;
/// a future task can replace this with a real clock without breaking
/// the marker JSON shape.
const GENERATED_AT_PLACEHOLDER: &str = "1970-01-01T00:00:00Z";

/// A single thumbnail request from the panel side.
#[derive(Debug, Clone)]
pub struct ThumbnailRequest {
    /// Filesystem path of the source asset (string form; cache key is
    /// derived from its bytes verbatim — caller must normalize).
    pub source_path: String,
    /// Last-modified time of the source file at request time (ms since epoch).
    pub mtime_ms: i64,
    /// Size of the source file at request time (bytes).
    pub size_bytes: u64,
    /// Logical file type (`image`, `image-sequence`, `svg`, `font`, `text`).
    pub file_type: String,
}

/// Classification of the cached artifact returned to the caller.
#[derive(Debug, Clone)]
pub enum ThumbnailKind {
    /// Single still thumbnail.
    Static,
    /// Static thumbnail plus sibling sequence frames (count = N).
    StaticAndFrames(usize),
    /// SVG source — the cached bytes are an SVG passthrough.
    SvgPassthrough,
}

/// Outcome of a successful [`lookup_or_generate`] call.
#[derive(Debug, Clone)]
pub struct ThumbnailResult {
    /// On-disk path of the primary thumbnail (`<stem>.webp`).
    pub cache_path: PathBuf,
    /// For animated sources, the original file path the UI should hand to
    /// its animated viewer (GIF/SVG). `None` for still sources.
    pub animated_source_path: Option<PathBuf>,
    /// Classification of the cached artifact.
    pub kind: ThumbnailKind,
}

/// Errors surfaced by [`lookup_or_generate`] and its inner stages.
#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    /// Underlying filesystem I/O failed.
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    /// Source bytes could not be decoded into an image.
    #[error("decode: {0}")]
    Decode(String),
    /// Decoded image could not be encoded to WebP.
    #[error("encode: {0}")]
    Encode(String),
    /// Meta marker read/write failed.
    #[error("meta: {0}")]
    Meta(String),
    /// SVG rasterization failed.
    #[error("svg: {0}")]
    Svg(String),
    /// Font preview rendering failed.
    #[error("font: {0}")]
    Font(String),
    /// Text preview rendering failed.
    #[error("text: {0}")]
    Text(String),
    /// Source bytes were not valid UTF-8 (text/thumbnail path).
    #[error("utf8: {0}")]
    Utf8(#[from] std::str::Utf8Error),
    /// The request's `file_type` field is not recognized.
    #[error("unsupported fileType: {0}")]
    UnsupportedFileType(String),
}

impl From<DecodeError> for PipelineError {
    fn from(e: DecodeError) -> Self {
        PipelineError::Decode(e.to_string())
    }
}

impl From<EncodeError> for PipelineError {
    fn from(e: EncodeError) -> Self {
        PipelineError::Encode(e.to_string())
    }
}

impl From<SvgError> for PipelineError {
    fn from(e: SvgError) -> Self {
        PipelineError::Svg(e.to_string())
    }
}

impl From<FontError> for PipelineError {
    fn from(e: FontError) -> Self {
        PipelineError::Font(e.to_string())
    }
}

impl From<TextError> for PipelineError {
    fn from(e: TextError) -> Self {
        PipelineError::Text(e.to_string())
    }
}

impl From<super::meta::MetaError> for PipelineError {
    fn from(e: super::meta::MetaError) -> Self {
        PipelineError::Meta(e.to_string())
    }
}

/// Look up an existing thumbnail for `req`, or generate and persist one.
///
/// v1 defers in-flight deduplication to the React side (THB-HOOK-001) and
/// guarantees atomicity on the worker side via `<stem>.webp.tmp` →
/// `<stem>.webp` rename. The function is `async` to keep the public IPC
/// contract stable across future tasks; the body has no `.await` points,
/// so callers may drive it synchronously when needed.
pub async fn lookup_or_generate(
    req: ThumbnailRequest,
    ctx: &SessionContext,
) -> Result<ThumbnailResult, PipelineError> {
    let resolved = resolve_cache_root(ctx);
    let cache_root_path = match &resolved {
        CacheRootResolution::Managed(p) => p.clone(),
        CacheRootResolution::TempFallback(p) => p.clone(),
    };
    let tdir = thumbnail_dir(&cache_root_path);
    let sdir = source_dir(&tdir, &req.source_path);
    let stem = stem_of(&req.source_path);

    let cache_file = sdir.join(format!("{stem}.webp"));

    if let Some(meta) = read_meta(&sdir, &stem)? {
        if meta.source_mtime_ms == req.mtime_ms
            && meta.source_size_bytes == req.size_bytes
            && cache_file.exists()
        {
            return Ok(ThumbnailResult {
                cache_path: cache_file,
                animated_source_path: animated_source(&req),
                kind: ThumbnailKind::Static,
            });
        }
    }

    generate_inner(&req, &sdir, &stem)?;
    Ok(ThumbnailResult {
        cache_path: cache_file,
        animated_source_path: animated_source(&req),
        kind: classify_kind(&req),
    })
}

fn generate_inner(req: &ThumbnailRequest, dir: &Path, stem: &str) -> Result<(), PipelineError> {
    std::fs::create_dir_all(dir)?;
    let bytes = std::fs::read(&req.source_path)?;

    let img = match req.file_type.as_str() {
        "image" | "image-sequence" => {
            let dec = decode_static_image(&bytes)?;
            match dec {
                DecodedImage::Static(img) => fit_to_thumbnail(&img, THUMBNAIL_MAX_SIDE),
                DecodedImage::Animated { frames } => {
                    let first = frames
                        .into_iter()
                        .next()
                        .ok_or_else(|| PipelineError::Decode("empty animated payload".into()))?;
                    let main = fit_to_thumbnail(&first, THUMBNAIL_MAX_SIDE);
                    let seq = decode_image_sequence(&main, SEQUENCE_FRAMES);
                    for (i, frame) in seq.iter().enumerate().skip(1) {
                        let p = dir.join(format!("{stem}_{i}.webp"));
                        write_webp_atomic(frame, &p)?;
                    }
                    main
                }
                DecodedImage::SvgSource(svg) => decode_svg_to_thumbnail(&svg, THUMBNAIL_MAX_SIDE)?,
            }
        }
        "svg" => {
            let svg = std::str::from_utf8(&bytes)?.to_string();
            decode_svg_to_thumbnail(&svg, THUMBNAIL_MAX_SIDE)?
        }
        "font" => decode_font_preview(&bytes, "AaBb", FONT_POINT_SIZE)?,
        "text" => decode_text_preview(
            std::str::from_utf8(&bytes)?,
            DEJAVU_SANS_MONO_BYTES,
            TEXT_POINT_SIZE,
            TEXT_MAX_LINES,
        )?,
        other => return Err(PipelineError::UnsupportedFileType(other.to_string())),
    };

    let webp = encode_webp(&img, WEBP_QUALITY)?;
    let final_path = dir.join(format!("{stem}.webp"));
    write_webp_atomic_raw(&webp, &final_path)?;

    let mut sha = Sha256::new();
    sha.update(&bytes);
    let sha_hex = format!("{:x}", sha.finalize());

    let marker = MetaMarker {
        source_mtime_ms: req.mtime_ms,
        source_size_bytes: req.size_bytes,
        source_sha256_hex: sha_hex,
        generated_at: GENERATED_AT_PLACEHOLDER.to_string(),
    };
    write_meta(dir, stem, &marker)?;
    Ok(())
}

/// Encode `img` to WebP and persist it at `final_path` via a tmp-file
/// rename so concurrent readers see either the previous version or the
/// new one, never a half-written file.
fn write_webp_atomic(img: &image::RgbaImage, final_path: &Path) -> Result<(), PipelineError> {
    let webp = encode_webp(img, WEBP_QUALITY)?;
    write_webp_atomic_raw(&webp, final_path)
}

fn write_webp_atomic_raw(webp: &[u8], final_path: &Path) -> Result<(), PipelineError> {
    let mut tmp_name = final_path
        .file_name()
        .map(|n| n.to_os_string())
        .unwrap_or_default();
    tmp_name.push(".tmp");
    let tmp_path = match final_path.parent() {
        Some(parent) => parent.join(tmp_name),
        None => PathBuf::from(tmp_name),
    };
    std::fs::write(&tmp_path, webp)?;
    std::fs::rename(&tmp_path, final_path)?;
    Ok(())
}

/// Extract the file stem (the final path segment without its extension).
fn stem_of(p: &str) -> String {
    let normalized = p.replace('\\', "/");
    let seg = normalized.split('/').next_back().unwrap_or(p);
    let dot = seg.rfind('.').unwrap_or(seg.len());
    seg[..dot].to_string()
}

/// `Some(path)` for sources the UI should hand to its animated viewer
/// (GIF, SVG); `None` otherwise.
fn animated_source(req: &ThumbnailRequest) -> Option<PathBuf> {
    let lower = req.source_path.to_lowercase();
    if lower.ends_with(".gif") || lower.ends_with(".svg") {
        Some(PathBuf::from(&req.source_path))
    } else {
        None
    }
}

fn classify_kind(req: &ThumbnailRequest) -> ThumbnailKind {
    if req.file_type == "image-sequence" {
        ThumbnailKind::StaticAndFrames(SEQUENCE_FRAMES)
    } else if req.file_type == "svg" {
        ThumbnailKind::SvgPassthrough
    } else {
        ThumbnailKind::Static
    }
}

/// Lowercase hex SHA-256 of `bytes`. Exposed for snapshot tests.
#[must_use]
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut sha = Sha256::new();
    sha.update(bytes);
    format!("{:x}", sha.finalize())
}
