use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use super::instance_lock::{InstanceLock, ProcessIdentity};
use super::permission::PermissionConfig;
use crate::transport::TransportError;

/// Recovery configuration for stale locks and endpoints.
#[derive(Debug, Clone)]
pub struct RecoveryConfig {
    /// Maximum age of a lock file before it's considered stale (in seconds).
    pub max_lock_age_secs: u64,
    /// Maximum age of an endpoint file before it's considered stale (in seconds).
    pub max_endpoint_age_secs: u64,
    /// Permission configuration for recovered endpoints.
    pub permission: PermissionConfig,
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            max_lock_age_secs: 300,     // 5 minutes
            max_endpoint_age_secs: 600, // 10 minutes
            permission: PermissionConfig::default(),
        }
    }
}

/// Recovery manager for handling stale locks and endpoints.
pub struct RecoveryManager {
    control_root: PathBuf,
    config: RecoveryConfig,
}

impl RecoveryManager {
    /// Creates a new recovery manager.
    #[must_use]
    pub fn new(control_root: PathBuf, config: RecoveryConfig) -> Self {
        Self {
            control_root,
            config,
        }
    }

    /// Checks if a lock file is stale.
    ///
    /// A lock is stale if:
    /// 1. The file doesn't exist
    /// 2. The file is older than `max_lock_age_secs`
    /// 3. The lock file is corrupted
    #[must_use]
    pub fn is_lock_stale(&self, lock_path: &Path) -> bool {
        if !lock_path.exists() {
            return true;
        }

        // Check file age
        if let Ok(metadata) = std::fs::metadata(lock_path) {
            if let Ok(modified) = metadata.modified() {
                let age = SystemTime::now()
                    .duration_since(modified)
                    .unwrap_or_default();
                if age > Duration::from_secs(self.config.max_lock_age_secs) {
                    return true;
                }
            }
        }

        // Check if lock file is valid
        match Self::read_lock_identity(lock_path) {
            Ok(identity) => !Self::is_process_alive(identity.pid),
            Err(_) => true, // Corrupted lock is stale
        }
    }

    /// Checks if an endpoint file is stale.
    #[must_use]
    pub fn is_endpoint_stale(&self, endpoint_path: &Path) -> bool {
        if !endpoint_path.exists() {
            return true;
        }

        if let Ok(metadata) = std::fs::metadata(endpoint_path) {
            if let Ok(modified) = metadata.modified() {
                let age = SystemTime::now()
                    .duration_since(modified)
                    .unwrap_or_default();
                return age > Duration::from_secs(self.config.max_endpoint_age_secs);
            }
        }

        true
    }

    /// Recovers from a stale lock by removing it and creating a new one.
    ///
    /// # Errors
    ///
    /// Returns `Err` if recovery fails.
    pub fn recover_lock(&self) -> Result<InstanceLock, TransportError> {
        let lock_path = self.control_root.join("runtime.lock");

        if self.is_lock_stale(&lock_path) {
            // Remove stale lock
            if lock_path.exists() {
                std::fs::remove_file(&lock_path)?;
            }
        }

        // Acquire new lock
        InstanceLock::acquire(lock_path)
    }

    /// Recovers a stale endpoint file.
    ///
    /// # Errors
    ///
    /// Returns `Err` if recovery fails.
    pub fn recover_endpoint(&self) -> Result<(), TransportError> {
        let endpoint_path = self.control_root.join("endpoint.json");

        if self.is_endpoint_stale(&endpoint_path) && endpoint_path.exists() {
            std::fs::remove_file(&endpoint_path)?;
        }

        Ok(())
    }

    /// Performs full recovery: lock, endpoint, and any other stale files.
    ///
    /// # Errors
    ///
    /// Returns `Err` if any recovery step fails.
    pub fn recover_all(&self) -> Result<InstanceLock, TransportError> {
        // Ensure control root exists
        std::fs::create_dir_all(&self.control_root)?;

        // Recover lock
        let lock = self.recover_lock()?;

        // Recover endpoint
        self.recover_endpoint()?;

        Ok(lock)
    }

    fn read_lock_identity(path: &Path) -> Result<ProcessIdentity, TransportError> {
        let contents = std::fs::read_to_string(path)?;
        let identity: ProcessIdentity = serde_json::from_str(&contents).map_err(|e| {
            TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("corrupted lock file: {e}"),
            ))
        })?;
        Ok(identity)
    }

    fn is_process_alive(pid: u32) -> bool {
        // Same logic as in instance_lock
        if pid == std::process::id() {
            return true;
        }
        // Assume alive to prevent taking over valid locks
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_control_root() -> PathBuf {
        let dir = std::env::temp_dir();
        dir.join("ty-plus-test-recovery")
    }

    #[test]
    fn recovery_config_defaults() {
        let config = RecoveryConfig::default();
        assert_eq!(config.max_lock_age_secs, 300);
        assert_eq!(config.max_endpoint_age_secs, 600);
        assert!(config.permission.same_user_only);
    }

    #[test]
    fn is_lock_stale_returns_true_for_missing_file() {
        let root = test_control_root();
        let manager = RecoveryManager::new(root, RecoveryConfig::default());
        let lock_path = Path::new("/nonexistent/lock/file.lock");
        assert!(manager.is_lock_stale(lock_path));
    }

    #[test]
    fn is_endpoint_stale_returns_true_for_missing_file() {
        let root = test_control_root();
        let manager = RecoveryManager::new(root, RecoveryConfig::default());
        let endpoint_path = Path::new("/nonexistent/endpoint/file.json");
        assert!(manager.is_endpoint_stale(endpoint_path));
    }

    #[test]
    fn recover_all_creates_lock_and_endpoint() {
        let root = test_control_root();
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();

        let config = RecoveryConfig::default();
        let manager = RecoveryManager::new(root.clone(), config);

        let lock = manager.recover_all().unwrap();
        assert!(root.join("runtime.lock").exists());
        assert_eq!(lock.identity().pid, std::process::id());

        // Cleanup
        let _ = std::fs::remove_dir_all(&root);
    }
}
