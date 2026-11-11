//! JSON envelope used for every CLI response.
//!
//! The CEP panel parses this verbatim; the shape is the contract between Rust
//! and TypeScript. See `tools/ty-plus-cli/README.md` for the field rules.

use serde::{Deserialize, Serialize};

use crate::error::{TyPlusError, TyPlusResult};
use crate::CLI_VERSION;

/// Stable JSON envelope. `data` carries the subcommand-specific payload;
/// `warnings` collects non-fatal issues (e.g. "skipped unreadable file X")
/// so the panel can still render the result.
#[derive(Debug, Serialize, Deserialize)]
pub struct Envelope<T> {
    /// Always present. The panel reads this before unpacking the rest.
    pub ok: bool,

    /// CLI version that produced this envelope. The panel can flag a
    /// mismatch without parsing the rest.
    pub version: &'static str,

    /// Payload. Only meaningful when `ok` is true.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub data: Option<T>,

    /// Non-fatal issues. Empty when nothing to report. The panel may surface
    /// these as a toast but does not abort on them.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,

    /// Structured failure. Only meaningful when `ok` is false.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub error: Option<ErrorBody>,
}

/// Body of the `error` field when `ok` is false.
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorBody {
    /// Stable machine-readable tag (see `TyPlusError::code`).
    pub code: String,

    /// Human-readable message. Already localized — English only for now;
    /// localization is a panel concern, not a CLI concern.
    pub message: String,
}

impl<T: Serialize> Envelope<T> {
    /// Wrap a successful result. `warnings` starts empty.
    pub fn ok(data: T) -> Self {
        Self {
            ok: true,
            version: CLI_VERSION,
            data: Some(data),
            warnings: Vec::new(),
            error: None,
        }
    }

    /// Wrap a successful result with non-fatal warnings.
    pub fn ok_with_warnings(data: T, warnings: Vec<String>) -> Self {
        Self {
            ok: true,
            version: CLI_VERSION,
            data: Some(data),
            warnings,
            error: None,
        }
    }

    /// Serialize to a JSON string with a trailing newline. Trailing newline
    /// matters because `execFileSync` consumers sometimes lose the last line
    /// without one.
    pub fn to_json_string(&self) -> TyPlusResult<String> {
        let s = serde_json::to_string(self)?;
        Ok(format!("{s}\n"))
    }
}

impl Envelope<()> {
    /// Wrap an error.
    pub fn err(err: &TyPlusError) -> Self {
        Self {
            ok: false,
            version: CLI_VERSION,
            data: None,
            warnings: Vec::new(),
            error: Some(ErrorBody {
                code: err.code().to_string(),
                message: err.to_string(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct Sample {
        n: i32,
    }

    #[test]
    fn ok_envelope_serializes_data_and_version() {
        let env: Envelope<Sample> = Envelope::ok(Sample { n: 42 });
        let s = env.to_json_string().unwrap();
        assert!(s.contains("\"ok\":true"));
        assert!(s.contains("\"version\":\"0.1.0\""));
        assert!(s.contains("\"n\":42"));
        assert!(!s.contains("\"error\""));
        assert!(s.ends_with('\n'));
    }

    #[test]
    fn err_envelope_omits_data_and_carries_code() {
        let e = TyPlusError::Data("missing".into());
        let env: Envelope<()> = Envelope::err(&e);
        let s = env.to_json_string().unwrap();
        assert!(s.contains("\"ok\":false"));
        assert!(s.contains("\"code\":\"DATA\""));
        assert!(s.contains("missing"));
        assert!(!s.contains("\"data\""));
    }

    #[test]
    fn warnings_array_omitted_when_empty() {
        let env: Envelope<Sample> = Envelope::ok(Sample { n: 1 });
        let s = env.to_json_string().unwrap();
        assert!(!s.contains("warnings"));
    }
}
