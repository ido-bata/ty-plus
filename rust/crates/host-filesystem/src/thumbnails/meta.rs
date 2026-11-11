//! Meta-marker I/O for cache hit detection.
//!
//! Each thumbnail `<stem>.webp` lives next to a `<stem>.meta.json` file
//! carrying the `(sourceMtimeMs, sourceSizeBytes, sourceSha256Hex)`
//! triple captured at generation time. The thumbnail cache is
//! considered a hit only when the cached triple matches the current
//! source triple (see `cache_key` for the directory-level grouping).
//!
//! See `meta.test.rs` for the contract.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[cfg(test)]
#[path = "meta.test.rs"]
mod tests;

/// Persistent descriptor of a generated thumbnail's source snapshot.
///
/// Used by the cache layer to invalidate stale thumbnails when the
/// underlying source file changes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MetaMarker {
    /// Last-modified time of the source file, in milliseconds since the
    /// Unix epoch.
    pub source_mtime_ms: i64,
    /// Size of the source file in bytes at generation time.
    pub source_size_bytes: u64,
    /// Hex-encoded SHA-256 of the source file at generation time.
    pub source_sha256_hex: String,
    /// ISO-8601 timestamp (UTC) when the thumbnail was generated.
    pub generated_at: String,
}

/// Errors that can occur while reading or writing a meta marker.
#[derive(Debug, Error)]
pub enum MetaError {
    /// Underlying filesystem I/O failed.
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    /// Meta-marker JSON could not be (de)serialized.
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

/// Returns the on-disk path of the meta marker for `stem` inside `dir`.
///
/// Path layout: `<dir>/<stem>.meta.json`.
#[must_use]
pub fn meta_path(dir: &Path, stem: &str) -> PathBuf {
    dir.join(format!("{stem}.meta.json"))
}

/// Reads the meta marker for `stem` from `dir`, if one exists.
///
/// Returns `Ok(None)` when the marker file is absent (a cache miss).
/// Returns `Err` for I/O failures and decode failures so it can surface
/// corrupt markers instead of treating them as a hit.
pub fn read_meta(dir: &Path, stem: &str) -> Result<Option<MetaMarker>, MetaError> {
    let path = meta_path(dir, stem);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path)?;
    let marker = serde_json::from_slice(&bytes)?;
    Ok(Some(marker))
}

/// Writes the meta marker for `stem` into `dir`, overwriting any
/// existing file at that path.
pub fn write_meta(dir: &Path, stem: &str, marker: &MetaMarker) -> Result<(), MetaError> {
    let path = meta_path(dir, stem);
    let bytes = serde_json::to_vec_pretty(marker)?;
    std::fs::write(&path, bytes)?;
    Ok(())
}
