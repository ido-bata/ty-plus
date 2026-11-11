//! User-visible managed storage, persistent caches, and operation history.
//!
//! Storage roots are session inputs. This crate never discovers an After Effects
//! installation or support directory from the registry, environment, or a fixed
//! operating-system path.

mod json_commit;
pub mod json_store;
mod manifest;
pub mod migration;
pub mod operation_history;
pub mod operation_lock;
pub mod panel_persistence;
pub mod path;
pub mod persistence_io;
pub mod persistent_cache;
pub mod relocation;
pub mod retention;
mod root;
pub mod scoped_ops;
pub mod settings_files;
pub mod snapshot;
pub mod tool_handoff;
pub mod transaction;
pub mod widget_state;
pub mod workspace_layout;
pub mod workspace_records;

pub mod clipboard;
pub mod i18n_preference;

pub use json_commit::{JsonFile, JsonRevision, WriteError};
pub use json_store::{JsonFileStore, JsonStoreError};
pub use manifest::{
    ApplicationFolderManifest, DisposableScratchScope, ManagedStatePolicy, ManifestItem,
    RegisteredStorageKey, RegisteredStorageKind, ResetOperationError, ResetOutcome,
    ResetTargetError, MANAGED_RESET_PATHS, SEARCH_CACHE_RELATIVE_PATH,
};
pub use operation_lock::{LockError, MutationContext, OperationLock, OperationLockGuard};
pub use path::{
    ManagedRelativePath, ManagedRelativePathError, RegisteredDirectory, RegisteredPath,
};
pub use persistence_io::{
    PersistenceIoHandler, PersistenceReadJsonRequest, PersistenceReadJsonResponse,
    PersistenceReadTextRequest, PersistenceReadTextResponse, PersistenceRemoveJsonRequest,
    PersistenceWriteJsonRequest,
};
pub use retention::{DiagnosticBundleStore, RetentionStoreError, WorkerLogStore};
pub use root::{
    HostSessionRoots, ManagedRoot, ManagedRootSelection, ManagedRootSource, ResolvedStorageRoots,
    RootValidationError, SessionAppRoot, SessionSupportRoot, SharedBrowseRoot,
};
pub use transaction::{
    CommitReceipt, InvocationId, RecoveryError, RecoveryReport, Revision, Transaction,
    TransactionError, TransactionState,
};

/// Stable identifier for this crate's architectural responsibility.
pub const RESPONSIBILITY: &str = "managed storage and persistent local state";

/// Marker for storage-owned operations while their request contracts are added.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct StorageBoundary;

impl StorageBoundary {
    /// Creates an unconfigured storage boundary.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }
}

#[cfg(test)]
mod tests {
    use super::{StorageBoundary, RESPONSIBILITY};

    #[test]
    fn boundary_owns_persistent_local_state() {
        assert_eq!(StorageBoundary::new(), StorageBoundary);
        assert_eq!(RESPONSIBILITY, "managed storage and persistent local state");
    }
}
