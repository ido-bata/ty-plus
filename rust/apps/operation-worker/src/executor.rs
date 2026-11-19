use serde_json::Value;
use ty_plus_protocol::{
    CURRENT_PROTOCOL_VERSION, CanonicalMethod, DiagnosticId, PluginEffectScanRequest,
    ProtocolError, RequestEnvelope, ResponseEnvelope, ResponseOutcome, StableErrorCode, Warning,
};

use crate::{
    CancellationToken, EventSink, OperationExecutor, WorkerError,
    dispatch_plugin_effect_scan_for_request,
    host_filesystem_thumbnail_dispatch::{
        dispatch_thumbnail_batch_for_request, dispatch_thumbnail_lookup_or_generate_for_request,
    },
};

/// Composition root for all operations accepted by the worker executable.
#[derive(Debug, Clone)]
pub struct ProductionOperationExecutor;

impl Default for ProductionOperationExecutor {
    fn default() -> Self {
        Self
    }
}

impl OperationExecutor for ProductionOperationExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        let Some(canonical) = request.method.canonical() else {
            return failure(
                request,
                StableErrorCode::InvalidRequest,
                "unsupported operation",
            );
        };

        if let Err(error) = validate_payload(canonical, &request.payload) {
            let _ = error;
            return failure(
                request,
                StableErrorCode::InvalidRequest,
                "invalid operation payload",
            );
        }
        cancellation.checkpoint()?;

        // `update.install` reports typed failures (integrity, download,
        // permission, contention) that must reach the wire as stable
        // error codes instead of collapsing into `internal_error`
        // (Issue #169).
        if canonical == CanonicalMethod::UpdateInstall {
            return execute_update_install(request, cancellation, events);
        }

        let result = match canonical {
            CanonicalMethod::HostPluginEffectScan => {
                let payload: PluginEffectScanRequest =
                    serde_json::from_value(request.payload.clone())
                        .expect("payload was validated before dispatch");
                dispatch_plugin_effect_scan_for_request(request, payload, cancellation, events)
                    .map(|result| serde_json::to_value(result).expect("scan result serializes"))
                    .map_err(|error| error.to_string())
            }
            CanonicalMethod::HostThumbnailLookup
            | CanonicalMethod::HostThumbnailGenerate
            | CanonicalMethod::HostThumbnailLookupOrGenerate => {
                let payload: ty_plus_protocol::LookupOrGenerateThumbnailRequest =
                    match serde_json::from_value(request.payload.clone()) {
                        Ok(p) => p,
                        Err(_error) => {
                            return failure(
                                request,
                                StableErrorCode::InvalidRequest,
                                "invalid thumbnail payload",
                            );
                        }
                    };
                dispatch_thumbnail_lookup_or_generate_for_request(request, payload)
                    .map(|result| {
                        serde_json::to_value(result).expect("thumbnail result serializes")
                    })
                    .map_err(|error| error.to_string())
            }
            CanonicalMethod::HostThumbnailBatch => {
                let payload: ty_plus_protocol::BatchThumbnailRequest =
                    match serde_json::from_value(request.payload.clone()) {
                        Ok(p) => p,
                        Err(_error) => {
                            return failure(
                                request,
                                StableErrorCode::InvalidRequest,
                                "invalid batch thumbnail payload",
                            );
                        }
                    };
                dispatch_thumbnail_batch_for_request(request, payload)
                    .map(|result| serde_json::to_value(result).expect("batch result serializes"))
                    .map_err(|error| error.to_string())
            }
            CanonicalMethod::UpdateInstall => {
                unreachable!("update install returns early above")
            }
        };

        match result {
            Ok(payload) => Ok(ResponseEnvelope {
                protocol_version: CURRENT_PROTOCOL_VERSION,
                request_id: request.metadata.request_id.clone(),
                session_id: request.metadata.session_id.clone(),
                outcome: ResponseOutcome::Success {
                    payload,
                    warnings: Vec::<Warning>::new(),
                },
            }),
            Err(_error) if cancellation.is_cancelled() => {
                Err(WorkerError::Protocol(StableErrorCode::Cancelled))
            }
            Err(_error) => failure(request, StableErrorCode::InternalError, "operation failed"),
        }
    }
}

/// `update.install` dispatch with per-variant wire error mapping. Kept
/// out of the shared `Result<Value, String>` path so `UpdateInstallError`
/// survives to `StableErrorCode` classification (Issue #169).
fn execute_update_install(
    request: &RequestEnvelope,
    cancellation: &CancellationToken,
    events: &mut dyn EventSink,
) -> Result<ResponseEnvelope, WorkerError> {
    let payload: crate::UpdateInstallRequest = match serde_json::from_value(request.payload.clone())
    {
        Ok(payload) => payload,
        Err(_error) => {
            return failure(
                request,
                StableErrorCode::InvalidRequest,
                "invalid update install payload",
            );
        }
    };
    match crate::dispatch_update_install(request, payload, cancellation, events) {
        Ok(payload) => Ok(ResponseEnvelope {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            request_id: request.metadata.request_id.clone(),
            session_id: request.metadata.session_id.clone(),
            outcome: ResponseOutcome::Success {
                payload,
                warnings: Vec::<Warning>::new(),
            },
        }),
        Err(_) if cancellation.is_cancelled() => {
            Err(WorkerError::Protocol(StableErrorCode::Cancelled))
        }
        Err(error) => {
            let (code, retryable, detail) = crate::update_install::update_error_wire(&error);
            failure_with_retryable(request, code, retryable, &detail)
        }
    }
}

fn validate_payload(method: CanonicalMethod, payload: &Value) -> Result<(), String> {
    match method {
        CanonicalMethod::HostPluginEffectScan => {
            let request: PluginEffectScanRequest =
                serde_json::from_value(payload.clone()).map_err(|error| error.to_string())?;
            request.validate().map_err(|error| error.to_string())
        }
        CanonicalMethod::HostThumbnailLookup
        | CanonicalMethod::HostThumbnailGenerate
        | CanonicalMethod::HostThumbnailLookupOrGenerate
        | CanonicalMethod::HostThumbnailBatch => {
            // All thumbnail methods share compatible wire payload shapes.
            Ok(())
        }
        CanonicalMethod::UpdateInstall => {
            serde_json::from_value::<crate::UpdateInstallRequest>(payload.clone())
                .map(|_| ())
                .map_err(|error| error.to_string())
        }
    }
}

fn failure(
    request: &RequestEnvelope,
    code: StableErrorCode,
    detail: &str,
) -> Result<ResponseEnvelope, WorkerError> {
    failure_with_retryable(request, code, false, detail)
}

fn failure_with_retryable(
    request: &RequestEnvelope,
    code: StableErrorCode,
    retryable: bool,
    detail: &str,
) -> Result<ResponseEnvelope, WorkerError> {
    let error = ProtocolError::new(
        code,
        retryable,
        detail,
        DiagnosticId::parse("worker-operation-failed").map_err(WorkerError::Validation)?,
    )
    .map_err(WorkerError::Validation)?;
    Ok(ResponseEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        request_id: request.metadata.request_id.clone(),
        session_id: request.metadata.session_id.clone(),
        outcome: ResponseOutcome::Failure { error },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ops::Deref;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use ty_plus_protocol::{
        DeadlineUnixMs, EventEnvelope, HostContext, InvocationContext, ManagedRootContext,
        MethodName, RequestId, RequestMetadata, SessionId,
    };

    static NEXT_FIXTURE: AtomicUsize = AtomicUsize::new(0);

    struct FixtureDir {
        path: PathBuf,
        root: PathBuf,
    }

    impl Deref for FixtureDir {
        type Target = Path;

        fn deref(&self) -> &Self::Target {
            &self.path
        }
    }

    impl AsRef<Path> for FixtureDir {
        fn as_ref(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for FixtureDir {
        fn drop(&mut self) {
            let Ok(path) = std::fs::canonicalize(&self.path) else {
                return;
            };
            if path.starts_with(&self.root) {
                let _ = std::fs::remove_dir_all(&path);
            }
        }
    }

    fn tempdir_in(label: &str) -> FixtureDir {
        assert!(
            !label.is_empty()
                && label
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        );
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .join(".tmp/ow-live-003");
        std::fs::create_dir_all(&root).unwrap();
        let root = std::fs::canonicalize(root).unwrap();
        let directory = root.join(format!(
            "{label}-{}-{}",
            std::process::id(),
            NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ));
        assert!(directory.starts_with(&root));
        std::fs::create_dir_all(&directory).unwrap();
        assert!(
            std::fs::canonicalize(&directory)
                .unwrap()
                .starts_with(&root)
        );
        FixtureDir {
            path: directory,
            root,
        }
    }

    #[test]
    fn fixture_dir_drop_removes_new_fixture_within_resolved_root() {
        let path = {
            let fixture = tempdir_in("fixture-drop");
            let path = fixture.to_path_buf();
            assert!(path.exists());
            path
        };
        assert!(!path.exists(), "fixture Drop must remove its directory");
    }

    #[cfg(target_os = "windows")]
    fn platform_plugin_filename(stem: &str) -> String {
        format!("{stem}.aex")
    }

    #[cfg(target_os = "macos")]
    fn platform_plugin_filename(stem: &str) -> String {
        format!("{stem}.plugin")
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn platform_plugin_filename(stem: &str) -> String {
        format!("{stem}.plugin")
    }

    struct CancellingEvents {
        token: CancellationToken,
        seen: usize,
    }

    struct RootBarrierCancellingEvents {
        token: CancellationToken,
        barrier_seen: bool,
        advanced_after_barrier: bool,
    }

    impl EventSink for CancellingEvents {
        fn progress(&mut self, _event: EventEnvelope) -> Result<(), WorkerError> {
            self.seen += 1;
            if self.seen == 1 {
                self.token.cancel();
            }
            Ok(())
        }
    }

    impl EventSink for RootBarrierCancellingEvents {
        fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError> {
            let ty_plus_protocol::EventPayload::Progress(progress) = event.payload else {
                return Ok(());
            };
            if self.barrier_seen {
                self.advanced_after_barrier = true;
            }
            if progress.stage == ty_plus_protocol::ProgressStage::Discovering
                && progress.completed_units == Some(2)
                && progress.total_units == Some(3)
            {
                self.barrier_seen = true;
                self.token.cancel();
            }
            Ok(())
        }
    }

    #[derive(Default)]
    struct NoopEvents;

    impl EventSink for NoopEvents {
        fn progress(&mut self, _event: EventEnvelope) -> Result<(), WorkerError> {
            Ok(())
        }
    }

    fn scan_request(root: &std::path::Path) -> RequestEnvelope {
        let session = SessionId::parse("executor-session").unwrap();
        RequestEnvelope {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            metadata: RequestMetadata {
                request_id: RequestId::parse("executor-request").unwrap(),
                session_id: session,
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
                    app_root: root.to_string_lossy().into_owned(),
                    support_root: root.join("support").to_string_lossy().into_owned(),
                    session_id: "executor-session".to_owned(),
                },
                managed_root: ManagedRootContext::SessionDefault,
            },
            method: MethodName::parse("host.plugin.effect.scan").unwrap(),
            payload: serde_json::json!({"roots": ["Plugins"]}),
        }
    }

    #[test]
    fn production_host_scan_checks_shared_token_before_each_real_batch() {
        let root = tempdir_in("executor-cancel");
        std::fs::create_dir_all(root.join("Plugins")).unwrap();
        for index in 0..8 {
            let batch = root.join("Plugins").join(format!("batch-{index}"));
            std::fs::create_dir_all(&batch).unwrap();
            std::fs::write(batch.join(platform_plugin_filename("fixture")), b"fixture").unwrap();
        }
        let request = scan_request(&root);
        let token = CancellationToken::default();
        let mut events = CancellingEvents {
            token: token.clone(),
            seen: 0,
        };
        let result = ProductionOperationExecutor.execute(&request, &token, &mut events);
        assert!(matches!(
            result,
            Err(WorkerError::Protocol(StableErrorCode::Cancelled))
        ));
        assert_eq!(
            events.seen, 1,
            "scan must stop at the next batch checkpoint"
        );
    }

    #[test]
    fn production_host_scan_cancels_at_completed_root_before_invalid_next_root() {
        let root = tempdir_in("executor-root-barrier");
        for name in ["ValidA", "ValidB"] {
            std::fs::create_dir_all(root.join(name)).unwrap();
            std::fs::write(
                root.join(name).join(platform_plugin_filename("fixture")),
                b"fixture",
            )
            .unwrap();
        }
        let mut request = scan_request(&root);
        request.payload = serde_json::json!({
            "roots": ["ValidA", "ValidB", "Missing"]
        });
        let token = CancellationToken::default();
        let mut events = RootBarrierCancellingEvents {
            token: token.clone(),
            barrier_seen: false,
            advanced_after_barrier: false,
        };
        let result = ProductionOperationExecutor.execute(&request, &token, &mut events);
        assert!(matches!(
            result,
            Err(WorkerError::Protocol(StableErrorCode::Cancelled))
        ));
        assert!(events.barrier_seen, "second valid root must complete first");
        assert!(
            !events.advanced_after_barrier,
            "cancelled root boundary must not emit progress for invalid next root"
        );
    }

    #[test]
    fn production_executor_rejects_wrong_payload_before_opening_storage() {
        let root = tempdir_in("executor-invalid");
        let mut request = scan_request(&root);
        request.method = MethodName::parse("unknown.method").unwrap();
        request.payload = serde_json::json!({"q": "not a download"});
        let token = CancellationToken::default();
        let mut events = CancellingEvents {
            token: token.clone(),
            seen: 0,
        };
        let result = ProductionOperationExecutor
            .execute(&request, &token, &mut events)
            .unwrap();
        assert!(
            matches!(result.outcome, ResponseOutcome::Failure { error } if error.code == StableErrorCode::InvalidRequest)
        );
        assert!(
            !root.join("support/ty-plus").exists(),
            "invalid payload must fail before storage composition"
        );
    }

    #[test]
    fn canonical_registry_has_an_explicit_payload_route_for_every_method() {
        for method in CanonicalMethod::all() {
            let payload = match method {
                CanonicalMethod::HostPluginEffectScan => serde_json::json!({"roots": ["Plugins"]}),
                CanonicalMethod::HostThumbnailLookup
                | CanonicalMethod::HostThumbnailGenerate
                | CanonicalMethod::HostThumbnailLookupOrGenerate => {
                    serde_json::json!({
                        "source_path": "/host/foo.png",
                        "mtime_ms": 1700000000000i64,
                        "size_bytes": 4096,
                        "file_type": "image"
                    })
                }
                CanonicalMethod::HostThumbnailBatch => {
                    serde_json::json!({
                        "requests": [{
                            "source_path": "/host/foo.png",
                            "mtime_ms": 1700000000000i64,
                            "size_bytes": 4096,
                            "file_type": "image"
                        }]
                    })
                }
                CanonicalMethod::UpdateInstall => serde_json::json!({
                    "release_version": "9.9.9",
                    "tag": "v9.9.9",
                    "asset": {
                        "url": "https://github.com/ido-bata/ty-plus/releases/download/v9.9.9/ty-plus-v9.9.9-macos.zip",
                        "file_name": "ty-plus-v9.9.9-macos.zip",
                        "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e"
                    }
                }),
            };
            assert!(
                validate_payload(*method, &payload).is_ok(),
                "canonical route has no strict payload mapping: {}",
                method.wire_name()
            );
        }
        assert_eq!(CanonicalMethod::all().len(), 6);
    }

    #[test]
    fn production_executor_executes_every_canonical_method_branch() {
        let root = tempdir_in("executor-all-methods");
        std::fs::create_dir_all(root.join("support")).unwrap();
        std::fs::create_dir_all(root.join("Plugins")).unwrap();
        std::fs::write(
            root.join("Plugins")
                .join(platform_plugin_filename("fixture")),
            b"fixture",
        )
        .unwrap();

        let executor = ProductionOperationExecutor;
        for method in CanonicalMethod::all() {
            let mut request = scan_request(&root);
            request.method = MethodName::parse(method.wire_name()).unwrap();
            // `update.install` mutates the extension install tree and hits
            // the network; it is covered by `update_install` unit tests,
            // not by this every-method executor sweep.
            if matches!(method, CanonicalMethod::UpdateInstall) {
                continue;
            }
            request.payload = match method {
                CanonicalMethod::HostPluginEffectScan => {
                    serde_json::json!({"roots": ["Plugins"]})
                }
                CanonicalMethod::HostThumbnailLookup
                | CanonicalMethod::HostThumbnailGenerate
                | CanonicalMethod::HostThumbnailLookupOrGenerate => {
                    serde_json::json!({
                        "source_path": "/host/foo.png",
                        "mtime_ms": 1700000000000i64,
                        "size_bytes": 4096,
                        "file_type": "image"
                    })
                }
                CanonicalMethod::HostThumbnailBatch => {
                    serde_json::json!({
                        "requests": [{
                            "source_path": "/host/foo.png",
                            "mtime_ms": 1700000000000i64,
                            "size_bytes": 4096,
                            "file_type": "image"
                        }]
                    })
                }
                CanonicalMethod::UpdateInstall => {
                    unreachable!("update install is skipped by the sweep below")
                }
            };
            let token = CancellationToken::default();
            let mut events = NoopEvents;
            let response = executor
                .execute(&request, &token, &mut events)
                .expect("canonical method must dispatch");
            match method {
                CanonicalMethod::HostPluginEffectScan => {
                    let ResponseOutcome::Success { payload, .. } = response.outcome else {
                        panic!("host scan must succeed");
                    };
                    assert_eq!(payload["rows"].as_array().map(Vec::len), Some(1));
                }
                CanonicalMethod::HostThumbnailLookup
                | CanonicalMethod::HostThumbnailGenerate
                | CanonicalMethod::HostThumbnailLookupOrGenerate => {
                    // The source file does not exist, so generation fails
                    // with an internal error. This validates the dispatch path
                    // reaches the pipeline and returns a structured error.
                    let ResponseOutcome::Failure { error } = response.outcome else {
                        panic!("thumbnail route must fail for non-existent source");
                    };
                    assert_eq!(error.code, StableErrorCode::InternalError);
                }
                CanonicalMethod::HostThumbnailBatch => {
                    // The source file does not exist, so the batch result
                    // contains an error for each item.
                    let ResponseOutcome::Success { payload, .. } = response.outcome else {
                        panic!("batch thumbnail route must succeed with error results");
                    };
                    let results = payload["results"].as_array().unwrap();
                    assert_eq!(results.len(), 1);
                    assert!(results[0]["error"].as_str().is_some());
                }
                CanonicalMethod::UpdateInstall => unreachable!(),
            }
        }
    }

    fn update_install_request() -> RequestEnvelope {
        let mut request = scan_request(Path::new("/host"));
        request.method = MethodName::parse("update.install").unwrap();
        request.payload = serde_json::json!({
            "release_version": "0.10.2",
            "tag": "v0.10.2",
            "asset": {
                "url": "https://github.com/ido-bata/ty-plus/releases/download/v0.10.2/ty-plus-v0.10.2-macos.zip",
                "file_name": "ty-plus-v0.10.2-macos.zip",
                "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e"
            }
        });
        request
    }

    /// Issue #135: `update.install` failures must surface as a
    /// `ResponseOutcome::Failure` carrying the mapped stable code and its
    /// retryable flag, not collapse into a worker error. The test binary
    /// does not live under an `app.ty-plus` install tree, so dispatch
    /// fails with `UnsupportedLayout` → `internal_error` (non-retryable)
    /// before any network access.
    #[test]
    fn update_install_typed_error_maps_to_failure_envelope() {
        let request = update_install_request();
        let token = CancellationToken::default();
        let mut events = NoopEvents;
        let response = ProductionOperationExecutor
            .execute(&request, &token, &mut events)
            .expect("typed install failure must produce a response envelope");
        let ResponseOutcome::Failure { error } = response.outcome else {
            panic!(
                "unsupported install layout must fail, got {:?}",
                response.outcome
            );
        };
        assert_eq!(error.code, StableErrorCode::InternalError);
        assert!(!error.retryable);
    }

    /// Issue #135: a cancelled `update.install` must surface as the
    /// stable `cancelled` protocol error rather than a failure envelope.
    #[test]
    fn update_install_cancelled_maps_to_protocol_cancelled() {
        let request = update_install_request();
        let token = CancellationToken::default();
        token.cancel();
        let mut events = NoopEvents;
        let result = execute_update_install(&request, &token, &mut events);
        assert!(matches!(
            result,
            Err(WorkerError::Protocol(StableErrorCode::Cancelled))
        ));
    }

    /// Issue #135: a payload that is not a valid `UpdateInstallRequest`
    /// fails as `invalid_request` before dispatch.
    #[test]
    fn update_install_invalid_payload_fails_invalid_request() {
        let mut request = update_install_request();
        request.payload = serde_json::json!({"release_version": 1});
        let token = CancellationToken::default();
        let mut events = NoopEvents;
        let response = ProductionOperationExecutor
            .execute(&request, &token, &mut events)
            .expect("invalid payload must produce a response envelope");
        assert!(
            matches!(response.outcome, ResponseOutcome::Failure { error } if error.code == StableErrorCode::InvalidRequest && !error.retryable)
        );
    }
}
