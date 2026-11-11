//! Product HTTP, catalog, synchronization, and download operations.
//!
//! Licensing policy and persistent storage remain in their owning crates.

pub mod catalog;
pub mod config;
pub mod connectivity;
pub mod download;
pub mod offline;
pub mod search_cache;

/// Stable identifier for this crate's architectural responsibility.
pub const RESPONSIBILITY: &str = "product network and download operations";

/// Marker for online-owned operations while concrete clients are introduced.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct OnlineBoundary;

impl OnlineBoundary {
    /// Creates an online boundary without starting network activity.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }
}

#[cfg(test)]
mod tests {
    use super::{OnlineBoundary, RESPONSIBILITY};

    #[test]
    fn construction_does_not_require_connectivity() {
        assert_eq!(OnlineBoundary::new(), OnlineBoundary);
        assert_eq!(RESPONSIBILITY, "product network and download operations");
    }
}
