use serde::{Deserialize, Serialize};

use crate::{DiagnosticId, ValidationError, MAX_STRING_BYTES};

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StableErrorCode {
    InvalidRequest,
    IncompatibleProtocol,
    ProtocolViolation,
    WorkerCrashed,
    WorkerForcedTermination,
    HostContextMissing,
    HostContextStale,
    NotFound,
    AlreadyExists,
    PermissionDenied,
    ElevationDeclined,
    PathOutsideAllowedScope,
    NetworkUnavailable,
    Timeout,
    RemoteRejected,
    IntegrityMismatch,
    StorageCorrupt,
    MigrationRequired,
    Busy,
    Conflict,
    Cancelled,
    InternalError,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProtocolError {
    pub code: StableErrorCode,
    pub retryable: bool,
    pub user_safe_detail: String,
    pub diagnostic_id: DiagnosticId,
}

impl ProtocolError {
    pub fn new(
        code: StableErrorCode,
        retryable: bool,
        user_safe_detail: impl Into<String>,
        diagnostic_id: DiagnosticId,
    ) -> Result<Self, ValidationError> {
        let user_safe_detail = user_safe_detail.into();
        crate::validation::validate_bounded_text(
            "user_safe_detail",
            &user_safe_detail,
            MAX_STRING_BYTES,
        )?;
        Ok(Self {
            code,
            retryable,
            user_safe_detail,
            diagnostic_id,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_error_code_has_a_stable_wire_name() {
        let all = [
            StableErrorCode::InvalidRequest,
            StableErrorCode::IncompatibleProtocol,
            StableErrorCode::ProtocolViolation,
            StableErrorCode::WorkerCrashed,
            StableErrorCode::WorkerForcedTermination,
            StableErrorCode::HostContextMissing,
            StableErrorCode::HostContextStale,
            StableErrorCode::NotFound,
            StableErrorCode::AlreadyExists,
            StableErrorCode::PermissionDenied,
            StableErrorCode::ElevationDeclined,
            StableErrorCode::PathOutsideAllowedScope,
            StableErrorCode::NetworkUnavailable,
            StableErrorCode::Timeout,
            StableErrorCode::RemoteRejected,
            StableErrorCode::IntegrityMismatch,
            StableErrorCode::StorageCorrupt,
            StableErrorCode::MigrationRequired,
            StableErrorCode::Busy,
            StableErrorCode::Conflict,
            StableErrorCode::Cancelled,
            StableErrorCode::InternalError,
        ];
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../tests/fixtures/error-codes.json")).unwrap();
        assert_eq!(serde_json::to_value(all).unwrap(), fixture);
    }

    #[test]
    fn error_detail_is_bounded_and_control_character_free() {
        let diagnostic_id = DiagnosticId::parse("diag-1").unwrap();
        assert!(ProtocolError::new(
            StableErrorCode::InternalError,
            false,
            "x".repeat(MAX_STRING_BYTES + 1),
            diagnostic_id.clone()
        )
        .is_err());
        assert!(ProtocolError::new(
            StableErrorCode::InternalError,
            false,
            "unsafe\nmessage",
            diagnostic_id
        )
        .is_err());
    }
}
