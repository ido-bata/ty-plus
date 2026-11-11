//! Scoped binary and directory operations.
//!
//! This module provides safe binary and directory operations that are
//! scoped to a managed root, preventing path escape.

use std::path::{Path, PathBuf};

use crate::{ManagedRoot, MutationContext, RegisteredDirectory, RegisteredPath, Transaction};
use ty_plus_host_filesystem::platform::{
    ensure_directory, list_directory, read_entry, remove_directory, remove_entry,
};

/// Errors that can occur during binary/directory operations.
#[derive(Debug)]
pub enum StorageOperationError {
    /// I/O error.
    Io(std::io::Error),
    /// Path escape attempt detected.
    PathEscape {
        /// The path that attempted to escape.
        path: PathBuf,
        /// The root that was escaped from.
        root: PathBuf,
    },
    /// Path not found.
    NotFound(PathBuf),
}

impl From<std::io::Error> for StorageOperationError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

impl std::fmt::Display for StorageOperationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "I/O error: {err}"),
            Self::PathEscape { path, root } => {
                write!(
                    f,
                    "path escape attempt: {} escapes {}",
                    path.display(),
                    root.display()
                )
            }
            Self::NotFound(path) => write!(f, "not found: {}", path.display()),
        }
    }
}

impl std::error::Error for StorageOperationError {}

/// A scoped directory that prevents path escape.
#[derive(Debug, Clone)]
pub struct ScopedDirectory {
    /// The root directory.
    root: PathBuf,
    managed_root: ManagedRoot,
}

impl ScopedDirectory {
    /// Creates a new scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError::PathEscape` if the root is not absolute.
    pub fn new(root: &Path) -> Result<Self, StorageOperationError> {
        let managed_root =
            ManagedRoot::new(root).map_err(|_| StorageOperationError::PathEscape {
                path: root.to_path_buf(),
                root: root.to_path_buf(),
            })?;
        Ok(Self {
            root: root.to_path_buf(),
            managed_root,
        })
    }

    /// Returns the root directory.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Validates that a path is within the scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError::PathEscape` if the path escapes the root.
    #[cfg(test)]
    pub fn validate_path(&self, relative: &Path) -> Result<PathBuf, StorageOperationError> {
        // Join relative path to root
        let full_path = self.root.join(relative);

        // Canonicalize the full path
        let canonical = if full_path.exists() {
            std::fs::canonicalize(&full_path)?
        } else {
            // For non-existent paths, canonicalize the root and check prefix
            let canonical_root = std::fs::canonicalize(&self.root)?;
            let mut parts = Vec::new();
            for component in relative.components() {
                match component {
                    std::path::Component::ParentDir => {
                        parts.pop();
                    }
                    std::path::Component::Normal(p) => {
                        parts.push(p);
                    }
                    _ => {}
                }
            }
            let mut result = canonical_root;
            for part in parts {
                result = result.join(part);
            }
            result
        };

        let canonical_root = std::fs::canonicalize(&self.root)?;

        if !canonical.starts_with(&canonical_root) {
            return Err(StorageOperationError::PathEscape {
                path: relative.to_path_buf(),
                root: self.root.clone(),
            });
        }

        Ok(canonical)
    }

    /// Registers a relative path for the host no-follow capability boundary.
    pub fn register_path(&self, relative: &Path) -> Result<RegisteredPath, StorageOperationError> {
        RegisteredPath::new(relative).map_err(|_| StorageOperationError::PathEscape {
            path: relative.to_path_buf(),
            root: self.root.clone(),
        })
    }

    /// Reads a binary file within the scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError` if the read fails or path escapes.
    pub fn read_bytes(&self, relative: &Path) -> Result<Vec<u8>, StorageOperationError> {
        let relative = self.register_path(relative)?;
        Ok(read_entry(self.managed_root.as_path(), relative.as_path())?)
    }

    /// Writes binary data to a file within the scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError` if the write fails or path escapes.
    pub fn write_bytes_with_context(
        &self,
        context: &MutationContext<'_>,
        relative: &Path,
        data: &[u8],
    ) -> Result<(), StorageOperationError> {
        let relative = self.register_path(relative)?;
        let mut transaction =
            Transaction::prepare(context.guard(), relative, context.invocation_id().clone())
                .map_err(|error| {
                    StorageOperationError::Io(std::io::Error::other(error.to_string()))
                })?;
        transaction
            .write_all(data)
            .and_then(|_| transaction.flush())
            .and_then(|_| transaction.commit().map(|_| ()))
            .map_err(|error| StorageOperationError::Io(std::io::Error::other(error.to_string())))?;
        Ok(())
    }

    /// Lists files in a directory within the scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError` if the list fails or path escapes.
    pub fn list_dir(&self, relative: &Path) -> Result<Vec<PathBuf>, StorageOperationError> {
        let directory = if relative.as_os_str().is_empty() || relative == Path::new(".") {
            RegisteredDirectory::Root
        } else {
            RegisteredDirectory::Child(self.register_path(relative)?)
        };
        Ok(list_directory(
            self.managed_root.as_path(),
            directory.as_path(),
        )?)
    }

    /// Ensures a directory exists within the scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError` if the operation fails or path escapes.
    pub fn ensure_dir_with_context(
        &self,
        _context: &MutationContext<'_>,
        relative: &Path,
    ) -> Result<(), StorageOperationError> {
        let relative = self.register_path(relative)?;
        ensure_directory(self.managed_root.as_path(), relative.as_path())?;
        Ok(())
    }

    /// Deletes a file within the scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError` if the delete fails or path escapes.
    pub fn delete_file_with_context(
        &self,
        context: &MutationContext<'_>,
        relative: &Path,
    ) -> Result<(), StorageOperationError> {
        let relative = self.register_path(relative)?;
        let _ = context.guard();
        remove_entry(self.managed_root.as_path(), relative.as_path())?;
        Ok(())
    }

    /// Deletes a directory and its contents within the scoped directory.
    ///
    /// # Errors
    ///
    /// Returns `StorageOperationError` if the delete fails or path escapes.
    pub fn delete_dir_with_context(
        &self,
        _context: &MutationContext<'_>,
        relative: &Path,
    ) -> Result<(), StorageOperationError> {
        let relative = self.register_path(relative)?;
        remove_directory(self.managed_root.as_path(), relative.as_path())?;
        Ok(())
    }

    #[cfg(test)]
    pub fn write_bytes(&self, relative: &Path, data: &[u8]) -> Result<(), StorageOperationError> {
        crate::operation_lock::with_test_context(self.root(), |context| {
            self.write_bytes_with_context(context, relative, data)
        })
    }
    #[cfg(test)]
    pub fn ensure_dir(&self, relative: &Path) -> Result<(), StorageOperationError> {
        crate::operation_lock::with_test_context(self.root(), |context| {
            self.ensure_dir_with_context(context, relative)
        })
    }
    #[cfg(test)]
    pub fn delete_file(&self, relative: &Path) -> Result<(), StorageOperationError> {
        crate::operation_lock::with_test_context(self.root(), |context| {
            self.delete_file_with_context(context, relative)
        })
    }
    #[cfg(test)]
    pub fn delete_dir(&self, relative: &Path) -> Result<(), StorageOperationError> {
        crate::operation_lock::with_test_context(self.root(), |context| {
            self.delete_dir_with_context(context, relative)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-scoped-test-{suffix}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("failed to create test dir");
        dir
    }

    fn cleanup(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn scoped_directory_new() {
        let dir = test_dir("new");
        let scoped = ScopedDirectory::new(&dir).expect("should succeed");
        assert_eq!(scoped.root(), dir);
        cleanup(&dir);
    }

    #[test]
    fn scoped_directory_rejects_relative() {
        let dir = PathBuf::from("relative/path");
        let result = ScopedDirectory::new(&dir);
        assert!(matches!(
            result,
            Err(StorageOperationError::PathEscape { .. })
        ));
    }

    #[test]
    fn scoped_directory_validate_path_within_root() {
        let dir = test_dir("validate");
        let scoped = ScopedDirectory::new(&dir).expect("should succeed");

        let relative = PathBuf::from("subdir/file.txt");
        let result = scoped.validate_path(&relative);
        assert!(result.is_ok());

        cleanup(&dir);
    }

    #[test]
    fn scoped_directory_write_and_read_bytes() {
        let dir = test_dir("binary");
        let scoped = ScopedDirectory::new(&dir).expect("should succeed");

        let relative = PathBuf::from("test.bin");
        let data = b"hello world";

        scoped
            .write_bytes(&relative, data)
            .expect("write should succeed");
        let read_back = scoped.read_bytes(&relative).expect("read should succeed");
        assert_eq!(read_back, data);

        cleanup(&dir);
    }

    #[test]
    fn scoped_directory_ensure_dir() {
        let dir = test_dir("ensure");
        let scoped = ScopedDirectory::new(&dir).expect("should succeed");

        let relative = PathBuf::from("a/b/c");
        scoped.ensure_dir(&relative).expect("ensure should succeed");
        assert!(scoped.root().join("a/b/c").exists());

        cleanup(&dir);
    }

    #[test]
    fn scoped_directory_list_dir() {
        let dir = test_dir("list");
        let scoped = ScopedDirectory::new(&dir).expect("should succeed");

        fs::write(scoped.root().join("file1.txt"), "1").expect("failed to write");
        fs::write(scoped.root().join("file2.txt"), "2").expect("failed to write");

        let entries = scoped
            .list_dir(Path::new("."))
            .expect("list should succeed");
        assert_eq!(entries.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn scoped_directory_delete_file() {
        let dir = test_dir("delete");
        let scoped = ScopedDirectory::new(&dir).expect("should succeed");

        let relative = PathBuf::from("to-delete.txt");
        scoped
            .write_bytes(&relative, b"data")
            .expect("write should succeed");
        assert!(scoped.root().join(&relative).exists());

        scoped
            .delete_file(&relative)
            .expect("delete should succeed");
        assert!(!scoped.root().join(&relative).exists());

        cleanup(&dir);
    }
}
