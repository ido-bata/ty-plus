//! Existing data migration support.
//!
//! This module provides migration support for existing data, including
//! transaction recovery and reset fixtures.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// Migration status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MigrationStatus {
    /// Migration not started.
    Pending,
    /// Migration in progress.
    InProgress,
    /// Migration completed successfully.
    Completed,
    /// Migration failed.
    Failed(String),
}

/// Migration record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationRecord {
    /// Unique identifier for this migration.
    pub id: String,
    /// ISO 8601 timestamp of when this migration was created.
    pub created_at: String,
    /// Migration version.
    pub version: u32,
    /// Migration description.
    pub description: String,
    /// Current status.
    pub status: MigrationStatus,
    /// Files affected by this migration.
    pub affected_files: Vec<PathBuf>,
    /// Pre-migration snapshot hash.
    pub pre_snapshot_hash: Option<String>,
    /// Post-migration snapshot hash.
    pub post_snapshot_hash: Option<String>,
}

impl MigrationRecord {
    /// Creates a new migration record.
    #[must_use]
    pub fn new(version: u32, description: &str) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let id = format!("migration-v{version}");

        Self {
            id,
            created_at: now,
            version,
            description: description.to_string(),
            status: MigrationStatus::Pending,
            affected_files: Vec::new(),
            pre_snapshot_hash: None,
            post_snapshot_hash: None,
        }
    }
}

/// Migration fixture for reset operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationFixture {
    /// Fixture name.
    pub name: String,
    /// Fixture description.
    pub description: String,
    /// Pre-reset file tree.
    pub pre_reset_tree: serde_json::Value,
    /// Post-reset file tree.
    pub post_reset_tree: serde_json::Value,
    /// Pre-reset hash.
    pub pre_reset_hash: String,
    /// Post-reset hash.
    pub post_reset_hash: String,
}

/// Migration store.
#[derive(Debug, Clone)]
pub struct MigrationStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl MigrationStore {
    /// Creates a new migration store.
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

    /// Gets a migration record by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, id: &str) -> Result<Option<MigrationRecord>, JsonStoreError> {
        let records = self.list()?;
        Ok(records.into_iter().find(|r| r.id == id))
    }

    /// Saves a migration record.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        record: &MigrationRecord,
    ) -> Result<(), JsonStoreError> {
        let mut records = self.list()?;

        // Remove existing record with same ID
        records.retain(|r| r.id != record.id);

        // Add new record
        records.push(record.clone());

        self.store
            .write_with_context(context, "migration-records", &records, None)?;
        Ok(())
    }

    /// Lists all migration records.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<MigrationRecord>, JsonStoreError> {
        let records: Option<Vec<MigrationRecord>> = self.store.read("migration-records")?;
        let mut records = records.unwrap_or_default();
        records.sort_by_key(|record| record.version);
        Ok(records)
    }

    /// Gets the latest migration version.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn latest_version(&self) -> Result<Option<u32>, JsonStoreError> {
        let records = self.list()?;
        Ok(records.last().map(|r| r.version))
    }

    /// Saves a migration fixture.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_fixture_with_context(
        &self,
        context: &MutationContext<'_>,
        fixture: &MigrationFixture,
    ) -> Result<(), JsonStoreError> {
        let mut fixtures = self.list_fixtures()?;

        // Remove existing fixture with same name
        fixtures.retain(|f| f.name != fixture.name);

        // Add new fixture
        fixtures.push(fixture.clone());

        self.store
            .write_with_context(context, "migration-fixtures", &fixtures, None)?;
        Ok(())
    }

    /// Gets a migration fixture by name.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get_fixture(&self, name: &str) -> Result<Option<MigrationFixture>, JsonStoreError> {
        let fixtures = self.list_fixtures()?;
        Ok(fixtures.into_iter().find(|f| f.name == name))
    }

    /// Lists all migration fixtures.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_fixtures(&self) -> Result<Vec<MigrationFixture>, JsonStoreError> {
        let fixtures: Option<Vec<MigrationFixture>> = self.store.read("migration-fixtures")?;
        Ok(fixtures.unwrap_or_default())
    }

    #[cfg(test)]
    pub fn save(&self, record: &MigrationRecord) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, record)
        })
    }

    #[cfg(test)]
    pub fn save_fixture(&self, fixture: &MigrationFixture) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_fixture_with_context(context, fixture)
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
            "ty-plus-migration-test-{suffix}-{:?}",
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

    fn test_record() -> MigrationRecord {
        let mut record = MigrationRecord::new(1, "Initial migration");
        record.affected_files = vec![PathBuf::from("/file1"), PathBuf::from("/file2")];
        record
    }

    fn test_fixture() -> MigrationFixture {
        MigrationFixture {
            name: "reset-v1".to_string(),
            description: "Reset fixture for v1".to_string(),
            pre_reset_tree: serde_json::json!({"files": ["a.json", "b.json"]}),
            post_reset_tree: serde_json::json!({"files": ["a.json"]}),
            pre_reset_hash: "abc123".to_string(),
            post_reset_hash: "def456".to_string(),
        }
    }

    #[test]
    fn migration_store_new() {
        let dir = test_dir("new");
        let store = MigrationStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn migration_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = MigrationStore::new(&dir);

        let record = test_record();
        store.save(&record).expect("save should succeed");

        let loaded = store.get(&record.id).expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, record.id);
        assert_eq!(loaded.version, 1);

        cleanup(&dir);
    }

    #[test]
    fn migration_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = MigrationStore::new(&dir);

        let loaded = store.get("nonexistent").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn migration_store_list() {
        let dir = test_dir("list");
        let store = MigrationStore::new(&dir);

        let record1 = MigrationRecord::new(1, "Migration 1");
        store.save(&record1).expect("save should succeed");

        let record2 = MigrationRecord::new(2, "Migration 2");
        store.save(&record2).expect("save should succeed");

        let records = store.list().expect("list should succeed");
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].version, 1);
        assert_eq!(records[1].version, 2);

        cleanup(&dir);
    }

    #[test]
    fn migration_store_latest_version() {
        let dir = test_dir("latest-version");
        let store = MigrationStore::new(&dir);

        let record1 = MigrationRecord::new(1, "Migration 1");
        store.save(&record1).expect("save should succeed");

        let record2 = MigrationRecord::new(2, "Migration 2");
        store.save(&record2).expect("save should succeed");

        let version = store
            .latest_version()
            .expect("latest_version should succeed");
        assert_eq!(version, Some(2));

        cleanup(&dir);
    }

    #[test]
    fn migration_store_save_fixture() {
        let dir = test_dir("fixture");
        let store = MigrationStore::new(&dir);

        let fixture = test_fixture();
        store.save_fixture(&fixture).expect("save should succeed");

        let loaded = store.get_fixture("reset-v1").expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "reset-v1");
        assert_eq!(loaded.pre_reset_hash, "abc123");

        cleanup(&dir);
    }

    #[test]
    fn migration_store_list_fixtures() {
        let dir = test_dir("list-fixtures");
        let store = MigrationStore::new(&dir);

        let fixture1 = test_fixture();
        store.save_fixture(&fixture1).expect("save should succeed");

        let fixture2 = MigrationFixture {
            name: "reset-v2".to_string(),
            description: "Reset fixture for v2".to_string(),
            pre_reset_tree: serde_json::json!({"files": ["x.json"]}),
            post_reset_tree: serde_json::json!({"files": []}),
            pre_reset_hash: "aaa111".to_string(),
            post_reset_hash: "bbb222".to_string(),
        };
        store.save_fixture(&fixture2).expect("save should succeed");

        let fixtures = store.list_fixtures().expect("list should succeed");
        assert_eq!(fixtures.len(), 2);

        cleanup(&dir);
    }
}
