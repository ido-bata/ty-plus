//! Main entry point for the ty-plus runtime.
//!
//! This binary reads newline-delimited JSON requests from stdin,
//! dispatches them to handlers, and writes responses to stdout.

use std::io::{self, BufRead, Write};

use serde_json::Value;
use ty_plus_protocol::{
    DiagnosticId, RequestEnvelope, ResponseEnvelope, ResponseOutcome, SessionId, StableErrorCode,
    CURRENT_PROTOCOL_VERSION,
};
use ty_plus_runtime::dispatcher;
use ty_plus_runtime::online_dispatch::OnlineComposition;
use ty_plus_storage::PersistenceIoHandler;

fn main() -> io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let root = args.get(1).map_or_else(
        || {
            eprintln!("Usage: ty-plus-runtime <storage-root>");
            eprintln!("  <storage-root>: Path to the managed storage root directory");
            std::process::exit(1);
        },
        |r| r.clone(),
    );

    eprintln!("[ty-plus-runtime] Starting with root: {root}");

    let persistence_handler = PersistenceIoHandler::new(root.clone());
    let online = OnlineComposition::new(std::path::Path::new(&root));
    let session_id = SessionId::parse("session-main").expect("valid session ID");

    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    for line in stdin.lock().lines() {
        let line = line?;
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        // Parse as a simple JSON request
        let response =
            match parse_and_dispatch(&line, &session_id, &root, &persistence_handler, &online) {
                Ok(resp) => resp,
                Err(error) => {
                    let diagnostic_id =
                        DiagnosticId::parse("diag-main").expect("valid diagnostic ID");
                    let protocol_error = ty_plus_protocol::ProtocolError::new(
                        StableErrorCode::InternalError,
                        false,
                        error,
                        diagnostic_id,
                    )
                    .expect("failed to create protocol error");
                    ResponseEnvelope {
                        protocol_version: CURRENT_PROTOCOL_VERSION,
                        request_id: ty_plus_protocol::RequestId::parse("unknown")
                            .expect("valid request ID"),
                        session_id: session_id.clone(),
                        outcome: ResponseOutcome::Failure {
                            error: protocol_error,
                        },
                    }
                }
            };

        let json = serde_json::to_string(&response)?;
        stdout.write_all(json.as_bytes())?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }

    Ok(())
}

fn parse_and_dispatch(
    line: &str,
    session_id: &SessionId,
    managed_root: &str,
    persistence_handler: &PersistenceIoHandler,
    online: &OnlineComposition,
) -> Result<ResponseEnvelope, String> {
    let value: Value = serde_json::from_str(line).map_err(|e| format!("JSON parse error: {e}"))?;

    let obj = value
        .as_object()
        .ok_or_else(|| "request must be a JSON object".to_string())?;

    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
    let method = obj
        .get("method")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'method' field".to_string())?;
    let params = obj
        .get("params")
        .cloned()
        .unwrap_or(Value::Object(serde_json::Map::new()));

    let request_id =
        ty_plus_protocol::RequestId::parse(id).map_err(|e| format!("invalid request ID: {e}"))?;

    let request = RequestEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        metadata: ty_plus_protocol::RequestMetadata {
            request_id,
            session_id: session_id.clone(),
            deadline_unix_ms: ty_plus_protocol::DeadlineUnixMs::new(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0)
                    + 30_000,
            ),
            cancellable: false,
            idempotency_key: None,
        },
        context: ty_plus_protocol::InvocationContext {
            host_context: ty_plus_protocol::HostContext {
                app_root: managed_root.to_owned(),
                support_root: managed_root.to_owned(),
                session_id: session_id.as_str().to_owned(),
            },
            managed_root: ty_plus_protocol::ManagedRootContext::ExplicitShared {
                root: managed_root.to_owned(),
            },
        },
        method: ty_plus_protocol::MethodName::parse(method)
            .map_err(|e| format!("invalid method name: {e}"))?,
        payload: params,
    };

    Ok(dispatcher::dispatch(
        session_id.clone(),
        request,
        persistence_handler,
        online,
    ))
}
