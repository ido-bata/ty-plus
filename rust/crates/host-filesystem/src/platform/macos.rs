use std::{
    ffi::OsStr,
    fs::File,
    io,
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
};

use cap_fs_ext::{DirEntryExt, FollowSymlinks, OpenOptionsFollowExt, OpenOptionsSyncExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use fs2::FileExt;

use super::{PlatformImplementation, SupportedPlatform};

pub(super) const fn implementation() -> PlatformImplementation {
    PlatformImplementation::new(SupportedPlatform::Macos)
}

/// A lock-file handle opened relative to a no-follow managed-root capability.
#[derive(Debug)]
pub struct PlatformLockHandle {
    file: File,
    path: PathBuf,
}

/// A same-directory transaction capability rooted below the managed root.
#[derive(Debug)]
pub struct PlatformTransactionHandle {
    directory: Dir,
    destination: String,
    temp: String,
    revision: String,
    journal: String,
}

impl PlatformTransactionHandle {
    #[must_use]
    pub fn journal_name(&self) -> &str {
        &self.journal
    }

    pub fn create_temp(&self) -> io::Result<File> {
        let mut options = OpenOptions::new();
        options
            .read(true)
            .write(true)
            .create_new(true)
            .sync(true)
            .follow(FollowSymlinks::No);
        Ok(self.directory.open_with(&self.temp, &options)?.into_std())
    }

    pub fn create_revision(&self) -> io::Result<File> {
        let mut options = OpenOptions::new();
        options
            .read(true)
            .write(true)
            .create_new(true)
            .sync(true)
            .follow(FollowSymlinks::No);
        Ok(self
            .directory
            .open_with(&self.revision, &options)?
            .into_std())
    }

    pub fn write_journal(&self, bytes: &[u8]) -> io::Result<()> {
        let mut options = OpenOptions::new();
        options
            .read(true)
            .write(true)
            .create_new(true)
            .sync(true)
            .follow(FollowSymlinks::No);
        let mut file = self
            .directory
            .open_with(&self.journal, &options)?
            .into_std();
        std::io::Write::write_all(&mut file, bytes)?;
        file.sync_all()
    }

    pub fn update_journal(&self, bytes: &[u8]) -> io::Result<()> {
        let mut options = OpenOptions::new();
        options
            .read(true)
            .write(true)
            .truncate(true)
            .sync(true)
            .follow(FollowSymlinks::No);
        let mut file = self
            .directory
            .open_with(&self.journal, &options)?
            .into_std();
        std::io::Write::write_all(&mut file, bytes)?;
        file.sync_all()
    }

    pub fn sync_directory(&self) -> io::Result<()> {
        self.directory.try_clone()?.into_std_file().sync_all()
    }

    pub fn replace_body(&self) -> io::Result<()> {
        self.directory
            .rename(&self.temp, &self.directory, &self.destination)
    }

    pub fn replace_body_if_present(&self) -> io::Result<bool> {
        if self.has_entry(&self.temp)? {
            self.replace_body()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn replace_revision(&self) -> io::Result<()> {
        self.directory.rename(
            &self.revision,
            &self.directory,
            revision_name(&self.destination),
        )
    }

    pub fn replace_revision_if_present(&self) -> io::Result<bool> {
        if self.has_entry(&self.revision)? {
            self.replace_revision()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn remove_artifacts(&self) -> io::Result<()> {
        for name in [&self.temp, &self.revision, &self.journal] {
            match self.directory.remove_file(name) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }

    pub fn has_entry(&self, name: &str) -> io::Result<bool> {
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No);
        match self.directory.open_with(name, &options) {
            Ok(_) => Ok(true),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error),
        }
    }

    pub fn read_entry(&self, name: &str) -> io::Result<Vec<u8>> {
        self.directory.read(name)
    }
}

fn revision_name(destination: &str) -> String {
    let path = Path::new(destination);
    let stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or(destination);
    format!("{stem}.rev.json")
}

/// Opens a transaction directory and creates invocation-owned artifact names.
pub fn transaction_open(
    managed_root: &Path,
    destination: &Path,
    invocation_id: &str,
) -> io::Result<PlatformTransactionHandle> {
    validate_relative(destination)?;
    validate_invocation(invocation_id)?;
    let root_dir = open_managed_root(managed_root)?;
    let mut directory = root_dir;
    let mut components = destination.components().peekable();
    let destination_name = loop {
        match components.next() {
            Some(Component::Normal(name)) if components.peek().is_none() => {
                break name
                    .to_str()
                    .ok_or_else(|| invalid("destination is not unicode"))?
                    .to_owned()
            }
            Some(Component::Normal(name)) => directory = open_or_create_dir(&directory, name)?,
            _ => return Err(invalid("destination must be a relative normal path")),
        }
    };
    reject_link_destination(&directory, &destination_name)?;
    reject_link_destination(&directory, &revision_name(&destination_name))?;
    let token = artifact_token(&destination.to_string_lossy(), invocation_id);
    Ok(PlatformTransactionHandle {
        directory,
        destination: destination_name,
        temp: format!(".ty-plus-{token}.tmp"),
        revision: format!(".ty-plus-{token}.revision.tmp"),
        journal: format!(".ty-plus-{token}.journal"),
    })
}

/// Lists only journal entries owned by this transaction format.
pub fn list_journals(managed_root: &Path, directory: &Path) -> io::Result<Vec<(String, Vec<u8>)>> {
    validate_relative(directory)?;
    let root_dir = open_managed_root(managed_root)?;
    let mut current = root_dir;
    for component in directory.components() {
        match component {
            Component::Normal(name) => match open_dir_nofollow(&current, name) {
                Ok(next) => current = next,
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
                Err(error) => return Err(error),
            },
            _ => return Err(invalid("recovery directory must be relative")),
        }
    }
    let mut journals = Vec::new();
    for entry in current.entries()? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.starts_with(".ty-plus-") && name.ends_with(".journal") {
            let mut options = OpenOptions::new();
            options.read(true).follow(FollowSymlinks::No);
            let file = current.open_with(name, &options)?;
            journals.push((
                name.to_owned(),
                file.into_std().bytes().collect::<io::Result<Vec<_>>>()?,
            ));
        }
    }
    Ok(journals)
}

/// Increments the durable commit sequence under the caller-held operation lock.
pub fn commit_sequence(managed_root: &Path, transaction_key: &str) -> io::Result<u64> {
    if transaction_key.is_empty() || transaction_key.contains(':') {
        return Err(invalid("invalid transaction key"));
    }
    let root = open_managed_root(managed_root)?;
    let control = open_or_create_dir(&root, OsStr::new("control"))?;
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(true)
        .create(true)
        .sync(true)
        .follow(FollowSymlinks::No);
    let mut file = control.open_with("commit-sequence", &options)?.into_std();
    let mut bytes = Vec::new();
    file.seek(SeekFrom::Start(0))?;
    file.read_to_end(&mut bytes)?;
    let parsed = parse_sequence_log(&bytes)?;
    if parsed.valid_len < bytes.len() as u64 {
        file.set_len(parsed.valid_len)?;
        file.sync_all()?;
    }
    if let Some(existing) = parsed
        .records
        .iter()
        .find(|record| record.key == transaction_key)
    {
        file.sync_all()?;
        return Ok(existing.sequence);
    }
    let next = parsed
        .current
        .checked_add(1)
        .ok_or_else(|| invalid("commit sequence overflow"))?;
    let record = format!(
        "{next:020x}:{transaction_key}:{}\n",
        sequence_checksum(next, transaction_key)
    );
    file.seek(SeekFrom::End(0))?;
    std::io::Write::write_all(&mut file, record.as_bytes())?;
    file.sync_all()?;
    Ok(next)
}

fn sequence_checksum(sequence: u64, transaction_key: &str) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "{:x}",
        Sha256::digest(format!("{sequence}:{transaction_key}").as_bytes())
    )
}

#[derive(Debug)]
struct SequenceRecord {
    sequence: u64,
    key: String,
}

#[derive(Debug)]
struct ParsedSequenceLog {
    current: u64,
    records: Vec<SequenceRecord>,
    valid_len: u64,
}

fn parse_sequence_log(bytes: &[u8]) -> io::Result<ParsedSequenceLog> {
    if bytes.is_empty() {
        return Ok(ParsedSequenceLog {
            current: 0,
            records: Vec::new(),
            valid_len: 0,
        });
    }
    let complete_len = if bytes.ends_with(b"\n") {
        bytes.len()
    } else {
        bytes
            .iter()
            .rposition(|byte| *byte == b'\n')
            .map_or(0, |offset| offset + 1)
    };
    let mut current = 0;
    let mut records: Vec<SequenceRecord> = Vec::new();
    for line in bytes[..complete_len]
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
    {
        let text = std::str::from_utf8(line).map_err(|_| invalid("invalid commit sequence"))?;
        let mut fields = text.rsplitn(3, ':');
        let checksum = fields
            .next()
            .ok_or_else(|| invalid("invalid commit sequence record"))?;
        let key = fields
            .next()
            .ok_or_else(|| invalid("invalid commit sequence record"))?;
        let value = fields
            .next()
            .ok_or_else(|| invalid("invalid commit sequence record"))?;
        let sequence =
            u64::from_str_radix(value, 16).map_err(|_| invalid("invalid commit sequence value"))?;
        if key.is_empty()
            || key.contains(':')
            || checksum != sequence_checksum(sequence, key)
            || sequence <= current
            || records.iter().any(|record| record.key == key)
        {
            return Err(invalid("corrupt commit sequence log"));
        }
        records.push(SequenceRecord {
            sequence,
            key: key.to_owned(),
        });
        current = sequence;
    }
    Ok(ParsedSequenceLog {
        current,
        records,
        valid_len: complete_len as u64,
    })
}

/// Removes one managed-root-relative file through a no-follow capability.
pub fn remove_entry(managed_root: &Path, relative: &Path) -> io::Result<()> {
    validate_relative(relative)?;
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    let mut components = relative.components().peekable();
    let name = loop {
        match components.next() {
            Some(Component::Normal(name)) if components.peek().is_none() => break name,
            Some(Component::Normal(name)) => directory = open_dir_nofollow(&directory, name)?,
            _ => return Err(invalid("path must be relative")),
        }
    };
    directory.remove_file(name)
}

/// Creates a managed relative directory through no-follow handles.
pub fn ensure_directory(managed_root: &Path, relative: &Path) -> io::Result<()> {
    validate_relative(relative)?;
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    for component in relative.components() {
        match component {
            Component::Normal(name) => directory = open_or_create_dir(&directory, name)?,
            _ => return Err(invalid("directory path must be relative")),
        }
    }
    Ok(())
}

/// Reads one managed relative file through no-follow handles.
pub fn read_entry(managed_root: &Path, relative: &Path) -> io::Result<Vec<u8>> {
    validate_relative(relative)?;
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    let mut components = relative.components().peekable();
    let name = loop {
        match components.next() {
            Some(Component::Normal(name)) if components.peek().is_none() => break name,
            Some(Component::Normal(name)) => directory = open_dir_nofollow(&directory, name)?,
            _ => return Err(invalid("file path must be relative")),
        }
    };
    directory.read(name)
}

/// Lists one managed relative directory through no-follow handles.
pub fn list_directory(managed_root: &Path, relative: &Path) -> io::Result<Vec<PathBuf>> {
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err(invalid("directory path must be relative"));
    }
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    for component in relative.components() {
        match component {
            Component::Normal(name) => directory = open_dir_nofollow(&directory, name)?,
            Component::CurDir => {}
            _ => return Err(invalid("directory path must be relative")),
        }
    }
    collect_directory_entries(directory.entries()?, |entry| entry.file_name().into())
}

fn collect_directory_entries<I, E, F>(entries: I, mut to_path: F) -> io::Result<Vec<PathBuf>>
where
    I: IntoIterator<Item = io::Result<E>>,
    F: FnMut(E) -> PathBuf,
{
    let mut paths = Vec::new();
    for entry in entries {
        paths.push(to_path(entry?));
    }
    Ok(paths)
}

/// Removes one empty managed relative directory through no-follow handles.
pub fn remove_directory(managed_root: &Path, relative: &Path) -> io::Result<()> {
    validate_relative(relative)?;
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    let mut components = relative.components().peekable();
    let name = loop {
        match components.next() {
            Some(Component::Normal(name)) if components.peek().is_none() => break name,
            Some(Component::Normal(name)) => directory = open_dir_nofollow(&directory, name)?,
            _ => return Err(invalid("directory path must be relative")),
        }
    };
    directory.remove_dir(name)
}

/// Removes one managed relative directory and all descendants through a
/// no-follow capability. The target and every parent component must be a
/// directory; links fail closed during the walk.
pub fn remove_directory_all(managed_root: &Path, relative: &Path) -> io::Result<()> {
    validate_relative(relative)?;
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    let mut components = relative.components().peekable();
    let name = loop {
        match components.next() {
            Some(Component::Normal(name)) if components.peek().is_none() => break name,
            Some(Component::Normal(name)) => directory = open_dir_nofollow(&directory, name)?,
            _ => return Err(invalid("directory path must be relative")),
        }
    };
    {
        let target = open_dir_nofollow(&directory, name)?;
        validate_directory_tree(&target)?;
        remove_directory_tree(&target)?;
    }
    remove_directory_by_handle(&directory, name)
}

/// Preflights one managed directory tree without mutating it.
pub fn preflight_directory_all(managed_root: &Path, relative: &Path) -> io::Result<bool> {
    validate_relative(relative)?;
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    let mut components = relative.components().peekable();
    let name = loop {
        match components.next() {
            Some(Component::Normal(name)) if components.peek().is_none() => break name,
            Some(Component::Normal(name)) => match open_dir_nofollow(&directory, name) {
                Ok(next) => directory = next,
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
                Err(error) => return Err(error),
            },
            _ => return Err(invalid("directory path must be relative")),
        }
    };
    let target = match open_dir_nofollow(&directory, name) {
        Ok(target) => target,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    validate_directory_tree(&target)?;
    Ok(true)
}

/// Preflights one managed regular-file entry without mutating it.
pub fn preflight_entry(managed_root: &Path, relative: &Path) -> io::Result<bool> {
    validate_relative(relative)?;
    let root = open_managed_root(managed_root)?;
    let mut directory = root;
    let mut components = relative.components().peekable();
    let name = loop {
        match components.next() {
            Some(Component::Normal(name)) if components.peek().is_none() => break name,
            Some(Component::Normal(name)) => match open_dir_nofollow(&directory, name) {
                Ok(next) => directory = next,
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
                Err(error) => return Err(error),
            },
            _ => return Err(invalid("file path must be relative")),
        }
    };
    for entry in directory.entries()? {
        let entry = entry?;
        if entry.file_name() == name {
            let file_type = entry.full_metadata()?.file_type();
            if file_type.is_symlink() || !file_type.is_file() {
                return Err(invalid("entry is not a regular file"));
            }
            return Ok(true);
        }
    }
    Ok(false)
}

fn validate_directory_tree(directory: &Dir) -> io::Result<()> {
    for entry in directory.entries()? {
        let entry = entry?;
        let file_type = entry.full_metadata()?.file_type();
        if file_type.is_symlink() {
            return Err(invalid("directory tree contains a link or reparse point"));
        }
        if file_type.is_dir() {
            let child = open_dir_nofollow(directory, &entry.file_name())?;
            validate_directory_tree(&child)?;
        } else if !file_type.is_file() {
            return Err(invalid("directory tree contains an unsafe entry"));
        }
    }
    Ok(())
}

fn remove_directory_tree(directory: &Dir) -> io::Result<()> {
    for entry in directory.entries()? {
        let entry = entry?;
        let name = entry.file_name();
        let file_type = entry.full_metadata()?.file_type();
        if file_type.is_symlink() {
            return Err(invalid("directory tree changed to a link or reparse point"));
        }
        if file_type.is_dir() {
            {
                let child = open_dir_nofollow(directory, &name)?;
                remove_directory_tree(&child)?;
            }
            remove_directory_by_handle(directory, &name)?;
        } else if file_type.is_file() {
            remove_file_by_handle(directory, &name)?;
        } else {
            return Err(invalid("directory tree contains an unsafe entry"));
        }
    }
    Ok(())
}

fn remove_file_by_handle(directory: &Dir, name: &OsStr) -> io::Result<()> {
    let parent = directory.try_clone()?.into_std_file();
    fs_at::OpenOptions::default().unlink_at(&parent, name)
}

fn remove_directory_by_handle(directory: &Dir, name: &OsStr) -> io::Result<()> {
    let parent = directory.try_clone()?.into_std_file();
    fs_at::OpenOptions::default().rmdir_at(&parent, name)
}

fn artifact_token(destination: &str, invocation: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    destination.hash(&mut hasher);
    format!("{invocation}-{:016x}", hasher.finish())
}

fn validate_invocation(value: &str) -> io::Result<()> {
    if value.is_empty()
        || value.len() > 128
        || value == "."
        || value == ".."
        || value.contains('/')
        || value.contains('\\')
    {
        return Err(invalid("invalid invocation identity"));
    }
    Ok(())
}

fn validate_relative(path: &Path) -> io::Result<()> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::CurDir | Component::ParentDir | Component::Prefix(_)
            )
        })
        || path.components().any(|component| {
            matches!(component, Component::Normal(name) if name.to_string_lossy().contains(['/', '\\']))
        })
    {
        return Err(invalid(
            "transaction path must be relative and traversal-free",
        ));
    }
    Ok(())
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn reject_link_destination(directory: &Dir, name: &str) -> io::Result<()> {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    match directory.open_with(name, &options) {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

impl PlatformLockHandle {
    /// Returns the visible lock entry path.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Attempts the macOS file-descriptor exclusive lock.
    pub fn try_lock(&self) -> io::Result<()> {
        self.file.try_lock_exclusive()
    }

    /// Releases the macOS file-descriptor exclusive lock.
    pub fn unlock(self) -> io::Result<()> {
        fs2::FileExt::unlock(&self.file)
    }
}

/// Opens `control/operation.lock` through handle-relative no-follow operations.
pub fn exclusive_open(managed_root: &Path) -> io::Result<PlatformLockHandle> {
    let root_dir = open_managed_root(managed_root)?;
    let control_dir = open_or_create_dir(&root_dir, OsStr::new("control"))?;
    let mut options = OpenOptions::new();
    options
        .read(true)
        .write(true)
        .create(true)
        .follow(FollowSymlinks::No);
    let file = control_dir
        .open_with("operation.lock", &options)?
        .into_std();
    Ok(PlatformLockHandle {
        file,
        path: managed_root.join("control").join("operation.lock"),
    })
}

fn open_managed_root(managed_root: &Path) -> io::Result<Dir> {
    let mut current = Dir::open_ambient_dir(Path::new("/"), ambient_authority())?;
    for component in managed_root.components() {
        match component {
            Component::RootDir => {}
            Component::Normal(name) => current = open_or_create_dir(&current, name)?,
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "managed root contains a non-normal component",
                ))
            }
        }
    }
    Ok(current)
}

fn open_or_create_dir(parent: &Dir, name: &OsStr) -> io::Result<Dir> {
    match open_dir_nofollow(parent, name) {
        Ok(dir) => Ok(dir),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            match parent.create_dir(name) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
            open_dir_nofollow(parent, name)
        }
        Err(error) => Err(error),
    }
}

fn open_dir_nofollow(parent: &Dir, name: &OsStr) -> io::Result<Dir> {
    // Use the same handle-relative no-follow contract as Windows. On macOS
    // `fs_at` maps this to openat(2) with no-follow semantics.
    let parent_handle = parent.try_clone()?.into_std_file();
    let child = fs_at::OpenOptions::default()
        .read(true)
        .follow(false)
        .open_dir_at(&parent_handle, Path::new(name))?;
    Ok(Dir::from_std_file(child))
}

#[cfg(test)]
mod directory_entry_tests {
    use super::{collect_directory_entries, remove_directory_all};
    #[cfg(target_os = "macos")]
    use std::fs;
    use std::{
        io,
        path::{Path, PathBuf},
    };

    #[test]
    fn collection_propagates_an_error_after_a_successful_entry() {
        let entries = vec![
            Ok(PathBuf::from("first")),
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "injected")),
            Ok(PathBuf::from("third")),
        ];
        let error = collect_directory_entries(entries, |path| path).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(), "injected");
    }

    #[test]
    fn remove_directory_all_rejects_parent_traversal() {
        let error =
            remove_directory_all(Path::new("/managed"), Path::new("../outside")).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn remove_directory_all_removes_normal_nested_tree_and_reports_missing() {
        let root = std::env::temp_dir().join(format!(
            "ty-plus-host-filesystem-macos-tree-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("cache/nested/deeper")).unwrap();
        fs::write(root.join("cache/nested/deeper/value"), b"sentinel").unwrap();
        assert!(super::preflight_directory_all(&root, Path::new("cache")).unwrap());
        remove_directory_all(&root, Path::new("cache")).unwrap();
        assert!(!root.join("cache").exists());
        assert!(!super::preflight_directory_all(&root, Path::new("cache")).unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn preflight_rejects_nested_symlink_and_preserves_external_sentinel() {
        use std::os::unix::fs::symlink;

        let root = std::env::temp_dir().join(format!(
            "ty-plus-host-filesystem-macos-link-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let external = root.with_file_name("ty-plus-host-filesystem-macos-external");
        fs::create_dir_all(root.join("cache/nested")).unwrap();
        fs::create_dir_all(&external).unwrap();
        fs::write(external.join("sentinel"), b"keep").unwrap();
        symlink(&external, root.join("cache/nested/link")).unwrap();
        assert!(super::preflight_directory_all(&root, Path::new("cache")).is_err());
        assert!(remove_directory_all(&root, Path::new("cache")).is_err());
        assert!(external.join("sentinel").exists());
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(external);
    }
}
