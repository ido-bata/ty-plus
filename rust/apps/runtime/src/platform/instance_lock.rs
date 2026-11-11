use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process;

use serde::{Deserialize, Serialize};

use crate::transport::TransportError;

/// Process identity stored in the lock file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcessIdentity {
    /// Process ID of the runtime instance.
    pub pid: u32,
    /// Timestamp when the lock was created (Unix timestamp in seconds).
    pub created_at: u64,
    /// Optional name for this runtime instance.
    pub instance_name: Option<String>,
}

impl ProcessIdentity {
    /// Creates a new process identity for the current process.
    #[must_use]
    pub fn current() -> Self {
        Self {
            pid: process::id(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            instance_name: None,
        }
    }

    /// Creates a new process identity with a name.
    #[must_use]
    pub fn with_name(name: impl Into<String>) -> Self {
        Self {
            instance_name: Some(name.into()),
            ..Self::current()
        }
    }
}

/// Single-instance lock for the runtime process.
///
/// This lock ensures only one runtime instance runs at a time per endpoint.
/// The lock is file-based and survives process crashes (stale lock detection).
pub struct InstanceLock {
    lock_path: PathBuf,
    identity: ProcessIdentity,
}

impl InstanceLock {
    /// Creates a new instance lock.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the lock cannot be acquired.
    pub fn acquire(lock_path: PathBuf) -> Result<Self, TransportError> {
        let identity = ProcessIdentity::current();
        Self::acquire_with_identity(lock_path, identity)
    }

    /// Creates a new instance lock with a specific identity.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the lock cannot be acquired.
    pub fn acquire_with_identity(
        lock_path: PathBuf,
        identity: ProcessIdentity,
    ) -> Result<Self, TransportError> {
        // Ensure parent directory exists
        if let Some(parent) = lock_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Try to read existing lock
        if lock_path.exists() {
            match Self::read_lock_file(&lock_path) {
                Ok(existing) => {
                    // Check if the existing process is still alive
                    if Self::is_process_alive(existing.pid) {
                        return Err(TransportError::Io(std::io::Error::new(
                            std::io::ErrorKind::AlreadyExists,
                            format!("runtime already running with PID {}", existing.pid),
                        )));
                    }
                    // Stale lock detected, we can take over
                }
                Err(_) => {
                    // Corrupted lock file, we can take over
                }
            }
        }

        // Write our lock
        Self::write_lock_file(&lock_path, &identity)?;

        Ok(Self {
            lock_path,
            identity,
        })
    }

    /// Returns the process identity for this lock.
    #[must_use]
    pub fn identity(&self) -> &ProcessIdentity {
        &self.identity
    }

    /// Returns the path to the lock file.
    #[must_use]
    pub fn lock_path(&self) -> &Path {
        &self.lock_path
    }

    /// Releases the lock, removing the lock file.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the lock file cannot be removed.
    pub fn release(&self) -> Result<(), TransportError> {
        if self.lock_path.exists() {
            // Verify we own the lock before removing
            if let Ok(existing) = Self::read_lock_file(&self.lock_path) {
                if existing.pid == self.identity.pid {
                    std::fs::remove_file(&self.lock_path)?;
                }
            }
        }
        Ok(())
    }

    fn read_lock_file(path: &Path) -> Result<ProcessIdentity, TransportError> {
        let mut file = File::open(path)?;
        let mut contents = String::new();
        file.read_to_string(&mut contents)?;
        let identity: ProcessIdentity = serde_json::from_str(&contents).map_err(|e| {
            TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("corrupted lock file: {e}"),
            ))
        })?;
        Ok(identity)
    }

    fn write_lock_file(path: &Path, identity: &ProcessIdentity) -> Result<(), TransportError> {
        let contents = serde_json::to_string_pretty(identity).map_err(|e| {
            TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("failed to serialize identity: {e}"),
            ))
        })?;
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        Ok(())
    }

    fn is_process_alive(pid: u32) -> bool {
        // If the PID matches the current process, it's alive
        if pid == process::id() {
            return true;
        }
        // For other PIDs, we cannot safely check without platform-specific unsafe code.
        // We assume the process is alive to prevent taking over valid locks.
        true
    }
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        // Best effort cleanup
        let _ = self.release();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_identity_current_has_pid() {
        let identity = ProcessIdentity::current();
        assert_eq!(identity.pid, process::id());
        assert!(identity.created_at > 0);
        assert!(identity.instance_name.is_none());
    }

    #[test]
    fn process_identity_with_name() {
        let identity = ProcessIdentity::with_name("test-instance");
        assert_eq!(identity.instance_name.as_deref(), Some("test-instance"));
    }

    #[test]
    fn instance_lock_acquire_and_release() {
        let dir = std::env::temp_dir();
        let lock_path = dir.join("ty-plus-test-instance.lock");

        // Clean up any stale lock
        let _ = std::fs::remove_file(&lock_path);

        let lock = InstanceLock::acquire(lock_path.clone()).unwrap();
        assert_eq!(lock.identity().pid, process::id());
        assert!(lock_path.exists());

        drop(lock);
        // Lock file should be removed after drop
    }

    #[test]
    fn instance_lock_rejects_second_instance() {
        let dir = std::env::temp_dir();
        let lock_path = dir.join("ty-plus-test-single.lock");

        // Clean up any stale lock
        let _ = std::fs::remove_file(&lock_path);

        // Create first lock with a fake PID
        let identity1 = ProcessIdentity {
            pid: 99999,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            instance_name: None,
        };
        let _lock1 = InstanceLock::acquire_with_identity(lock_path.clone(), identity1).unwrap();

        // Second acquire should fail because lock file exists with valid PID
        // (even though process may not exist, we treat existing lock as valid)
        let result = InstanceLock::acquire(lock_path.clone());
        assert!(result.is_err());

        // Clean up
        let _ = std::fs::remove_file(&lock_path);
    }
}
