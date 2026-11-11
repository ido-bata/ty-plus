//! Cache root resolution and on-disk path layout.
//!
//! Resolves where thumbnail files live on disk for a given
//! [`SessionContext`] and computes the layout used by every downstream
//! step of the pipeline:
//!
//! ```text
//! <cacheRoot>/thumbnails/<sha8(normalizedSource)>/<stem>.webp
//! <cacheRoot>/thumbnails/<sha8(normalizedSource)>/<stem>.meta.json
//! ```
//!
//! `cacheRoot` is normally `<managedRoot>` when the host's managed root
//! is writable; otherwise it falls back to `<tempDir>/ty-plus-thumbnails`.
//! The decision is made once per worker invocation and stays fixed.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::context::SessionContext;

#[cfg(test)]
#[path = "cache_root.test.rs"]
mod tests;

/// Outcome of [`resolve_cache_root`].
///
/// `Managed` means the host's managed root is writable; the cache lives
/// there. `TempFallback` means onboarding isn't complete (no managed
/// root, or the managed root is not writable) and the cache lives under
/// the OS temp directory.
#[derive(Debug, PartialEq, Eq)]
pub enum CacheRootResolution {
    /// `<managedRoot>` is writable; use it directly.
    Managed(PathBuf),
    /// Fallback under `<tempDir>/ty-plus-thumbnails`.
    TempFallback(PathBuf),
}

/// Decides where the thumbnail cache lives for this invocation.
///
/// The result is fixed for the lifetime of the worker: the cache root
/// does not migrate from `TempFallback` to `Managed` if the host later
/// becomes writable. Callers that need to react to that case must
/// re-resolve at the next worker start.
#[must_use]
pub fn resolve_cache_root(ctx: &SessionContext) -> CacheRootResolution {
    if let Some(managed) = ctx.managed_root() {
        let writable = ctx
            .managed_writable_override()
            .unwrap_or_else(|| probe_writable(managed));
        if writable {
            return CacheRootResolution::Managed(managed.to_path_buf());
        }
    }
    CacheRootResolution::TempFallback(temp_dir().join("ty-plus-thumbnails"))
}

/// Returns `<cacheRoot>/thumbnails`.
#[must_use]
pub fn thumbnail_dir(cache_root: &Path) -> PathBuf {
    cache_root.join("thumbnails")
}

/// Returns the per-source directory `<thumbnailDir>/<cacheKey>`.
///
/// `normalized_source` must be the filesystem-normalized source path
/// (see `sibling-thumbnail.ts`'s `normalizeSiblingDirPath`).
#[must_use]
pub fn source_dir(thumbnail_dir: &Path, normalized_source: &str) -> PathBuf {
    thumbnail_dir.join(cache_key(normalized_source))
}

/// Eight lowercase hex characters: the first 8 bytes of
/// `SHA-256(normalizedSource)` rendered in base 16.
///
/// Used as the on-disk directory name for one source path. Truncating
/// the digest to 8 hex chars (32 bits) keeps the directory tree short;
/// collisions are caught by the meta-marker triple
/// `(sha8, sourceMtimeMs, sourceSizeBytes)`, not by the directory name
/// alone.
#[must_use]
pub fn cache_key(normalized_source: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalized_source.as_bytes());
    let digest = hasher.finalize();
    let hex = format!("{digest:x}");
    hex[..8].to_string()
}

/// Touches a probe file inside `path` and immediately removes it.
///
/// Returns `true` when both the create/open and the remove succeed.
/// Missing directories, read-only filesystems, and permission denials
/// all surface as `false`.
fn probe_writable(path: &Path) -> bool {
    let probe = path.join(".ty-plus-cache-probe");
    match std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&probe)
    {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn temp_dir() -> PathBuf {
    std::env::temp_dir()
}
