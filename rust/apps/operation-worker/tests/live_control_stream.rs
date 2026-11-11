use std::io::{self, Cursor, Read, Write};
use std::sync::{
    Arc, Condvar, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc::{self, Receiver, Sender},
};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ty_plus_operation_worker::{
    CancellationToken, EventSink, OperationExecutor, WorkerDependencies, WorkerError, read_message,
    run_once, write_message,
};
use ty_plus_protocol::{
    AcceptedEvent, CURRENT_PROTOCOL_VERSION, CancellationDecision, DeadlineUnixMs, EventEnvelope,
    EventPayload, HostContext, InvocationContext, MAX_FRAME_BYTES, ManagedRootContext, MethodName,
    ProgressEvent, ProgressStage, RequestEnvelope, RequestId, RequestMetadata, ResponseEnvelope,
    ResponseOutcome, SessionId, StableErrorCode, ValidationError, WireMessage,
};

fn request() -> RequestEnvelope {
    RequestEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        metadata: RequestMetadata {
            request_id: RequestId::parse("request-live").unwrap(),
            session_id: SessionId::parse("session-live").unwrap(),
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
                session_id: "session-live".into(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        method: MethodName::parse("storage.read").unwrap(),
        payload: serde_json::json!({"path": "example"}),
    }
}

fn non_cancellable_request() -> RequestEnvelope {
    let mut request = request();
    request.metadata.cancellable = false;
    request
}

fn frame(message: &WireMessage) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_message(&mut bytes, message).unwrap();
    bytes
}

fn cancel(request_id: &str) -> WireMessage {
    WireMessage::Cancel(ty_plus_protocol::CancelRequest {
        target_request_id: RequestId::parse(request_id).unwrap(),
    })
}

fn progress(sequence: u64, stage: ProgressStage) -> EventEnvelope {
    EventEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        session_id: SessionId::parse("session-live").unwrap(),
        request_id: RequestId::parse("request-live").unwrap(),
        payload: EventPayload::Progress(ProgressEvent {
            sequence,
            stage,
            completed_units: Some(sequence),
            total_units: Some(2),
            user_safe_detail: None,
        }),
    }
}

fn accepted_event() -> EventEnvelope {
    EventEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        session_id: SessionId::parse("session-live").unwrap(),
        request_id: RequestId::parse("request-live").unwrap(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: RequestId::parse("request-live").unwrap(),
            session_id: SessionId::parse("session-live").unwrap(),
        }),
    }
}

struct ProgressExecutor {
    events: Vec<EventEnvelope>,
}

impl OperationExecutor for ProgressExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        for event in self.events.iter().cloned() {
            events.progress(event)?;
        }
        Ok(success(request))
    }
}

fn run_progress_observed(
    events: Vec<EventEnvelope>,
) -> (
    Result<ty_plus_operation_worker::WorkerExit, WorkerError>,
    Vec<WireMessage>,
) {
    let output = Arc::new((Mutex::new(Vec::new()), Condvar::new()));
    let result = run_once(
        Cursor::new(frame(&WireMessage::Request(request()))),
        ObservedWriter {
            output: Arc::clone(&output),
            pending: Vec::new(),
        },
        &WorkerDependencies {
            executor: &ProgressExecutor { events },
        },
    );
    (result, observed_messages(&output))
}

fn assert_accepted_only(messages: &[WireMessage]) {
    assert_eq!(messages.len(), 1);
    assert!(matches!(
        messages[0],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Accepted(_),
            ..
        })
    ));
}

fn success(request: &RequestEnvelope) -> ResponseEnvelope {
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

struct PipeReader {
    input: Receiver<Option<Vec<u8>>>,
    pending: Cursor<Vec<u8>>,
    done: Arc<AtomicBool>,
    received: Sender<()>,
}

impl Read for PipeReader {
    fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
        if destination.is_empty() {
            return Ok(0);
        }
        let amount = self.pending.read(destination)?;
        if amount != 0 {
            return Ok(amount);
        }
        match self.input.recv() {
            Ok(Some(bytes)) => {
                let _ = self.received.send(());
                self.pending = Cursor::new(bytes);
                self.pending.read(destination)
            }
            Ok(None) | Err(_) => {
                self.done.store(true, Ordering::Release);
                Ok(0)
            }
        }
    }
}

impl Drop for PipeReader {
    fn drop(&mut self) {
        self.done.store(true, Ordering::Release);
    }
}

struct ObservedWriter {
    output: Arc<(Mutex<Vec<u8>>, Condvar)>,
    pending: Vec<u8>,
}

impl Write for ObservedWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.output
            .0
            .lock()
            .unwrap()
            .extend_from_slice(&self.pending);
        self.pending.clear();
        self.output.1.notify_all();
        Ok(())
    }
}

struct FinalFlushBarrierWriter {
    output: Arc<(Mutex<Vec<u8>>, Condvar)>,
    pending: Vec<u8>,
    final_flush_started: Sender<()>,
    final_flush_release: Receiver<()>,
    flush_count: usize,
    barrier_flush: usize,
}

impl Write for FinalFlushBarrierWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.flush_count += 1;
        self.output
            .0
            .lock()
            .unwrap()
            .extend_from_slice(&self.pending);
        self.pending.clear();
        if self.flush_count == self.barrier_flush {
            self.final_flush_started.send(()).unwrap();
            self.final_flush_release
                .recv_timeout(Duration::from_secs(2))
                .unwrap();
        }
        self.output.1.notify_all();
        Ok(())
    }
}

fn observed_messages(output: &Arc<(Mutex<Vec<u8>>, Condvar)>) -> Vec<WireMessage> {
    let bytes = output.0.lock().unwrap().clone();
    let mut reader = Cursor::new(bytes);
    std::iter::from_fn(|| read_message(&mut reader).unwrap()).collect()
}

fn wait_for<F>(output: &Arc<(Mutex<Vec<u8>>, Condvar)>, predicate: F) -> Vec<WireMessage>
where
    F: Fn(&[WireMessage]) -> bool,
{
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    let mut guard = output.0.lock().unwrap();
    loop {
        let bytes = guard.clone();
        let mut reader = Cursor::new(bytes);
        let messages =
            std::iter::from_fn(|| read_message(&mut reader).unwrap()).collect::<Vec<_>>();
        if predicate(&messages) {
            return messages;
        }
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        assert!(
            !remaining.is_zero(),
            "timed out waiting for lifecycle output"
        );
        (guard, _) = output.1.wait_timeout(guard, remaining).unwrap();
    }
}

struct ImmediateExecutor;

impl OperationExecutor for ImmediateExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        _events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        Ok(success(request))
    }
}

struct CancellationExecutor {
    started: Sender<()>,
    observed: Sender<()>,
    release: Option<Receiver<()>>,
}

impl OperationExecutor for CancellationExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        cancellation: &CancellationToken,
        _events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        self.started.send(()).unwrap();
        while !cancellation.is_cancelled() {
            thread::yield_now();
        }
        let _ = self.observed.send(());
        if let Some(release) = &self.release {
            release.recv_timeout(Duration::from_secs(2)).unwrap();
        }
        cancellation.checkpoint()?;
        Ok(success(request))
    }
}

struct CommitExecutor {
    committed: Sender<()>,
    release: Receiver<()>,
}

struct NonCancellableCommitExecutor {
    preparing: Sender<()>,
    release: Receiver<()>,
}

impl OperationExecutor for NonCancellableCommitExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        events.progress(progress(0, ProgressStage::Preparing))?;
        self.preparing.send(()).unwrap();
        self.release.recv_timeout(Duration::from_secs(2)).unwrap();
        events.progress(progress(1, ProgressStage::Committing))?;
        Ok(success(request))
    }
}

impl OperationExecutor for CommitExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        events.progress(progress(0, ProgressStage::Preparing))?;
        events.progress(progress(1, ProgressStage::Committing))?;
        self.committed.send(()).unwrap();
        self.release.recv_timeout(Duration::from_secs(2)).unwrap();
        Ok(success(request))
    }
}

struct ProgressGateExecutor {
    emitted: Sender<()>,
    release: Receiver<()>,
}

impl OperationExecutor for ProgressGateExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        events.progress(progress(0, ProgressStage::Preparing))?;
        self.emitted.send(()).unwrap();
        self.release.recv_timeout(Duration::from_secs(2)).unwrap();
        Ok(success(request))
    }
}

struct CrashAfterCommitExecutor {
    committed: Sender<()>,
}

struct IgnoreProgressFailureExecutor;

struct IgnoreValidationFailureExecutor;

impl OperationExecutor for IgnoreProgressFailureExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        let _ = events.progress(progress(0, ProgressStage::Preparing));
        Ok(success(request))
    }
}

impl OperationExecutor for IgnoreValidationFailureExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        let mut invalid = progress(0, ProgressStage::Preparing);
        invalid.payload = EventPayload::Progress(ProgressEvent {
            completed_units: Some(3),
            total_units: Some(2),
            ..match invalid.payload {
                EventPayload::Progress(progress) => progress,
                _ => unreachable!(),
            }
        });
        let _ = events.progress(invalid);
        Ok(success(request))
    }
}

struct FailingProgressWriter {
    state: Arc<Mutex<(Vec<u8>, usize)>>,
}

struct FailingAckWriter {
    state: Arc<Mutex<(Vec<u8>, usize)>>,
}

struct AckFailureExecutor {
    reader_done: Arc<AtomicBool>,
}

impl OperationExecutor for AckFailureExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        _events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        while !self.reader_done.load(Ordering::Acquire) {
            thread::yield_now();
        }
        Ok(success(request))
    }
}

struct CrashAfterProtocolFault {
    started: Sender<()>,
    reader_done: Arc<AtomicBool>,
}

impl OperationExecutor for CrashAfterProtocolFault {
    fn execute(
        &self,
        _request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        _events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        self.started.send(()).unwrap();
        while !self.reader_done.load(Ordering::Acquire) {
            thread::yield_now();
        }
        Err(WorkerError::Crash(StableErrorCode::WorkerCrashed))
    }
}

impl Write for FailingProgressWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.state.lock().unwrap().0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut state = self.state.lock().unwrap();
        state.1 += 1;
        if state.1 == 2 {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "progress flush failed",
            ));
        }
        Ok(())
    }
}

impl Write for FailingAckWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.state.lock().unwrap().0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut state = self.state.lock().unwrap();
        state.1 += 1;
        if state.1 == 2 {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "ack flush failed",
            ));
        }
        Ok(())
    }
}

impl OperationExecutor for CrashAfterCommitExecutor {
    fn execute(
        &self,
        _request: &RequestEnvelope,
        _cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        events.progress(progress(0, ProgressStage::Preparing))?;
        events.progress(progress(1, ProgressStage::Committing))?;
        self.committed.send(()).unwrap();
        Err(WorkerError::Crash(StableErrorCode::WorkerCrashed))
    }
}

fn start<E: OperationExecutor + Send + 'static>(executor: E) -> WorkerHarnessParts {
    start_with_request(executor, request())
}

fn start_with_request<E: OperationExecutor + Send + 'static>(
    executor: E,
    invocation: RequestEnvelope,
) -> WorkerHarnessParts {
    let (input_sender, input_receiver) = mpsc::channel();
    let (received_sender, _received_receiver) = mpsc::channel();
    let done = Arc::new(AtomicBool::new(false));
    let output = Arc::new((Mutex::new(Vec::new()), Condvar::new()));
    let reader = PipeReader {
        input: input_receiver,
        pending: Cursor::new(frame(&WireMessage::Request(invocation))),
        done: Arc::clone(&done),
        received: received_sender,
    };
    let writer = ObservedWriter {
        output: Arc::clone(&output),
        pending: Vec::new(),
    };
    let worker = thread::spawn(move || {
        let dependencies = WorkerDependencies {
            executor: &executor,
        };
        run_once(reader, writer, &dependencies)
    });
    (input_sender, output, done, worker)
}

type WorkerHarnessParts = (
    Sender<Option<Vec<u8>>>,
    Arc<(Mutex<Vec<u8>>, Condvar)>,
    Arc<AtomicBool>,
    thread::JoinHandle<Result<ty_plus_operation_worker::WorkerExit, WorkerError>>,
);

fn close_and_wait(sender: Sender<Option<Vec<u8>>>, done: &Arc<AtomicBool>) {
    drop(sender);
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while !done.load(Ordering::Acquire) {
        assert!(
            std::time::Instant::now() < deadline,
            "reader thread did not reach EOF"
        );
        thread::yield_now();
    }
}

fn recv_watchdog<T>(receiver: &Receiver<T>) -> T {
    receiver
        .recv_timeout(Duration::from_secs(2))
        .expect("lifecycle barrier timed out")
}

fn join_worker(
    worker: thread::JoinHandle<Result<ty_plus_operation_worker::WorkerExit, WorkerError>>,
) -> Result<ty_plus_operation_worker::WorkerExit, WorkerError> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let _ = sender.send(worker.join());
    });
    receiver
        .recv_timeout(Duration::from_secs(2))
        .expect("worker join timed out")
        .expect("worker thread panicked")
}

#[test]
fn normal_completion_does_not_wait_for_open_stdin() {
    let (input, output, done, worker) = start(ImmediateExecutor);
    let messages = wait_for(&output, |messages| {
        messages
            .iter()
            .any(|m| matches!(m, WireMessage::Response(_)))
    });
    assert!(matches!(
        messages[0],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Accepted(_),
            ..
        })
    ));
    assert!(matches!(messages.last(), Some(WireMessage::Response(_))));
    assert!(join_worker(worker).is_ok());
    close_and_wait(input, &done);
}

#[test]
fn matching_cancel_changes_running_token_and_is_acknowledged_once() {
    let (started_sender, started_receiver) = mpsc::channel();
    let (observed_sender, observed_receiver) = mpsc::channel();
    let (input, output, done, worker) = start(CancellationExecutor {
        started: started_sender,
        observed: observed_sender,
        release: None,
    });
    wait_for(&output, |messages| !messages.is_empty());
    recv_watchdog(&started_receiver);
    input.send(Some(frame(&cancel("request-live")))).unwrap();
    recv_watchdog(&observed_receiver);
    let messages = wait_for(&output, |messages| {
        messages
            .iter()
            .any(|m| matches!(m, WireMessage::Response(_)))
    });
    assert_eq!(
        messages
            .iter()
            .filter(|m| matches!(
                m,
                WireMessage::Event(EventEnvelope {
                    payload: EventPayload::CancellationAcknowledged(_),
                    ..
                })
            ))
            .count(),
        1
    );
    assert!(
        matches!(messages.last(), Some(WireMessage::Response(ResponseEnvelope { outcome: ResponseOutcome::Failure { error }, .. })) if error.code == StableErrorCode::Cancelled)
    );
    assert!(join_worker(worker).is_ok());
    close_and_wait(input, &done);
}

#[test]
fn committing_cancel_is_rejected_and_success_final_completes() {
    let (committed_sender, committed_receiver) = mpsc::channel();
    let (release_sender, release_receiver) = mpsc::channel();
    let (input, output, done, worker) = start(CommitExecutor {
        committed: committed_sender,
        release: release_receiver,
    });
    recv_watchdog(&committed_receiver);
    input.send(Some(frame(&cancel("request-live")))).unwrap();
    let messages = wait_for(&output, |messages| {
        messages.iter().any(|m| {
            matches!(
                m,
                WireMessage::Event(EventEnvelope {
                    payload: EventPayload::CancellationAcknowledged(_),
                    ..
                })
            )
        })
    });
    assert!(messages.iter().any(|m| matches!(m, WireMessage::Event(EventEnvelope { payload: EventPayload::CancellationAcknowledged(ack), .. }) if ack.decision == CancellationDecision::RejectedCommitInProgress)));
    release_sender.send(()).unwrap();
    let messages = wait_for(&output, |messages| {
        matches!(messages.last(), Some(WireMessage::Response(_)))
    });
    assert!(matches!(
        messages.last(),
        Some(WireMessage::Response(ResponseEnvelope {
            outcome: ResponseOutcome::Success { .. },
            ..
        }))
    ));
    assert!(join_worker(worker).is_ok());
    close_and_wait(input, &done);
}

#[test]
fn non_cancellable_cancel_does_not_block_commit_progress_or_success() {
    let (preparing_sender, preparing_receiver) = mpsc::channel();
    let (release_sender, release_receiver) = mpsc::channel();
    let (input, output, done, worker) = start_with_request(
        NonCancellableCommitExecutor {
            preparing: preparing_sender,
            release: release_receiver,
        },
        non_cancellable_request(),
    );
    recv_watchdog(&preparing_receiver);
    input.send(Some(frame(&cancel("request-live")))).unwrap();
    let messages = wait_for(&output, |messages| {
        messages.iter().any(|message| {
            matches!(
                message,
                WireMessage::Event(EventEnvelope {
                    payload: EventPayload::CancellationAcknowledged(_),
                    ..
                })
            )
        })
    });
    assert!(messages.iter().any(|message| {
        matches!(
            message,
            WireMessage::Event(EventEnvelope {
                payload: EventPayload::CancellationAcknowledged(ack),
                ..
            }) if ack.decision == CancellationDecision::RejectedNotCancellable
        )
    }));
    release_sender.send(()).unwrap();
    let messages = wait_for(&output, |messages| {
        matches!(messages.last(), Some(WireMessage::Response(_)))
    });
    assert!(matches!(
        messages.last(),
        Some(WireMessage::Response(ResponseEnvelope {
            outcome: ResponseOutcome::Success { .. },
            ..
        }))
    ));
    assert!(join_worker(worker).is_ok());
    close_and_wait(input, &done);
}

#[test]
fn second_cancel_and_non_cancel_controls_fail_closed() {
    let (started_sender, started_receiver) = mpsc::channel();
    let (observed_sender, _observed_receiver) = mpsc::channel();
    let (release_sender, release_receiver) = mpsc::channel();
    let (input, output, done, worker) = start(CancellationExecutor {
        started: started_sender,
        observed: observed_sender,
        release: Some(release_receiver),
    });
    wait_for(&output, |messages| !messages.is_empty());
    recv_watchdog(&started_receiver);
    input.send(Some(frame(&cancel("request-live")))).unwrap();
    wait_for(&output, |messages| {
        messages.iter().any(|m| {
            matches!(
                m,
                WireMessage::Event(EventEnvelope {
                    payload: EventPayload::CancellationAcknowledged(_),
                    ..
                })
            )
        })
    });
    input.send(Some(frame(&cancel("request-live")))).unwrap();
    close_and_wait(input, &done);
    release_sender.send(()).unwrap();
    let result = join_worker(worker);
    assert!(matches!(
        result,
        Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
    ));
    let messages = observed_messages(&output);
    assert_eq!(
        messages
            .iter()
            .filter(|m| matches!(
                m,
                WireMessage::Event(EventEnvelope {
                    payload: EventPayload::CancellationAcknowledged(_),
                    ..
                })
            ))
            .count(),
        1
    );
}

#[test]
fn non_cancel_control_frames_fail_closed() {
    let controls = [
        WireMessage::Request(request()),
        WireMessage::Response(success(&request())),
        WireMessage::Event(progress(0, ProgressStage::Preparing)),
    ];
    for control in controls {
        let (started_sender, started_receiver) = mpsc::channel();
        let (observed_sender, _observed_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let (input, output, done, worker) = start(CancellationExecutor {
            started: started_sender,
            observed: observed_sender,
            release: Some(release_receiver),
        });
        wait_for(&output, |messages| !messages.is_empty());
        recv_watchdog(&started_receiver);
        input.send(Some(frame(&control))).unwrap();
        close_and_wait(input, &done);
        release_sender.send(()).unwrap();
        assert!(matches!(
            join_worker(worker),
            Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
        ));
        assert!(
            !observed_messages(&output)
                .iter()
                .any(|m| matches!(m, WireMessage::Response(_)))
        );
    }
}

#[test]
fn oversized_control_frame_fails_closed() {
    let (started_sender, started_receiver) = mpsc::channel();
    let (observed_sender, _observed_receiver) = mpsc::channel();
    let (input, output, done, worker) = start(CancellationExecutor {
        started: started_sender,
        observed: observed_sender,
        release: None,
    });
    wait_for(&output, |messages| !messages.is_empty());
    recv_watchdog(&started_receiver);
    input
        .send(Some(((MAX_FRAME_BYTES as u32) + 1).to_be_bytes().to_vec()))
        .unwrap();
    close_and_wait(input, &done);
    assert!(matches!(
        join_worker(worker),
        Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
    ));
    assert!(
        !observed_messages(&output)
            .iter()
            .any(|m| matches!(m, WireMessage::Response(_)))
    );
}

#[test]
fn truncated_control_frame_fails_closed() {
    let (started_sender, started_receiver) = mpsc::channel();
    let (observed_sender, _observed_receiver) = mpsc::channel();
    let (input, output, done, worker) = start(CancellationExecutor {
        started: started_sender,
        observed: observed_sender,
        release: None,
    });
    wait_for(&output, |messages| !messages.is_empty());
    recv_watchdog(&started_receiver);
    input.send(Some(vec![0, 0, 0, 3, b'n'])).unwrap();
    close_and_wait(input, &done);
    assert!(matches!(
        join_worker(worker),
        Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
    ));
    assert!(
        !observed_messages(&output)
            .iter()
            .any(|m| matches!(m, WireMessage::Response(_)))
    );
}

#[test]
fn wrong_identity_and_malformed_control_are_protocol_faults() {
    for payload in [
        frame(&cancel("wrong-request")),
        vec![0, 0, 0, 3, b'n', b'o', b'!'],
    ] {
        let (started_sender, started_receiver) = mpsc::channel();
        let (observed_sender, _observed_receiver) = mpsc::channel();
        let (input, output, done, worker) = start(CancellationExecutor {
            started: started_sender,
            observed: observed_sender,
            release: None,
        });
        wait_for(&output, |messages| !messages.is_empty());
        recv_watchdog(&started_receiver);
        input.send(Some(payload)).unwrap();
        close_and_wait(input, &done);
        let result = join_worker(worker);
        assert!(matches!(
            result,
            Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
        ));
        assert!(
            !observed_messages(&output)
                .iter()
                .any(|m| matches!(m, WireMessage::Response(_)))
        );
    }
}

#[test]
fn progress_is_visible_before_executor_completion() {
    let (emitted_sender, emitted_receiver) = mpsc::channel();
    let (release_sender, release_receiver) = mpsc::channel();
    let (input, output, done, worker) = start(ProgressGateExecutor {
        emitted: emitted_sender,
        release: release_receiver,
    });
    recv_watchdog(&emitted_receiver);
    let messages = wait_for(&output, |messages| messages.len() >= 2);
    assert!(matches!(
        messages[1],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(_),
            ..
        })
    ));
    release_sender.send(()).unwrap();
    wait_for(&output, |messages| {
        matches!(messages.last(), Some(WireMessage::Response(_)))
    });
    assert!(join_worker(worker).is_ok());
    close_and_wait(input, &done);
}

#[test]
fn progress_rejects_wrong_session_and_request_identity() {
    let mut wrong_session = progress(0, ProgressStage::Preparing);
    wrong_session.session_id = SessionId::parse("session-other").unwrap();
    let mut wrong_request = progress(0, ProgressStage::Preparing);
    wrong_request.request_id = RequestId::parse("request-other").unwrap();
    for event in [wrong_session, wrong_request] {
        let (result, messages) = run_progress_observed(vec![event]);
        assert!(matches!(
            result,
            Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
        ));
        assert_accepted_only(&messages);
    }
}

#[test]
fn progress_requires_progress_payload() {
    let (result, messages) = run_progress_observed(vec![accepted_event()]);
    assert!(matches!(
        result,
        Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
    ));
    assert_accepted_only(&messages);
}

#[test]
fn progress_requires_increasing_sequence_and_monotonic_stage() {
    let (result, messages) = run_progress_observed(vec![
        progress(0, ProgressStage::Preparing),
        progress(0, ProgressStage::Preparing),
    ]);
    assert!(matches!(
        result,
        Err(WorkerError::Validation(
            ValidationError::ProgressSequenceNotIncreasing
        ))
    ));
    assert_eq!(messages.len(), 2);
    assert!(matches!(
        messages[1],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(_),
            ..
        })
    ));
    assert!(
        !messages
            .iter()
            .any(|message| matches!(message, WireMessage::Response(_)))
    );
    let (result, messages) = run_progress_observed(vec![
        progress(0, ProgressStage::Committing),
        progress(1, ProgressStage::Preparing),
    ]);
    assert!(matches!(
        result,
        Err(WorkerError::Validation(
            ValidationError::ProgressStageRegressed
        ))
    ));
    assert_eq!(messages.len(), 2);
    assert!(matches!(
        messages[1],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(_),
            ..
        })
    ));
    assert!(
        !messages
            .iter()
            .any(|message| matches!(message, WireMessage::Response(_)))
    );
}

#[test]
fn progress_validates_units_before_publishing() {
    let mut invalid = progress(0, ProgressStage::Preparing);
    invalid.payload = EventPayload::Progress(ProgressEvent {
        completed_units: Some(3),
        total_units: Some(2),
        ..match invalid.payload {
            EventPayload::Progress(progress) => progress,
            _ => unreachable!(),
        }
    });
    let (result, messages) = run_progress_observed(vec![invalid]);
    assert!(matches!(
        result,
        Err(WorkerError::Validation(
            ValidationError::CompletedExceedsTotal
        ))
    ));
    assert_accepted_only(&messages);
}

#[test]
fn flushed_committing_progress_survives_executor_failure() {
    let (committed_sender, committed_receiver) = mpsc::channel();
    let (input, output, done, worker) = start(CrashAfterCommitExecutor {
        committed: committed_sender,
    });
    recv_watchdog(&committed_receiver);
    let messages = wait_for(&output, |messages| messages.len() >= 3);
    assert!(matches!(
        messages[2],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(ProgressEvent {
                stage: ProgressStage::Committing,
                ..
            }),
            ..
        })
    ));
    assert!(matches!(
        join_worker(worker),
        Err(WorkerError::Crash(StableErrorCode::WorkerCrashed))
    ));
    assert!(
        !observed_messages(&output)
            .iter()
            .any(|m| matches!(m, WireMessage::Response(_)))
    );
    close_and_wait(input, &done);
}

#[test]
fn ignored_progress_write_failure_suppresses_success_final() {
    let state = Arc::new(Mutex::new((Vec::new(), 0)));
    let result = run_once(
        Cursor::new(frame(&WireMessage::Request(request()))),
        FailingProgressWriter {
            state: Arc::clone(&state),
        },
        &WorkerDependencies {
            executor: &IgnoreProgressFailureExecutor,
        },
    );
    assert!(matches!(result, Err(WorkerError::Codec(_))));
    assert_eq!(state.lock().unwrap().1, 2);
    let mut output = Cursor::new(state.lock().unwrap().0.clone());
    let messages =
        std::iter::from_fn(|| read_message(&mut output).ok().flatten()).collect::<Vec<_>>();
    assert!(
        !messages
            .iter()
            .any(|message| matches!(message, WireMessage::Response(_)))
    );
}

#[test]
fn ignored_progress_validation_failure_preserves_validation_type() {
    let result = run_once(
        Cursor::new(frame(&WireMessage::Request(request()))),
        Vec::<u8>::new(),
        &WorkerDependencies {
            executor: &IgnoreValidationFailureExecutor,
        },
    );
    assert!(matches!(
        result,
        Err(WorkerError::Validation(
            ValidationError::CompletedExceedsTotal
        ))
    ));
}

#[test]
fn ack_write_failure_is_terminal_before_executor_success() {
    let (input_sender, input_receiver) = mpsc::channel();
    let (received_sender, _received_receiver) = mpsc::channel();
    let done = Arc::new(AtomicBool::new(false));
    let state = Arc::new(Mutex::new((Vec::new(), 0)));
    let reader = PipeReader {
        input: input_receiver,
        pending: Cursor::new(frame(&WireMessage::Request(request()))),
        done: Arc::clone(&done),
        received: received_sender,
    };
    let worker_done = Arc::clone(&done);
    let writer_state = Arc::clone(&state);
    let worker = thread::spawn(move || {
        let executor = AckFailureExecutor {
            reader_done: worker_done,
        };
        let writer = FailingAckWriter {
            state: writer_state,
        };
        run_once(
            reader,
            writer,
            &WorkerDependencies {
                executor: &executor,
            },
        )
    });
    input_sender
        .send(Some(frame(&cancel("request-live"))))
        .unwrap();
    close_and_wait(input_sender, &done);
    assert!(matches!(join_worker(worker), Err(WorkerError::Codec(_))));
    let bytes = state.lock().unwrap().0.clone();
    let mut output = Cursor::new(bytes);
    let messages =
        std::iter::from_fn(|| read_message(&mut output).ok().flatten()).collect::<Vec<_>>();
    assert!(
        !messages
            .iter()
            .any(|message| matches!(message, WireMessage::Response(_)))
    );
}

#[test]
fn coordinator_protocol_fault_precedes_non_cancelled_executor_error() {
    let (started_sender, started_receiver) = mpsc::channel();
    let (input_sender, input_receiver) = mpsc::channel();
    let (received_sender, _received_receiver) = mpsc::channel();
    let output = Arc::new((Mutex::new(Vec::new()), Condvar::new()));
    let done = Arc::new(AtomicBool::new(false));
    let reader = PipeReader {
        input: input_receiver,
        pending: Cursor::new(frame(&WireMessage::Request(request()))),
        done: Arc::clone(&done),
        received: received_sender,
    };
    let writer = ObservedWriter {
        output: Arc::clone(&output),
        pending: Vec::new(),
    };
    let reader_done = Arc::clone(&done);
    let worker = thread::spawn(move || {
        let executor = CrashAfterProtocolFault {
            started: started_sender,
            reader_done,
        };
        let dependencies = WorkerDependencies {
            executor: &executor,
        };
        run_once(reader, writer, &dependencies)
    });
    wait_for(&output, |messages| !messages.is_empty());
    recv_watchdog(&started_receiver);
    input_sender
        .send(Some(frame(&cancel("wrong-request"))))
        .unwrap();
    let result = join_worker(worker);
    assert!(matches!(
        result,
        Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation))
    ));
    assert!(
        !observed_messages(&output)
            .iter()
            .any(|message| matches!(message, WireMessage::Response(_)))
    );
    close_and_wait(input_sender, &done);
}

#[test]
fn final_response_is_last_even_when_cancel_arrives_after_it() {
    let (input, output, done, worker) = start(ImmediateExecutor);
    let messages = wait_for(&output, |messages| {
        matches!(messages.last(), Some(WireMessage::Response(_)))
    });
    assert!(join_worker(worker).is_ok());
    input.send(Some(frame(&cancel("request-live")))).unwrap();
    close_and_wait(input, &done);
    assert_eq!(messages, observed_messages(&output));
}

#[test]
fn cancel_during_final_flush_cannot_append_ack_after_final() {
    let (input_sender, input_receiver) = mpsc::channel();
    let (received_sender, received_receiver) = mpsc::channel();
    let output = Arc::new((Mutex::new(Vec::new()), Condvar::new()));
    let done = Arc::new(AtomicBool::new(false));
    let reader = PipeReader {
        input: input_receiver,
        pending: Cursor::new(frame(&WireMessage::Request(request()))),
        done: Arc::clone(&done),
        received: received_sender,
    };
    let (final_started_sender, final_started_receiver) = mpsc::channel();
    let (final_release_sender, final_release_receiver) = mpsc::channel();
    let writer = FinalFlushBarrierWriter {
        output: Arc::clone(&output),
        pending: Vec::new(),
        final_flush_started: final_started_sender,
        final_flush_release: final_release_receiver,
        flush_count: 0,
        barrier_flush: 2,
    };
    let worker = thread::spawn(move || {
        let dependencies = WorkerDependencies {
            executor: &ImmediateExecutor,
        };
        run_once(reader, writer, &dependencies)
    });
    wait_for(&output, |messages| !messages.is_empty());
    recv_watchdog(&final_started_receiver);
    input_sender
        .send(Some(frame(&cancel("request-live"))))
        .unwrap();
    recv_watchdog(&received_receiver);
    final_release_sender.send(()).unwrap();
    assert!(join_worker(worker).is_ok());
    close_and_wait(input_sender, &done);
    let messages = observed_messages(&output);
    assert!(matches!(messages.last(), Some(WireMessage::Response(_))));
    assert_eq!(
        messages
            .iter()
            .filter(|message| matches!(
                message,
                WireMessage::Event(EventEnvelope {
                    payload: EventPayload::CancellationAcknowledged(_),
                    ..
                })
            ))
            .count(),
        0
    );
}

#[test]
fn cancel_during_commit_flush_is_ordered_after_commit_and_before_final() {
    let (input_sender, input_receiver) = mpsc::channel();
    let (received_sender, received_receiver) = mpsc::channel();
    let output = Arc::new((Mutex::new(Vec::new()), Condvar::new()));
    let done = Arc::new(AtomicBool::new(false));
    let reader = PipeReader {
        input: input_receiver,
        pending: Cursor::new(frame(&WireMessage::Request(request()))),
        done: Arc::clone(&done),
        received: received_sender,
    };
    let (commit_flush_sender, commit_flush_receiver) = mpsc::channel();
    let (commit_flush_release_sender, commit_flush_release_receiver) = mpsc::channel();
    let writer = FinalFlushBarrierWriter {
        output: Arc::clone(&output),
        pending: Vec::new(),
        final_flush_started: commit_flush_sender,
        final_flush_release: commit_flush_release_receiver,
        flush_count: 0,
        barrier_flush: 3,
    };
    let (committed_sender, _committed_receiver) = mpsc::channel();
    let (executor_release_sender, executor_release_receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let executor = CommitExecutor {
            committed: committed_sender,
            release: executor_release_receiver,
        };
        run_once(
            reader,
            writer,
            &WorkerDependencies {
                executor: &executor,
            },
        )
    });
    wait_for(&output, |messages| messages.len() >= 2);
    recv_watchdog(&commit_flush_receiver);
    input_sender
        .send(Some(frame(&cancel("request-live"))))
        .unwrap();
    recv_watchdog(&received_receiver);
    assert!(!observed_messages(&output).iter().any(|message| matches!(
        message,
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::CancellationAcknowledged(_),
            ..
        })
    )));
    commit_flush_release_sender.send(()).unwrap();
    let messages = wait_for(&output, |messages| {
        messages.iter().any(|message| {
            matches!(
                message,
                WireMessage::Event(EventEnvelope {
                    payload: EventPayload::CancellationAcknowledged(_),
                    ..
                })
            )
        })
    });
    assert!(messages.iter().any(|message| matches!(
        message,
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(ProgressEvent {
                stage: ProgressStage::Committing,
                ..
            }),
            ..
        })
    )));
    assert!(messages.iter().any(|message| matches!(
        message,
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::CancellationAcknowledged(ack),
            ..
        }) if ack.decision == CancellationDecision::RejectedCommitInProgress
    )));
    executor_release_sender.send(()).unwrap();
    let messages = wait_for(&output, |messages| {
        matches!(messages.last(), Some(WireMessage::Response(_)))
    });
    assert!(matches!(
        messages.last(),
        Some(WireMessage::Response(ResponseEnvelope {
            outcome: ResponseOutcome::Success { .. },
            ..
        }))
    ));
    assert_eq!(messages.len(), 5);
    assert!(matches!(
        messages[2],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::Progress(ProgressEvent {
                stage: ProgressStage::Committing,
                ..
            }),
            ..
        })
    ));
    assert!(matches!(
        &messages[3],
        WireMessage::Event(EventEnvelope {
            payload: EventPayload::CancellationAcknowledged(ack),
            ..
        }) if ack.decision == CancellationDecision::RejectedCommitInProgress
    ));
    assert!(matches!(
        messages[4],
        WireMessage::Response(ResponseEnvelope {
            outcome: ResponseOutcome::Success { .. },
            ..
        })
    ));
    assert!(join_worker(worker).is_ok());
    close_and_wait(input_sender, &done);
}
