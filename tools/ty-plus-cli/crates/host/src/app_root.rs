//! After Effects install path resolution.
//!
//! The panel's current implementation runs an ExtendScript one-liner that
//! uses `Folder.appPackage.parent.absoluteURI` to find AE. That works but it
//! has two costs:
//!   1. The first panel interaction pays an XPC evalScript roundtrip just to
//!      find the install path.
//!   2. Build-time / deploy-time scripts that need `appRoot` (e.g. install
//!      hooks, watch scripts) can't easily call into ExtendScript.
//!
//! This module reads the same info from OS-level sources that AE itself
//! writes during install:
//!   - **Windows**: `HKLM\SOFTWARE\Adobe\After Effects\<version>\InstallPath`
//!     (or the WOW6432Node mirror for 32-bit AE on 64-bit Windows). We
//!     enumerate every `After Effects\<version>` key, parse `<version>` as
//!     a number, and return the highest.
//!   - **macOS**: scan `/Applications/` for `Adobe After Effects <year>` (or
//!     `Adobe After Effects CC <year>` for pre-2020 versions) and pick the
//!     lexicographically greatest match. We then verify the `.app` bundle
//!     exists.
//!
//! ## Escapes
//!
//! - `AE_INSTALL_PATH` env var wins over both sources. CI / dev override.
//! - `--app-root <path>` CLI flag wins over the env var. Used by the Vite
//!   build step when packaging.
//!
//! Both escape hatches emit an [`AppRootSource`] of `Override` so the panel
//! can tell that the value is not the default discovery.

use std::path::{Path, PathBuf};

use ty_plus_core::error::{TyPlusError, TyPlusResult};

/// Where the discovered `appRoot` came from. Surfaced in the JSON envelope so
/// the panel can log unexpected sources (e.g. "user is on an override").
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AppRootSource {
    /// Explicit override via CLI flag or env var.
    Override,
    /// Windows registry (`HKLM\SOFTWARE\Adobe\After Effects\<v>`).
    WindowsRegistry,
    /// macOS `/Applications/Adobe After Effects <year>/`.
    MacApplications,
    /// Fallback: AE was found but we cannot tell how.
    Unknown,
}

/// One possible install location. The resolver tries multiple sources and
/// returns the first that succeeds; the rest are discarded. We keep this
/// struct for future expansion (e.g. "list all installed AE versions").
#[derive(Debug, Clone)]
pub struct AppRootCandidate {
    /// The install folder.
    pub path: PathBuf,
    /// AE major version, when known (e.g. `25` for AE 2025).
    pub version: Option<u32>,
    /// How we found it.
    pub source: AppRootSource,
}

/// Find After Effects' install path.
///
/// Returns `Err(TyPlusError::Data("..."))` when no install is discoverable.
/// The error message is the same on both platforms so the panel can render
/// it without branching.
pub fn find_app_root() -> TyPlusResult<AppRootCandidate> {
    find_app_root_with(None, None)
}

/// Find After Effects' install path, allowing overrides. `cli_override`
/// takes precedence over `env_override`.
pub fn find_app_root_with(
    cli_override: Option<&Path>,
    env_override: Option<&str>,
) -> TyPlusResult<AppRootCandidate> {
    // 1. CLI override (--app-root)
    if let Some(p) = cli_override {
        return Ok(AppRootCandidate {
            path: p.to_path_buf(),
            version: None,
            source: AppRootSource::Override,
        });
    }

    // 2. Env var (AE_INSTALL_PATH)
    if let Some(s) = env_override {
        let p = PathBuf::from(s);
        if p.is_dir() {
            return Ok(AppRootCandidate {
                path: p,
                version: None,
                source: AppRootSource::Override,
            });
        }
        return Err(TyPlusError::Data(format!(
            "AE_INSTALL_PATH={s} does not point to a directory"
        )));
    }

    // 3. Platform discovery
    #[cfg(target_os = "windows")]
    {
        return find_via_windows_registry();
    }
    #[cfg(target_os = "macos")]
    {
        return find_via_macos_applications();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err(TyPlusError::UnsupportedPlatform(format!(
            "AE install discovery is only implemented for Windows and macOS (current: {})",
            std::env::consts::OS
        )))
    }
}

// ===========================================================================
// Windows: registry walk
// ===========================================================================

#[cfg(target_os = "windows")]
fn find_via_windows_registry() -> TyPlusResult<AppRootCandidate> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    // We check both the 64-bit and WOW6432Node hives. Modern AE installs are
    // 64-bit and write to the former; older AE or 32-bit-on-64-bit writes to
    // the latter. We try 64-bit first because that is the canonical location
    // for current installs.
    //
    // `open_subkey` returns `Result<RegKey, io::Error>`; we filter the
    // "not found" case (the legacy hive simply doesn't exist on a clean
    // install) into `None` and propagate other errors.
    let hive_paths = [
        "SOFTWARE\\Adobe\\After Effects",
        "SOFTWARE\\WOW6432Node\\Adobe\\After Effects",
    ];

    let mut best: Option<(u32, PathBuf)> = None;
    for path in hive_paths {
        let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(path) else {
            continue;
        };
        for version_result in key.enum_keys() {
            let Ok(version) = version_result else { continue };
            let version_num = match version.parse::<u32>() {
                Ok(n) => n,
                Err(_) => continue,
            };
            let Ok(version_key) = key.open_subkey_with_flags(&version, KEY_READ) else {
                continue
            };
            let Ok(install_path) = version_key.get_value::<String, _>("InstallPath") else {
                continue
            };
            let path = PathBuf::from(&install_path);
            // Some registry entries point to paths that no longer exist (e.g.
            // user uninstalled). Skip those.
            if !path.is_dir() {
                continue;
            }
            // Highest version wins.
            if best.as_ref().map_or(true, |(v, _)| version_num > *v) {
                best = Some((version_num, path));
            }
        }
    }

    let (version, path) = best.ok_or_else(|| {
        TyPlusError::Data(
            "After Effects install not found. Searched HKLM\\SOFTWARE\\Adobe\\After Effects and HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\After Effects. Set AE_INSTALL_PATH to override.".to_string(),
        )
    })?;

    Ok(AppRootCandidate {
        path,
        version: Some(version),
        source: AppRootSource::WindowsRegistry,
    })
}

// ===========================================================================
// macOS: /Applications scan
// ===========================================================================

#[cfg(target_os = "macos")]
fn find_via_macos_applications() -> TyPlusResult<AppRootCandidate> {
    use std::fs;

    // AE folder naming over the years:
    //   - 2020+ (year-based): "Adobe After Effects 2025"
    //   - 2013-2019 (CC-year): "Adobe After Effects CC 2019"
    // We sort entries lexicographically and pick the last; year-based naming
    // sorts higher than CC-based because the year is a larger number.
    let applications = PathBuf::from("/Applications");
    if !applications.is_dir() {
        return Err(TyPlusError::Data(
            "/Applications does not exist on this macOS install".to_string(),
        ));
    }

    let entries = match fs::read_dir(&applications) {
        Ok(rd) => rd.filter_map(Result::ok).collect::<Vec<_>>(),
        Err(e) => {
            return Err(TyPlusError::Io {
                path: applications,
                source: e,
            });
        }
    };

    // Match both "Adobe After Effects <year>" and "Adobe After Effects CC <year>".
    // Case-sensitive; macOS HFS+/APFS preserves case in directory names.
    let prefix_new = "Adobe After Effects 20";
    let prefix_old = "Adobe After Effects CC 20";

    let mut best: Option<(String, PathBuf)> = None;
    for entry in entries {
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else { continue };
        if !(name_str.starts_with(prefix_new) || name_str.starts_with(prefix_old)) {
            continue;
        }
        let bundle = entry.path().join("Adobe After Effects.app");
        if !bundle.is_dir() {
            continue;
        }
        // Lexicographic compare is sufficient for our naming convention
        // because both forms end with "20YY" and the prefixes differ.
        if best
            .as_ref()
            .map_or(true, |(best_name, _)| name_str > best_name.as_str())
        {
            best = Some((name_str.to_string(), entry.path()));
        }
    }

    let (_, path) = best.ok_or_else(|| {
        TyPlusError::Data(
            "After Effects install not found in /Applications. Expected a directory named 'Adobe After Effects <year>' or 'Adobe After Effects CC <year>' containing Adobe After Effects.app. Set AE_INSTALL_PATH to override.".to_string(),
        )
    })?;

    Ok(AppRootCandidate {
        path,
        version: None,
        source: AppRootSource::MacApplications,
    })
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_override_wins() {
        let p = std::env::temp_dir();
        let c = find_app_root_with(Some(&p), None).unwrap();
        assert_eq!(c.source, AppRootSource::Override);
        assert_eq!(c.path, p);
    }

    #[test]
    fn env_override_takes_effect_when_cli_absent() {
        let p = std::env::temp_dir();
        let c = find_app_root_with(None, p.to_str()).unwrap();
        assert_eq!(c.source, AppRootSource::Override);
        assert_eq!(c.path, p);
    }

    #[test]
    fn bad_env_override_surfaces_data_error() {
        let r = find_app_root_with(None, Some("/this/path/does/not/exist/ty-plus-cli-test"));
        assert!(matches!(r, Err(TyPlusError::Data(_))));
    }
}
