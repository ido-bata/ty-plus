//! Filesystem operations scoped to an After Effects host session.
//!
//! `appRoot` discovery is intentionally absent. A later host-context operation
//! will supply roots obtained from the active After Effects ExtendScript side.

/// Embedded DejaVu Sans Mono font (OFL) for thumbnail text rendering.
///
/// Note: the entire font is compiled into every consumer binary
/// (~340 KB). Add new embedded assets with that cost in mind.
pub const DEJAVU_SANS_MONO_BYTES: &[u8] = include_bytes!("../assets/DejaVuSansMono.ttf");

pub mod context;
pub mod paths;
pub mod platform;
pub mod scan;
pub mod thumbnails;

pub use context::{SessionContext, SessionContextError, SessionContextStore, SessionId};

#[cfg(test)]
pub mod test_support;
use platform::PlatformImplementation;
pub use scan::HostScanRoot;

/// Stable identifier for this crate's architectural responsibility.
pub const RESPONSIBILITY: &str = "session-scoped After Effects filesystem operations";

/// Host context payload from After Effects ExtendScript.
///
/// This struct contains the application root and support root paths
/// derived from ExtendScript's `app.path`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostContext {
    /// Application root path from ExtendScript's `app.path`.
    pub app_root: String,
    /// Application support root path.
    pub support_root: String,
    /// After Effects version string (for diagnostics only).
    pub ae_version: String,
    /// Session identifier for this AE instance.
    pub session_id: String,
}

impl HostContext {
    /// Creates a new host context.
    #[must_use]
    pub fn new(
        app_root: impl Into<String>,
        support_root: impl Into<String>,
        ae_version: impl Into<String>,
        session_id: impl Into<String>,
    ) -> Self {
        Self {
            app_root: app_root.into(),
            support_root: support_root.into(),
            ae_version: ae_version.into(),
            session_id: session_id.into(),
        }
    }

    /// Returns the app root path.
    #[must_use]
    pub fn app_root(&self) -> &str {
        &self.app_root
    }

    /// Returns the support root path.
    #[must_use]
    pub fn support_root(&self) -> &str {
        &self.support_root
    }

    /// Returns the AE version.
    #[must_use]
    pub fn ae_version(&self) -> &str {
        &self.ae_version
    }

    /// Returns the session ID.
    #[must_use]
    pub fn session_id(&self) -> &str {
        &self.session_id
    }
}

/// Composition root for host-filesystem operations on the current OS.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HostFilesystemBoundary {
    platform: PlatformImplementation,
}

impl HostFilesystemBoundary {
    /// Selects the complete Windows or macOS implementation at compile time.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            platform: platform::current(),
        }
    }

    /// Reports the selected implementation for diagnostics and contract tests.
    #[must_use]
    pub const fn platform(self) -> PlatformImplementation {
        self.platform
    }
}

impl Default for HostFilesystemBoundary {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        platform::SupportedPlatform, HostContext, HostFilesystemBoundary, DEJAVU_SANS_MONO_BYTES,
    };

    #[test]
    fn current_boundary_uses_the_compile_time_platform() {
        assert_eq!(
            HostFilesystemBoundary::new().platform().platform(),
            SupportedPlatform::CURRENT
        );
    }

    #[test]
    fn host_context_creation() {
        let ctx = HostContext::new("/app", "/support", "24.0.0", "session-1");
        assert_eq!(ctx.app_root(), "/app");
        assert_eq!(ctx.support_root(), "/support");
        assert_eq!(ctx.ae_version(), "24.0.0");
        assert_eq!(ctx.session_id(), "session-1");
    }

    #[test]
    fn dejavu_sans_mono_bytes_are_a_non_empty_true_type_font() {
        // TrueType magic bytes: 0x00 0x01 0x00 0x00 (or OTTO for CFF).
        assert!(
            DEJAVU_SANS_MONO_BYTES.len() > 1024,
            "embedded font is implausibly small ({} bytes)",
            DEJAVU_SANS_MONO_BYTES.len()
        );
        let magic = &DEJAVU_SANS_MONO_BYTES[..4];
        assert!(
            magic == b"\x00\x01\x00\x00" || magic == b"OTTO",
            "embedded font does not start with a TrueType or OpenType magic: {magic:?}"
        );
    }
}
