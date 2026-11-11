//! Adjacent implementations for runtime process platform differences.

mod macos;
mod windows;

pub mod control_root;
pub mod endpoint;
pub mod instance_lock;
pub mod permission;
pub mod recovery;

#[cfg(target_os = "windows")]
pub mod windows_transport;

#[cfg(target_os = "macos")]
pub mod macos_transport;

pub use control_root::{
    control_root_for_platform, current_control_root, ControlRoot, ControlRootError,
};
pub use endpoint::{EndpointError, EndpointName};

/// Platforms supported by the companion runtime process.
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
compile_error!("ty-plus-runtime supports only Windows and macOS product targets");

/// Selected process-boundary implementation.
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

/// Selects a concrete process implementation without an unsupported fallback.
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

    #[test]
    fn current_selection_matches_the_compilation_target() {
        assert_eq!(super::current().platform(), SupportedPlatform::CURRENT);
    }
}
