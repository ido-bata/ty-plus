//! Test support for the `host-filesystem` crate.
//!
//! Provides fakes for production types that tests need to construct
//! without touching the host (After Effects) or the real filesystem.

use std::path::PathBuf;

use crate::context::SessionContext;

/// A test fake for [`SessionContext`].
///
/// Wraps a real [`SessionContext`] so it can flow through the same
/// production APIs (e.g. [`crate::thumbnails::cache_root::resolve_cache_root`])
/// while controlling the managed-root path and the writability probe
/// outcome without any real I/O.
pub struct FakeSessionContext(SessionContext);

impl FakeSessionContext {
    /// Builds a fake session whose managed root is reported as writable.
    pub fn managed_writable(path: impl Into<PathBuf>) -> Self {
        let ctx = SessionContext::new(Some(path.into())).with_managed_writable_override(true);
        Self(ctx)
    }

    /// Builds a fake session whose managed root is reported as not writable.
    pub fn managed_readonly(path: impl Into<PathBuf>) -> Self {
        let ctx = SessionContext::new(Some(path.into())).with_managed_writable_override(false);
        Self(ctx)
    }
}

impl From<FakeSessionContext> for SessionContext {
    fn from(fake: FakeSessionContext) -> Self {
        fake.0
    }
}
