use std::io::{self, Cursor, Write};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use ty_plus_operation_worker::{
    CancellationToken, EventSink, OperationExecutor, WorkerDependencies, WorkerError, WorkerExit,
    read_message, run_once, write_message,
};
use ty_plus_protocol::{
    CURRENT_PROTOCOL_VERSION, DeadlineUnixMs, EventEnvelope, EventPayload, HostContext,
    InvocationContext, ManagedRootContext, MethodName, ProgressEvent, ProgressStage,
    RequestEnvelope, RequestId, RequestMetadata, ResponseEnvelope, ResponseOutcome, SessionId,
    WireMessage,
};

fn request() -> RequestEnvelope {
    RequestEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        metadata: RequestMetadata {
            request_id: RequestId::parse("request-lifecycle").unwrap(),
            session_id: SessionId::parse("session-lifecycle").unwrap(),
            deadline_unix_ms: DeadlineUnixMs::new(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64
                    + 60 * 60 * 1_000,
            ),
            cancellable: true,
            idempotency_key: None,
        },
        context: InvocationContext {
            host_context: HostContext {
                app_root: "/Applications/After Effects".into(),
                support_root: "/Users/test/Support".into(),
                session_id: "session-lifecycle".into(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        method: MethodName::parse("storage.read").unwrap(),
        payload: serde_json::json!({"path": "example"}),
    }
}

fn frames(messages: &[WireMessage]) -> Vec<u8> {
    let mut bytes = Vec::new();
    for message in messages {
        write_message(&mut bytes, message).unwrap();
    }
    bytes
}

fn progress(sequence: u64, stage: ProgressStage) -> WireMessage {
    WireMessage::Event(EventEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        session_id: SessionId::parse("session-lifecycle").unwrap(),
        request_id: RequestId::parse("request-lifecycle").unwrap(),
        payload: EventPayload::Progress(ProgressEvent {
            sequence,
            stage,
            completed_units: Some(sequence),
            total_units: Some(2),
            user_safe_detail: None,
        }),
    })
}

fn success_response(request: &RequestEnvelope) -> ResponseEnvelope {
    ResponseEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        request_id: request.metadata.request_id.clone(),
        session_id: request.metadata.session_id.clone(),
        outcome: ResponseOutcome::Success {
            payload: serde_json::json!({"ok": true}),
            warnings: Vec::new(),
        },
    }
}

#[derive(Clone)]
struct SharedWriter(Arc<Mutex<Vec<u8>>>);

impl Write for SharedWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct FixtureExecutor {
    stages: Vec<ProgressStage>,
    checkpoint: bool,
}

impl OperationExecutor for FixtureExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        for (sequence, stage) in self.stages.iter().copied().enumerate() {
            events.progress(match progress(sequence as u64, stage) {
                WireMessage::Event(event) => event,
                _ => unreachable!(),
            })?;
            if self.checkpoint {
                cancellation.checkpoint()?;
            }
        }
        Ok(success_response(request))
    }
}

fn run_fixture(input: Vec<u8>, executor: &FixtureExecutor) -> Vec<WireMessage> {
    let output = Arc::new(Mutex::new(Vec::new()));
    run_once(
        Cursor::new(input),
        SharedWriter(Arc::clone(&output)),
        &WorkerDependencies { executor },
    )
    .unwrap();
    let mut reader = Cursor::new(output.lock().unwrap().clone());
    std::iter::from_fn(|| read_message(&mut reader).unwrap()).collect()
}

#[test]
fn lifecycle_flushes_accepted_progress_and_final_in_order() {
    let output = run_fixture(
        frames(&[WireMessage::Request(request())]),
        &FixtureExecutor {
            stages: vec![ProgressStage::Preparing],
            checkpoint: false,
        },
    );
    assert!(matches!(
        output[0],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Accepted(_),
            ..
        })
    ));
    assert!(matches!(
        output[1],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(_),
            ..
        })
    ));
    assert!(matches!(output.last(), Some(WireMessage::Response(_))));
}

#[test]
fn cancellation_token_checkpoint_is_cooperative_and_cloneable() {
    let token = CancellationToken::default();
    let clone = token.clone();
    assert!(!clone.is_cancelled());
    assert!(clone.checkpoint().is_ok());
}

#[test]
fn malformed_request_is_rejected_before_accepted() {
    let mut invalid = request();
    invalid.metadata.deadline_unix_ms = DeadlineUnixMs::new(0);
    let output = Arc::new(Mutex::new(Vec::new()));
    let result = run_once(
        Cursor::new(frames(&[WireMessage::Request(invalid)])),
        SharedWriter(Arc::clone(&output)),
        &WorkerDependencies {
            executor: &FixtureExecutor {
                stages: vec![],
                checkpoint: false,
            },
        },
    );
    assert!(matches!(result, Err(WorkerError::Validation(_))));
    assert!(output.lock().unwrap().is_empty());
}

#[test]
fn worker_exit_reports_final_response_sent() {
    let output = Arc::new(Mutex::new(Vec::new()));
    let exit = run_once(
        Cursor::new(frames(&[WireMessage::Request(request())])),
        SharedWriter(output),
        &WorkerDependencies {
            executor: &FixtureExecutor {
                stages: vec![],
                checkpoint: false,
            },
        },
    )
    .unwrap();
    assert_eq!(exit, WorkerExit::FinalResponseSent);
}

#[test]
fn committing_progress_is_valid_before_success_final() {
    let output = run_fixture(
        frames(&[WireMessage::Request(request())]),
        &FixtureExecutor {
            stages: vec![ProgressStage::Preparing, ProgressStage::Committing],
            checkpoint: false,
        },
    );
    assert!(matches!(
        output[2],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(_),
            ..
        })
    ));
    assert!(matches!(
        output[3],
        WireMessage::Response(ResponseEnvelope {
            outcome: ResponseOutcome::Success { .. },
            ..
        })
    ));
    assert_eq!(output.len(), 4);
    assert!(!output.iter().any(|message| matches!(
        message,
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::CancellationAcknowledged(_),
            ..
        })
    )));
}
