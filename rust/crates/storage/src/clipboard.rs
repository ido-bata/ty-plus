//! Clipboard persistence storage.
//!
//! This module provides persistent clipboard storage with support for
//! size limits and corrupt payload handling.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// Clipboard item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    /// Unique identifier for this clipboard item.
    pub id: String,
    /// ISO 8601 timestamp of when this item was created.
    pub created_at: String,
    /// Clipboard content type.
    pub content_type: ClipboardContentType,
    /// Clipboard content data.
    pub data: serde_json::Value,
    /// Optional metadata.
    pub metadata: Option<serde_json::Value>,
}

/// Clipboard content type.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ClipboardContentType {
    /// Text content.
    Text,
    /// JSON content.
    Json,
    /// Binary content (base64 encoded).
    Binary,
    /// Preset content.
    Preset,
}

impl ClipboardContentType {
    /// Returns the string representation of the content type.
    #[must_use]
    pub fn as_str(&self) -> &str {
        match self {
            Self::Text => "text",
            Self::Json => "json",
            Self::Binary => "binary",
            Self::Preset => "preset",
        }
    }
}

impl ClipboardItem {
    /// Creates a new clipboard item.
    #[must_use]
    pub fn new(content_type: ClipboardContentType, data: serde_json::Value) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let id = format!(
            "clip-{}",
            now.replace([':', '-', 'T', 'Z'], "")
                .chars()
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
        );

        Self {
            id,
            created_at: now,
            content_type,
            data,
            metadata: None,
        }
    }
}

/// Clipboard store configuration.
#[derive(Debug, Clone)]
pub struct ClipboardStoreConfig {
    /// Maximum number of items to keep.
    pub max_items: usize,
    /// Maximum total size in bytes (0 = unlimited).
    pub max_size_bytes: u64,
}

impl Default for ClipboardStoreConfig {
    fn default() -> Self {
        Self {
            max_items: 100,
            max_size_bytes: 10 * 1024 * 1024, // 10 MB
        }
    }
}

/// Clipboard store.
#[derive(Debug, Clone)]
pub struct ClipboardStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
    /// Store configuration.
    config: ClipboardStoreConfig,
}

impl ClipboardStore {
    /// Creates a new clipboard store.
    #[must_use]
    pub fn new(base_dir: &Path, config: ClipboardStoreConfig) -> Self {
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

    /// Gets a clipboard item by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, id: &str) -> Result<Option<ClipboardItem>, JsonStoreError> {
        let items = self.list()?;
        Ok(items.into_iter().find(|i| i.id == id))
    }

    /// Saves a clipboard item.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        item: &ClipboardItem,
    ) -> Result<(), JsonStoreError> {
        let mut items = self.list()?;

        // Add new item
        items.push(item.clone());

        // Sort by creation time (newest first)
        items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        // Trim to max items
        if items.len() > self.config.max_items {
            items.truncate(self.config.max_items);
        }

        self.store
            .write_with_context(context, "clipboard", &items, None)?;
        Ok(())
    }

    /// Deletes a clipboard item by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut items = self.list()?;

        let initial_len = items.len();
        items.retain(|i| i.id != id);

        if items.len() == initial_len {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("clipboard item with ID {id} not found"),
            )));
        }

        self.store
            .write_with_context(context, "clipboard", &items, None)?;
        Ok(())
    }

    /// Lists all clipboard items.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<ClipboardItem>, JsonStoreError> {
        let items: Option<Vec<ClipboardItem>> = self.store.read("clipboard")?;
        Ok(items.unwrap_or_default())
    }

    /// Clears all clipboard items.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the clear fails.
    pub fn clear_with_context(&self, context: &MutationContext<'_>) -> Result<(), JsonStoreError> {
        let empty: Vec<ClipboardItem> = Vec::new();
        self.store
            .write_with_context(context, "clipboard", &empty, None)?;
        Ok(())
    }

    #[cfg(test)]
    pub fn save(&self, item: &ClipboardItem) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, item)
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

    /// Returns the number of clipboard items.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the count fails.
    pub fn count(&self) -> Result<usize, JsonStoreError> {
        let items = self.list()?;
        Ok(items.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-clipboard-test-{suffix}-{:?}",
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

    fn test_item() -> ClipboardItem {
        ClipboardItem::new(
            ClipboardContentType::Text,
            serde_json::json!("Hello, World!"),
        )
    }

    #[test]
    fn clipboard_store_new() {
        let dir = test_dir("new");
        let store = ClipboardStore::new(&dir, ClipboardStoreConfig::default());
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn clipboard_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = ClipboardStore::new(&dir, ClipboardStoreConfig::default());

        let item = test_item();
        store.save(&item).expect("save should succeed");

        let loaded = store.get(&item.id).expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, item.id);
        assert_eq!(loaded.content_type, ClipboardContentType::Text);

        cleanup(&dir);
    }

    #[test]
    fn clipboard_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = ClipboardStore::new(&dir, ClipboardStoreConfig::default());

        let loaded = store.get("nonexistent").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn clipboard_store_delete() {
        let dir = test_dir("delete");
        let store = ClipboardStore::new(&dir, ClipboardStoreConfig::default());

        let item = test_item();
        store.save(&item).expect("save should succeed");

        store.delete(&item.id).expect("delete should succeed");

        let loaded = store.get(&item.id).expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn clipboard_store_list() {
        let dir = test_dir("list");
        let store = ClipboardStore::new(&dir, ClipboardStoreConfig::default());

        let item1 = test_item();
        store.save(&item1).expect("save should succeed");

        let item2 = ClipboardItem::new(
            ClipboardContentType::Json,
            serde_json::json!({"key": "value"}),
        );
        store.save(&item2).expect("save should succeed");

        let items = store.list().expect("list should succeed");
        assert_eq!(items.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn clipboard_store_clear() {
        let dir = test_dir("clear");
        let store = ClipboardStore::new(&dir, ClipboardStoreConfig::default());

        let item = test_item();
        store.save(&item).expect("save should succeed");

        store.clear().expect("clear should succeed");

        let items = store.list().expect("list should succeed");
        assert_eq!(items.len(), 0);

        cleanup(&dir);
    }

    #[test]
    fn clipboard_store_max_items() {
        let dir = test_dir("max-items");
        let config = ClipboardStoreConfig {
            max_items: 3,
            max_size_bytes: 0,
        };
        let store = ClipboardStore::new(&dir, config);

        for _ in 0..5 {
            let item = test_item();
            store.save(&item).expect("save should succeed");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let items = store.list().expect("list should succeed");
        assert_eq!(items.len(), 3);

        cleanup(&dir);
    }
}
