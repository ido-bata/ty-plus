//! aescripts license state and periodic validation policy.
//!
//! This crate is separate from general online operations so local feature
//! availability cannot accidentally become a network concern.

/// Stable identifier for this crate's architectural responsibility.
pub const RESPONSIBILITY: &str = "aescripts licensing policy and state";

/// Marker for licensing-owned operations while the vendor contract is pending.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct LicensingBoundary;

impl LicensingBoundary {
    /// Creates a boundary without performing online validation.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }
}

#[cfg(test)]
mod tests {
    use super::{LicensingBoundary, RESPONSIBILITY};

    #[test]
    fn construction_does_not_require_connectivity() {
        assert_eq!(LicensingBoundary::new(), LicensingBoundary);
        assert_eq!(RESPONSIBILITY, "aescripts licensing policy and state");
    }
}
