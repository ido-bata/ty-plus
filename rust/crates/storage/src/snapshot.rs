//! Workspace snapshot with crash recovery and last-write semantics.
//!
//! This module provides a workspace snapshot that can be saved and restored,
//! with crash recovery support.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::retention::{RetentionError, SnapshotLimit};
use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// A workspace snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSnapshot {
    /// Unique identifier for this snapshot.
    pub id: String,
    /// ISO 8601 timestamp of when this snapshot was created.
    pub created_at: String,
    /// Unix timestamp in milliseconds for ordering.
    pub timestamp_ms: u64,
    /// The workspace data.
    pub data: serde_json::Value,
    /// Optional description of the snapshot.
    pub description: Option<String>,
}

impl WorkspaceSnapshot {
    /// Creates a new workspace snapshot.
    #[must_use]
    pub fn new(data: serde_json::Value, description: Option<String>) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let timestamp_ms = now.as_millis() as u64;
        let created_at = chrono::Utc::now().to_rfc3339();
        let id = format!("snapshot-{}", timestamp_ms);

        Self {
            id,
            created_at,
            timestamp_ms,
            data,
            description,
        }
    }
}

/// Workspace snapshot store.
#[derive(Debug, Clone)]
pub struct SnapshotStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
    /// Maximum number of snapshots to keep.
    max_snapshots: SnapshotLimit,
}

impl SnapshotStore {
    /// Creates a new snapshot store.
    pub fn new(base_dir: &Path, max_snapshots: usize) -> Result<Self, RetentionError> {
        Ok(Self {
            store: JsonFileStore::new(base_dir),
            max_snapshots: SnapshotLimit::new(max_snapshots)?,
        })
    }

    /// Returns the base directory.
    #[must_use]
    pub fn base_dir(&self) -> &Path {
        self.store.base_dir()
    }

    /// Saves a workspace snapshot.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        snapshot: &WorkspaceSnapshot,
    ) -> Result<(), JsonStoreError> {
        // Load existing snapshots
        let mut snapshots = self.list_internal()?;

        // Add new snapshot
        snapshots.push(snapshot.clone());

        // Sort by timestamp (oldest first)
        snapshots.sort_by_key(|s| s.timestamp_ms);

        // Trim to max
        if snapshots.len() > self.max_snapshots.get() {
            snapshots = snapshots[snapshots.len() - self.max_snapshots.get()..].to_vec();
        }

        // Save all snapshots
        self.store
            .write_with_context(context, "workspace-snapshots", &snapshots, None)?;

        Ok(())
    }

    /// Loads a workspace snapshot by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the load fails.
    pub fn load(&self, id: &str) -> Result<Option<WorkspaceSnapshot>, JsonStoreError> {
        let snapshots = self.list_internal()?;
        Ok(snapshots.into_iter().find(|s| s.id == id))
    }

    /// Loads the most recent workspace snapshot.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the load fails.
    pub fn load_latest(&self) -> Result<Option<WorkspaceSnapshot>, JsonStoreError> {
        let snapshots = self.list_internal()?;
        Ok(snapshots.into_iter().next_back())
    }

    /// Lists all snapshots in chronological order.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<WorkspaceSnapshot>, JsonStoreError> {
        self.list_internal()
    }

    /// Deletes a snapshot by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut snapshots = self.list_internal()?;
        snapshots.retain(|s| s.id != id);

        self.store
            .write_with_context(context, "workspace-snapshots", &snapshots, None)?;

        Ok(())
    }

    /// Explicitly removes all snapshots and their revision metadata.
    pub fn clear_with_context(&self, context: &MutationContext<'_>) -> Result<(), JsonStoreError> {
        self.store
            .delete_with_context(context, "workspace-snapshots")
    }

    /// Lists all snapshots internally.
    fn list_internal(&self) -> Result<Vec<WorkspaceSnapshot>, JsonStoreError> {
        let snapshots: Option<Vec<WorkspaceSnapshot>> = self.store.read("workspace-snapshots")?;
        Ok(snapshots.unwrap_or_default())
    }

    #[cfg(test)]
    pub fn save(&self, snapshot: &WorkspaceSnapshot) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, snapshot)
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
    use std::time::Duration;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-snapshot-test-{suffix}-{:?}",
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

    fn test_snapshot() -> WorkspaceSnapshot {
        WorkspaceSnapshot::new(
            serde_json::json!({"workspace": "test"}),
            Some("Test snapshot".to_string()),
        )
    }

    #[test]
    fn snapshot_store_new() {
        let dir = test_dir("new");
        let store = SnapshotStore::new(&dir, 10).expect("count should be valid");
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_save_and_load() {
        let dir = test_dir("save-load");
        let store = SnapshotStore::new(&dir, 10).expect("count should be valid");

        let snapshot = test_snapshot();
        store.save(&snapshot).expect("save should succeed");

        let loaded = store.load(&snapshot.id).expect("load should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, snapshot.id);
        assert_eq!(loaded.data, snapshot.data);

        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_load_nonexistent() {
        let dir = test_dir("load-nonexistent");
        let store = SnapshotStore::new(&dir, 10).expect("count should be valid");

        let loaded = store.load("nonexistent").expect("load should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_load_latest() {
        let dir = test_dir("load-latest");
        let store = SnapshotStore::new(&dir, 10).expect("count should be valid");

        let snapshot1 =
            WorkspaceSnapshot::new(serde_json::json!({"version": 1}), Some("First".to_string()));
        store.save(&snapshot1).expect("save should succeed");

        std::thread::sleep(Duration::from_millis(10));

        let snapshot2 = WorkspaceSnapshot::new(
            serde_json::json!({"version": 2}),
            Some("Second".to_string()),
        );
        store.save(&snapshot2).expect("save should succeed");

        let latest = store.load_latest().expect("load_latest should succeed");
        assert!(latest.is_some());
        assert_eq!(latest.unwrap().id, snapshot2.id);

        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_list() {
        let dir = test_dir("list");
        let store = SnapshotStore::new(&dir, 10).expect("count should be valid");

        let snapshot1 = test_snapshot();
        store.save(&snapshot1).expect("save should succeed");

        std::thread::sleep(Duration::from_millis(10));

        let snapshot2 = test_snapshot();
        store.save(&snapshot2).expect("save should succeed");

        let snapshots = store.list().expect("list should succeed");
        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].id, snapshot1.id);
        assert_eq!(snapshots[1].id, snapshot2.id);

        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_delete() {
        let dir = test_dir("delete");
        let store = SnapshotStore::new(&dir, 10).expect("count should be valid");

        let snapshot = test_snapshot();
        store.save(&snapshot).expect("save should succeed");

        store.delete(&snapshot.id).expect("delete should succeed");

        let loaded = store.load(&snapshot.id).expect("load should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_trim_old() {
        let dir = test_dir("trim");
        let store = SnapshotStore::new(&dir, 3).expect("count should be valid");

        for _ in 0..5 {
            let snapshot = test_snapshot();
            store.save(&snapshot).expect("save should succeed");
            std::thread::sleep(Duration::from_millis(10));
        }

        let snapshots = store.list().expect("list should succeed");
        assert_eq!(snapshots.len(), 3);

        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_cannot_exceed_product_hard_max() {
        let dir = test_dir("product-hard-max");
        let store = SnapshotStore::new(&dir, 100).expect("count should be valid");

        for _ in 0..101 {
            store.save(&test_snapshot()).expect("save should succeed");
        }

        assert!(store.list().expect("list should succeed").len() <= 100);
        cleanup(&dir);
    }

    #[test]
    fn snapshot_store_rejects_counts_outside_product_range() {
        let dir = test_dir("invalid-count");

        assert!(SnapshotStore::new(&dir, 0).is_err());
        assert!(SnapshotStore::new(&dir, 101).is_err());

        cleanup(&dir);
    }
}
