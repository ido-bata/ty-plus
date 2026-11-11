//! Shared JSON file store with missing/corrupt/revision handling.
//!
//! This module provides a JSON file store that handles missing files,
//! corrupt data, and revision tracking.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use ty_plus_host_filesystem::platform::remove_entry;

use crate::{
    ManagedRoot, MutationContext, RegisteredDirectory, RegisteredPath, Transaction, WriteError,
};
use ty_plus_host_filesystem::platform::{list_directory, read_entry};

/// Errors specific to the JSON file store.
#[derive(Debug)]
pub enum JsonStoreError {
    /// I/O error.
    Io(std::io::Error),
    /// JSON parse error.
    Parse(serde_json::Error),
    /// Revision mismatch (optimistic concurrency failure).
    RevisionMismatch {
        /// Expected revision.
        expected: String,
        /// Actual revision.
        actual: String,
    },
    /// File is corrupt.
    Corrupt {
        /// Path to the corrupt file.
        path: PathBuf,
        /// Error message.
        detail: String,
    },
}

impl From<std::io::Error> for JsonStoreError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

impl From<serde_json::Error> for JsonStoreError {
    fn from(err: serde_json::Error) -> Self {
        Self::Parse(err)
    }
}

impl From<WriteError> for JsonStoreError {
    fn from(err: WriteError) -> Self {
        match err {
            WriteError::Io(e) => Self::Io(e),
            WriteError::RevisionMismatch { expected, actual } => {
                Self::RevisionMismatch { expected, actual }
            }
        }
    }
}

impl std::fmt::Display for JsonStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "I/O error: {err}"),
            Self::Parse(err) => write!(f, "JSON parse error: {err}"),
            Self::RevisionMismatch { expected, actual } => {
                write!(f, "revision mismatch: expected {expected}, got {actual}")
            }
            Self::Corrupt { path, detail } => {
                write!(f, "corrupt file {}: {}", path.display(), detail)
            }
        }
    }
}

impl std::error::Error for JsonStoreError {}

/// A shared JSON file store.
#[derive(Debug, Clone)]
pub struct JsonFileStore {
    /// Validated managed root used for every read, list, and mutation.
    managed_root: ManagedRoot,
    base_directory: RegisteredDirectory,
}

impl JsonFileStore {
    /// Creates a new JSON file store.
    #[must_use]
    pub fn new(base_dir: &Path) -> Self {
        Self {
            managed_root: ManagedRoot::new(base_dir)
                .expect("JSON store construction requires an absolute managed root"),
            base_directory: RegisteredDirectory::Root,
        }
    }

    /// Returns the base directory.
    #[must_use]
    pub fn base_dir(&self) -> &Path {
        self.managed_root.as_path()
    }

    /// Resolves a key to a file path.
    #[must_use]
    #[cfg(test)]
    pub fn resolve_path(&self, key: &str) -> PathBuf {
        self.managed_root.as_path().join(key).with_extension("json")
    }

    fn relative_path(key: &str, extension: &str) -> Result<RegisteredPath, JsonStoreError> {
        RegisteredPath::new(Path::new(key).with_extension(extension)).map_err(|error| {
            JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                error.to_string(),
            ))
        })
    }

    fn read_bytes(&self, relative: &RegisteredPath) -> Result<Option<Vec<u8>>, JsonStoreError> {
        match read_entry(self.managed_root.as_path(), relative.as_path()) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(JsonStoreError::Io(error)),
        }
    }

    /// Reads a JSON value by key.
    ///
    /// Returns `None` if the file doesn't exist.
    /// Returns `Err` if the file is corrupt.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the read fails.
    pub fn read<T>(&self, key: &str) -> Result<Option<T>, JsonStoreError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let relative = Self::relative_path(key, "json")?;
        match self.read_bytes(&relative)? {
            Some(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(JsonStoreError::Parse),
            None => Ok(None),
        }
    }

    /// Reads a JSON value with its revision.
    ///
    /// Returns `None` if the file doesn't exist.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the read fails.
    pub fn read_with_revision<T>(
        &self,
        key: &str,
    ) -> Result<Option<(T, Option<String>)>, JsonStoreError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let relative = Self::relative_path(key, "json")?;
        let revision_relative = Self::relative_path(key, "rev.json")?;
        let value: Option<T> = self
            .read_bytes(&relative)?
            .map(|bytes| serde_json::from_slice(&bytes))
            .transpose()?;
        let revision = self
            .read_bytes(&revision_relative)?
            .map(|bytes| serde_json::from_slice::<crate::JsonRevision>(&bytes))
            .transpose()?
            .map(|revision| revision.revision);

        Ok(value.map(|v| (v, revision)))
    }

    /// Writes a JSON value by key.
    ///
    /// If `expected_revision` is provided, the write will fail if the
    /// current revision doesn't match (optimistic concurrency).
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the write fails.
    pub fn write_with_context<T>(
        &self,
        context: &MutationContext<'_>,
        key: &str,
        value: &T,
        expected_revision: Option<&str>,
    ) -> Result<String, JsonStoreError>
    where
        T: Serialize,
    {
        let relative = Self::relative_path(key, "json")?;
        if let Some(expected) = expected_revision {
            let revision_relative = Self::relative_path(key, "rev.json")?;
            let current = self
                .read_bytes(&revision_relative)?
                .map(|bytes| serde_json::from_slice::<crate::JsonRevision>(&bytes))
                .transpose()?
                .map(|revision| revision.revision);
            if current.as_deref() != Some(expected) {
                return Err(JsonStoreError::RevisionMismatch {
                    expected: expected.to_owned(),
                    actual: current.unwrap_or_else(|| "none".to_owned()),
                });
            }
        }
        let content = serde_json::to_vec_pretty(value)?;
        let mut transaction =
            Transaction::prepare(context.guard(), relative, context.invocation_id().clone())
                .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
        transaction
            .write_all(&content)
            .and_then(|_| transaction.flush())
            .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
        let receipt = transaction
            .commit()
            .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
        Ok(receipt.revision.to_string())
    }

    /// Deletes a JSON file by key.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        key: &str,
    ) -> Result<(), JsonStoreError> {
        for relative in [format!("{key}.json"), format!("{key}.rev.json")] {
            let relative = RegisteredPath::new(relative)
                .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
            match remove_entry(context.guard().managed_root().as_path(), relative.as_path()) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(JsonStoreError::Io(error)),
            }
        }

        Ok(())
    }

    /// Test-only compatibility wrapper; product callers must provide context.
    #[cfg(test)]
    pub fn write<T>(
        &self,
        key: &str,
        value: &T,
        expected_revision: Option<&str>,
    ) -> Result<String, JsonStoreError>
    where
        T: Serialize,
    {
        let root = crate::ManagedRoot::new(self.base_dir())
            .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
        let guard = crate::OperationLock::acquire(
            &root,
            std::time::Instant::now() + std::time::Duration::from_secs(5),
        )
        .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
        let invocation = crate::InvocationId::new("test-json-store");
        let context = MutationContext::new(&guard, &invocation);
        self.write_with_context(&context, key, value, expected_revision)
    }

    /// Test-only compatibility wrapper; product callers must provide context.
    #[cfg(test)]
    pub fn delete(&self, key: &str) -> Result<(), JsonStoreError> {
        let root = crate::ManagedRoot::new(self.base_dir())
            .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
        let guard = crate::OperationLock::acquire(
            &root,
            std::time::Instant::now() + std::time::Duration::from_secs(5),
        )
        .map_err(|error| JsonStoreError::Io(std::io::Error::other(error.to_string())))?;
        let invocation = crate::InvocationId::new("test-json-store");
        let context = MutationContext::new(&guard, &invocation);
        self.delete_with_context(&context, key)
    }

    /// Lists all JSON keys in the store.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_keys(&self) -> Result<Vec<String>, JsonStoreError> {
        let mut keys = Vec::new();

        let entries =
            match list_directory(self.managed_root.as_path(), self.base_directory.as_path()) {
                Ok(entries) => entries,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(keys),
                Err(error) => return Err(JsonStoreError::Io(error)),
            };
        for path in entries {
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                // Skip revision files
                if path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.ends_with(".rev"))
                    .unwrap_or(false)
                {
                    continue;
                }

                if let Some(key) = path.file_stem().and_then(|s| s.to_str()) {
                    keys.push(key.to_string());
                }
            }
        }

        keys.sort();
        Ok(keys)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-json-store-test-{suffix}-{:?}",
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
    fn json_store_new() {
        let dir = test_dir("new");
        let store = JsonFileStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn json_store_read_nonexistent() {
        let dir = test_dir("read");
        let store = JsonFileStore::new(&dir);
        let result: Option<serde_json::Value> =
            store.read("nonexistent").expect("read should succeed");
        assert!(result.is_none());
        cleanup(&dir);
    }

    #[test]
    fn json_store_write_and_read() {
        let dir = test_dir("write");
        let store = JsonFileStore::new(&dir);

        let data = serde_json::json!({"key": "value"});
        let revision = store
            .write("test", &data, None)
            .expect("write should succeed");

        assert!(!revision.is_empty());

        let read_back: Option<serde_json::Value> = store.read("test").expect("read should succeed");
        assert_eq!(read_back, Some(data));

        cleanup(&dir);
    }

    #[test]
    fn json_store_write_with_expected_revision() {
        let dir = test_dir("revision");
        let store = JsonFileStore::new(&dir);

        let data = serde_json::json!({"key": "value"});
        let revision = store
            .write("test", &data, None)
            .expect("write should succeed");

        // Write with correct expected revision
        let data2 = serde_json::json!({"key": "value2"});
        let revision2 = store
            .write("test", &data2, Some(&revision))
            .expect("write with correct revision should succeed");

        assert_ne!(revision, revision2);

        cleanup(&dir);
    }

    #[test]
    fn json_store_write_with_wrong_revision_fails() {
        let dir = test_dir("wrong-revision");
        let store = JsonFileStore::new(&dir);

        let data = serde_json::json!({"key": "value"});
        store
            .write("test", &data, None)
            .expect("write should succeed");

        // Write with wrong expected revision
        let data2 = serde_json::json!({"key": "value2"});
        let result = store.write("test", &data2, Some("wrong-revision"));

        assert!(matches!(
            result,
            Err(JsonStoreError::RevisionMismatch { .. })
        ));

        cleanup(&dir);
    }

    #[test]
    fn json_store_delete() {
        let dir = test_dir("delete");
        let store = JsonFileStore::new(&dir);

        let data = serde_json::json!({"key": "value"});
        store
            .write("test", &data, None)
            .expect("write should succeed");
        assert!(store.resolve_path("test").exists());

        store.delete("test").expect("delete should succeed");
        assert!(!store.resolve_path("test").exists());

        cleanup(&dir);
    }

    #[test]
    fn json_store_list_keys() {
        let dir = test_dir("list");
        let store = JsonFileStore::new(&dir);

        store
            .write("alpha", &serde_json::json!(1), None)
            .expect("write should succeed");
        store
            .write("beta", &serde_json::json!(2), None)
            .expect("write should succeed");
        store
            .write("gamma", &serde_json::json!(3), None)
            .expect("write should succeed");

        let mut keys = store.list_keys().expect("list should succeed");
        keys.sort();

        assert_eq!(keys, vec!["alpha", "beta", "gamma"]);

        cleanup(&dir);
    }

    #[test]
    fn json_store_read_with_revision() {
        let dir = test_dir("read-revision");
        let store = JsonFileStore::new(&dir);

        let data = serde_json::json!({"key": "value"});
        let revision = store
            .write("test", &data, None)
            .expect("write should succeed");

        let (read_back, read_revision): (serde_json::Value, Option<String>) = store
            .read_with_revision("test")
            .expect("read should succeed")
            .expect("file should exist");

        assert_eq!(read_back, data);
        assert_eq!(read_revision, Some(revision));

        cleanup(&dir);
    }
}
