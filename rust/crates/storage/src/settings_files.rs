//! Settings files storage.
//!
//! This module provides persistent settings file storage with support for
//! version migration and default values.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// A settings file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsFile {
    /// Unique identifier for this settings file.
    pub id: String,
    /// ISO 8601 timestamp of when this settings file was last updated.
    pub updated_at: String,
    /// Settings file name.
    pub name: String,
    /// Settings file description.
    pub description: Option<String>,
    /// Current settings version.
    pub version: u32,
    /// Settings data.
    pub data: serde_json::Value,
}

impl SettingsFile {
    /// Creates a new settings file.
    #[must_use]
    pub fn new(id: &str, name: &str, data: serde_json::Value) -> Self {
        Self {
            id: id.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            name: name.to_string(),
            description: None,
            version: 1,
            data,
        }
    }

    /// Updates the settings file timestamp.
    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

/// Settings file store.
#[derive(Debug, Clone)]
pub struct SettingsFileStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl SettingsFileStore {
    /// Creates a new settings file store.
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

    /// Gets a settings file by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, id: &str) -> Result<Option<SettingsFile>, JsonStoreError> {
        let files = self.list()?;
        Ok(files.into_iter().find(|f| f.id == id))
    }

    /// Saves a settings file.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        file: &SettingsFile,
    ) -> Result<(), JsonStoreError> {
        let mut files = self.list()?;

        // Remove existing file with same ID
        files.retain(|f| f.id != file.id);

        // Add new file
        files.push(file.clone());

        self.store
            .write_with_context(context, "settings-files", &files, None)?;
        Ok(())
    }

    /// Deletes a settings file by ID.
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
                format!("settings file with ID {id} not found"),
            )));
        }

        self.store
            .write_with_context(context, "settings-files", &files, None)?;
        Ok(())
    }

    /// Lists all settings files.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<SettingsFile>, JsonStoreError> {
        let files: Option<Vec<SettingsFile>> = self.store.read("settings-files")?;
        Ok(files.unwrap_or_default())
    }

    #[cfg(test)]
    pub fn save(&self, file: &SettingsFile) -> Result<(), JsonStoreError> {
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

    /// Gets or creates a settings file with a default value.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get_or_create_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
        name: &str,
        default_data: serde_json::Value,
    ) -> Result<SettingsFile, JsonStoreError> {
        if let Some(file) = self.get(id)? {
            return Ok(file);
        }

        let file = SettingsFile::new(id, name, default_data);
        self.save_with_context(context, &file)?;
        Ok(file)
    }

    #[cfg(test)]
    pub fn get_or_create(
        &self,
        id: &str,
        name: &str,
        default_data: serde_json::Value,
    ) -> Result<SettingsFile, JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.get_or_create_with_context(context, id, name, default_data)
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
            "ty-plus-settings-test-{suffix}-{:?}",
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

    fn test_settings_file() -> SettingsFile {
        SettingsFile::new(
            "settings-1",
            "Test Settings",
            serde_json::json!({"theme": "dark", "language": "en"}),
        )
    }

    #[test]
    fn settings_file_store_new() {
        let dir = test_dir("new");
        let store = SettingsFileStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn settings_file_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = SettingsFileStore::new(&dir);

        let file = test_settings_file();
        store.save(&file).expect("save should succeed");

        let loaded = store.get("settings-1").expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, "settings-1");
        assert_eq!(loaded.name, "Test Settings");
        assert_eq!(
            loaded.data,
            serde_json::json!({"theme": "dark", "language": "en"})
        );

        cleanup(&dir);
    }

    #[test]
    fn settings_file_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = SettingsFileStore::new(&dir);

        let loaded = store.get("nonexistent").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn settings_file_store_delete() {
        let dir = test_dir("delete");
        let store = SettingsFileStore::new(&dir);

        let file = test_settings_file();
        store.save(&file).expect("save should succeed");

        store.delete("settings-1").expect("delete should succeed");

        let loaded = store.get("settings-1").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn settings_file_store_list() {
        let dir = test_dir("list");
        let store = SettingsFileStore::new(&dir);

        let file1 = test_settings_file();
        store.save(&file1).expect("save should succeed");

        let file2 = SettingsFile::new(
            "settings-2",
            "Settings 2",
            serde_json::json!({"font_size": 14}),
        );
        store.save(&file2).expect("save should succeed");

        let files = store.list().expect("list should succeed");
        assert_eq!(files.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn settings_file_store_get_or_create() {
        let dir = test_dir("get-or-create");
        let store = SettingsFileStore::new(&dir);

        // First call creates file
        let file = store
            .get_or_create(
                "settings-1",
                "Test Settings",
                serde_json::json!({"theme": "dark"}),
            )
            .expect("get_or_create should succeed");
        assert_eq!(file.id, "settings-1");

        // Second call returns existing
        let file2 = store
            .get_or_create(
                "settings-1",
                "Test Settings",
                serde_json::json!({"theme": "light"}),
            )
            .expect("get_or_create should succeed");
        assert_eq!(file2.data, serde_json::json!({"theme": "dark"}));

        cleanup(&dir);
    }
}
