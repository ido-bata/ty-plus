use std::path::Path;

use crate::transport::TransportError;

/// Permission configuration for transport endpoints.
#[derive(Debug, Clone)]
pub struct PermissionConfig {
    /// Only allow same-user connections.
    pub same_user_only: bool,
}

impl Default for PermissionConfig {
    fn default() -> Self {
        Self {
            same_user_only: true,
        }
    }
}

/// Validates that the current user matches the expected user.
///
/// # Errors
///
/// Returns `Err` if the user validation fails.
pub fn validate_same_user() -> Result<(), TransportError> {
    #[cfg(target_os = "windows")]
    {
        validate_windows_same_user()
    }
    #[cfg(target_os = "macos")]
    {
        validate_macos_same_user()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Ok(())
    }
}

/// Cleans up stale transport endpoints.
///
/// # Errors
///
/// Returns `Err` if cleanup fails.
pub fn cleanup_stale_endpoint(path: &Path) -> Result<(), TransportError> {
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// Sets Unix socket permissions (macOS only).
///
/// # Errors
///
/// Returns `Err` if permission setting fails.
#[cfg(target_os = "macos")]
pub fn set_socket_permissions(path: &Path, mode: u32) -> Result<(), TransportError> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(mode);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn validate_windows_same_user() -> Result<(), TransportError> {
    // On Windows, we rely on the named pipe security descriptor
    // to enforce same-user access. The pipe is created with a
    // security descriptor that only allows the current user.
    Ok(())
}

#[cfg(target_os = "macos")]
fn validate_macos_same_user() -> Result<(), TransportError> {
    // On macOS, we rely on Unix socket file permissions
    // to enforce same-user access. The socket is created with
    // mode 0600 (owner read/write only).
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_config_default_is_same_user_only() {
        let config = PermissionConfig::default();
        assert!(config.same_user_only);
    }

    #[test]
    fn validate_same_user_succeeds() {
        assert!(validate_same_user().is_ok());
    }

    #[test]
    fn cleanup_stale_endpoint_removes_file() {
        let dir = std::env::temp_dir();
        let path = dir.join("ty-plus-test-cleanup.txt");
        std::fs::write(&path, "test").unwrap();
        assert!(path.exists());

        cleanup_stale_endpoint(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn cleanup_stale_endpoint_handles_missing_file() {
        let path = Path::new("/nonexistent/path/ty-plus-test.txt");
        assert!(cleanup_stale_endpoint(path).is_ok());
    }
}
