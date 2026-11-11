use std::{
    error::Error,
    fmt, io,
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

use crate::{InvocationId, ManagedRoot};
use ty_plus_host_filesystem::platform::{exclusive_open, PlatformLockHandle};

/// Stable failure returned when a managed-root lock cannot be obtained in time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LockError {
    /// The lock remained held until the caller's deadline.
    Timeout,
    /// The operating system rejected a lock operation.
    Io { message: String },
}

impl fmt::Display for LockError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Timeout => formatter.write_str("managed-root operation lock timed out"),
            Self::Io { message } => {
                write!(formatter, "managed-root operation lock failed: {message}")
            }
        }
    }
}

impl Error for LockError {}

/// The managed-root operation lock coordinator.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct OperationLock;

impl OperationLock {
    /// Acquires the managed-root OS lock until the supplied deadline.
    pub fn acquire(
        managed_root: &ManagedRoot,
        deadline: Instant,
    ) -> Result<OperationLockGuard, LockError> {
        if Instant::now() >= deadline {
            return Err(LockError::Timeout);
        }

        let path = managed_root.control_lock_path();
        let handle = exclusive_open(managed_root.as_path()).map_err(io_error)?;

        loop {
            match handle.try_lock() {
                Ok(()) => {
                    return Ok(OperationLockGuard {
                        handle: Some(handle),
                        path,
                        managed_root: managed_root.clone(),
                    });
                }
                Err(error) if is_contention(&error) => {
                    if Instant::now() >= deadline {
                        return Err(LockError::Timeout);
                    }
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    thread::sleep(remaining.min(Duration::from_millis(2)));
                }
                Err(error) => return Err(io_error(error)),
            }
        }
    }
}

/// A held OS lock for one managed root.
#[derive(Debug)]
pub struct OperationLockGuard {
    handle: Option<PlatformLockHandle>,
    path: PathBuf,
    managed_root: ManagedRoot,
}

/// Caller-owned mutation context tying an operation identity to its held root lock.
#[derive(Debug, Clone, Copy)]
pub struct MutationContext<'a> {
    guard: &'a OperationLockGuard,
    invocation_id: &'a InvocationId,
}

impl<'a> MutationContext<'a> {
    /// Binds one operation identity to an already-held managed-root lock.
    #[must_use]
    pub const fn new(guard: &'a OperationLockGuard, invocation_id: &'a InvocationId) -> Self {
        Self {
            guard,
            invocation_id,
        }
    }

    /// Returns the exclusive lock owned by the caller.
    #[must_use]
    pub const fn guard(self) -> &'a OperationLockGuard {
        self.guard
    }

    /// Returns the caller-supplied operation identity.
    #[must_use]
    pub const fn invocation_id(self) -> &'a InvocationId {
        self.invocation_id
    }
}

#[cfg(test)]
pub(crate) fn with_test_context<T>(
    root_path: &Path,
    operation: impl for<'a> FnOnce(&MutationContext<'a>) -> T,
) -> T {
    let root = ManagedRoot::new(root_path).expect("test managed root");
    let guard = OperationLock::acquire(&root, Instant::now() + Duration::from_secs(5))
        .expect("test operation lock");
    let invocation = crate::InvocationId::new("test-mutation");
    let context = MutationContext::new(&guard, &invocation);
    operation(&context)
}

impl OperationLockGuard {
    /// Returns the visible `control/operation.lock` entry.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Returns the root whose exclusive lock is held by this guard.
    #[must_use]
    pub fn managed_root(&self) -> &ManagedRoot {
        &self.managed_root
    }

    /// Releases the OS lock and closes its handle.
    pub fn release(mut self) -> Result<(), LockError> {
        let handle = self.handle.take().expect("lock guard owns its file handle");
        handle.unlock().map_err(io_error)
    }
}

impl Drop for OperationLockGuard {
    fn drop(&mut self) {
        if let Some(handle) = self.handle.take() {
            let _ = handle.unlock();
        }
    }
}

impl PartialEq for OperationLockGuard {
    fn eq(&self, other: &Self) -> bool {
        self.path == other.path
    }
}

impl Eq for OperationLockGuard {}

fn io_error(error: io::Error) -> LockError {
    LockError::Io {
        message: error.to_string(),
    }
}

fn is_contention(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::WouldBlock | io::ErrorKind::AlreadyExists
    ) || matches!(error.raw_os_error(), Some(32 | 33))
}
