//! Composition root for the long-lived ty-plus companion runtime.
//!
//! The process transport and lifecycle are added in the IPC phase. This
//! skeleton neither parses CLI operations nor emits stdout response envelopes.

pub mod codec;
pub mod dispatcher;
pub mod handshake;
pub mod online_dispatch;
pub mod platform;
pub mod preset_install;
pub mod session;
pub mod transport;

use ty_plus_host_filesystem::HostFilesystemBoundary;
use ty_plus_online::OnlineBoundary;
use ty_plus_protocol::ProtocolBoundary;
use ty_plus_storage::{PersistenceIoHandler, StorageBoundary};

/// Responsibility crates composed by the runtime application.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeComposition {
    /// Versioned IPC contract boundary.
    pub protocol: ProtocolBoundary,
    /// Managed storage boundary.
    pub storage: StorageBoundary,
    /// Product network boundary.
    pub online: OnlineBoundary,
    /// Session-scoped After Effects filesystem boundary.
    pub host_filesystem: HostFilesystemBoundary,
}

impl RuntimeComposition {
    /// Composes all responsibility crates without performing I/O.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            protocol: ProtocolBoundary::new(),
            storage: StorageBoundary::new(),
            online: OnlineBoundary::new(),
            host_filesystem: HostFilesystemBoundary::new(),
        }
    }
}

/// Creates a persistence I/O handler for the given root directory.
pub fn create_persistence_handler(root: String) -> PersistenceIoHandler {
    PersistenceIoHandler::new(root)
}

#[cfg(test)]
mod tests {
    use super::RuntimeComposition;
    use ty_plus_host_filesystem::platform::SupportedPlatform;

    #[test]
    fn composition_selects_the_current_host_filesystem_implementation() {
        assert_eq!(
            RuntimeComposition::new()
                .host_filesystem
                .platform()
                .platform(),
            SupportedPlatform::CURRENT
        );
    }
}
