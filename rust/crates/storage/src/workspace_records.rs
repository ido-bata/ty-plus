//! Workspace records management.
//!
//! This module provides workspace record management with support for
//! multiple sessions and shared root ordering.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// A workspace record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceRecord {
    /// Unique identifier for this workspace.
    pub id: String,
    /// Display name of the workspace.
    pub name: String,
    /// ISO 8601 timestamp of when this workspace was created.
    pub created_at: String,
    /// ISO 8601 timestamp of when this workspace was last updated.
    pub updated_at: String,
    /// Optional description of the workspace.
    pub description: Option<String>,
    /// Optional tags for the workspace.
    pub tags: Vec<String>,
}

impl WorkspaceRecord {
    /// Creates a new workspace record.
    #[must_use]
    pub fn new(id: &str, name: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: id.to_string(),
            name: name.to_string(),
            created_at: now.clone(),
            updated_at: now,
            description: None,
            tags: Vec::new(),
        }
    }

    /// Updates the workspace record's timestamp.
    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

/// Workspace records store.
#[derive(Debug, Clone)]
pub struct WorkspaceRecordsStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl WorkspaceRecordsStore {
    /// Creates a new workspace records store.
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

    /// Lists all workspace records.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<WorkspaceRecord>, JsonStoreError> {
        let records: Option<Vec<WorkspaceRecord>> = self.store.read("workspace-records")?;
        let mut records = records.unwrap_or_default();

        // Sort by creation time (oldest first)
        records.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        Ok(records)
    }

    /// Gets a workspace record by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, id: &str) -> Result<Option<WorkspaceRecord>, JsonStoreError> {
        let records = self.list()?;
        Ok(records.into_iter().find(|r| r.id == id))
    }

    /// Creates a new workspace record.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the create fails.
    pub fn create_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
        name: &str,
    ) -> Result<WorkspaceRecord, JsonStoreError> {
        let mut records = self.list()?;

        // Check if ID already exists
        if records.iter().any(|r| r.id == id) {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                format!("workspace with ID {id} already exists"),
            )));
        }

        let record = WorkspaceRecord::new(id, name);
        records.push(record.clone());

        self.store
            .write_with_context(context, "workspace-records", &records, None)?;

        Ok(record)
    }

    /// Updates an existing workspace record.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the update fails.
    pub fn update_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
        name: &str,
    ) -> Result<WorkspaceRecord, JsonStoreError> {
        let mut records = self.list()?;

        let record = records.iter_mut().find(|r| r.id == id).ok_or_else(|| {
            JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("workspace with ID {id} not found"),
            ))
        })?;

        record.name = name.to_string();
        record.touch();

        let updated = record.clone();
        self.store
            .write_with_context(context, "workspace-records", &records, None)?;

        Ok(updated)
    }

    /// Deletes a workspace record by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut records = self.list()?;
        let initial_len = records.len();

        records.retain(|r| r.id != id);

        if records.len() == initial_len {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("workspace with ID {id} not found"),
            )));
        }

        self.store
            .write_with_context(context, "workspace-records", &records, None)?;

        Ok(())
    }

    /// Returns the number of workspace records.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the count fails.
    pub fn count(&self) -> Result<usize, JsonStoreError> {
        let records = self.list()?;
        Ok(records.len())
    }

    #[cfg(test)]
    pub fn create(&self, id: &str, name: &str) -> Result<WorkspaceRecord, JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.create_with_context(context, id, name)
        })
    }
    #[cfg(test)]
    pub fn update(&self, id: &str, name: &str) -> Result<WorkspaceRecord, JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.update_with_context(context, id, name)
        })
    }
    #[cfg(test)]
    pub fn delete(&self, id: &str) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.delete_with_context(context, id)
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
            "ty-plus-workspace-test-{suffix}-{:?}",
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
    fn workspace_records_store_new() {
        let dir = test_dir("new");
        let store = WorkspaceRecordsStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn workspace_records_store_create_and_list() {
        let dir = test_dir("create-list");
        let store = WorkspaceRecordsStore::new(&dir);

        store
            .create("ws-1", "Workspace 1")
            .expect("create should succeed");
        store
            .create("ws-2", "Workspace 2")
            .expect("create should succeed");

        let records = store.list().expect("list should succeed");
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].id, "ws-1");
        assert_eq!(records[1].id, "ws-2");

        cleanup(&dir);
    }

    #[test]
    fn workspace_records_store_get() {
        let dir = test_dir("get");
        let store = WorkspaceRecordsStore::new(&dir);

        store
            .create("ws-1", "Workspace 1")
            .expect("create should succeed");

        let record = store.get("ws-1").expect("get should succeed");
        assert!(record.is_some());
        assert_eq!(record.unwrap().name, "Workspace 1");

        cleanup(&dir);
    }

    #[test]
    fn workspace_records_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = WorkspaceRecordsStore::new(&dir);

        let record = store.get("nonexistent").expect("get should succeed");
        assert!(record.is_none());

        cleanup(&dir);
    }

    #[test]
    fn workspace_records_store_update() {
        let dir = test_dir("update");
        let store = WorkspaceRecordsStore::new(&dir);

        store
            .create("ws-1", "Workspace 1")
            .expect("create should succeed");

        let updated = store
            .update("ws-1", "Updated Workspace")
            .expect("update should succeed");
        assert_eq!(updated.name, "Updated Workspace");

        let record = store.get("ws-1").expect("get should succeed").unwrap();
        assert_eq!(record.name, "Updated Workspace");

        cleanup(&dir);
    }

    #[test]
    fn workspace_records_store_delete() {
        let dir = test_dir("delete");
        let store = WorkspaceRecordsStore::new(&dir);

        store
            .create("ws-1", "Workspace 1")
            .expect("create should succeed");
        assert_eq!(store.count().expect("count should succeed"), 1);

        store.delete("ws-1").expect("delete should succeed");
        assert_eq!(store.count().expect("count should succeed"), 0);

        cleanup(&dir);
    }

    #[test]
    fn workspace_records_store_count() {
        let dir = test_dir("count");
        let store = WorkspaceRecordsStore::new(&dir);

        assert_eq!(store.count().expect("count should succeed"), 0);

        store
            .create("ws-1", "Workspace 1")
            .expect("create should succeed");
        store
            .create("ws-2", "Workspace 2")
            .expect("create should succeed");

        assert_eq!(store.count().expect("count should succeed"), 2);

        cleanup(&dir);
    }
}
