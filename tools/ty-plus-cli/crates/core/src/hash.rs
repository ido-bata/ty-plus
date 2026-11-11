//! Content-addressable hashing.
//!
//! Cache invalidation across the CLI is driven by [`content_key`]: the
//! fingerprint of `(path, mtime, size)` (or any other relevant bytes). If the
//! key changes between two runs, the cached JSON is stale and the producer
//! must recompute.
//!
//! We use `blake3` because it is fast (SIMD on every target we ship), small,
//! and produces a 32-byte key that fits in a filename without escaping issues
//! on either Windows or macOS.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use blake3::Hasher;

use crate::error::{TyPlusError, TyPlusResult};

/// Domain-separated hasher. The leading byte prevents accidentally colliding
/// with hashes produced by other subsystems (e.g. a font cache and a plugin
/// cache must never share the same key, even when the underlying file is the
/// same).
const DOMAIN_TAG: u8 = 0x01;

/// Derive a content-key string for a single file. Combines:
///
/// 1. absolute path (for uniqueness)
/// 2. mtime (Unix nanoseconds since epoch, or `0` if unavailable)
/// 3. file size in bytes
///
/// Returns a 32-char hex string (16 bytes of the blake3 output is plenty for
/// cache key purposes; collisions would still be detected by reading the
/// cached value's own `mtime` field at load time).
pub fn file_key(path: &Path) -> TyPlusResult<String> {
    let meta = std::fs::metadata(path).map_err(|e| TyPlusError::Io {
        path: path.to_path_buf(),
        source: e,
    })?;
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    Ok(derive_key(&[path.to_string_lossy().as_bytes(), &size.to_le_bytes(), &mtime.to_le_bytes()]))
}

/// Derive a content-key for a directory. Uses (mtime of directory entry) +
/// the sorted names of immediate children — enough to invalidate when a
/// plugin folder gains or loses an `.aex` even though the folder's own mtime
/// is sometimes unreliable.
pub fn dir_key(path: &Path) -> TyPlusResult<String> {
    let mut entries: Vec<PathBuf> = match std::fs::read_dir(path) {
        Ok(rd) => rd
            .filter_map(Result::ok)
            .map(|e| e.path())
            .collect(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(e) => {
            return Err(TyPlusError::Io {
                path: path.to_path_buf(),
                source: e,
            });
        }
    };
    entries.sort();

    let mut buf: Vec<u8> = Vec::new();
    buf.extend_from_slice(path.to_string_lossy().as_bytes());
    buf.push(0xff); // separator between path and entries
    for entry in &entries {
        buf.extend_from_slice(entry.file_name().unwrap_or_default().as_encoded_bytes());
        buf.push(0x00);
    }
    Ok(derive_key(&[buf.as_slice()]))
}

/// Generic key derivation. Used by `file_key` / `dir_key` and by callers that
/// want to derive a key from arbitrary byte slices (e.g. JSON content for
/// tests).
pub fn derive_key(parts: &[&[u8]]) -> String {
    let mut hasher = Hasher::new();
    hasher.update(&[DOMAIN_TAG]);
    for part in parts {
        hasher.update(part);
        hasher.update(&[0x00]); // separator
    }
    let hash = hasher.finalize();
    let bytes = hash.as_bytes();
    // First 16 bytes → 32 hex chars. Plenty of entropy for a cache key, and
    // short enough to embed in a filename on every platform without escaping.
    let mut out = String::with_capacity(32);
    for b in &bytes[..16] {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_key_is_deterministic() {
        let a = derive_key(&[b"foo", b"bar"]);
        let b = derive_key(&[b"foo", b"bar"]);
        assert_eq!(a, b);
    }

    #[test]
    fn derive_key_changes_with_input() {
        let a = derive_key(&[b"foo"]);
        let b = derive_key(&[b"bar"]);
        assert_ne!(a, b);
    }

    #[test]
    fn derive_key_separates_components() {
        // Same total bytes but different split → different key. Without the
        // separator, "fo"+"obar" would collide with "foo"+"bar".
        let a = derive_key(&[b"fo", b"obar"]);
        let b = derive_key(&[b"foo", b"bar"]);
        assert_ne!(a, b);
    }
}
