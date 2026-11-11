use super::{PlatformImplementation, SupportedPlatform};

pub(super) const fn implementation() -> PlatformImplementation {
    PlatformImplementation::new(SupportedPlatform::Windows)
}
