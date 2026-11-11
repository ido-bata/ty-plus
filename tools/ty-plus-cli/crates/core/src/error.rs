//! Unified error type. Every crate in this workspace returns [`TyPlusResult`]
//! so that the CLI can format failures with a stable JSON envelope and exit
//! code without each subcommand re-implementing error mapping.
//!
//! The error variants are intentionally broad. Domain crates wrap their
//! library errors into the closest variant and preserve the source via
//! `#[source]`. The CLI never matches on a variant — it just serializes the
//! [`Display`] text and the `code` field for the panel to inspect.

use std::path::PathBuf;

/// Shorthand used everywhere in the workspace.
pub type TyPlusResult<T> = Result<T, TyPlusError>;

/// Top-level error. Use `thiserror`'s `#[error("...")]` per variant to keep
/// the human message stable; the `code` field is the machine-readable tag.
#[derive(Debug, thiserror::Error)]
pub enum TyPlusError {
    /// The input arguments are invalid (missing, wrong type, out of range).
    /// Exit code 2.
    #[error("invalid usage: {0}")]
    InvalidUsage(String),

    /// A file or directory could not be found, opened, or read.
    /// Exit code 3.
    #[error("io error at {path}: {source}")]
    Io {
        /// Path that produced the error.
        path: PathBuf,
        /// Underlying std::io::Error.
        #[source]
        source: std::io::Error,
    },

    /// The required data is missing or malformed. Examples:
    /// - appRoot not found in the registry
    /// - a JSON file fails schema validation
    /// Exit code 4.
    #[error("data error: {0}")]
    Data(String),

    /// JSON serialization/deserialization failure. Usually means a panel-side
    /// contract drift; the `code` field tells the panel which schema.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    /// The platform is unsupported for this command (e.g. winreg on Mac).
    #[error("unsupported platform: {0}")]
    UnsupportedPlatform(String),

    /// Catch-all for unexpected internal failures.
    #[error("internal error: {0}")]
    Internal(String),
}

impl TyPlusError {
    /// Stable machine-readable tag. The panel switches on this string, so it
    /// must never change without bumping the CLI version + updating the panel.
    pub fn code(&self) -> &'static str {
        match self {
            TyPlusError::InvalidUsage(_) => "INVALID_USAGE",
            TyPlusError::Io { .. } => "IO",
            TyPlusError::Data(_) => "DATA",
            TyPlusError::Json(_) => "JSON",
            TyPlusError::UnsupportedPlatform(_) => "UNSUPPORTED_PLATFORM",
            TyPlusError::Internal(_) => "INTERNAL",
        }
    }

    /// Process exit code. Stable contract — the panel uses it to decide
    /// whether to retry, fall back to ExtendScript, or surface the error.
    pub fn exit_code(&self) -> i32 {
        match self {
            TyPlusError::InvalidUsage(_) => 2,
            TyPlusError::Io { .. } => 3,
            TyPlusError::Data(_) => 4,
            TyPlusError::Json(_) => 4,
            TyPlusError::UnsupportedPlatform(_) => 2,
            TyPlusError::Internal(_) => 1,
        }
    }
}

impl From<std::io::Error> for TyPlusError {
    fn from(e: std::io::Error) -> Self {
        TyPlusError::Io {
            path: PathBuf::new(),
            source: e,
        }
    }
}
