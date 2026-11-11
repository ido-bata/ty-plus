//! Wire contracts shared by the runtime and its clients.
//!
//! Domain behavior does not belong here. This crate owns only the versioned
//! messages and validation rules that cross the IPC boundary.

mod error;
mod host_context;
mod limits;
mod message;
mod metadata;
mod scan;
#[cfg(feature = "schema-generation")]
pub mod schema;
mod task;
mod validation;
mod version;

pub use error::{ProtocolError, StableErrorCode};
pub use host_context::{
    HostContext, InvocationContext, ManagedRootContext, MAX_HOST_CONTEXT_PATH_BYTES,
};
pub use limits::{
    validate_frame_size, validate_pending_queue, UnknownMethodBudget, MAX_FRAME_BYTES,
    MAX_JSON_DEPTH, MAX_PENDING_REQUESTS, MAX_STRING_BYTES, MAX_UNKNOWN_METHODS_PER_SESSION,
    MAX_WARNINGS,
};
pub use message::{
    AcceptedEvent, BatchThumbnailRequest, BatchThumbnailResponse, BatchThumbnailResult,
    ConnectivityStatusDto, EventEnvelope, EventPayload, GenerateThumbnailRequest,
    GenerateThumbnailResponse, LookupOrGenerateThumbnailRequest, LookupOrGenerateThumbnailResponse,
    LookupThumbnailRequest, LookupThumbnailResponse, OnlineCacheWriteRequest, OnlineCatalogQuery,
    OnlineCatalogSearchItem, OnlineCatalogSearchResult, OnlineDownloadRequest,
    OnlineSignedDownload, RequestEnvelope, ResponseEnvelope, ResponseOutcome, Warning,
    WireDecodeError, WireMessage,
};
pub use metadata::{
    CanonicalMethod, CanonicalOperationPolicy, DeadlineUnixMs, DiagnosticId, IdempotencyKey,
    IdempotencyPolicy, MethodName, RequestId, RequestMetadata, RetryClass, SessionId,
    MAX_DEADLINE_HORIZON_MS, MAX_IDEMPOTENCY_KEY_BYTES, MAX_IDENTIFIER_BYTES,
    MAX_METHOD_NAME_BYTES,
};
pub use scan::{
    PluginEffectScanRequest, PluginEffectScanResult, PluginEffectScanRow, MAX_SCAN_ROOTS,
    MAX_SCAN_ROOT_PATH_BYTES,
};
pub use task::{
    CancelRequest, CancellationAcknowledgement, CancellationDecision, ProgressEvent, ProgressStage,
    ProgressState,
};
pub use validation::ValidationError;
pub use version::{
    CapabilityName, CapabilitySet, NegotiatedProtocol, ProtocolCompatibility, ProtocolVersion,
    CURRENT_PROTOCOL_VERSION, MAX_CAPABILITIES, MAX_CAPABILITY_NAME_BYTES,
};

/// Stable identifier for this crate's architectural responsibility.
pub const RESPONSIBILITY: &str = "versioned IPC contracts";

/// Marker for the protocol boundary while concrete wire types are introduced.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct ProtocolBoundary;

impl ProtocolBoundary {
    /// Creates the protocol boundary without selecting a transport.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }
}

#[cfg(test)]
mod tests {
    use super::{ProtocolBoundary, RESPONSIBILITY};

    #[test]
    fn boundary_does_not_claim_transport_ownership() {
        assert_eq!(ProtocolBoundary::new(), ProtocolBoundary);
        assert_eq!(RESPONSIBILITY, "versioned IPC contracts");
    }
}
