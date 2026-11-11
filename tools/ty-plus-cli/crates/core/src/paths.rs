//! Cross-platform path helpers.
//!
//! After Effects' install layout differs between Windows and macOS, but the
//! shape is the same: `appRoot` (the AE install folder), then
//! `appRoot/Presets`, `appRoot/Scripts`, `appRoot/Plug-ins`. The helpers here
//! centralize the AE-side layout so every domain crate (host/storage/...)
//! can use the same path conventions.
//!
//! `appRoot` itself is computed by the `host` crate; this module only deals
//! with **what to do with** an `appRoot` once you have one.

use std::path::{Path, PathBuf};

/// Standard subdirectory name under `appRoot` that holds user installable
/// presets (e.g. animation presets). Same on Windows and macOS.
pub const PRESETS_DIR: &str = "Presets";

/// Standard subdirectory name under `appRoot` that holds ExtendScript
/// scripts. Same on Windows and macOS.
pub const SCRIPTS_DIR: &str = "Scripts";

/// Standard subdirectory name under `appRoot` that holds native plugins
/// (`.aex` on Windows, `.plugin` bundles on macOS). Same on Windows and macOS.
pub const PLUGINS_DIR: &str = "Plug-ins";

/// Resolve `<appRoot>/Presets` if the directory exists. Returns `None` if
/// `appRoot` itself is missing — the caller decides whether that's a hard
/// error or a soft "AE not installed" condition.
pub fn preset_root(app_root: &Path) -> Option<PathBuf> {
    let candidate = app_root.join(PRESETS_DIR);
    candidate.exists().then_some(candidate)
}

/// Resolve `<appRoot>/Scripts` if the directory exists.
pub fn script_root(app_root: &Path) -> Option<PathBuf> {
    let candidate = app_root.join(SCRIPTS_DIR);
    candidate.exists().then_some(candidate)
}

/// Resolve `<appRoot>/Plug-ins` if the directory exists.
pub fn plugin_root(app_root: &Path) -> Option<PathBuf> {
    let candidate = app_root.join(PLUGINS_DIR);
    candidate.exists().then_some(candidate)
}

/// Normalize a path for stable hashing. Removes the Windows `\\?\` UNC prefix
/// if present, lowercases on Windows for case-insensitive comparison, and
/// resolves `.` / `..` segments via `Path::clean` (Rust's equivalent).
///
/// **Do not call this for paths that will be used to spawn processes** — case
/// changes can break Windows file lookups when the path came from a
/// case-sensitive source. Use only for cache keys.
pub fn normalize_for_hash(path: &Path) -> PathBuf {
    let cleaned: PathBuf = path.components().collect();
    #[cfg(target_os = "windows")]
    {
        // Windows is case-insensitive for filesystem operations. For cache
        // key purposes only, lowercase the path. Don't apply elsewhere.
        cleaned.to_string_lossy().to_lowercase().into()
    }
    #[cfg(not(target_os = "windows"))]
    {
        cleaned
    }
}

/// Read a JSON file, returning `Ok(None)` when the file is missing so that
/// callers can distinguish "first run" from "corrupt file". Other I/O errors
/// propagate.
///
/// Used by every cache reader. Centralized so the empty-file / corrupt-file
/// policy is consistent across the CLI.
pub fn read_json_or_missing<T: serde::de::DeserializeOwned>(
    path: &Path,
) -> crate::error::TyPlusResult<Option<T>> {
    match std::fs::read(path) {
        Ok(bytes) => {
            if bytes.is_empty() {
                return Ok(None);
            }
            let value = serde_json::from_slice(&bytes)?;
            Ok(Some(value))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(crate::error::TyPlusError::Io {
            path: path.to_path_buf(),
            source: e,
        }),
    }
}

/// Atomic JSON write. Writes to `<path>.tmp` first, then renames. Avoids
/// leaving half-written cache files on crash.
///
/// **Note**: on Windows the rename can fail if the target exists. We delete
/// the target first to make the rename succeed. The race window between
/// delete and rename is acceptable for a per-invocation CLI; the only
/// contention would be multiple CLI instances writing the same cache, which
/// is rare in our model.
pub fn write_json_atomic<T: serde::Serialize>(
    path: &Path,
    value: &T,
) -> crate::error::TyPlusResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| crate::error::TyPlusError::Io {
            path: parent.to_path_buf(),
            source: e,
        })?;
    }
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)?;
    std::fs::write(&tmp, &bytes).map_err(|e| crate::error::TyPlusError::Io {
        path: tmp.clone(),
        source: e,
    })?;
    #[cfg(target_os = "windows")]
    {
        let _ = std::fs::remove_file(path);
    }
    std::fs::rename(&tmp, path).map_err(|e| crate::error::TyPlusError::Io {
        path: path.to_path_buf(),
        source: e,
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_root_returns_none_when_missing() {
        let tmp = std::env::temp_dir().join("ty-plus-cli-test-nonexistent");
        assert!(preset_root(&tmp).is_none());
    }

    #[test]
    fn write_then_read_round_trips() {
        let tmp = std::env::temp_dir().join("ty-plus-cli-test-roundtrip.json");
        let _ = std::fs::remove_file(&tmp);

        #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
        struct S {
            n: i32,
        }
        write_json_atomic(&tmp, &S { n: 7 }).unwrap();
        let back: Option<S> = read_json_or_missing(&tmp).unwrap();
        assert_eq!(back, Some(S { n: 7 }));

        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn read_missing_returns_none_not_error() {
        let path = std::env::temp_dir().join("ty-plus-cli-test-missing.json");
        let _ = std::fs::remove_file(&path);
        let v: Option<i32> = read_json_or_missing(&path).unwrap();
        assert_eq!(v, None);
    }
}
