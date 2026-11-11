//! Operation history storage.
//!
//! This module provides operation history storage with support for
//! configurable count with a storage-owned hard maximum.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::retention::{OperationHistoryLimit, RetentionError};
use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// An operation history entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    /// Unique identifier for this entry.
    pub id: String,
    /// ISO 8601 timestamp of when this entry was created.
    pub created_at: String,
    /// Operation type.
    pub operation: String,
    /// Operation description.
    pub description: Option<String>,
    /// Operation parameters.
    pub params: serde_json::Value,
    /// Operation result (if completed).
    pub result: Option<serde_json::Value>,
}

impl HistoryEntry {
    /// Creates a new history entry.
    #[must_use]
    pub fn new(operation: &str, params: serde_json::Value) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let id = format!(
            "hist-{}",
            now.replace([':', '-', 'T', 'Z'], "")
                .chars()
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
        );

        Self {
            id,
            created_at: now,
            operation: operation.to_string(),
            description: None,
            params,
            result: None,
        }
    }
}

/// Operation history store configuration.
#[derive(Debug, Clone)]
pub struct HistoryStoreConfig {
    /// Maximum number of entries to keep.
    max_entries: OperationHistoryLimit,
}

impl HistoryStoreConfig {
    /// Validates a configured operation history count.
    pub fn new(max_entries: usize) -> Result<Self, RetentionError> {
        Ok(Self {
            max_entries: OperationHistoryLimit::new(max_entries)?,
        })
    }

    /// Returns the configured count.
    #[must_use]
    pub const fn max_entries(&self) -> usize {
        self.max_entries.get()
    }
}

impl Default for HistoryStoreConfig {
    fn default() -> Self {
        Self::new(OperationHistoryLimit::default().get()).expect("default count is valid")
    }
}

/// Operation history store.
#[derive(Debug, Clone)]
pub struct HistoryStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
    /// Store configuration.
    config: HistoryStoreConfig,
}

impl HistoryStore {
    /// Creates a new history store.
    #[must_use]
    pub fn new(base_dir: &Path, config: HistoryStoreConfig) -> Self {
        Self {
            store: JsonFileStore::new(base_dir),
            config,
        }
    }

    /// Returns the base directory.
    #[must_use]
    pub fn base_dir(&self) -> &Path {
        self.store.base_dir()
    }

    /// Gets a history entry by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, id: &str) -> Result<Option<HistoryEntry>, JsonStoreError> {
        let entries = self.list()?;
        Ok(entries.into_iter().find(|e| e.id == id))
    }

    /// Saves a history entry.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        entry: &HistoryEntry,
    ) -> Result<(), JsonStoreError> {
        let mut entries = self.list()?;

        // Add new entry
        entries.push(entry.clone());

        // Sort by creation time (newest first)
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        // Trim to the validated configured count.
        let max = self.config.max_entries.get();
        if self.config.max_entries.is_disabled() {
            // A zero limit disables new persistence only. Existing entries are
            // retained until the caller explicitly invokes clear.
            return Ok(());
        }
        if entries.len() > max {
            entries.truncate(max);
        }

        self.store
            .write_with_context(context, "operation-history", &entries, None)?;
        Ok(())
    }

    /// Deletes a history entry by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut entries = self.list()?;

        let initial_len = entries.len();
        entries.retain(|e| e.id != id);

        if entries.len() == initial_len {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("history entry with ID {id} not found"),
            )));
        }

        self.store
            .write_with_context(context, "operation-history", &entries, None)?;
        Ok(())
    }

    /// Lists all history entries.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<HistoryEntry>, JsonStoreError> {
        if self.config.max_entries.is_disabled() {
            return Ok(Vec::new());
        }
        let entries: Option<Vec<HistoryEntry>> = self.store.read("operation-history")?;
        Ok(entries.unwrap_or_default())
    }

    /// Lists all history entries for a given operation.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_by_operation(&self, operation: &str) -> Result<Vec<HistoryEntry>, JsonStoreError> {
        let entries = self.list()?;
        Ok(entries
            .into_iter()
            .filter(|e| e.operation == operation)
            .collect())
    }

    /// Clears all history entries.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the clear fails.
    pub fn clear_with_context(&self, context: &MutationContext<'_>) -> Result<(), JsonStoreError> {
        self.store.delete_with_context(context, "operation-history")
    }

    #[cfg(test)]
    pub fn save(&self, entry: &HistoryEntry) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, entry)
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

    /// Returns the number of history entries.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the count fails.
    pub fn count(&self) -> Result<usize, JsonStoreError> {
        let entries = self.list()?;
        Ok(entries.len())
    }

    /// Returns the current configuration.
    #[must_use]
    pub fn config(&self) -> &HistoryStoreConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-history-test-{suffix}-{:?}",
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

    fn test_entry() -> HistoryEntry {
        HistoryEntry::new(
            "preset-save",
            serde_json::json!({"preset_id": "123", "name": "Test Preset"}),
        )
    }

    #[test]
    fn history_store_new() {
        let dir = test_dir("new");
        let store = HistoryStore::new(&dir, HistoryStoreConfig::default());
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn history_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = HistoryStore::new(&dir, HistoryStoreConfig::default());

        let entry = test_entry();
        store.save(&entry).expect("save should succeed");

        let loaded = store.get(&entry.id).expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, entry.id);
        assert_eq!(loaded.operation, "preset-save");

        cleanup(&dir);
    }

    #[test]
    fn history_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = HistoryStore::new(&dir, HistoryStoreConfig::default());

        let loaded = store.get("nonexistent").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn history_store_delete() {
        let dir = test_dir("delete");
        let store = HistoryStore::new(&dir, HistoryStoreConfig::default());

        let entry = test_entry();
        store.save(&entry).expect("save should succeed");

        store.delete(&entry.id).expect("delete should succeed");

        let loaded = store.get(&entry.id).expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn history_store_list() {
        let dir = test_dir("list");
        let store = HistoryStore::new(&dir, HistoryStoreConfig::default());

        let entry1 = test_entry();
        store.save(&entry1).expect("save should succeed");

        let entry2 = HistoryEntry::new("preset-load", serde_json::json!({"preset_id": "456"}));
        store.save(&entry2).expect("save should succeed");

        let entries = store.list().expect("list should succeed");
        assert_eq!(entries.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn history_store_list_by_operation() {
        let dir = test_dir("list-by-operation");
        let store = HistoryStore::new(&dir, HistoryStoreConfig::default());

        let entry1 = test_entry();
        store.save(&entry1).expect("save should succeed");

        let entry2 = HistoryEntry::new("preset-load", serde_json::json!({"preset_id": "456"}));
        store.save(&entry2).expect("save should succeed");

        let save_entries = store
            .list_by_operation("preset-save")
            .expect("list should succeed");
        assert_eq!(save_entries.len(), 1);

        let load_entries = store
            .list_by_operation("preset-load")
            .expect("list should succeed");
        assert_eq!(load_entries.len(), 1);

        cleanup(&dir);
    }

    #[test]
    fn history_store_clear() {
        let dir = test_dir("clear");
        let store = HistoryStore::new(&dir, HistoryStoreConfig::default());

        let entry = test_entry();
        store.save(&entry).expect("save should succeed");

        store.clear().expect("clear should succeed");

        let entries = store.list().expect("list should succeed");
        assert_eq!(entries.len(), 0);

        cleanup(&dir);
    }

    #[test]
    fn history_store_max_entries() {
        let dir = test_dir("max-entries");
        let config = HistoryStoreConfig::new(3).expect("count should be valid");
        let store = HistoryStore::new(&dir, config);

        for _ in 0..5 {
            let entry = test_entry();
            store.save(&entry).expect("save should succeed");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let entries = store.list().expect("list should succeed");
        assert_eq!(entries.len(), 3);

        cleanup(&dir);
    }

    #[test]
    fn history_store_uses_only_configured_count() {
        let dir = test_dir("hard-max");
        let config = HistoryStoreConfig::new(10).expect("count should be valid");
        let store = HistoryStore::new(&dir, config);

        for _ in 0..5 {
            let entry = test_entry();
            store.save(&entry).expect("save should succeed");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let entries = store.list().expect("list should succeed");
        assert_eq!(entries.len(), 5);

        cleanup(&dir);
    }

    #[test]
    fn history_store_cannot_exceed_product_hard_max() {
        let dir = test_dir("product-hard-max");
        let config = HistoryStoreConfig::new(500).expect("count should be valid");
        let store = HistoryStore::new(&dir, config);

        for index in 0..501 {
            let mut entry = test_entry();
            entry.id = format!("history-{index}");
            store.save(&entry).expect("save should succeed");
        }

        assert!(store.count().expect("count should succeed") <= 500);
        cleanup(&dir);
    }

    #[test]
    fn history_store_rejects_count_above_product_hard_max() {
        assert!(HistoryStoreConfig::new(501).is_err());
    }

    #[test]
    fn zero_history_limit_leaves_no_persisted_recovery_entries() {
        let dir = test_dir("zero-limit");
        let config = HistoryStoreConfig::new(0).expect("zero should be valid");
        let store = HistoryStore::new(&dir, config);

        store.save(&test_entry()).expect("save should succeed");

        assert!(!dir.join("operation-history.json").exists());
        cleanup(&dir);
    }

    #[test]
    fn applying_zero_history_limit_requires_explicit_clear_for_existing_entries() {
        let dir = test_dir("zero-limit-existing");
        let enabled = HistoryStore::new(
            &dir,
            HistoryStoreConfig::new(1).expect("count should be valid"),
        );
        enabled
            .save(&test_entry())
            .expect("initial save should succeed");

        let history_path = dir.join("operation-history.json");
        let revision_path = dir.join("operation-history.rev.json");
        assert!(history_path.exists());
        assert!(revision_path.exists());

        let disabled = HistoryStore::new(
            &dir,
            HistoryStoreConfig::new(0).expect("zero should be valid"),
        );
        assert!(disabled.list().expect("read should succeed").is_empty());

        disabled.clear().expect("explicit clear should succeed");

        assert!(!history_path.exists());
        assert!(!revision_path.exists());
        cleanup(&dir);
    }
}
