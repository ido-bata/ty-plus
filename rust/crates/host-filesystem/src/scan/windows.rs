//! Windows-specific retained-handle plugin/effect scanning.

use std::ffi::OsStr;

use ty_plus_protocol::PluginEffectScanRow;

use super::{HostScanDirectory, ScanError, MAX_SCAN_DEPTH};

const WINDOWS_PLUGIN_EXTENSIONS: &[&str] = &["aex", "dll"];

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
                Ok(_) => scan_directory(&child, rows, warnings, on_item, depth + 1)?,
                Err(error) if is_not_directory(&error) => {
                    if is_windows_plugin_file(&name) {
                        scan_windows_plugin_file(directory, &name, rows, warnings)?;
                        on_item()?;
                    }
                }
                Err(error) => warnings.push(format!("Skipping unsafe entry {:?}: {error}", name)),
            },
            Err(error) if is_not_directory(&error) => {
                if is_windows_plugin_file(&name) {
                    scan_windows_plugin_file(directory, &name, rows, warnings)?;
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

fn is_windows_plugin_file(path: &OsStr) -> bool {
    let extension = std::path::Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    WINDOWS_PLUGIN_EXTENSIONS.contains(&extension.as_str())
}

fn scan_windows_plugin_file(
    directory: &HostScanDirectory,
    name: &OsStr,
    rows: &mut Vec<PluginEffectScanRow>,
    warnings: &mut Vec<String>,
) -> Result<(), ScanError> {
    match directory.read_file(name) {
        Ok(_) => {}
        Err(error) => {
            warnings.push(format!("Cannot read plugin {:?}: {error}", name));
            return Ok(());
        }
    }
    let stem = std::path::Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Unknown");
    let match_name = format!("Windows Plugin: {stem}");
    rows.push(PluginEffectScanRow {
        file_path: directory.display_path(name).to_string_lossy().into_owned(),
        display_name: match_name
            .strip_prefix("Windows Plugin: ")
            .unwrap_or(&match_name)
            .to_owned(),
        match_name,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_windows_plugin_file;
    use std::path::Path;

    #[test]
    fn is_windows_plugin_file_aex() {
        assert!(is_windows_plugin_file(Path::new("test.aex").as_os_str()));
    }

    #[test]
    fn is_windows_plugin_file_dll() {
        assert!(is_windows_plugin_file(Path::new("test.dll").as_os_str()));
    }

    #[test]
    fn is_windows_plugin_file_not_plugin() {
        assert!(!is_windows_plugin_file(Path::new("test.txt").as_os_str()));
    }
}
