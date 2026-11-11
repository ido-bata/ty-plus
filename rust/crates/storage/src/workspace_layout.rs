//! Workspace layout storage.
//!
//! This module provides persistent workspace layout storage with support for
//! missing fallback and concurrent update handling.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// A workspace layout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLayout {
    /// Unique identifier for this layout.
    pub id: String,
    /// ISO 8601 timestamp of when this layout was last updated.
    pub updated_at: String,
    /// Layout name.
    pub name: String,
    /// Layout description.
    pub description: Option<String>,
    /// Panel positions and sizes.
    pub panels: Vec<PanelLayout>,
    /// Current layout revision.
    pub revision: u64,
}

impl WorkspaceLayout {
    /// Creates a new workspace layout.
    #[must_use]
    pub fn new(id: &str, name: &str) -> Self {
        Self {
            id: id.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            name: name.to_string(),
            description: None,
            panels: Vec::new(),
            revision: 1,
        }
    }

    /// Updates the layout timestamp and increments revision.
    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
        self.revision += 1;
    }
}

/// Panel layout information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelLayout {
    /// Panel identifier.
    pub panel_id: String,
    /// Panel type.
    pub panel_type: String,
    /// X position.
    pub x: f64,
    /// Y position.
    pub y: f64,
    /// Width.
    pub width: f64,
    /// Height.
    pub height: f64,
    /// Whether the panel is visible.
    pub visible: bool,
}

/// Workspace layout store.
#[derive(Debug, Clone)]
pub struct WorkspaceLayoutStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl WorkspaceLayoutStore {
    /// Creates a new workspace layout store.
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

    /// Gets a workspace layout by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, id: &str) -> Result<Option<WorkspaceLayout>, JsonStoreError> {
        let layouts = self.list()?;
        Ok(layouts.into_iter().find(|l| l.id == id))
    }

    /// Saves a workspace layout.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        layout: &WorkspaceLayout,
    ) -> Result<(), JsonStoreError> {
        let mut layouts = self.list()?;

        // Remove existing layout with same ID
        layouts.retain(|l| l.id != layout.id);

        // Add new layout
        layouts.push(layout.clone());

        self.store
            .write_with_context(context, "workspace-layouts", &layouts, None)?;
        Ok(())
    }

    /// Deletes a workspace layout by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut layouts = self.list()?;

        let initial_len = layouts.len();
        layouts.retain(|l| l.id != id);

        if layouts.len() == initial_len {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("workspace layout with ID {id} not found"),
            )));
        }

        self.store
            .write_with_context(context, "workspace-layouts", &layouts, None)?;
        Ok(())
    }

    /// Lists all workspace layouts.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<WorkspaceLayout>, JsonStoreError> {
        let layouts: Option<Vec<WorkspaceLayout>> = self.store.read("workspace-layouts")?;
        Ok(layouts.unwrap_or_default())
    }

    /// Gets or creates a default layout.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get_or_create_default_with_context(
        &self,
        context: &MutationContext<'_>,
    ) -> Result<WorkspaceLayout, JsonStoreError> {
        let layouts = self.list()?;
        if let Some(layout) = layouts.into_iter().next() {
            return Ok(layout);
        }

        // Create default layout
        let mut layout = WorkspaceLayout::new("default", "Default Layout");
        layout.description = Some("Default workspace layout".to_string());
        self.save_with_context(context, &layout)?;
        Ok(layout)
    }

    #[cfg(test)]
    pub fn save(&self, layout: &WorkspaceLayout) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, layout)
        })
    }
    #[cfg(test)]
    pub fn delete(&self, id: &str) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.delete_with_context(context, id)
        })
    }
    #[cfg(test)]
    pub fn get_or_create_default(&self) -> Result<WorkspaceLayout, JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.get_or_create_default_with_context(context)
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
            "ty-plus-layout-test-{suffix}-{:?}",
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

    fn test_layout() -> WorkspaceLayout {
        let mut layout = WorkspaceLayout::new("layout-1", "Test Layout");
        layout.panels.push(PanelLayout {
            panel_id: "timeline-1".to_string(),
            panel_type: "timeline".to_string(),
            x: 0.0,
            y: 0.0,
            width: 800.0,
            height: 200.0,
            visible: true,
        });
        layout
    }

    #[test]
    fn workspace_layout_store_new() {
        let dir = test_dir("new");
        let store = WorkspaceLayoutStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn workspace_layout_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = WorkspaceLayoutStore::new(&dir);

        let layout = test_layout();
        store.save(&layout).expect("save should succeed");

        let loaded = store.get("layout-1").expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, "layout-1");
        assert_eq!(loaded.name, "Test Layout");
        assert_eq!(loaded.panels.len(), 1);

        cleanup(&dir);
    }

    #[test]
    fn workspace_layout_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = WorkspaceLayoutStore::new(&dir);

        let loaded = store.get("nonexistent").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn workspace_layout_store_delete() {
        let dir = test_dir("delete");
        let store = WorkspaceLayoutStore::new(&dir);

        let layout = test_layout();
        store.save(&layout).expect("save should succeed");

        store.delete("layout-1").expect("delete should succeed");

        let loaded = store.get("layout-1").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn workspace_layout_store_list() {
        let dir = test_dir("list");
        let store = WorkspaceLayoutStore::new(&dir);

        let layout1 = test_layout();
        store.save(&layout1).expect("save should succeed");

        let layout2 = WorkspaceLayout::new("layout-2", "Layout 2");
        store.save(&layout2).expect("save should succeed");

        let layouts = store.list().expect("list should succeed");
        assert_eq!(layouts.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn workspace_layout_store_get_or_create_default() {
        let dir = test_dir("default");
        let store = WorkspaceLayoutStore::new(&dir);

        // First call creates default
        let layout = store
            .get_or_create_default()
            .expect("get_or_create should succeed");
        assert_eq!(layout.id, "default");

        // Second call returns existing
        let layout2 = store
            .get_or_create_default()
            .expect("get_or_create should succeed");
        assert_eq!(layout2.id, "default");

        cleanup(&dir);
    }
}
