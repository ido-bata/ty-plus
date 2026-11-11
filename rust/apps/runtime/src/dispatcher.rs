//! Request dispatcher for routing incoming requests to handlers.
//!
//! This module provides a simple method-name-to-handler dispatch mechanism.

use serde_json::Value;
use ty_plus_protocol::{
    DiagnosticId, RequestEnvelope, ResponseEnvelope, ResponseOutcome, SessionId, StableErrorCode,
    CURRENT_PROTOCOL_VERSION,
};
use ty_plus_storage::{InvocationId, MutationContext, OperationLock, PersistenceIoHandler};

use crate::online_dispatch::{CatalogSearchRequest, DownloadRequest, OnlineComposition};

/// Errors that can occur during request dispatching.
#[derive(Debug)]
pub enum DispatchError {
    /// Unknown method name.
    UnknownMethod(String),
    /// Handler failed.
    Handler(String),
    /// Invalid request payload.
    InvalidPayload(String),
}

impl std::fmt::Display for DispatchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownMethod(method) => write!(f, "unknown method: {method}"),
            Self::Handler(detail) => write!(f, "handler error: {detail}"),
            Self::InvalidPayload(detail) => write!(f, "invalid payload: {detail}"),
        }
    }
}

impl std::error::Error for DispatchError {}

/// Dispatches a request envelope to the appropriate handler.
///
/// Returns a response envelope that should be sent back to the client.
pub fn dispatch(
    session_id: SessionId,
    request: RequestEnvelope,
    persistence_handler: &PersistenceIoHandler,
    online: &OnlineComposition,
) -> ResponseEnvelope {
    let request_id = request.metadata.request_id;
    let method = request.method.as_str();

    let outcome = match dispatch_inner(
        method,
        request.payload,
        persistence_handler,
        online,
        request_id.to_string(),
    ) {
        Ok(payload) => ResponseOutcome::Success {
            payload,
            warnings: Vec::new(),
        },
        Err(error) => {
            let diagnostic_id = DiagnosticId::parse("diag-dispatch").expect("valid diagnostic ID");
            let protocol_error = ty_plus_protocol::ProtocolError::new(
                StableErrorCode::InternalError,
                false,
                error.to_string(),
                diagnostic_id,
            )
            .expect("failed to create protocol error");
            ResponseOutcome::Failure {
                error: protocol_error,
            }
        }
    };

    ResponseEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        request_id,
        session_id,
        outcome,
    }
}

fn dispatch_inner(
    method: &str,
    payload: Value,
    persistence_handler: &PersistenceIoHandler,
    online: &OnlineComposition,
    invocation: String,
) -> Result<Value, DispatchError> {
    match method {
        "storage.persistence.read-json" => {
            let request: ty_plus_storage::PersistenceReadJsonRequest =
                serde_json::from_value(payload)
                    .map_err(|e| DispatchError::InvalidPayload(e.to_string()))?;
            let response = persistence_handler
                .read_json(request)
                .map_err(|e| DispatchError::Handler(e.to_string()))?;
            serde_json::to_value(response).map_err(|e| DispatchError::Handler(e.to_string()))
        }
        "storage.persistence.read-text" => {
            let request: ty_plus_storage::PersistenceReadTextRequest =
                serde_json::from_value(payload)
                    .map_err(|e| DispatchError::InvalidPayload(e.to_string()))?;
            let response = persistence_handler
                .read_text(request)
                .map_err(|e| DispatchError::Handler(e.to_string()))?;
            serde_json::to_value(response).map_err(|e| DispatchError::Handler(e.to_string()))
        }
        "storage.persistence.write-json" => {
            let request: ty_plus_storage::PersistenceWriteJsonRequest =
                serde_json::from_value(payload)
                    .map_err(|e| DispatchError::InvalidPayload(e.to_string()))?;
            let root = persistence_handler
                .managed_root()
                .map_err(|e| DispatchError::Handler(e.to_string()))?;
            let guard = OperationLock::acquire(
                &root,
                std::time::Instant::now() + std::time::Duration::from_secs(5),
            )
            .map_err(|e| DispatchError::Handler(e.to_string()))?;
            let invocation = InvocationId::new(invocation);
            let context = MutationContext::new(&guard, &invocation);
            persistence_handler
                .write_json_with_context(&context, request)
                .map_err(|e| DispatchError::Handler(e.to_string()))?;
            Ok(serde_json::Value::Null)
        }
        "storage.persistence.remove-json" => {
            let request: ty_plus_storage::PersistenceRemoveJsonRequest =
                serde_json::from_value(payload)
                    .map_err(|e| DispatchError::InvalidPayload(e.to_string()))?;
            let root = persistence_handler
                .managed_root()
                .map_err(|e| DispatchError::Handler(e.to_string()))?;
            let guard = OperationLock::acquire(
                &root,
                std::time::Instant::now() + std::time::Duration::from_secs(5),
            )
            .map_err(|e| DispatchError::Handler(e.to_string()))?;
            let invocation = InvocationId::new(invocation);
            let context = MutationContext::new(&guard, &invocation);
            persistence_handler
                .remove_json_with_context(&context, request)
                .map_err(|e| DispatchError::Handler(e.to_string()))?;
            Ok(serde_json::Value::Null)
        }
        "online.connectivity.check" => {
            let status = online
                .connectivity_check()
                .map_err(DispatchError::Handler)?;
            serde_json::to_value(status).map_err(|e| DispatchError::Handler(e.to_string()))
        }
        "online.catalog.search" => {
            let request: CatalogSearchRequest = serde_json::from_value(payload)
                .map_err(|e| DispatchError::InvalidPayload(e.to_string()))?;
            let root = persistence_handler
                .managed_root()
                .map_err(|e| DispatchError::Handler(e.to_string()))?;
            let guard = OperationLock::acquire(
                &root,
                std::time::Instant::now() + std::time::Duration::from_secs(5),
            )
            .map_err(|e| DispatchError::Handler(e.to_string()))?;
            let invocation = InvocationId::new(invocation);
            let context = MutationContext::new(&guard, &invocation);
            let result = online
                .catalog_search(&request, &context)
                .map_err(DispatchError::Handler)?;
            serde_json::to_value(result).map_err(|e| DispatchError::Handler(e.to_string()))
        }
        "online.download" => {
            let request: DownloadRequest = serde_json::from_value(payload)
                .map_err(|e| DispatchError::InvalidPayload(e.to_string()))?;
            let operation_invocation = InvocationId::new(invocation);
            let result = online
                .download_with_invocation(&request, &operation_invocation)
                .map_err(DispatchError::Handler)?;
            serde_json::to_value(result).map_err(|e| DispatchError::Handler(e.to_string()))
        }
        _ => Err(DispatchError::UnknownMethod(method.to_string())),
    }
}
