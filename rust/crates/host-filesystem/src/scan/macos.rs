//! macOS-specific retained-handle plugin/effect scanning.

use std::ffi::OsStr;

use ty_plus_protocol::PluginEffectScanRow;

use super::{HostScanDirectory, ScanError, MAX_SCAN_DEPTH};

const MACOS_PLUGIN_EXTENSIONS: &[&str] = &["bundle", "plugin", "component"];

pub(super) fn scan_directory(
    directory: &HostScanDirectory,
    rows: &mut Vec<PluginEffectScanRow>,
    warnings: &mut Vec<String>,
    on_item: &mut impl FnMut() -> Result<(), ScanError>,
    depth: usize,
) -> Result<(), ScanError> {
    if depth >= MAX_SCAN_DEPTH {
        warnings.push(format!(
            "Skipping scan directory at depth limit ({MAX_SCAN_DEPTH})"
        ));
        return Ok(());
    }
    let entries = match directory.entry_names() {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push(format!("Cannot read directory: {error}"));
            return Ok(());
        }
    };

    for name in entries {
        match directory.open_child_dir(&name) {
            Ok(child) => match child.entry_names() {
                Ok(_) => {
                    if is_macos_package(&name) {
                        scan_macos_package(&child, rows, warnings, on_item, depth + 1)?;
                    } else {
                        scan_directory(&child, rows, warnings, on_item, depth + 1)?;
                    }
                }
                Err(error) if is_not_directory(&error) => {
                    if scan_macos_plugin_file(directory, &name, rows, warnings) {
                        on_item()?;
                    }
                }
                Err(error) => warnings.push(format!("Skipping unsafe entry {:?}: {error}", name)),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotADirectory => {
                if scan_macos_plugin_file(directory, &name, rows, warnings) {
                    on_item()?;
                }
            }
            Err(error) => warnings.push(format!("Skipping unsafe entry {:?}: {error}", name)),
        }
    }
    Ok(())
}

fn is_not_directory(error: &std::io::Error) -> bool {
    error.kind() == std::io::ErrorKind::NotADirectory
        || matches!(error.raw_os_error(), Some(87 | 267))
}

fn is_macos_package(path: &OsStr) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            ["bundle", "plugin", "component"]
                .iter()
                .any(|candidate| value.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}

fn is_macos_plugin_file(path: &OsStr) -> bool {
    let extension = std::path::Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    MACOS_PLUGIN_EXTENSIONS
        .iter()
        .any(|candidate| *candidate == extension)
        && extension != "bundle"
}

fn scan_macos_package(
    package: &HostScanDirectory,
    rows: &mut Vec<PluginEffectScanRow>,
    warnings: &mut Vec<String>,
    on_item: &mut impl FnMut() -> Result<(), ScanError>,
    depth: usize,
) -> Result<(), ScanError> {
    let contents = match package.open_child_dir(OsStr::new("Contents")) {
        Ok(contents) => contents,
        Err(_) => return Ok(()),
    };
    let macos = match contents.open_child_dir(OsStr::new("MacOS")) {
        Ok(macos) => macos,
        Err(_) => return Ok(()),
    };
    scan_macos_executables(&macos, rows, warnings, on_item, depth + 1)
}

fn scan_macos_executables(
    directory: &HostScanDirectory,
    rows: &mut Vec<PluginEffectScanRow>,
    warnings: &mut Vec<String>,
    on_item: &mut impl FnMut() -> Result<(), ScanError>,
    depth: usize,
) -> Result<(), ScanError> {
    if depth >= MAX_SCAN_DEPTH {
        warnings.push(format!(
            "Skipping package directory at depth limit ({MAX_SCAN_DEPTH})"
        ));
        return Ok(());
    }
    let entries = match directory.entry_names() {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push(format!("Cannot read directory: {error}"));
            return Ok(());
        }
    };
    for name in entries {
        match directory.open_child_dir(&name) {
            // `open_dir_at` opens with `O_RDONLY | O_NOFOLLOW` and no
            // `O_DIRECTORY`, so opening a regular file *succeeds* — the
            // `Err` arm below only fires for an entry that cannot be opened at
            // all. A file is identified by the retained handle refusing to
            // enumerate, which is the same check `scan_directory` performs and
            // the reason the top-level walk finds loose plugin files.
            Ok(child) => match child.entry_names() {
                Ok(_) => scan_macos_executables(&child, rows, warnings, on_item, depth + 1)?,
                Err(error) if is_not_directory(&error) => {
                    // No extension gate here, unlike the top-level walk. This
                    // is a file inside a recognised package's `Contents/MacOS`,
                    // and a macOS bundle names its executable after the
                    // package with no extension at all
                    // (`Demo.plugin/Contents/MacOS/Demo`). Requiring
                    // `.plugin` / `.component` at this depth rejected every
                    // real After Effects plugin, so the scan returned an empty
                    // result on macOS.
                    record_macos_executable(directory, &name, rows, warnings);
                    on_item()?;
                }
                Err(error) => warnings.push(format!("Skipping unsafe entry {:?}: {error}", name)),
            },
            Err(error) if is_not_directory(&error) => {
                record_macos_executable(directory, &name, rows, warnings);
                on_item()?;
            }
            Err(error) => warnings.push(format!("Skipping unsafe entry {:?}: {error}", name)),
        }
    }
    Ok(())
}

/// Records a plugin row for a file that sits directly in a scan directory.
///
/// Returns whether a row was recorded, so the caller can report progress for
/// the plugin it actually found rather than for every entry it walked past.
fn scan_macos_plugin_file(
    directory: &HostScanDirectory,
    name: &OsStr,
    rows: &mut Vec<PluginEffectScanRow>,
    warnings: &mut Vec<String>,
) -> bool {
    if !is_macos_plugin_file(name) {
        return false;
    }
    record_macos_executable(directory, name, rows, warnings);
    true
}

/// Records one plugin row for an executable the scan has already accepted.
///
/// Kept separate from the extension test so the two call sites can disagree
/// about what counts as a plugin *name* without duplicating the row shape and
/// the readability check.
fn record_macos_executable(
    directory: &HostScanDirectory,
    name: &OsStr,
    rows: &mut Vec<PluginEffectScanRow>,
    warnings: &mut Vec<String>,
) {
    if let Err(error) = directory.read_file(name) {
        warnings.push(format!("Cannot read plugin {:?}: {error}", name));
        return;
    }
    let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Unknown");
    let match_name = format!("macOS Plugin: {stem}");
    rows.push(PluginEffectScanRow {
        file_path: directory.display_path(name).to_string_lossy().into_owned(),
        display_name: stem.to_owned(),
        match_name,
    });
}

#[cfg(test)]
mod tests {
    use super::{is_macos_package, is_macos_plugin_file};
    use std::path::Path;

    #[test]
    fn is_macos_plugin_file_component() {
        assert!(is_macos_plugin_file(
            Path::new("test.component").as_os_str()
        ));
    }

    #[test]
    fn is_macos_plugin_file_not_plugin() {
        assert!(!is_macos_plugin_file(Path::new("test.txt").as_os_str()));
    }

    #[test]
    fn is_macos_package_directory() {
        for extension in ["bundle", "plugin", "component"] {
            assert!(is_macos_package(
                Path::new(&format!("test.{extension}")).as_os_str()
            ));
        }
    }
}
