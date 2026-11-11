//! Plugin/effect scanning rooted in a retained host directory capability.

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(test)]
mod adversarial;

pub mod task;

#[cfg(not(windows))]
use cap_std::ambient_authority;
use cap_std::fs::Dir;
use std::{
    ffi::{OsStr, OsString},
    io::{self, Read},
    path::{Component, Path, PathBuf},
};

#[cfg(windows)]
use std::sync::Arc;

use ty_plus_protocol::{PluginEffectScanRow, ProgressEvent, ProgressStage};

use crate::context::SessionContextError;

const MAX_SCAN_DEPTH: usize = 64;
const MAX_SCAN_ENTRIES_PER_DIRECTORY: usize = 4096;

#[cfg(windows)]
#[derive(Debug, Clone)]
struct RetainedAncestors(Arc<RetainedAncestor>);

#[cfg(windows)]
#[derive(Debug)]
struct RetainedAncestor {
    _handle: std::fs::File,
    _parent: Option<Arc<RetainedAncestor>>,
}

#[cfg(windows)]
impl RetainedAncestors {
    fn new(handle: std::fs::File) -> Self {
        Self(Arc::new(RetainedAncestor {
            _handle: handle,
            _parent: None,
        }))
    }

    fn extend(&self, handle: std::fs::File) -> Self {
        Self(Arc::new(RetainedAncestor {
            _handle: handle,
            _parent: Some(Arc::clone(&self.0)),
        }))
    }
}

#[cfg(test)]
use std::sync::{Mutex, OnceLock};

#[cfg(test)]
type AfterAnchorHook = (std::thread::ThreadId, Box<dyn FnOnce() + Send>);

#[cfg(test)]
static AFTER_ANCHOR_HOOK: OnceLock<Mutex<Option<AfterAnchorHook>>> = OnceLock::new();

#[cfg(test)]
fn install_after_anchor_hook(hook: Box<dyn FnOnce() + Send>) {
    let slot = AFTER_ANCHOR_HOOK.get_or_init(|| Mutex::new(None));
    let mut guard = slot.lock().expect("after-anchor hook mutex poisoned");
    assert!(guard.is_none(), "after-anchor hook already installed");
    *guard = Some((std::thread::current().id(), hook));
}

#[cfg(test)]
fn run_after_anchor_hook() {
    let hook = AFTER_ANCHOR_HOOK.get().and_then(|slot| {
        let mut guard = slot.lock().expect("after-anchor hook mutex poisoned");
        if guard
            .as_ref()
            .is_some_and(|(thread_id, _)| *thread_id == std::thread::current().id())
        {
            guard.take().map(|(_, hook)| hook)
        } else {
            None
        }
    });
    if let Some(hook) = hook {
        hook();
    }
}

/// Errors that can occur during plugin/effect scanning.
#[derive(Debug, Clone)]
pub enum ScanError {
    /// I/O error occurred during scanning.
    IoError { path: PathBuf, detail: String },
    /// Session context error.
    SessionContext(SessionContextError),
    /// A borrowed progress consumer rejected a live event.
    Progress(String),
}

impl From<SessionContextError> for ScanError {
    fn from(err: SessionContextError) -> Self {
        Self::SessionContext(err)
    }
}

impl std::fmt::Display for ScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IoError { path, detail } => {
                write!(f, "I/O error at {}: {detail}", path.display())
            }
            Self::SessionContext(err) => write!(f, "Session context error: {err}"),
            Self::Progress(detail) => write!(f, "progress callback failed: {detail}"),
        }
    }
}

impl std::error::Error for ScanError {}

/// Result of a plugin/effect scan.
#[derive(Debug, Clone, Default)]
pub struct ScanOutput {
    /// Discovered rows, sorted by match_name and deduplicated.
    pub rows: Vec<PluginEffectScanRow>,
    /// Warnings for unreadable paths.
    pub warnings: Vec<String>,
}

impl ScanOutput {
    /// Creates a new ScanOutput and applies sort/dedupe/warnings.
    pub fn new(rows: Vec<PluginEffectScanRow>, warnings: Vec<String>) -> Self {
        let mut output = Self { rows, warnings };
        output.normalize();
        output
    }

    /// Sorts rows by match_name, deduplicates, and sorts warnings.
    pub fn normalize(&mut self) {
        self.rows.sort_by(|a, b| a.match_name.cmp(&b.match_name));
        self.rows.dedup_by_key(|row| row.match_name.clone());
        self.warnings.sort();
        self.warnings.dedup();
    }
}

/// A retained, app-root directory capability supplied by the host context.
#[derive(Debug)]
pub struct HostScanRoot {
    directory: Dir,
    app_root: PathBuf,
    #[cfg(windows)]
    root_path: PathBuf,
    #[cfg(windows)]
    _ancestors: RetainedAncestors,
}

impl HostScanRoot {
    /// Opens the supplied app root once. Relative roots are not ambient paths.
    pub fn open(app_root: impl AsRef<Path>) -> io::Result<Self> {
        let app_root = app_root.as_ref().to_path_buf();
        if !app_root.is_absolute() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "app root must be absolute",
            ));
        }
        #[cfg(windows)]
        {
            let (directory, ancestors) = open_app_root(&app_root)?;
            Ok(Self {
                directory,
                root_path: app_root.clone(),
                _ancestors: ancestors,
                app_root,
            })
        }
        #[cfg(not(windows))]
        Ok(Self {
            directory: open_app_root(&app_root)?,
            app_root,
        })
    }

    /// Opens a payload root relative to this retained capability.
    pub(crate) fn open_relative(
        &self,
        relative: impl AsRef<Path>,
    ) -> io::Result<HostScanDirectory> {
        let components = validate_relative_path(relative.as_ref())?;
        let mut directory = self.directory.try_clone()?;
        let mut relative_path = PathBuf::new();
        #[cfg(windows)]
        let mut current_path = self.root_path.clone();
        #[cfg(windows)]
        let mut ancestors = self._ancestors.clone();
        #[cfg(not(windows))]
        let mut anchor = None;
        for component in components {
            #[cfg(windows)]
            {
                current_path.push(&component);
                let (next, child_anchor) = open_windows_verified_dir(&current_path)?;
                #[cfg(test)]
                run_after_anchor_hook();
                ancestors = ancestors.extend(child_anchor);
                directory = next;
            }
            #[cfg(not(windows))]
            {
                let (next, _, child_anchor) = open_dir_nofollow(&directory, &component)?;
                directory = next;
                anchor = Some(child_anchor);
            }
            relative_path.push(&component);
        }
        #[cfg(not(windows))]
        let handle = directory.try_clone()?.into_std_file();
        #[cfg(windows)]
        {
            Ok(HostScanDirectory {
                directory,
                _ancestors: ancestors,
                app_root: self.app_root.clone(),
                relative_path,
                directory_path: current_path,
            })
        }
        #[cfg(not(windows))]
        Ok(HostScanDirectory {
            directory,
            handle,
            _anchor: anchor.expect("validated relative path has a component"),
            app_root: self.app_root.clone(),
            relative_path,
        })
    }
}

/// A directory opened from a retained [`HostScanRoot`].
#[derive(Debug)]
pub(crate) struct HostScanDirectory {
    directory: Dir,
    #[cfg(not(windows))]
    handle: std::fs::File,
    #[cfg(not(windows))]
    _anchor: std::fs::File,
    #[cfg(windows)]
    _ancestors: RetainedAncestors,
    app_root: PathBuf,
    relative_path: PathBuf,
    #[cfg(windows)]
    directory_path: PathBuf,
}

impl HostScanDirectory {
    pub(crate) fn entry_names(&self) -> io::Result<Vec<OsString>> {
        #[cfg(windows)]
        {
            collect_windows_entry_names(self.directory.entries()?)
        }
        #[cfg(not(windows))]
        {
            let mut handle = self.handle.try_clone()?;
            let entries = fs_at::read_dir(&mut handle)?;
            collect_entry_names(entries)
        }
    }

    pub(crate) fn open_child_dir(&self, name: &OsStr) -> io::Result<Self> {
        #[cfg(windows)]
        {
            validate_windows_component(name)?;
            let path = self.directory_path.join(name);
            let (directory, anchor) = open_windows_verified_dir(&path)?;
            #[cfg(test)]
            run_after_anchor_hook();
            let mut relative_path = self.relative_path.clone();
            relative_path.push(name);
            let ancestors = self._ancestors.extend(anchor);
            Ok(Self {
                directory,
                _ancestors: ancestors,
                app_root: self.app_root.clone(),
                relative_path,
                directory_path: path,
            })
        }
        #[cfg(not(windows))]
        {
            let (directory, handle, anchor) = open_dir_nofollow(&self.directory, name)?;
            let mut relative_path = self.relative_path.clone();
            relative_path.push(name);
            Ok(Self {
                directory,
                handle,
                _anchor: anchor,
                app_root: self.app_root.clone(),
                relative_path,
            })
        }
    }

    pub(crate) fn read_file(&self, name: &OsStr) -> io::Result<Vec<u8>> {
        #[cfg(windows)]
        let mut file = open_windows_verified_file(&self.directory_path, name)?;
        #[cfg(not(windows))]
        let mut file = {
            let parent_handle = self.handle.try_clone()?;
            fs_at::OpenOptions::default()
                .read(true)
                .follow(false)
                .open_at(&parent_handle, Path::new(name))?
        };
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    pub(crate) fn display_path(&self, name: &OsStr) -> PathBuf {
        self.app_root.join(&self.relative_path).join(name)
    }
}

fn validate_relative_path(path: &Path) -> io::Result<Vec<OsString>> {
    let raw = path.to_string_lossy();
    let normalized = raw.replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.as_bytes().get(1) == Some(&b':')
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "scan root must be relative",
        ));
    }
    let mut components = Vec::new();
    for component in normalized.split('/') {
        if component.is_empty() || component == "." || component == ".." {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "scan root contains an invalid component",
            ));
        }
        let component = OsString::from(component);
        #[cfg(windows)]
        validate_windows_component(&component)?;
        components.push(component);
    }
    if components.len() > MAX_SCAN_DEPTH {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "scan root exceeds the maximum depth",
        ));
    }
    Ok(components)
}

#[cfg(windows)]
fn open_app_root(app_root: &Path) -> io::Result<(Dir, RetainedAncestors)> {
    let mut components = app_root.components();
    let prefix = match components.next() {
        Some(Component::Prefix(prefix)) => prefix.as_os_str(),
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "app root must have a drive prefix",
            ))
        }
    };
    if !matches!(components.next(), Some(Component::RootDir)) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "app root must have a drive root",
        ));
    }
    let mut drive_root = PathBuf::from(prefix);
    drive_root.push(Path::new("\\"));
    let (mut current, root_anchor) = open_windows_verified_dir(&drive_root)?;
    let mut ancestors = RetainedAncestors::new(root_anchor);
    let mut current_path = drive_root;
    for component in components {
        match component {
            Component::Normal(name) => {
                validate_windows_component(name)?;
                current_path.push(name);
                let (next, anchor) = open_windows_verified_dir(&current_path)?;
                current = next;
                ancestors = ancestors.extend(anchor);
            }
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "app root contains a non-normal component",
                ))
            }
        }
    }
    Ok((current, ancestors))
}

#[cfg(target_os = "macos")]
fn open_app_root(app_root: &Path) -> io::Result<Dir> {
    let mut components = app_root.components();
    if !matches!(components.next(), Some(Component::RootDir)) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "app root must have a filesystem root",
        ));
    }
    let mut current = Dir::open_ambient_dir(Path::new("/"), ambient_authority())?;
    for component in components {
        match component {
            Component::Normal(name) => {
                current = open_dir_nofollow(&current, name)?.0;
            }
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "app root contains a non-normal component",
                ))
            }
        }
    }
    Ok(current)
}

#[cfg(not(any(windows, target_os = "macos")))]
fn open_app_root(app_root: &Path) -> io::Result<Dir> {
    Dir::open_ambient_dir(app_root, ambient_authority())
}

#[cfg(not(windows))]
fn collect_entry_names(
    entries: impl Iterator<Item = io::Result<fs_at::DirEntry>>,
) -> io::Result<Vec<OsString>> {
    let mut names = Vec::new();
    for entry in entries {
        if names.len() >= MAX_SCAN_ENTRIES_PER_DIRECTORY {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "scan directory exceeds the maximum entry count",
            ));
        }
        let entry = entry?;
        let name = entry.name().to_owned();
        if name != OsStr::new(".") && name != OsStr::new("..") {
            names.push(name);
        }
    }
    Ok(names)
}

#[cfg(windows)]
fn validate_windows_component(name: &OsStr) -> io::Result<()> {
    let path = Path::new(name);
    if path.components().count() != 1
        || !matches!(path.components().next(), Some(Component::Normal(_)))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "scan component must be a single normal component",
        ));
    }
    let value = name.to_str().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "scan component must be valid Unicode",
        )
    })?;
    if value.is_empty() || value.contains(':') || value.ends_with('.') || value.ends_with(' ') {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "scan component uses an unsafe Windows alias",
        ));
    }
    let basename = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let reserved = matches!(
        basename.as_str(),
        "con" | "prn" | "aux" | "nul" | "clock$" | "conin$" | "conout$"
    ) || (basename.len() == 4
        && (basename.starts_with("com") || basename.starts_with("lpt"))
        && basename.as_bytes()[3].is_ascii_digit()
        && basename.as_bytes()[3] != b'0');
    if reserved {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "scan component is a reserved Windows device name",
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn collect_windows_entry_names(
    entries: impl Iterator<Item = io::Result<cap_std::fs::DirEntry>>,
) -> io::Result<Vec<OsString>> {
    let mut names = Vec::new();
    for entry in entries {
        if names.len() >= MAX_SCAN_ENTRIES_PER_DIRECTORY {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "scan directory exceeds the maximum entry count",
            ));
        }
        let entry = entry?;
        let name = entry.file_name().to_owned();
        if name != OsStr::new(".") && name != OsStr::new("..") {
            names.push(name);
        }
    }
    Ok(names)
}

#[cfg(windows)]
fn open_windows_verified_dir(path: &Path) -> io::Result<(Dir, std::fs::File)> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS,
        FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ, FILE_SHARE_WRITE,
    };

    let mut options = std::fs::OpenOptions::new();
    options
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options.open(path)?;
    let attributes = file.metadata()?.file_attributes();
    if attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "reparse point is not a managed scan directory",
        ));
    }
    if attributes & FILE_ATTRIBUTE_DIRECTORY == 0 {
        return Err(io::Error::new(
            io::ErrorKind::NotADirectory,
            "scan entry is not a directory",
        ));
    }
    let directory = Dir::from_std_file(file.try_clone()?);
    Ok((directory, file))
}

#[cfg(windows)]
fn open_windows_verified_file(parent: &Path, name: &OsStr) -> io::Result<std::fs::File> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_OPEN_REPARSE_POINT,
        FILE_SHARE_READ, FILE_SHARE_WRITE,
    };

    validate_windows_component(name)?;
    let child = Path::new(name);
    let mut options = std::fs::OpenOptions::new();
    options
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let file = options.open(parent.join(child))?;
    let attributes = file.metadata()?.file_attributes();
    if attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "reparse point is not a managed scan file",
        ));
    }
    if attributes & FILE_ATTRIBUTE_DIRECTORY != 0 {
        return Err(io::Error::new(
            io::ErrorKind::NotADirectory,
            "scan entry is a directory",
        ));
    }
    Ok(file)
}

#[cfg(not(windows))]
fn open_dir_nofollow(
    parent: &Dir,
    name: &OsStr,
) -> io::Result<(Dir, std::fs::File, std::fs::File)> {
    let parent_handle = parent.try_clone()?.into_std_file();
    let anchor = fs_at::OpenOptions::default()
        .read(true)
        .follow(false)
        .open_dir_at(&parent_handle, Path::new(name))?;
    #[cfg(test)]
    run_after_anchor_hook();
    let directory = Dir::from_std_file(anchor.try_clone()?);
    let handle = directory.try_clone()?.into_std_file();
    Ok((directory, handle, anchor))
}

/// Scans roots below a retained host capability.
pub fn scan_roots(capability: &HostScanRoot, roots: &[PathBuf]) -> Result<ScanOutput, ScanError> {
    let mut rows = Vec::new();
    let mut warnings = Vec::new();
    for root in roots {
        let directory = capability
            .open_relative(root)
            .map_err(|error| ScanError::IoError {
                path: root.clone(),
                detail: error.to_string(),
            })?;
        scan_directory(&directory, &mut rows, &mut warnings, &mut || Ok(()), 0)?;
    }
    Ok(ScanOutput::new(rows, warnings))
}

/// Scans roots below a retained host capability while reporting live progress.
pub fn scan_roots_with_progress(
    capability: &HostScanRoot,
    roots: &[PathBuf],
    callback: &mut impl FnMut(ProgressEvent) -> Result<(), ScanError>,
) -> Result<ScanOutput, ScanError> {
    let total = roots.len() as u64;
    callback(ProgressEvent {
        sequence: 0,
        stage: ProgressStage::Discovering,
        completed_units: Some(0),
        total_units: Some(total),
        user_safe_detail: None,
    })?;

    let mut rows = Vec::new();
    let mut warnings = Vec::new();
    let sequence = std::cell::Cell::new(0u64);
    for (index, root) in roots.iter().enumerate() {
        let directory = capability
            .open_relative(root)
            .map_err(|error| ScanError::IoError {
                path: root.clone(),
                detail: error.to_string(),
            })?;
        let mut report_item = || {
            let next_sequence = sequence.get() + 1;
            sequence.set(next_sequence);
            callback(ProgressEvent {
                sequence: next_sequence,
                stage: ProgressStage::Discovering,
                completed_units: Some(index as u64),
                total_units: Some(total),
                user_safe_detail: None,
            })
        };
        scan_directory(&directory, &mut rows, &mut warnings, &mut report_item, 0)?;
        let completed = index as u64 + 1;
        let next_sequence = sequence.get() + 1;
        sequence.set(next_sequence);
        callback(ProgressEvent {
            sequence: next_sequence,
            stage: ProgressStage::Finished,
            completed_units: Some(completed),
            total_units: Some(total),
            user_safe_detail: None,
        })?;
    }
    Ok(ScanOutput::new(rows, warnings))
}

fn scan_directory(
    directory: &HostScanDirectory,
    rows: &mut Vec<PluginEffectScanRow>,
    warnings: &mut Vec<String>,
    on_item: &mut impl FnMut() -> Result<(), ScanError>,
    depth: usize,
) -> Result<(), ScanError> {
    #[cfg(target_os = "windows")]
    {
        windows::scan_directory(directory, rows, warnings, on_item, depth)
    }
    #[cfg(target_os = "macos")]
    {
        macos::scan_directory(directory, rows, warnings, on_item, depth)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (directory, rows, warnings, on_item);
        Ok(())
    }
}

#[cfg(test)]
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod tests {
    use super::*;

    #[test]
    fn scan_output_normalize_sorts_by_match_name() {
        let rows = vec![
            PluginEffectScanRow {
                file_path: "/b.aex".to_string(),
                match_name: "Z Plugin".to_string(),
                display_name: "Z".to_string(),
            },
            PluginEffectScanRow {
                file_path: "/a.aex".to_string(),
                match_name: "A Plugin".to_string(),
                display_name: "A".to_string(),
            },
        ];
        let output = ScanOutput::new(rows, vec![]);
        assert_eq!(output.rows[0].match_name, "A Plugin");
        assert_eq!(output.rows[1].match_name, "Z Plugin");
    }
}

#[cfg(all(test, not(windows)))]
mod entry_names_tests {
    use super::collect_entry_names;
    use std::io;

    #[test]
    fn entry_name_collection_propagates_iterator_errors() {
        let error = io::Error::new(io::ErrorKind::PermissionDenied, "injected iterator error");
        let result = collect_entry_names(std::iter::once(Err(error)));

        let error = result.expect_err("iterator errors must not be discarded");
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(), "injected iterator error");
    }
}

#[cfg(windows)]
#[cfg(test)]
mod windows_verified_open_tests {
    use super::{
        open_windows_verified_dir, open_windows_verified_file, validate_windows_component,
    };
    use std::io::Read;

    #[test]
    fn verified_open_reads_nested_directory_and_file_from_exfat_compatible_handles() {
        let temp = tempfile::tempdir().expect("temporary scan root");
        let nested = temp.path().join("nested");
        std::fs::create_dir(&nested).unwrap();
        let file_path = nested.join("plugin.aex");
        std::fs::write(&file_path, b"plugin").unwrap();

        let (directory, _) = open_windows_verified_dir(&nested).unwrap();
        let mut file =
            open_windows_verified_file(&nested, std::ffi::OsStr::new("plugin.aex")).unwrap();
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();

        assert_eq!(bytes, b"plugin");
        assert!(directory.entries().unwrap().next().is_some());
    }

    #[test]
    fn windows_component_validation_rejects_aliases_and_devices() {
        for value in [
            "folder:name",
            "trailing.",
            "trailing ",
            "CON.txt",
            "com1.dll",
            "LPT9",
            "nested\\child",
        ] {
            assert!(
                validate_windows_component(std::ffi::OsStr::new(value)).is_err(),
                "unsafe Windows component accepted: {value}"
            );
        }
        for value in ["Plugins", "Demo.aex", "folder_1"] {
            validate_windows_component(std::ffi::OsStr::new(value)).unwrap();
        }
    }

    #[test]
    fn windows_entry_names_rejects_unbounded_directories() {
        let temp = tempfile::tempdir().expect("temporary scan root");
        for index in 0..=super::MAX_SCAN_ENTRIES_PER_DIRECTORY {
            std::fs::write(temp.path().join(format!("entry-{index}")), b"").unwrap();
        }
        let (directory, _) = open_windows_verified_dir(temp.path()).unwrap();

        let error = super::collect_windows_entry_names(directory.entries().unwrap())
            .expect_err("entry cap must reject oversized directories");
        assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn verified_file_handle_cannot_be_redirected_by_path_replacement() {
        let temp = tempfile::tempdir().expect("temporary scan root");
        let original = temp.path().join("plugin.aex");
        let moved = temp.path().join("moved.aex");
        std::fs::write(&original, b"original").unwrap();
        let mut file =
            open_windows_verified_file(temp.path(), std::ffi::OsStr::new("plugin.aex")).unwrap();

        match std::fs::rename(&original, &moved) {
            Ok(()) => {
                std::fs::write(&original, b"replacement").unwrap();
            }
            Err(error) => assert_eq!(error.raw_os_error(), Some(32)),
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, b"original");
    }
}
