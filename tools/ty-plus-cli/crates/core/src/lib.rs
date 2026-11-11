//! ty-plus-core
//!
//! Cross-cutting primitives shared by every ty-plus-cli crate. **No domain
//! knowledge lives here.** If a helper needs to know about After Effects,
//! presets, plugins, or fonts, it belongs in `host` / `storage` / `plugin` /
//! `preset` / `font`, not here.
//!
//! The crate exists so that:
//!   1. Every domain crate depends on the same error type, hash function, and
//!      JSON envelope. A single change in `error.rs` reaches all subcommands.
//!   2. Tests of pure helpers (path normalization, hash key derivation) live in
//!      one place rather than scattered across feature crates.

#![deny(unsafe_code)]
#![warn(missing_docs)]

pub mod error;
pub mod hash;
pub mod json;
pub mod paths;

pub use error::{TyPlusError, TyPlusResult};

/// The CLI version. Kept in sync with the ZXP package version (`package.json`
/// `version` field at the repo root). Update in lockstep — the JSON envelope
/// stamps this on every response so the panel can detect mismatches.
///
/// Bumping rule: this string is the `version` field in the JSON envelope. The
/// panel reads it and surfaces a "CLI out of date" warning when it differs
/// from its expectation.
pub const CLI_VERSION: &str = env!("CARGO_PKG_VERSION");
