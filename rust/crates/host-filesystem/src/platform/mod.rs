//! Adjacent implementations for host-filesystem platform differences.

// Both concrete modules stay compiled so cross-target contract checks can
// select either implementation; the inactive module has no runtime users.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod macos;
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
mod windows;

#[cfg(target_os = "macos")]
pub use macos::{
    commit_sequence, ensure_directory, exclusive_open, list_directory, list_journals,
    preflight_directory_all, preflight_entry, read_entry, remove_directory, remove_directory_all,
    remove_entry, transaction_open, PlatformLockHandle, PlatformTransactionHandle,
};
#[cfg(target_os = "windows")]
pub use windows::{
    commit_sequence, ensure_directory, exclusive_open, list_directory, list_journals,
    preflight_directory_all, preflight_entry, read_entry, remove_directory, remove_directory_all,
    remove_entry, transaction_open, PlatformLockHandle, PlatformTransactionHandle,
};

/// Platforms supported by the product runtime.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupportedPlatform {
    /// Microsoft Windows.
    Windows,
    /// Apple macOS.
    Macos,
}

impl SupportedPlatform {
    /// Platform selected by the current compilation target.
    #[cfg(target_os = "windows")]
    pub const CURRENT: Self = Self::Windows;

    /// Platform selected by the current compilation target.
    #[cfg(target_os = "macos")]
    pub const CURRENT: Self = Self::Macos;
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
compile_error!("ty-plus-host-filesystem supports only Windows and macOS product targets");

/// Selected implementation of the host-filesystem operation boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlatformImplementation {
    platform: SupportedPlatform,
}

impl PlatformImplementation {
    const fn new(platform: SupportedPlatform) -> Self {
        Self { platform }
    }

    /// Returns the platform implemented by this boundary.
    #[must_use]
    pub const fn platform(self) -> SupportedPlatform {
        self.platform
    }
}

/// Selects a platform implementation. Both match arms are concrete modules;
/// there is deliberately no unsupported or legacy fallback branch.
#[must_use]
pub const fn implementation_for(platform: SupportedPlatform) -> PlatformImplementation {
    match platform {
        SupportedPlatform::Windows => windows::implementation(),
        SupportedPlatform::Macos => macos::implementation(),
    }
}

/// Selects the implementation for the current compilation target.
#[must_use]
pub const fn current() -> PlatformImplementation {
    implementation_for(SupportedPlatform::CURRENT)
}

#[cfg(test)]
mod tests {
    use super::{implementation_for, SupportedPlatform};

    #[test]
    fn every_supported_platform_selects_its_adjacent_module() {
        for platform in [SupportedPlatform::Windows, SupportedPlatform::Macos] {
            assert_eq!(implementation_for(platform).platform(), platform);
        }
    }
}
