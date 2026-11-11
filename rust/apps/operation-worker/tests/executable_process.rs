use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use ty_plus_protocol::{
    CURRENT_PROTOCOL_VERSION, DeadlineUnixMs, HostContext, InvocationContext, ManagedRootContext,
    MethodName, RequestEnvelope, RequestId, RequestMetadata, ResponseOutcome, SessionId,
    WireMessage,
};

const MAX_HARNESS_FRAME_BYTES: usize = 1024 * 1024;
const MAX_CAPTURED_STDERR_BYTES: usize = 64 * 1024;
static NEXT_ARTIFACT: AtomicUsize = AtomicUsize::new(0);

struct InstalledWorker {
    executable: PathBuf,
    digest: String,
}

fn installed_worker() -> InstalledWorker {
    let repository_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let distribution_root = repository_root.join("dist/cep-dev");
    let manifest_path = distribution_root.join("worker/manifest.json");
    assert!(
        manifest_path.is_file(),
        "run `bun run build:cep:dev` before executable_process tests"
    );
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(&manifest_path).expect("development worker manifest must be readable"),
    )
    .expect("development worker manifest must be valid JSON");
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        panic!("operation-worker process tests require Windows or macOS");
    };
    let artifact = &manifest["workers"][platform];
    let relative_path = artifact["relativePath"]
        .as_str()
        .expect("manifest worker relativePath must be a string");
    let digest = artifact["sha256"]
        .as_str()
        .expect("manifest worker sha256 must be a string")
        .to_owned();
    let executable = distribution_root.join(relative_path);
    assert!(
        executable.is_file(),
        "manifest worker binary must exist: {}",
        executable.display()
    );
    let bytes = std::fs::read(&executable).expect("manifest worker binary must be readable");
    assert!(
        bytes
            .windows(b"ty-plus.operation-worker".len())
            .any(|window| window == b"ty-plus.operation-worker"),
        "built worker must embed its product identity"
    );
    let protocol_marker = format!(
        "ty-plus.protocol/{}.{}",
        CURRENT_PROTOCOL_VERSION.major, CURRENT_PROTOCOL_VERSION.minor
    );
    assert!(
        bytes
            .windows(protocol_marker.len())
            .any(|window| window == protocol_marker.as_bytes()),
        "built worker must embed its protocol identity"
    );
    InstalledWorker { executable, digest }
}

fn worker_command(worker: &InstalledWorker) -> Command {
    let mut command = Command::new(&worker.executable);
    command.env("TY_PLUS_WORKER_ARTIFACT_SHA256", &worker.digest);
    command
}

fn artifact_dir(label: &str) -> std::path::PathBuf {
    assert!(
        !label.is_empty()
            && label.chars().all(
                |character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            ),
        "artifact labels must be single safe path components"
    );
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join(".tmp/ow-live-003");
    std::fs::create_dir_all(&root).unwrap();
    let root = std::fs::canonicalize(root).unwrap();
    let directory = root.join(format!(
        "{label}-{}-{}",
        std::process::id(),
        NEXT_ARTIFACT.fetch_add(1, Ordering::Relaxed)
    ));
    assert!(directory.starts_with(&root));
    std::fs::create_dir_all(&directory).unwrap();
    let canonical_directory = std::fs::canonicalize(&directory).unwrap();
    assert!(canonical_directory.starts_with(&root));
    directory
}

fn harness_write_message<W: Write>(writer: &mut W, message: &WireMessage) -> io::Result<()> {
    let bytes = serde_json::to_vec(message).map_err(io::Error::other)?;
    let length = u32::try_from(bytes.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "frame too large"))?;
    writer.write_all(&length.to_be_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}

fn harness_read_message<R: Read>(reader: &mut R) -> Result<Option<WireMessage>, String> {
    let mut header = [0_u8; 4];
    match reader.read(&mut header[..1]) {
        Ok(0) => return Ok(None),
        Ok(_) => {}
        Err(error) => return Err(error.to_string()),
    }
    reader
        .read_exact(&mut header[1..])
        .map_err(|error| format!("truncated frame header: {error}"))?;
    let length = u32::from_be_bytes(header) as usize;
    if length == 0 || length > MAX_HARNESS_FRAME_BYTES {
        return Err(format!("invalid test frame length: {length}"));
    }
    let mut bytes = vec![0_u8; length];
    reader
        .read_exact(&mut bytes)
        .map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| error.to_string())
}

fn host_scan_request(app_root: &str, support_root: &str) -> RequestEnvelope {
    RequestEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        metadata: RequestMetadata {
            request_id: RequestId::parse("process-scan-1").unwrap(),
            session_id: SessionId::parse("process-session-1").unwrap(),
            deadline_unix_ms: DeadlineUnixMs::new(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64
                    + 60_000,
            ),
            cancellable: true,
            idempotency_key: None,
        },
        context: InvocationContext {
            host_context: HostContext {
                app_root: app_root.to_owned(),
                support_root: support_root.to_owned(),
                session_id: "process-session-1".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        method: MethodName::parse("host.plugin.effect.scan").unwrap(),
        payload: serde_json::json!({"roots": ["Plugins"]}),
    }
}

#[cfg(target_os = "windows")]
fn fixture_plugin_name() -> &'static str {
    "fixture.aex"
}

#[cfg(target_os = "macos")]
fn fixture_plugin_name() -> &'static str {
    "fixture.plugin"
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn fixture_plugin_name() -> &'static str {
    "fixture.plugin"
}

struct ChildDrains {
    stdout: Receiver<Result<Option<WireMessage>, String>>,
    stderr: Receiver<String>,
    stdout_join: JoinHandle<()>,
    stderr_join: JoinHandle<()>,
}

fn drain_child_with_watchdog(
    child: &mut Child,
    drains: ChildDrains,
    mut frames: Vec<WireMessage>,
) -> (Vec<WireMessage>, String, ExitStatus) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            let mut framing_error = None;
            loop {
                match drains.stdout.recv_timeout(Duration::from_secs(2)) {
                    Ok(Ok(Some(message))) => frames.push(message),
                    Ok(Ok(None)) => break,
                    Ok(Err(error)) => {
                        framing_error = Some(error);
                        break;
                    }
                    Err(error) => {
                        framing_error = Some(error.to_string());
                        break;
                    }
                }
            }
            let stderr = drains.stderr.recv().unwrap_or_default();
            drains
                .stdout_join
                .join()
                .expect("stdout drain thread must join");
            drains
                .stderr_join
                .join()
                .expect("stderr drain thread must join");
            if let Some(error) = framing_error {
                panic!("stdout framing error: {error}");
            }
            return (frames, stderr, status);
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let _ = child.kill();
    let status = child.wait().expect("watchdog child wait");
    let _stderr = drains.stderr.recv().unwrap_or_default();
    drains
        .stdout_join
        .join()
        .expect("stdout drain thread must join after watchdog");
    drains
        .stderr_join
        .join()
        .expect("stderr drain thread must join after watchdog");
    panic!("worker watchdog expired: {status:?}");
}

fn start_drains(child: &mut Child) -> ChildDrains {
    let mut stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let (stdout_sender, stdout_receiver) = mpsc::channel();
    let stdout_join = std::thread::spawn(move || {
        loop {
            match harness_read_message(&mut stdout) {
                Ok(Some(message)) => {
                    if stdout_sender.send(Ok(Some(message))).is_err() {
                        return;
                    }
                }
                Ok(None) => {
                    let _ = stdout_sender.send(Ok(None));
                    return;
                }
                Err(error) => {
                    let _ = stdout_sender.send(Err(error.to_string()));
                    return;
                }
            }
        }
    });
    let (stderr_sender, stderr_receiver) = mpsc::channel();
    let stderr_join = std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stderr);
        let mut captured = Vec::new();
        let mut buffer = [0_u8; 4096];
        let mut truncated = false;
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let remaining = MAX_CAPTURED_STDERR_BYTES.saturating_sub(captured.len());
                    let take = remaining.min(count);
                    captured.extend_from_slice(&buffer[..take]);
                    truncated |= take < count;
                }
                Err(_) => break,
            }
        }
        let mut text = String::from_utf8_lossy(&captured).into_owned();
        if truncated {
            text.push_str("[stderr truncated]");
        }
        let _ = stderr_sender.send(text);
    });
    ChildDrains {
        stdout: stdout_receiver,
        stderr: stderr_receiver,
        stdout_join,
        stderr_join,
    }
}

#[test]
fn real_worker_process_scans_host_root_and_exits_after_successful_final() {
    let worker = installed_worker();
    let fixture = artifact_dir("process-success");
    let app_root = fixture.join("After Effects");
    let support_root = fixture.join("Support");
    std::fs::create_dir_all(app_root.join("Plugins")).unwrap();
    std::fs::create_dir_all(&support_root).unwrap();
    std::fs::write(
        app_root.join("Plugins").join(fixture_plugin_name()),
        b"fixture plugin",
    )
    .unwrap();

    let mut child = worker_command(&worker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let request = host_scan_request(&app_root.to_string_lossy(), &support_root.to_string_lossy());
    let drains = start_drains(&mut child);
    harness_write_message(
        child.stdin.as_mut().unwrap(),
        &WireMessage::Request(request.clone()),
    )
    .unwrap();
    let (frames, stderr, status) = drain_child_with_watchdog(&mut child, drains, Vec::new());
    drop(child.stdin.take());

    assert!(status.success());
    assert_eq!(stderr.len(), 0);
    assert!(
        matches!(frames.first(), Some(WireMessage::Event(event)) if matches!(event.payload, ty_plus_protocol::EventPayload::Accepted(_)))
    );
    let mut accepted = 0_usize;
    let mut progress = Vec::new();
    for frame in &frames {
        match frame {
            WireMessage::Event(event) => {
                assert_eq!(event.request_id, request.metadata.request_id);
                assert_eq!(event.session_id, request.metadata.session_id);
                match &event.payload {
                    ty_plus_protocol::EventPayload::Accepted(_) => accepted += 1,
                    ty_plus_protocol::EventPayload::Progress(event) => progress.push(event),
                    ty_plus_protocol::EventPayload::CancellationAcknowledged(_) => {
                        panic!("success process must not emit cancellation acknowledgement")
                    }
                }
            }
            WireMessage::Response(response) => {
                assert_eq!(response.request_id, request.metadata.request_id);
                assert_eq!(response.session_id, request.metadata.session_id);
            }
            WireMessage::Request(_) | WireMessage::Cancel(_) => {
                panic!("child stdout must not echo control frames")
            }
        }
    }
    assert_eq!(accepted, 1);
    assert!(
        progress
            .windows(2)
            .all(|pair| { pair[1].sequence > pair[0].sequence && pair[1].stage >= pair[0].stage })
    );
    assert!(
        progress
            .iter()
            .any(|event| event.stage == ty_plus_protocol::ProgressStage::Discovering)
    );
    let finals: Vec<_> = frames
        .iter()
        .filter_map(|message| match message {
            WireMessage::Response(response) => Some(response),
            _ => None,
        })
        .collect();
    assert_eq!(finals.len(), 1);
    assert!(matches!(frames.last(), Some(WireMessage::Response(_))));
    let ResponseOutcome::Success { payload, .. } = &finals[0].outcome else {
        panic!(
            "expected successful host scan final: {:?}",
            finals[0].outcome
        );
    };
    assert_eq!(payload["rows"].as_array().map(Vec::len), Some(1));
    assert!(
        payload["rows"][0]["file_path"]
            .as_str()
            .is_some_and(|path| path.ends_with(fixture_plugin_name()))
    );
    let _ = std::fs::remove_dir_all(fixture);
}

#[test]
fn real_worker_domain_failure_redacts_sensitive_path_marker() {
    let worker = installed_worker();
    let marker = "OW-LIVE-003-SENSITIVE-MARKER";
    let fixture = artifact_dir("process-failure");
    let app_root = fixture.join(format!("missing-{marker}"));
    let support_root = fixture.join("Support");
    std::fs::create_dir_all(&support_root).unwrap();

    let mut child = worker_command(&worker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let drains = start_drains(&mut child);
    let mut request =
        host_scan_request(&app_root.to_string_lossy(), &support_root.to_string_lossy());
    request.payload = serde_json::json!({"roots": ["Missing"]});
    harness_write_message(
        child.stdin.as_mut().unwrap(),
        &WireMessage::Request(request),
    )
    .unwrap();
    let (frames, stderr, status) = drain_child_with_watchdog(&mut child, drains, Vec::new());
    drop(child.stdin.take());

    assert!(status.success());
    assert_eq!(stderr.len(), 0);
    let response = frames
        .iter()
        .find_map(|message| match message {
            WireMessage::Response(response) => Some(response),
            _ => None,
        })
        .expect("domain failure must have one final response");
    assert!(matches!(response.outcome, ResponseOutcome::Failure { .. }));
    let serialized = serde_json::to_string(&frames).unwrap();
    assert!(!serialized.contains(marker));
    assert!(!stderr.contains(marker));
    let _ = std::fs::remove_dir_all(fixture);
}

#[test]
fn real_worker_process_cancellation_smoke_records_observation_without_claiming_timing() {
    let worker = installed_worker();
    let fixture = artifact_dir("process-cancel");
    let app_root = fixture.join("After Effects");
    let support_root = fixture.join("Support");
    std::fs::create_dir_all(&app_root).unwrap();
    std::fs::create_dir_all(&support_root).unwrap();
    // The canonical wire contract caps payload roots at 16. Keep 64 distinct
    // nonempty batches while preserving that protocol-owned limit; a 64-root
    // payload requires a protocol-scope change outside this task's ownership.
    let roots: Vec<String> = (0..16).map(|root| format!("Root-{root:02}")).collect();
    for root in &roots {
        for batch in 0..4 {
            let directory = app_root.join(root).join(format!("batch-{batch:02}"));
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(directory.join(fixture_plugin_name()), b"fixture plugin").unwrap();
        }
    }

    let mut child = worker_command(&worker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut request =
        host_scan_request(&app_root.to_string_lossy(), &support_root.to_string_lossy());
    request.payload = serde_json::json!({"roots": roots});
    assert_eq!(request.payload["roots"].as_array().map(Vec::len), Some(16));
    let drains = start_drains(&mut child);
    let cancel_sent;
    let first;
    {
        let stdin = child.stdin.as_mut().unwrap();
        harness_write_message(stdin, &WireMessage::Request(request.clone())).unwrap();
        first = drains
            .stdout
            .recv_timeout(Duration::from_secs(10))
            .unwrap()
            .unwrap()
            .expect("accepted frame");
        assert!(
            matches!(&first, WireMessage::Event(event) if matches!(event.payload, ty_plus_protocol::EventPayload::Accepted(_)))
        );
        let cancel = WireMessage::Cancel(ty_plus_protocol::CancelRequest {
            target_request_id: request.metadata.request_id.clone(),
        });
        cancel_sent = harness_write_message(stdin, &cancel).is_ok();
    }
    let (frames, stderr, status) = drain_child_with_watchdog(&mut child, drains, vec![first]);
    let cancel_observed = frames.iter().any(|message| {
        matches!(message, WireMessage::Event(event) if matches!(event.payload, ty_plus_protocol::EventPayload::CancellationAcknowledged(_)))
    });
    println!("cancelObserved: {cancel_observed} (cancelSent: {cancel_sent})");
    assert!(status.success());
    assert_eq!(stderr.len(), 0);
    assert_eq!(
        frames
            .iter()
            .filter(|message| matches!(message, WireMessage::Response(_)))
            .count(),
        1
    );
    // This process smoke only proves framing and child wiring. Pipe flush timing
    // is not authoritative cancellation evidence; OW-LIVE-002 owns that proof.
    let _ = std::fs::remove_dir_all(fixture);
}
