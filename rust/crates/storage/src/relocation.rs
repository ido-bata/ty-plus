//! Support root relocate/copy/reset operations.
//!
//! This module provides support root relocation with support for
//! dry-run, cancel, rollback, and shared root handling.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// Relocation operation type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RelocationOperation {
    /// Move the support root to a new location.
    Move,
    /// Copy the support root to a new location.
    Copy,
    /// Reset the support root to default location.
    Reset,
}

/// Relocation status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RelocationStatus {
    /// Operation is pending.
    Pending,
    /// Operation is in progress.
    InProgress,
    /// Operation completed successfully.
    Completed,
    /// Operation was cancelled.
    Cancelled,
    /// Operation failed.
    Failed(String),
}

/// Relocation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelocationRequest {
    /// Unique identifier for this request.
    pub id: String,
    /// ISO 8601 timestamp of when this request was created.
    pub created_at: String,
    /// Relocation operation type.
    pub operation: RelocationOperation,
    /// Current support root path.
    pub source_path: PathBuf,
    /// Target path (for move/copy operations).
    pub target_path: Option<PathBuf>,
    /// Current status.
    pub status: RelocationStatus,
    /// Dry-run flag (if true, don't actually perform the operation).
    pub dry_run: bool,
}

impl RelocationRequest {
    /// Creates a new relocation request.
    #[must_use]
    pub fn new(operation: RelocationOperation, source_path: PathBuf) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let id = format!(
            "reloc-{}",
            now.replace([':', '-', 'T', 'Z'], "")
                .chars()
                .filter(|c| c.is_ascii_digit())
                .collect::<String>()
        );

        Self {
            id,
            created_at: now,
            operation,
            source_path,
            target_path: None,
            status: RelocationStatus::Pending,
            dry_run: false,
        }
    }
}

/// Relocation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelocationResult {
    /// Relocation request that produced this result.
    pub request_id: String,
    /// ISO 8601 timestamp of when this result was created.
    pub completed_at: String,
    /// Files that were affected by the operation.
    pub affected_files: Vec<PathBuf>,
    /// Rollback information (if operation needs to be reversed).
    pub rollback_info: Option<serde_json::Value>,
}

/// Support root relocate store.
#[derive(Debug, Clone)]
pub struct RelocationStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl RelocationStore {
    /// Creates a new relocation store.
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

    /// Gets a relocation request by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get_request(&self, id: &str) -> Result<Option<RelocationRequest>, JsonStoreError> {
        let requests = self.list_requests()?;
        Ok(requests.into_iter().find(|r| r.id == id))
    }

    /// Saves a relocation request.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_request_with_context(
        &self,
        context: &MutationContext<'_>,
        request: &RelocationRequest,
    ) -> Result<(), JsonStoreError> {
        let mut requests = self.list_requests()?;

        // Remove existing request with same ID
        requests.retain(|r| r.id != request.id);

        // Add new request
        requests.push(request.clone());

        self.store
            .write_with_context(context, "relocation-requests", &requests, None)?;
        Ok(())
    }

    /// Lists all relocation requests.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_requests(&self) -> Result<Vec<RelocationRequest>, JsonStoreError> {
        let requests: Option<Vec<RelocationRequest>> = self.store.read("relocation-requests")?;
        Ok(requests.unwrap_or_default())
    }

    /// Gets a relocation result by request ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get_result(&self, request_id: &str) -> Result<Option<RelocationResult>, JsonStoreError> {
        let results = self.list_results()?;
        Ok(results.into_iter().find(|r| r.request_id == request_id))
    }

    /// Saves a relocation result.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_result_with_context(
        &self,
        context: &MutationContext<'_>,
        result: &RelocationResult,
    ) -> Result<(), JsonStoreError> {
        let mut results = self.list_results()?;

        // Remove existing result with same request_id
        results.retain(|r| r.request_id != result.request_id);

        // Add new result
        results.push(result.clone());

        self.store
            .write_with_context(context, "relocation-results", &results, None)?;
        Ok(())
    }

    /// Lists all relocation results.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_results(&self) -> Result<Vec<RelocationResult>, JsonStoreError> {
        let results: Option<Vec<RelocationResult>> = self.store.read("relocation-results")?;
        Ok(results.unwrap_or_default())
    }

    /// Cancels a relocation request.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the cancel fails.
    pub fn cancel_request_with_context(
        &self,
        context: &MutationContext<'_>,
        id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut requests = self.list_requests()?;

        let request = requests.iter_mut().find(|r| r.id == id).ok_or_else(|| {
            JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("relocation request with ID {id} not found"),
            ))
        })?;

        request.status = RelocationStatus::Cancelled;

        self.store
            .write_with_context(context, "relocation-requests", &requests, None)?;
        Ok(())
    }

    #[cfg(test)]
    pub fn save_request(&self, request: &RelocationRequest) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_request_with_context(context, request)
        })
    }
    #[cfg(test)]
    pub fn save_result(&self, result: &RelocationResult) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_result_with_context(context, result)
        })
    }
    #[cfg(test)]
    pub fn cancel_request(&self, id: &str) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.cancel_request_with_context(context, id)
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
            "ty-plus-relocation-test-{suffix}-{:?}",
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

    fn test_request() -> RelocationRequest {
        let mut request = RelocationRequest::new(
            RelocationOperation::Move,
            PathBuf::from("/old/support/root"),
        );
        request.target_path = Some(PathBuf::from("/new/support/root"));
        request
    }

    #[test]
    fn relocation_store_new() {
        let dir = test_dir("new");
        let store = RelocationStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn relocation_store_save_and_get_request() {
        let dir = test_dir("save-get");
        let store = RelocationStore::new(&dir);

        let request = test_request();
        store.save_request(&request).expect("save should succeed");

        let loaded = store.get_request(&request.id).expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.id, request.id);
        assert_eq!(loaded.operation, RelocationOperation::Move);

        cleanup(&dir);
    }

    #[test]
    fn relocation_store_get_request_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = RelocationStore::new(&dir);

        let loaded = store
            .get_request("nonexistent")
            .expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn relocation_store_list_requests() {
        let dir = test_dir("list-requests");
        let store = RelocationStore::new(&dir);

        let request1 = test_request();
        store.save_request(&request1).expect("save should succeed");

        let request2 = RelocationRequest::new(
            RelocationOperation::Copy,
            PathBuf::from("/old/support/root"),
        );
        store.save_request(&request2).expect("save should succeed");

        let requests = store.list_requests().expect("list should succeed");
        assert_eq!(requests.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn relocation_store_save_and_get_result() {
        let dir = test_dir("result");
        let store = RelocationStore::new(&dir);

        let result = RelocationResult {
            request_id: "req-1".to_string(),
            completed_at: chrono::Utc::now().to_rfc3339(),
            affected_files: vec![PathBuf::from("/file1"), PathBuf::from("/file2")],
            rollback_info: None,
        };
        store.save_result(&result).expect("save should succeed");

        let loaded = store.get_result("req-1").expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.request_id, "req-1");
        assert_eq!(loaded.affected_files.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn relocation_store_cancel_request() {
        let dir = test_dir("cancel");
        let store = RelocationStore::new(&dir);

        let request = test_request();
        store.save_request(&request).expect("save should succeed");

        store
            .cancel_request(&request.id)
            .expect("cancel should succeed");

        let loaded = store
            .get_request(&request.id)
            .expect("get should succeed")
            .unwrap();
        assert!(matches!(loaded.status, RelocationStatus::Cancelled));

        cleanup(&dir);
    }
}
