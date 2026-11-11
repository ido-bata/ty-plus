//! stdout/stderr conventions for the CLI binary.
//!
//! stdout = JSON envelope only. stderr = human-readable log lines.
//! Exit code = 0 on success, 1+ on failure (see `TyPlusError::exit_code`).
//!
//! The split matters: the panel calls the CLI via
//! `child_process.execFileSync` and parses stdout as JSON. Anything written
//! to stdout that isn't JSON breaks parsing. Logs therefore always go to
//! stderr.

use std::io::{self, Write};

use ty_plus_core::error::{TyPlusError, TyPlusResult};
use ty_plus_core::json::Envelope;

/// Write the envelope as JSON to stdout, with a trailing newline. Flushes
/// before returning so that pipes / `execFileSync` consumers see the full
/// payload.
pub fn write_envelope<T: serde::Serialize>(envelope: &Envelope<T>) {
    match envelope.to_json_string() {
        Ok(s) => {
            // Use a buffered write then explicit flush so that the JSON
            // and any trailing newline reach the kernel buffer atomically.
            let stdout = io::stdout();
            let mut handle = stdout.lock();
            let _ = handle.write_all(s.as_bytes());
            let _ = handle.flush();
        }
        Err(e) => {
            // Serialization failure is a programmer error (the envelope is
            // meant to be infallible). Fall back to a minimal error envelope
            // and exit 1.
            let err: TyPlusError = e.into();
            let err_env: Envelope<()> = Envelope::err(&err);
            if let Ok(s) = err_env.to_json_string() {
                let _ = io::stdout().write_all(s.as_bytes());
            }
            std::process::exit(1);
        }
    }
}

/// Log to stderr. Each call writes one line with a trailing newline.
#[allow(dead_code)] // Reserved for subcommands added in follow-up crates.
pub fn log_warn(message: &str) {
    let _ = writeln!(io::stderr(), "warning: {message}");
}

/// Helper: build an "unsupported platform" error tied to a subcommand name.
/// Avoids each subcommand re-typing the variant.
#[allow(dead_code)] // Reserved for subcommands added in follow-up crates.
pub fn unsupported_platform(subcommand: &str) -> TyPlusResult<()> {
    Err(TyPlusError::UnsupportedPlatform(format!(
        "subcommand '{subcommand}' is not implemented on this platform"
    )))
}
