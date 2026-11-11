//! ty-plus-host
//!
//! Resolves After Effects install paths without going through ExtendScript.
//! Mirrors `src/management/ae/filesystem.ts` (host boundary) on the Rust
//! side. The panel still owns the AE-side state, but every "where is AE
//! installed?" probe now lives here.
//!
//! ## What this crate owns
//!
//! - [`app_root`] — find the AE install folder. Replaces the ExtendScript
//!   `Folder.appPackage.parent.absoluteURI` call at
//!   `src/management/setting/onboarding/initialization.ts:39-65`.
//! - [`preset_root`], [`script_root`], [`plugin_root`] — derived from
//!   `appRoot`. Same names as the standard AE layout.
//!
//! ## What this crate does NOT own
//!
//! - Anything inside `appRoot` (`.aex` parsing, preset files, scripts). Those
//!   belong to `plugin` / `preset` / `font` crates.
//! - State that needs `app.project` — still ExtendScript.
//! - UAC / elevation. The panel's `writeFileElevated` paths stay in TS;
//!   Rust only does normal writes.

#![deny(unsafe_code)]
#![warn(missing_docs)]

pub mod app_root;

pub use app_root::{find_app_root, find_app_root_with, AppRootCandidate, AppRootSource};
