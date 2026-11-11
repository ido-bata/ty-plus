use std::fmt;
use std::io::{self, Read, Write};
use std::sync::{Arc, Mutex, MutexGuard, mpsc::Sender};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use ty_plus_protocol::{
    AcceptedEvent, CURRENT_PROTOCOL_VERSION, CancellationAcknowledgement, CancellationDecision,
    DiagnosticId, EventEnvelope, EventPayload, IdempotencyPolicy, ProgressStage, ProgressState,
    ProtocolError, RequestEnvelope, ResponseEnvelope, ResponseOutcome, StableErrorCode,
    ValidationError, WireMessage,
};

use crate::cancellation::CancellationToken;
use crate::codec::{CodecError, read_message, write_message};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerExit {
    FinalResponseSent,
    RejectedBeforeAccepted,
}

#[derive(Debug)]
pub enum WorkerError {
    Codec(CodecError),
    Protocol(StableErrorCode),
    Validation(ValidationError),
    Crash(StableErrorCode),
}

impl fmt::Display for WorkerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Codec(error) => write!(formatter, "worker codec error: {error}"),
            Self::Protocol(code) => write!(formatter, "worker protocol error: {code:?}"),
            Self::Validation(error) => write!(formatter, "worker validation error: {error}"),
            Self::Crash(code) => write!(formatter, "worker crash: {code:?}"),
        }
    }
}

impl std::error::Error for WorkerError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Codec(error) => Some(error),
            Self::Validation(error) => Some(error),
            Self::Protocol(_) | Self::Crash(_) => None,
        }
    }
}

impl From<CodecError> for WorkerError {
    fn from(error: CodecError) -> Self {
        Self::Codec(error)
    }
}

fn replay_error(error: &WorkerError) -> WorkerError {
    match error {
        WorkerError::Codec(_) => WorkerError::Codec(CodecError::Io(io::Error::new(
            io::ErrorKind::BrokenPipe,
            "output failure",
        ))),
        WorkerError::Protocol(code) => WorkerError::Protocol(*code),
        WorkerError::Validation(error) => WorkerError::Validation(error.clone()),
        WorkerError::Crash(code) => WorkerError::Crash(*code),
    }
}

fn map_post_accept_codec_error(error: CodecError) -> WorkerError {
    match error {
        CodecError::Io(error) if error.kind() == io::ErrorKind::UnexpectedEof => {
            WorkerError::Protocol(StableErrorCode::ProtocolViolation)
        }
        CodecError::Io(_) => WorkerError::Crash(StableErrorCode::WorkerCrashed),
        CodecError::FrameTooLarge { .. }
        | CodecError::Json(_)
        | CodecError::Wire(_)
        | CodecError::Validation(_) => WorkerError::Protocol(StableErrorCode::ProtocolViolation),
    }
}

pub trait OperationExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError>;
}

pub struct WorkerDependencies<'a> {
    pub executor: &'a dyn OperationExecutor,
}

pub trait EventSink {
    fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError>;
}

#[derive(Debug, Default)]
struct LifecycleState {
    progress: Option<ProgressState>,
    cancel_seen: bool,
    cancel_accepted: bool,
    cancel_stage: Option<ProgressStage>,
    final_sent: bool,
    protocol_violation: bool,
    terminal_failure: bool,
    failure: Option<WorkerError>,
}

struct OutputCoordinator<W> {
    writer: W,
    request_id: ty_plus_protocol::RequestId,
    session_id: ty_plus_protocol::SessionId,
    cancellable: bool,
    state: LifecycleState,
}

impl<W: Write> OutputCoordinator<W> {
    fn new(writer: W, request: &RequestEnvelope) -> Self {
        Self {
            writer,
            request_id: request.metadata.request_id.clone(),
            session_id: request.metadata.session_id.clone(),
            cancellable: request.metadata.cancellable,
            state: LifecycleState::default(),
        }
    }

    fn write(&mut self, message: &WireMessage) -> Result<(), WorkerError> {
        write_message(&mut self.writer, message).map_err(WorkerError::from)
    }

    fn accepted(&mut self, request: &RequestEnvelope) -> Result<(), WorkerError> {
        self.write(&accepted_event(request))
    }

    fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError> {
        if self.state.final_sent || self.state.protocol_violation {
            return self.protocol_failure();
        }
        if event.request_id != self.request_id || event.session_id != self.session_id {
            return self.protocol_failure();
        }
        if event
            .protocol_version
            .compatibility_with(CURRENT_PROTOCOL_VERSION)
            == ty_plus_protocol::ProtocolCompatibility::IncompatibleMajor
        {
            return self.protocol_failure();
        }
        let EventPayload::Progress(progress) = &event.payload else {
            return self.protocol_failure();
        };
        if self.state.cancel_accepted {
            if let Some(stage) = self.state.cancel_stage {
                if stage != ProgressStage::Committing
                    && stage != ProgressStage::Finished
                    && progress.stage == ProgressStage::Committing
                {
                    return self.protocol_failure();
                }
            }
        }
        let next = match self.state.progress.take() {
            None => ProgressState::start(progress.clone()),
            Some(mut previous) => previous.advance(progress.clone()).map(|()| previous),
        };
        self.state.progress = Some(match next {
            Ok(progress) => progress,
            Err(error) => {
                self.state.terminal_failure = true;
                self.record_failure(WorkerError::Validation(error.clone()));
                return Err(WorkerError::Validation(error));
            }
        });
        let result = self.write(&WireMessage::Event(event));
        if let Err(error) = result {
            self.state.terminal_failure = true;
            let returned = replay_error(&error);
            self.record_failure(error);
            return Err(returned);
        }
        Ok(())
    }

    fn handle_cancel(
        &mut self,
        cancel: &ty_plus_protocol::CancelRequest,
        token: &CancellationToken,
    ) -> Result<(), WorkerError> {
        if cancel.target_request_id != self.request_id || self.state.cancel_seen {
            return Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
        }
        self.state.cancel_seen = true;
        if self.state.final_sent {
            return Ok(());
        }
        let stage = self
            .state
            .progress
            .as_ref()
            .map_or(ProgressStage::Preparing, |progress| {
                progress.current().stage
            });
        let decision = CancellationDecision::for_stage(self.cancellable, stage);
        self.state.cancel_stage = Some(stage);
        if matches!(decision, CancellationDecision::Accepted) {
            match self.write(&cancellation_event(
                &self.request_id,
                &self.session_id,
                decision,
            )) {
                Ok(()) => {
                    self.state.cancel_accepted = true;
                    token.cancel();
                    return Ok(());
                }
                Err(error) => {
                    self.state.terminal_failure = true;
                    self.record_failure(error);
                    return Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
                }
            }
        }
        self.write(&cancellation_event(
            &self.request_id,
            &self.session_id,
            decision,
        ))
        .map_err(|error| {
            self.state.terminal_failure = true;
            self.record_failure(error);
            WorkerError::Protocol(StableErrorCode::ProtocolViolation)
        })
    }

    fn handle_control(
        &mut self,
        message: WireMessage,
        request_id: &ty_plus_protocol::RequestId,
        token: &CancellationToken,
    ) -> Result<(), WorkerError> {
        match message {
            WireMessage::Cancel(cancel) if cancel.target_request_id == *request_id => {
                if self.state.cancel_seen {
                    self.control_protocol_fault()
                } else {
                    self.handle_cancel(&cancel, token)
                }
            }
            WireMessage::Cancel(_)
            | WireMessage::Request(_)
            | WireMessage::Response(_)
            | WireMessage::Event(_) => self.control_protocol_fault(),
        }
    }

    fn control_protocol_fault(&mut self) -> Result<(), WorkerError> {
        self.state.protocol_violation = true;
        self.state.terminal_failure = true;
        self.record_failure(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
        Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
    }

    fn codec_protocol_fault(&mut self, error: CodecError) -> Result<(), WorkerError> {
        self.state.protocol_violation = true;
        self.state.terminal_failure = true;
        self.record_failure(map_post_accept_codec_error(error));
        Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
    }

    fn final_response(
        &mut self,
        request: &RequestEnvelope,
        response: ResponseEnvelope,
    ) -> Result<(), WorkerError> {
        if self.state.protocol_violation || self.state.final_sent {
            return self.protocol_failure();
        }
        if response.request_id != request.metadata.request_id
            || response.session_id != request.metadata.session_id
            || response
                .protocol_version
                .compatibility_with(CURRENT_PROTOCOL_VERSION)
                == ty_plus_protocol::ProtocolCompatibility::IncompatibleMajor
        {
            return self.protocol_failure();
        }
        if let Err(error) = response.validate() {
            self.state.terminal_failure = true;
            return Err(WorkerError::Validation(error));
        }
        self.state.final_sent = true;
        self.write(&WireMessage::Response(response))
    }

    fn record_failure(&mut self, error: WorkerError) {
        if self.state.failure.is_none() {
            self.state.failure = Some(error);
        }
    }

    fn protocol_failure(&mut self) -> Result<(), WorkerError> {
        self.state.terminal_failure = true;
        let error = WorkerError::Protocol(StableErrorCode::ProtocolViolation);
        self.record_failure(replay_error(&error));
        Err(error)
    }

    fn take_failure(&mut self) -> Option<WorkerError> {
        self.state.failure.take()
    }

    fn terminal_failure(&self) -> bool {
        self.state.terminal_failure
    }

    fn cancel_accepted(&self) -> bool {
        self.state.cancel_accepted
    }
}

type Coordinator<W> = Arc<Mutex<OutputCoordinator<W>>>;

fn lock_coordinator<W>(
    coordinator: &Coordinator<W>,
) -> Result<MutexGuard<'_, OutputCoordinator<W>>, WorkerError> {
    coordinator
        .lock()
        .map_err(|_| WorkerError::Crash(StableErrorCode::WorkerCrashed))
}

struct CoordinatorEventSink<W> {
    coordinator: Coordinator<W>,
}

impl<W: Write> EventSink for CoordinatorEventSink<W> {
    fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError> {
        lock_coordinator(&self.coordinator)?.progress(event)
    }
}

fn reader_loop<R, W>(
    mut reader: R,
    coordinator: Coordinator<W>,
    request_id: ty_plus_protocol::RequestId,
    token: CancellationToken,
) where
    R: Read + Send + 'static,
    W: Write + Send + 'static,
{
    loop {
        let message = match read_message(&mut reader) {
            Ok(Some(message)) => message,
            Ok(None) => return,
            Err(error) => {
                if let Ok(mut output) = coordinator.lock() {
                    let _ = output.codec_protocol_fault(error);
                }
                token.cancel();
                return;
            }
        };
        let result = match coordinator.lock() {
            Ok(mut output) => output.handle_control(message, &request_id, &token),
            Err(_) => Err(WorkerError::Crash(StableErrorCode::WorkerCrashed)),
        };
        if result.is_err() {
            token.cancel();
            return;
        }
    }
}

fn accepted_event(request: &RequestEnvelope) -> WireMessage {
    WireMessage::Event(EventEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        session_id: request.metadata.session_id.clone(),
        request_id: request.metadata.request_id.clone(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: request.metadata.request_id.clone(),
            session_id: request.metadata.session_id.clone(),
        }),
    })
}

fn cancellation_event(
    request_id: &ty_plus_protocol::RequestId,
    session_id: &ty_plus_protocol::SessionId,
    decision: CancellationDecision,
) -> WireMessage {
    WireMessage::Event(EventEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        session_id: session_id.clone(),
        request_id: request_id.clone(),
        payload: EventPayload::CancellationAcknowledged(CancellationAcknowledgement {
            target_request_id: request_id.clone(),
            decision,
        }),
    })
}

fn cancelled_response(request: &RequestEnvelope) -> Result<ResponseEnvelope, WorkerError> {
    let error = ProtocolError::new(
        StableErrorCode::Cancelled,
        false,
        "operation cancelled",
        DiagnosticId::parse("worker-cancelled").map_err(WorkerError::Validation)?,
    )
    .map_err(WorkerError::Validation)?;
    Ok(ResponseEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        request_id: request.metadata.request_id.clone(),
        session_id: request.metadata.session_id.clone(),
        outcome: ResponseOutcome::Failure { error },
    })
}

fn validate_request_before_accept(request: &RequestEnvelope) -> Result<(), WorkerError> {
    if request
        .protocol_version
        .compatibility_with(CURRENT_PROTOCOL_VERSION)
        == ty_plus_protocol::ProtocolCompatibility::IncompatibleMajor
    {
        return Err(WorkerError::Protocol(StableErrorCode::IncompatibleProtocol));
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| WorkerError::Protocol(StableErrorCode::ProtocolViolation))?
        .as_millis() as u64;
    request
        .validate(now, IdempotencyPolicy::Optional)
        .map_err(WorkerError::Validation)
}

/// Runs one short-lived request. The reader is moved to a blocking control
/// thread and no completion path waits for stdin EOF or joins that thread.
pub fn run_once<R, W>(
    reader: R,
    writer: W,
    deps: &WorkerDependencies<'_>,
) -> Result<WorkerExit, WorkerError>
where
    R: Read + Send + 'static,
    W: Write + Send + 'static,
{
    run_once_inner(reader, writer, deps, None)
}

fn run_once_inner<R, W>(
    mut reader: R,
    writer: W,
    deps: &WorkerDependencies<'_>,
    reader_handle_sender: Option<Sender<thread::JoinHandle<()>>>,
) -> Result<WorkerExit, WorkerError>
where
    R: Read + Send + 'static,
    W: Write + Send + 'static,
{
    let Some(message) = read_message(&mut reader)
        .map_err(|_| WorkerError::Protocol(StableErrorCode::ProtocolViolation))?
    else {
        return Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
    };
    let WireMessage::Request(request) = message else {
        return Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
    };
    validate_request_before_accept(&request)?;

    let token = CancellationToken::default();
    let coordinator = Arc::new(Mutex::new(OutputCoordinator::new(writer, &request)));
    lock_coordinator(&coordinator)?.accepted(&request)?;

    let reader_coordinator = Arc::clone(&coordinator);
    let reader_token = token.clone();
    let request_id = request.metadata.request_id.clone();
    let reader_handle =
        thread::spawn(move || reader_loop(reader, reader_coordinator, request_id, reader_token));
    if let Some(sender) = reader_handle_sender {
        sender
            .send(reader_handle)
            .map_err(|_| WorkerError::Crash(StableErrorCode::WorkerCrashed))?;
    } else {
        drop(reader_handle);
    }

    let mut events = CoordinatorEventSink {
        coordinator: Arc::clone(&coordinator),
    };
    let final_response = match deps.executor.execute(&request, &token, &mut events) {
        Ok(response) => response,
        Err(WorkerError::Protocol(StableErrorCode::Cancelled)) if token.is_cancelled() => {
            if let Some(error) = lock_coordinator(&coordinator)?.take_failure() {
                return Err(error);
            }
            cancelled_response(&request)?
        }
        Err(error) => {
            if let Some(failure) = lock_coordinator(&coordinator)?.take_failure() {
                return Err(failure);
            }
            return Err(error);
        }
    };

    let mut output = lock_coordinator(&coordinator)?;
    if let Some(error) = output.take_failure() {
        return Err(error);
    }
    if output.terminal_failure() {
        return Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
    }
    let response = if output.cancel_accepted() {
        cancelled_response(&request)?
    } else {
        final_response
    };
    output.final_response(&request, response)?;
    Ok(WorkerExit::FinalResponseSent)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::sync::mpsc;
    use std::time::Duration;
    use ty_plus_protocol::{
        DeadlineUnixMs, HostContext, InvocationContext, ManagedRootContext, MethodName,
        RequestMetadata, SessionId,
    };

    fn request() -> RequestEnvelope {
        RequestEnvelope {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            metadata: RequestMetadata {
                request_id: ty_plus_protocol::RequestId::parse("request-unit").unwrap(),
                session_id: SessionId::parse("session-unit").unwrap(),
                deadline_unix_ms: DeadlineUnixMs::new(
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64
                        + 60_000,
                ),
                cancellable: true,
                idempotency_key: None,
            },
            context: InvocationContext {
                host_context: HostContext {
                    app_root: "/Applications/After Effects".into(),
                    support_root: "/Users/test/Support".into(),
                    session_id: "session-unit".into(),
                },
                managed_root: ManagedRootContext::SessionDefault,
            },
            method: MethodName::parse("storage.read").unwrap(),
            payload: serde_json::json!({"path": "example"}),
        }
    }

    struct FiniteReader {
        pending: Cursor<Vec<u8>>,
        close: mpsc::Receiver<()>,
    }

    impl Read for FiniteReader {
        fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
            let amount = self.pending.read(destination)?;
            if amount != 0 {
                return Ok(amount);
            }
            let _ = self.close.recv();
            Ok(0)
        }
    }

    struct Immediate;

    impl OperationExecutor for Immediate {
        fn execute(
            &self,
            request: &RequestEnvelope,
            _cancellation: &CancellationToken,
            _events: &mut dyn EventSink,
        ) -> Result<ResponseEnvelope, WorkerError> {
            Ok(ResponseEnvelope {
                protocol_version: CURRENT_PROTOCOL_VERSION,
                request_id: request.metadata.request_id.clone(),
                session_id: request.metadata.session_id.clone(),
                outcome: ResponseOutcome::Success {
                    payload: serde_json::json!({"ok": true}),
                    warnings: Vec::new(),
                },
            })
        }
    }

    #[test]
    fn finite_reader_handle_joins_after_input_close_with_watchdog() {
        let invocation = request();
        let mut request_bytes = Vec::new();
        write_message(&mut request_bytes, &WireMessage::Request(invocation)).unwrap();
        let (close_sender, close_receiver) = mpsc::channel();
        let reader = FiniteReader {
            pending: Cursor::new(request_bytes),
            close: close_receiver,
        };
        let (handle_sender, handle_receiver) = mpsc::channel();
        let executor = Immediate;
        let dependencies = WorkerDependencies {
            executor: &executor,
        };
        let result = run_once_inner(reader, Vec::<u8>::new(), &dependencies, Some(handle_sender));
        assert!(result.is_ok());
        let reader_handle = handle_receiver
            .recv_timeout(Duration::from_secs(2))
            .unwrap();
        drop(close_sender);
        let (join_sender, join_receiver) = mpsc::channel();
        thread::spawn(move || join_sender.send(reader_handle.join()).unwrap());
        assert!(
            join_receiver
                .recv_timeout(Duration::from_secs(2))
                .unwrap()
                .is_ok()
        );
    }

    #[test]
    fn duplicate_cancel_records_terminal_protocol_fault_atomically() {
        let invocation = request();
        let mut output = OutputCoordinator::new(Vec::<u8>::new(), &invocation);
        let token = CancellationToken::default();
        let cancel = WireMessage::Cancel(ty_plus_protocol::CancelRequest {
            target_request_id: invocation.metadata.request_id.clone(),
        });
        assert!(
            output
                .handle_control(cancel.clone(), &invocation.metadata.request_id, &token)
                .is_ok()
        );
        assert!(matches!(
            output.handle_control(cancel, &invocation.metadata.request_id, &token),
            Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
        ));
        assert!(output.state.terminal_failure);
        assert!(output.state.protocol_violation);
        assert!(matches!(
            output.state.failure,
            Some(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
        ));
    }

    #[test]
    fn non_cancel_control_records_terminal_protocol_fault_atomically() {
        let invocation = request();
        let mut output = OutputCoordinator::new(Vec::<u8>::new(), &invocation);
        let token = CancellationToken::default();
        assert!(matches!(
            output.handle_control(
                WireMessage::Request(invocation.clone()),
                &invocation.metadata.request_id,
                &token,
            ),
            Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
        ));
        assert!(output.state.terminal_failure);
        assert!(output.state.protocol_violation);
        assert!(matches!(
            output.state.failure,
            Some(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
        ));
    }
}
