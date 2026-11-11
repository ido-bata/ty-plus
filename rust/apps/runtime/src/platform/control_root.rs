use std::path::PathBuf;

use super::{PlatformImplementation, SupportedPlatform};

/// Application control root for the current platform.
///
/// This directory contains endpoint discovery, process identity,
/// protocol/build identity, and lock material. It is independent of
/// AE versions and managed data roots.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlRoot {
    path: PathBuf,
}

impl ControlRoot {
    /// Product identifier used in the control root path.
    pub const PRODUCT_ID: &'static str = "TyPlus";

    /// Subdirectory name for runtime control files.
    pub const CONTROL_DIR: &'static str = "runtime-control";

    /// Creates a control root from an explicit base directory.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the path is not an absolute directory.
    pub fn new(base: PathBuf) -> Result<Self, ControlRootError> {
        if !base.is_absolute() {
            return Err(ControlRootError::RelativePath);
        }
        Ok(Self { path: base })
    }

    /// Returns the path to the control root directory.
    #[must_use]
    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    /// Returns the path to the endpoint discovery file.
    #[must_use]
    pub fn endpoint_path(&self) -> PathBuf {
        self.path.join("endpoint.json")
    }

    /// Returns the path to the process identity file.
    #[must_use]
    pub fn process_identity_path(&self) -> PathBuf {
        self.path.join("process-identity.json")
    }

    /// Returns the path to the protocol/build identity file.
    #[must_use]
    pub fn protocol_identity_path(&self) -> PathBuf {
        self.path.join("protocol-identity.json")
    }

    /// Returns the path to the lock file.
    #[must_use]
    pub fn lock_path(&self) -> PathBuf {
        self.path.join("runtime.lock")
    }
}

/// Errors that can occur when creating a control root.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ControlRootError {
    /// The provided path is not absolute.
    RelativePath,
}

impl std::fmt::Display for ControlRootError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RelativePath => write!(f, "control root path must be absolute"),
        }
    }
}

impl std::error::Error for ControlRootError {}

/// Returns the platform-specific application control root.
///
/// # Windows
///
/// `%LOCALAPPDATA%/TyPlus/runtime-control/`
///
/// # macOS
///
/// `~/Library/Application Support/TyPlus/runtime-control/`
///
/// # Errors
///
/// Returns `Err` if the platform-specific base directory cannot be determined.
pub fn control_root_for_platform(
    platform: PlatformImplementation,
) -> Result<ControlRoot, ControlRootError> {
    match platform.platform() {
        SupportedPlatform::Windows => {
            let local_app_data =
                std::env::var("LOCALAPPDATA").map_err(|_| ControlRootError::RelativePath)?;
            let base = PathBuf::from(local_app_data)
                .join(ControlRoot::PRODUCT_ID)
                .join(ControlRoot::CONTROL_DIR);
            ControlRoot::new(base)
        }
        SupportedPlatform::Macos => {
            let home = std::env::var("HOME").map_err(|_| ControlRootError::RelativePath)?;
            let base = PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join(ControlRoot::PRODUCT_ID)
                .join(ControlRoot::CONTROL_DIR);
            ControlRoot::new(base)
        }
    }
}

/// Returns the control root for the current compilation target.
///
/// # Errors
///
/// Returns `Err` if the platform-specific base directory cannot be determined.
pub fn current_control_root() -> Result<ControlRoot, ControlRootError> {
    control_root_for_platform(super::current())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    fn test_root() -> PathBuf {
        PathBuf::from("C:\\tmp\\test-control")
    }

    #[cfg(not(target_os = "windows"))]
    fn test_root() -> PathBuf {
        PathBuf::from("/tmp/test-control")
    }

    #[test]
    fn control_root_path_is_absolute() {
        let root = ControlRoot::new(test_root()).unwrap();
        assert!(root.path().is_absolute());
    }

    #[test]
    fn control_root_rejects_relative_path() {
        let result = ControlRoot::new(PathBuf::from("relative/path"));
        assert_eq!(result, Err(ControlRootError::RelativePath));
    }

    #[test]
    fn endpoint_path_is_under_control_root() {
        let root = ControlRoot::new(test_root()).unwrap();
        assert_eq!(root.endpoint_path(), test_root().join("endpoint.json"));
    }

    #[test]
    fn process_identity_path_is_under_control_root() {
        let root = ControlRoot::new(test_root()).unwrap();
        assert_eq!(
            root.process_identity_path(),
            test_root().join("process-identity.json")
        );
    }

    #[test]
    fn protocol_identity_path_is_under_control_root() {
        let root = ControlRoot::new(test_root()).unwrap();
        assert_eq!(
            root.protocol_identity_path(),
            test_root().join("protocol-identity.json")
        );
    }

    #[test]
    fn lock_path_is_under_control_root() {
        let root = ControlRoot::new(test_root()).unwrap();
        assert_eq!(root.lock_path(), test_root().join("runtime.lock"));
    }

    #[test]
    fn product_id_is_stable() {
        assert_eq!(ControlRoot::PRODUCT_ID, "TyPlus");
    }

    #[test]
    fn control_dir_is_stable() {
        assert_eq!(ControlRoot::CONTROL_DIR, "runtime-control");
    }
}
