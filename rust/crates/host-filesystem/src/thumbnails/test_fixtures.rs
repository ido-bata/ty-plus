//! Test-only helpers for loading thumbnail pipeline fixtures from disk.
//!
//! Fixtures live under `tests/fixtures/thumbnails/` at the crate root.

/// Load the bytes of a fixture file by name.
///
/// Panics if the fixture is missing — fixtures are committed to the repo
/// and a missing one is a test wiring bug, not a runtime condition.
pub fn fixture_bytes(name: &str) -> Vec<u8> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/thumbnails")
        .join(name);
    std::fs::read(&path).unwrap_or_else(|e| panic!("missing fixture {name}: {e}"))
}
