use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    validate_frame_size, CancelRequest, CancellationAcknowledgement, IdempotencyPolicy,
    InvocationContext, ProgressEvent, ProtocolError, ProtocolVersion, RequestId, RequestMetadata,
    SessionId, ValidationError, MAX_JSON_DEPTH, MAX_STRING_BYTES, MAX_WARNINGS,
};

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestEnvelope {
    pub protocol_version: ProtocolVersion,
    pub metadata: RequestMetadata,
    pub context: InvocationContext,
    pub method: crate::MethodName,
    pub payload: Value,
}

impl RequestEnvelope {
    pub fn validate(
        &self,
        now_unix_ms: u64,
        idempotency: IdempotencyPolicy,
    ) -> Result<(), ValidationError> {
        let policy = self
            .method
            .canonical()
            .map(|method| method.operation_policy());
        self.metadata.validate(
            now_unix_ms,
            policy.map_or(idempotency, |value| value.idempotency_key),
        )?;
        if let Some(policy) = policy {
            if self.metadata.cancellable != policy.cancellable {
                return Err(ValidationError::InvalidFormat {
                    field: "metadata.cancellable",
                });
            }
        }
        self.context
            .validate_for_session(&self.metadata.session_id)?;
        validate_json_value(&self.payload, 0)?;
        if self.method.canonical() == Some(crate::CanonicalMethod::HostPluginEffectScan) {
            let request: crate::PluginEffectScanRequest =
                serde_json::from_value(self.payload.clone())
                    .map_err(|_| ValidationError::InvalidFormat { field: "payload" })?;
            request.validate()?;
        }
        Ok(())
    }
}

/// Strict method-owned query payload for canonical online operations.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct OnlineCatalogQuery {
    pub q: Option<String>,
    pub category: Option<String>,
    pub tag: Option<String>,
    pub platform: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OnlineSignedDownload {
    pub url: String,
    pub sha256: String,
    pub expires_in: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OnlineDownloadRequest {
    pub signed: Option<OnlineSignedDownload>,
    pub preset_id: Option<String>,
    pub destination: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OnlineCatalogSearchItem {
    pub preset_id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tag: Option<Vec<String>>,
    pub platform: Option<String>,
    pub version: Option<String>,
    pub notion_page_url: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OnlineCatalogSearchResult {
    pub items: Vec<OnlineCatalogSearchItem>,
}

/// Connectivity status payload for `online.connectivity.check`.
///
/// Mirrors the typed `ConnectivityStatus` from `ty_plus_online::connectivity`
/// but uses snake_case wire fields and an `error_message` option so it can be
/// serialized as part of the generated schema and re-imported by the
/// TypeScript runtime gateway.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "snake_case")]
pub struct ConnectivityStatusDto {
    pub state: String,
    pub label: String,
    pub checked_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OnlineCacheWriteRequest {
    pub query: OnlineCatalogQuery,
    pub result: OnlineCatalogSearchResult,
}

/// Cache-lookup request payload for the host thumbnail resolver.
///
/// Identifies the source media by its host-stable identity triple so the
/// runtime can answer whether a cached thumbnail exists without re-reading
/// the source bytes.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LookupThumbnailRequest {
    pub source_path: String,
    pub mtime_ms: i64,
    pub size_bytes: u64,
    pub file_type: String,
}

/// Cache-lookup response payload for the host thumbnail resolver.
///
/// `cache_path` is `None` when no cached thumbnail exists yet for the
/// requested identity. `animated_source_path` is set when the source is an
/// animated media file that the caller may render directly.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LookupThumbnailResponse {
    pub cache_path: Option<String>,
    pub animated_source_path: Option<String>,
}

/// Thumbnail-generation request payload for the host thumbnail resolver.
///
/// Mirrors `LookupThumbnailRequest` so callers can route lookup and generate
/// through the same identity triple.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GenerateThumbnailRequest {
    pub source_path: String,
    pub mtime_ms: i64,
    pub size_bytes: u64,
    pub file_type: String,
}

/// Thumbnail-generation response payload for the host thumbnail resolver.
///
/// `cache_path` is always populated after a successful generation. The
/// generation is idempotent over `(mtime, size, sha256)`, so a retry that
/// observes the same identity triple writes the same bytes back.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GenerateThumbnailResponse {
    pub cache_path: String,
    pub animated_source_path: Option<String>,
}

/// Combined lookup-or-generate request payload for the host thumbnail resolver.
///
/// Merges `LookupThumbnailRequest` and `GenerateThumbnailRequest` into a
/// single IPC call so the React side avoids the two-round-trip pattern
/// on cache misses (THB-PERF-001).
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LookupOrGenerateThumbnailRequest {
    pub source_path: String,
    pub mtime_ms: i64,
    pub size_bytes: u64,
    pub file_type: String,
}

/// Combined lookup-or-generate response payload for the host thumbnail resolver.
///
/// `cache_path` is always populated after a successful lookup or generation.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LookupOrGenerateThumbnailResponse {
    pub cache_path: String,
    pub animated_source_path: Option<String>,
}

/// Batch thumbnail request payload for processing multiple thumbnails
/// in a single IPC call (THB-PERF-002).
///
/// Each item in `requests` uses the same shape as `LookupOrGenerateThumbnailRequest`.
/// The worker processes all items in parallel using a thread pool.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatchThumbnailRequest {
    pub requests: Vec<LookupOrGenerateThumbnailRequest>,
}

/// Batch thumbnail response payload (THB-PERF-002).
///
/// Results are in the same order as the input requests. Items that
/// failed generation contain an `error` string instead of `cache_path`.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatchThumbnailResponse {
    pub results: Vec<BatchThumbnailResult>,
}

/// A single result within a batch thumbnail response.
#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatchThumbnailResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub animated_source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcceptedEvent {
    pub request_id: RequestId,
    pub session_id: SessionId,
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Warning {
    pub code: String,
    pub user_safe_detail: String,
}

impl Warning {
    pub fn new(
        code: impl Into<String>,
        user_safe_detail: impl Into<String>,
    ) -> Result<Self, ValidationError> {
        let code = code.into();
        let user_safe_detail = user_safe_detail.into();
        crate::validation::validate_qualified_name("warning.code", &code, 128)?;
        crate::validation::validate_bounded_text(
            "warning.user_safe_detail",
            &user_safe_detail,
            MAX_STRING_BYTES,
        )?;
        Ok(Self {
            code,
            user_safe_detail,
        })
    }

    fn validate(&self) -> Result<(), ValidationError> {
        crate::validation::validate_qualified_name("warning.code", &self.code, 128)?;
        crate::validation::validate_bounded_text(
            "warning.user_safe_detail",
            &self.user_safe_detail,
            MAX_STRING_BYTES,
        )
    }
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum ResponseOutcome {
    Success {
        payload: Value,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        warnings: Vec<Warning>,
    },
    Failure {
        error: ProtocolError,
    },
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResponseEnvelope {
    pub protocol_version: ProtocolVersion,
    pub request_id: RequestId,
    pub session_id: SessionId,
    pub outcome: ResponseOutcome,
}

impl ResponseEnvelope {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match &self.outcome {
            ResponseOutcome::Success { payload, warnings } => {
                if warnings.len() > MAX_WARNINGS {
                    return Err(ValidationError::TooManyWarnings {
                        max: MAX_WARNINGS,
                        actual: warnings.len(),
                    });
                }
                for warning in warnings {
                    warning.validate()?;
                }
                validate_json_value(payload, 0)
            }
            ResponseOutcome::Failure { error } => crate::validation::validate_bounded_text(
                "error.user_safe_detail",
                &error.user_safe_detail,
                MAX_STRING_BYTES,
            ),
        }
    }
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "event",
    content = "data",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum EventPayload {
    Accepted(AcceptedEvent),
    Progress(ProgressEvent),
    CancellationAcknowledged(CancellationAcknowledgement),
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventEnvelope {
    pub protocol_version: ProtocolVersion,
    pub session_id: SessionId,
    pub request_id: RequestId,
    pub payload: EventPayload,
}

impl EventEnvelope {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match &self.payload {
            EventPayload::Accepted(accepted) => {
                if accepted.request_id != self.request_id || accepted.session_id != self.session_id
                {
                    return Err(ValidationError::InvalidFormat {
                        field: "accepted.identity",
                    });
                }
                Ok(())
            }
            EventPayload::Progress(progress) => progress.validate(),
            EventPayload::CancellationAcknowledged(_) => Ok(()),
        }
    }
}

#[cfg_attr(feature = "schema-generation", derive(schemars::JsonSchema))]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "message",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum WireMessage {
    Request(RequestEnvelope),
    Cancel(CancelRequest),
    Response(ResponseEnvelope),
    Event(EventEnvelope),
}

impl WireMessage {
    pub fn decode_json_frame(bytes: &[u8]) -> Result<Self, WireDecodeError> {
        validate_frame_size(bytes.len()).map_err(WireDecodeError::Validation)?;
        let message: Self = serde_json::from_slice(bytes).map_err(WireDecodeError::Json)?;
        message
            .validate_structure()
            .map_err(WireDecodeError::Validation)?;
        Ok(message)
    }

    pub fn validate_structure(&self) -> Result<(), ValidationError> {
        match self {
            Self::Request(request) => {
                request
                    .context
                    .validate_for_session(&request.metadata.session_id)?;
                validate_json_value(&request.payload, 0)
            }
            Self::Cancel(_) => Ok(()),
            Self::Response(response) => response.validate(),
            Self::Event(event) => event.validate(),
        }
    }
}

#[derive(Debug)]
pub enum WireDecodeError {
    Validation(ValidationError),
    Json(serde_json::Error),
}

impl fmt::Display for WireDecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation(error) => write!(formatter, "wire validation failed: {error}"),
            Self::Json(_) => formatter.write_str("wire JSON is invalid"),
        }
    }
}

impl std::error::Error for WireDecodeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Validation(error) => Some(error),
            Self::Json(error) => Some(error),
        }
    }
}

fn validate_json_value(value: &Value, depth: usize) -> Result<(), ValidationError> {
    if depth > MAX_JSON_DEPTH {
        return Err(ValidationError::JsonNestingTooDeep {
            max_depth: MAX_JSON_DEPTH,
        });
    }
    match value {
        Value::String(text) => {
            crate::validation::validate_bounded_text("payload.string", text, MAX_STRING_BYTES)
        }
        Value::Array(items) => {
            for item in items {
                validate_json_value(item, depth + 1)?;
            }
            Ok(())
        }
        Value::Object(entries) => {
            for (key, value) in entries {
                crate::validation::validate_bounded_text("payload.key", key, MAX_STRING_BYTES)?;
                validate_json_value(value, depth + 1)?;
            }
            Ok(())
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversized_frames_are_rejected_before_json_parsing() {
        let oversized = vec![b' '; crate::MAX_FRAME_BYTES + 1];
        assert!(matches!(
            WireMessage::decode_json_frame(&oversized),
            Err(WireDecodeError::Validation(
                ValidationError::FrameTooLarge { .. }
            ))
        ));
    }

    #[test]
    fn oversized_nested_strings_are_rejected() {
        let response = ResponseEnvelope {
            protocol_version: crate::CURRENT_PROTOCOL_VERSION,
            request_id: RequestId::parse("request-1").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
            outcome: ResponseOutcome::Success {
                payload: Value::String("x".repeat(MAX_STRING_BYTES + 1)),
                warnings: Vec::new(),
            },
        };
        assert!(matches!(
            response.validate(),
            Err(ValidationError::TooLong {
                field: "payload.string",
                ..
            })
        ));
    }

    #[test]
    fn excessively_nested_payloads_are_rejected() {
        let mut payload = Value::Null;
        for _ in 0..=MAX_JSON_DEPTH {
            payload = serde_json::json!([payload]);
        }
        let response = ResponseEnvelope {
            protocol_version: crate::CURRENT_PROTOCOL_VERSION,
            request_id: RequestId::parse("request-1").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
            outcome: ResponseOutcome::Success {
                payload,
                warnings: Vec::new(),
            },
        };
        assert!(matches!(
            response.validate(),
            Err(ValidationError::JsonNestingTooDeep { .. })
        ));
    }

    #[test]
    fn unknown_fields_and_message_kinds_fail_closed() {
        assert!(WireMessage::decode_json_frame(br#"{"kind":"mystery","message":{}}"#).is_err());
        assert!(
            serde_json::from_str::<ProtocolVersion>(r#"{"major":1,"minor":0,"patch":1}"#).is_err()
        );
    }
}
