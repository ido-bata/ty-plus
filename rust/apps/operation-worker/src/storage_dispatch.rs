//! Per-invocation storage composition.

use std::time::{Duration, Instant};

use serde_json::Value;
use ty_plus_protocol::{CanonicalMethod, MethodName};

use ty_plus_storage::{
    InvocationId, ManagedRoot, MutationContext, OperationLock, OperationLockGuard,
    PersistenceIoHandler,
};

/// Storage services owned by one invocation.
pub struct StorageBoundary {
    io: PersistenceIoHandler,
    lock: OperationLockGuard,
    invocation_id: InvocationId,
}

impl std::fmt::Debug for StorageBoundary {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("StorageBoundary")
            .field("managed_root", &self.lock.managed_root().as_path())
            .field("invocation_id", &self.invocation_id)
            .finish_non_exhaustive()
    }
}

impl StorageBoundary {
    pub(crate) fn new(
        managed_root: ManagedRoot,
        invocation_id: InvocationId,
    ) -> Result<Self, StorageError> {
        let lock = OperationLock::acquire(&managed_root, Instant::now() + Duration::from_secs(5))
            .map_err(StorageError::Lock)?;
        // Recovery is intentionally delegated to the storage transaction API.
        // The control directory is always created by the lock boundary and is
        // the first directory inspected for an interrupted invocation.
        let control =
            ty_plus_storage::RegisteredPath::new("control").map_err(StorageError::Path)?;
        ty_plus_storage::Transaction::recover(&lock, control).map_err(StorageError::Recovery)?;

        Ok(Self {
            io: PersistenceIoHandler::new(
                lock.managed_root().as_path().to_string_lossy().into_owned(),
            ),
            lock,
            invocation_id,
        })
    }

    #[must_use]
    pub fn persistence(&self) -> &PersistenceIoHandler {
        &self.io
    }

    /// Creates the caller-owned authority required by managed mutations.
    #[must_use]
    pub fn mutation_context(&self) -> MutationContext<'_> {
        MutationContext::new(&self.lock, &self.invocation_id)
    }

    #[must_use]
    pub fn managed_root(&self) -> &ManagedRoot {
        self.lock.managed_root()
    }

    /// Recovers the transaction journal for every worker-owned mutating
    /// operation before its adapter touches the managed tree.
    pub(crate) fn recover_for_operation(
        &self,
        method: &MethodName,
        _payload: &Value,
    ) -> Result<(), StorageError> {
        match method.canonical() {
            Some(CanonicalMethod::HostPluginEffectScan) => Ok(()),
            Some(CanonicalMethod::UpdateInstall) => Ok(()),
            Some(CanonicalMethod::HostThumbnailLookup)
            | Some(CanonicalMethod::HostThumbnailGenerate)
            | Some(CanonicalMethod::HostThumbnailLookupOrGenerate)
            | Some(CanonicalMethod::HostThumbnailBatch) => {
                // Host thumbnails do not own any managed tree path — the
                // pipeline writes into `<cache_root>/thumbnails/`, where the
                // cache root is the managed root when writable or
                // `<temp_dir>/ty-plus-thumbnails/` otherwise. Either way,
                // no managed journal recovery is required.
                Ok(())
            }
            None => Ok(()),
        }
    }
}

#[derive(Debug)]
pub enum StorageError {
    Lock(ty_plus_storage::LockError),
    Path(ty_plus_storage::ManagedRelativePathError),
    Recovery(ty_plus_storage::RecoveryError),
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Lock(error) => write!(f, "storage lock failed: {error}"),
            Self::Path(error) => write!(f, "storage path failed: {error}"),
            Self::Recovery(error) => write!(f, "storage recovery failed: {error}"),
        }
    }
}

impl std::error::Error for StorageError {}
