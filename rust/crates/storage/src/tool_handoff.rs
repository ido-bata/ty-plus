//! Tool handoff file storage.
//!
//! This module provides tool handoff file storage with support for
//! opener surface and runtime restart.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// Tool handoff file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolHandoffFile {
    /// Unique identifier for this handoff.
    pub id: String,
    /// ISO 8601 timestamp of when this handoff was created.
    pub created_at: String,
    /// Tool identifier.
    pub tool_id: String,
    /// Tool parameters.
    pub params: serde_json::Value,
    /// Optional callback URL.
    pub callback_url: Option<String>,
}

impl ToolHandoffFile {
    /// Creates a new tool handoff file.
    #[must_use]
    pub fn new(tool_id: &str, params: serde_json::Value) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let id = format!(
            "handoff-{}",
            now.replace([':', '-', 'T', 'Z'], "")
                .chars()
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
        );

        Self {
            id,
            created_at: now,
            tool_id: tool_id.to_string(),
            params,
            callback_url: None,
        }
    }
}

/// Tool handoff store.
#[derive(Debug, Clone)]
pub struct ToolHandoffStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl ToolHandoffStore {
    /// Creates a new tool handoff store.
    #[must_use]
    pub fn new(base_dir: &Path) -> Self {
        Self {
            store: JsonFileStore::new(base_dir),
        }
    }

    /// Returns the base directory.
    #[must_use]
    pub fn base_dir(&self) -> &Path {
        self.store.base_dir()
    }

    /// Gets a tool handoff file by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, id: &str) -> Result<Option<ToolHandoffFile>, JsonStoreError> {
        let files = self.list()?;
        Ok(files.into_iter().find(|f| f.id == id))
    }

    /// Saves a tool handoff file.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        file: &ToolHandoffFile,
    ) -> Result<(), JsonStoreError> {
        let mut files = self.list()?;

        // Remove existing file with same ID
        files.retain(|f| f.id != file.id);

        // Add new file
        files.push(file.clone());

        self.store
            .write_with_context(context, "tool-handoffs", &files, None)?;
        Ok(())
    }

    /// Deletes a tool handoff file by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut files = self.list()?;

        let initial_len = files.len();
        files.retain(|f| f.id != id);

        if files.len() == initial_len {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("tool handoff with ID {id} not found"),
            )));
        }

        self.store
            .write_with_context(context, "tool-handoffs", &files, None)?;
        Ok(())
    }

    /// Lists all tool handoff files.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<ToolHandoffFile>, JsonStoreError> {
        let files: Option<Vec<ToolHandoffFile>> = self.store.read("tool-handoffs")?;
        Ok(files.unwrap_or_default())
    }

    /// Lists all tool handoff files for a given tool.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_by_tool(&self, tool_id: &str) -> Result<Vec<ToolHandoffFile>, JsonStoreError> {
        let files = self.list()?;
        Ok(files.into_iter().filter(|f| f.tool_id == tool_id).collect())
    }

    /// Clears all tool handoff files.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the clear fails.
    pub fn clear_with_context(&self, context: &MutationContext<'_>) -> Result<(), JsonStoreError> {
        let empty: Vec<ToolHandoffFile> = Vec::new();
        self.store
            .write_with_context(context, "tool-handoffs", &empty, None)?;
        Ok(())
    }

    #[cfg(test)]
    pub fn save(&self, file: &ToolHandoffFile) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, file)
        })
    }
    #[cfg(test)]
    pub fn delete(&self, id: &str) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.delete_with_context(context, id)
        })
    }
    #[cfg(test)]
    pub fn clear(&self) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.clear_with_context(context)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-handoff-test-{suffix}-{:?}",
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

    fn test_file() -> ToolHandoffFile {
        ToolHandoffFile::new(
            "preset-export",
            serde_json::json!({"format": "json", "preset_id": "123"}),
        )
    }

    #[test]
    fn tool_handoff_store_new() {
        let dir = test_dir("new");
        let store = ToolHandoffStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn tool_handoff_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = ToolHandoffStore::new(&dir);

        let file = test_file();
        store.save(&file).expect("save should succeed");

        let loaded = store.get(&file.id).expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, file.id);
        assert_eq!(loaded.tool_id, "preset-export");

        cleanup(&dir);
    }

    #[test]
    fn tool_handoff_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = ToolHandoffStore::new(&dir);

        let loaded = store.get("nonexistent").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn tool_handoff_store_delete() {
        let dir = test_dir("delete");
        let store = ToolHandoffStore::new(&dir);

        let file = test_file();
        store.save(&file).expect("save should succeed");

        store.delete(&file.id).expect("delete should succeed");

        let loaded = store.get(&file.id).expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn tool_handoff_store_list() {
        let dir = test_dir("list");
        let store = ToolHandoffStore::new(&dir);

        let file1 = test_file();
        store.save(&file1).expect("save should succeed");

        let file2 = ToolHandoffFile::new(
            "preset-import",
            serde_json::json!({"file_path": "/tmp/test.json"}),
        );
        store.save(&file2).expect("save should succeed");

        let files = store.list().expect("list should succeed");
        assert_eq!(files.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn tool_handoff_store_list_by_tool() {
        let dir = test_dir("list-by-tool");
        let store = ToolHandoffStore::new(&dir);

        let file1 = test_file();
        store.save(&file1).expect("save should succeed");

        let file2 = ToolHandoffFile::new(
            "preset-import",
            serde_json::json!({"file_path": "/tmp/test.json"}),
        );
        store.save(&file2).expect("save should succeed");

        let export_files = store
            .list_by_tool("preset-export")
            .expect("list should succeed");
        assert_eq!(export_files.len(), 1);

        let import_files = store
            .list_by_tool("preset-import")
            .expect("list should succeed");
        assert_eq!(import_files.len(), 1);

        cleanup(&dir);
    }

    #[test]
    fn tool_handoff_store_clear() {
        let dir = test_dir("clear");
        let store = ToolHandoffStore::new(&dir);

        let file = test_file();
        store.save(&file).expect("save should succeed");

        store.clear().expect("clear should succeed");

        let files = store.list().expect("list should succeed");
        assert_eq!(files.len(), 0);

        cleanup(&dir);
    }
}
