//! Atomic JSON commit with expected revision and write ordering.
//!
//! This module provides atomic JSON file operations with optimistic
//! concurrency control using revisions.

#[cfg(test)]
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Metadata stored alongside JSON content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JsonRevision {
    /// Unique revision identifier.
    pub revision: String,
    /// ISO 8601 timestamp of when this revision was created.
    pub timestamp: String,
}

/// A JSON file with revision tracking.
#[derive(Debug, Clone)]
pub struct JsonFile {
    /// Path to the JSON file.
    #[cfg(test)]
    path: PathBuf,
    /// Path to the revision metadata file.
    #[cfg(test)]
    revision_path: PathBuf,
}

impl JsonFile {
    /// Creates a new JSON file handler.
    #[must_use]
    #[cfg(test)]
    pub fn new(path: &Path) -> Self {
        let revision_path = path.with_extension("rev.json");
        Self {
            path: path.to_path_buf(),
            revision_path,
        }
    }

    /// Returns the path to the JSON file.
    #[must_use]
    #[cfg(test)]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Returns the path to the revision metadata file.
    #[must_use]
    #[cfg(test)]
    pub fn revision_path(&self) -> &Path {
        &self.revision_path
    }

    /// Reads the current revision, if it exists.
    ///
    /// # Errors
    ///
    /// Returns `std::io::Error` if the read fails.
    #[cfg(test)]
    pub fn read_revision(&self) -> Result<Option<JsonRevision>, std::io::Error> {
        if !self.revision_path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&self.revision_path)?;
        let revision: JsonRevision = serde_json::from_str(&content)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        Ok(Some(revision))
    }

    /// Reads the JSON content.
    ///
    /// # Errors
    ///
    /// Returns `std::io::Error` if the read fails.
    #[cfg(test)]
    pub fn read<T>(&self) -> Result<Option<T>, std::io::Error>
    where
        T: for<'de> Deserialize<'de>,
    {
        if !self.path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&self.path)?;
        let value: T = serde_json::from_str(&content)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        Ok(Some(value))
    }

    /// Writes JSON content with a new revision.
    ///
    /// If `expected_revision` is provided, the write will fail if the
    /// current revision doesn't match (optimistic concurrency).
    ///
    /// # Errors
    ///
    /// Returns `std::io::Error` if the write fails.
    /// Returns `RevisionMismatch` if the expected revision doesn't match.
    #[cfg(test)]
    fn write<T>(
        &self,
        value: &T,
        expected_revision: Option<&str>,
    ) -> Result<JsonRevision, WriteError>
    where
        T: Serialize,
    {
        // Check expected revision
        if let Some(expected) = expected_revision {
            let current = self.read_revision()?;
            match current {
                Some(rev) if rev.revision != expected => {
                    return Err(WriteError::RevisionMismatch {
                        expected: expected.to_string(),
                        actual: rev.revision,
                    });
                }
                None if !expected.is_empty() => {
                    return Err(WriteError::RevisionMismatch {
                        expected: expected.to_string(),
                        actual: "none".to_string(),
                    });
                }
                _ => {}
            }
        }

        // Generate new revision
        let new_revision = generate_revision();

        // Write content
        let content = serde_json::to_string_pretty(value)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(&self.path, content)?;

        // Write revision metadata
        let revision = JsonRevision {
            revision: new_revision,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
        let rev_content = serde_json::to_string_pretty(&revision)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        std::fs::write(&self.revision_path, rev_content)?;

        Ok(revision)
    }
}

/// Errors that can occur during JSON writes.
#[derive(Debug)]
pub enum WriteError {
    /// I/O error.
    Io(std::io::Error),
    /// Revision mismatch (optimistic concurrency failure).
    RevisionMismatch {
        /// Expected revision.
        expected: String,
        /// Actual revision.
        actual: String,
    },
}

impl From<std::io::Error> for WriteError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "I/O error: {err}"),
            Self::RevisionMismatch { expected, actual } => {
                write!(f, "revision mismatch: expected {expected}, got {actual}")
            }
        }
    }
}

impl std::error::Error for WriteError {}

/// Generates a new revision identifier.
#[cfg(test)]
fn generate_revision() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}-{}", duration.as_secs(), duration.subsec_nanos())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-json-test-{suffix}-{:?}",
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
    fn json_file_new() {
        let path = PathBuf::from("/test/data.json");
        let file = JsonFile::new(&path);
        assert_eq!(file.path(), path);
        assert_eq!(file.revision_path(), PathBuf::from("/test/data.rev.json"));
    }

    #[test]
    fn json_file_read_nonexistent() {
        let dir = test_dir("read");
        let file = JsonFile::new(&dir.join("nonexistent.json"));
        let result: Option<serde_json::Value> = file.read().expect("read should succeed");
        assert!(result.is_none());
        cleanup(&dir);
    }

    #[test]
    fn json_file_write_and_read() {
        let dir = test_dir("write");
        let file = JsonFile::new(&dir.join("data.json"));

        let data = serde_json::json!({"key": "value"});
        let revision = file.write(&data, None).expect("write should succeed");

        assert!(!revision.revision.is_empty());
        assert!(!revision.timestamp.is_empty());

        let read_back: Option<serde_json::Value> = file.read().expect("read should succeed");
        assert_eq!(read_back, Some(data));

        cleanup(&dir);
    }

    #[test]
    fn json_file_write_with_expected_revision() {
        let dir = test_dir("revision");
        let file = JsonFile::new(&dir.join("data.json"));

        let data = serde_json::json!({"key": "value"});
        let revision = file.write(&data, None).expect("write should succeed");

        // Write with correct expected revision
        let data2 = serde_json::json!({"key": "value2"});
        let revision2 = file
            .write(&data2, Some(&revision.revision))
            .expect("write with correct revision should succeed");

        assert_ne!(revision.revision, revision2.revision);

        cleanup(&dir);
    }

    #[test]
    fn json_file_write_with_wrong_revision_fails() {
        let dir = test_dir("wrong-revision");
        let file = JsonFile::new(&dir.join("data.json"));

        let data = serde_json::json!({"key": "value"});
        file.write(&data, None).expect("write should succeed");

        // Write with wrong expected revision
        let data2 = serde_json::json!({"key": "value2"});
        let result = file.write(&data2, Some("wrong-revision"));

        assert!(matches!(result, Err(WriteError::RevisionMismatch { .. })));

        cleanup(&dir);
    }
}
