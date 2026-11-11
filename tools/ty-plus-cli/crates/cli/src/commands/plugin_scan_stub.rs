//! Stub for `ty-plus plugin scan`. The real implementation lives in the
//! future `ty-plus-plugin` crate (see `tools/ty-plus-cli/README.md`). For
//! now we accept the argument and return a "not yet implemented" error so
//! `clap` parsing and the dispatch path can be exercised in CI.
//!
//! Marked `#[command(hide = true)]` in `main.rs` so it does not appear in
//! `ty-plus --help`. CI flips the visibility via a feature flag in the
//! follow-up that adds the `ty-plus-plugin` crate.

use std::path::Path;

use ty_plus_core::error::{TyPlusError, TyPlusResult};
use ty_plus_core::json::Envelope;

pub fn run(_root: &Path) -> TyPlusResult<Envelope<serde_json::Value>> {
    Err(TyPlusError::Data(
        "plugin scan is not implemented yet; see tools/ty-plus-cli/README.md".to_string(),
    ))
}
