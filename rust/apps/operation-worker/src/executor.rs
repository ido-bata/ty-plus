use serde_json::Value;
#[cfg(test)]
use std::path::Path;
use ty_plus_online::config::SupabaseConfig;
use ty_plus_protocol::{
    CURRENT_PROTOCOL_VERSION, CanonicalMethod, DiagnosticId, PluginEffectScanRequest,
    ProtocolError, RequestEnvelope, ResponseEnvelope, ResponseOutcome, StableErrorCode, Warning,
};

use crate::{
    CancellationToken, EventSink, Invocation, OnlineBoundary, OperationExecutor,
    ProductOnlineConfig, WorkerError, dispatch_online, dispatch_plugin_effect_scan_for_request,
    host_filesystem_thumbnail_dispatch::{
        dispatch_thumbnail_batch_for_request, dispatch_thumbnail_lookup_or_generate_for_request,
    },
    validate_online_payload,
};

/// Composition root for all operations accepted by the worker executable.
#[derive(Debug, Clone)]
pub struct ProductionOperationExecutor {
    online_config: ProductOnlineConfig,
    #[cfg(test)]
    test_online_factory: Option<fn(&Path) -> OnlineBoundary>,
}

impl ProductionOperationExecutor {
    #[must_use]
    pub fn with_online_config(config: SupabaseConfig) -> Self {
        Self::from_product_online_config(ProductOnlineConfig::Configured(config))
    }

    #[must_use]
    pub fn from_product_online_config(config: ProductOnlineConfig) -> Self {
        Self {
            online_config: config,
            #[cfg(test)]
            test_online_factory: None,
        }
    }

    #[cfg(test)]
    fn with_test_online_factory(
        config: ProductOnlineConfig,
        factory: fn(&Path) -> OnlineBoundary,
    ) -> Self {
        Self {
            online_config: config,
            test_online_factory: Some(factory),
        }
    }
}

impl Default for ProductionOperationExecutor {
    fn default() -> Self {
        Self::from_product_online_config(ProductOnlineConfig::Unconfigured)
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

        let result = match canonical {
            CanonicalMethod::HostPluginEffectScan => {
                let payload: PluginEffectScanRequest =
                    serde_json::from_value(request.payload.clone())
                        .expect("payload was validated before dispatch");
                dispatch_plugin_effect_scan_for_request(request, payload, cancellation, events)
                    .map(|result| serde_json::to_value(result).expect("scan result serializes"))
                    .map_err(|error| error.to_string())
            }
            CanonicalMethod::OnlineCatalogSearch
            | CanonicalMethod::OnlineConnectivityCheck
            | CanonicalMethod::OnlineDownload
            | CanonicalMethod::OnlineCatalogCacheRead
            | CanonicalMethod::OnlineCatalogCacheWrite
            | CanonicalMethod::OnlineCatalogCacheDelete
            | CanonicalMethod::OnlineCatalogCacheClear => {
                let invocation = Invocation {
                    context: request.context.clone(),
                    request: request.clone(),
                };
                let mut resolved = match invocation.resolve() {
                    Ok(resolved) => resolved,
                    Err(_error) => {
                        return failure(
                            request,
                            StableErrorCode::InternalError,
                            "operation boundary unavailable",
                        );
                    }
                };
                #[cfg(test)]
                if let Some(factory) = self.test_online_factory {
                    resolved.online = factory(resolved.managed_root.managed_root());
                } else if let ProductOnlineConfig::Configured(config) = &self.online_config {
                    resolved.online = OnlineBoundary::from_config(
                        resolved.managed_root.managed_root(),
                        config.clone(),
                    );
                }
                #[cfg(not(test))]
                if let ProductOnlineConfig::Configured(config) = &self.online_config {
                    resolved.online = OnlineBoundary::from_config(
                        resolved.managed_root.managed_root(),
                        config.clone(),
                    );
                }
                dispatch_online(
                    &resolved,
                    &request.method,
                    request.payload.clone(),
                    cancellation,
                    events,
                )
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

fn validate_payload(method: CanonicalMethod, payload: &Value) -> Result<(), String> {
    match method {
        CanonicalMethod::HostPluginEffectScan => {
            let request: PluginEffectScanRequest =
                serde_json::from_value(payload.clone()).map_err(|error| error.to_string())?;
            request.validate().map_err(|error| error.to_string())
        }
        CanonicalMethod::OnlineCatalogSearch
        | CanonicalMethod::OnlineConnectivityCheck
        | CanonicalMethod::OnlineDownload
        | CanonicalMethod::OnlineCatalogCacheRead
        | CanonicalMethod::OnlineCatalogCacheWrite
        | CanonicalMethod::OnlineCatalogCacheDelete
        | CanonicalMethod::OnlineCatalogCacheClear => {
            validate_online_payload(method, payload).map_err(|error| error.to_string())
        }
        CanonicalMethod::HostThumbnailLookup
        | CanonicalMethod::HostThumbnailGenerate
        | CanonicalMethod::HostThumbnailLookupOrGenerate
        | CanonicalMethod::HostThumbnailBatch => {
            // All thumbnail methods share compatible wire payload shapes.
            Ok(())
        }
    }
}

fn failure(
    request: &RequestEnvelope,
    code: StableErrorCode,
    detail: &str,
) -> Result<ResponseEnvelope, WorkerError> {
    let error = ProtocolError::new(
        code,
        false,
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
    use crate::{PersistentSearchCacheStore, product_online_config_from_inputs};
    use std::io::{Cursor, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::ops::Deref;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex, mpsc};
    use std::thread::JoinHandle;
    use std::time::{Duration, Instant};
    use ty_plus_online::catalog::{CatalogClient, CatalogQuery, CatalogResponse, CatalogTransport};
    use ty_plus_online::connectivity::{ConnectivityChecker, HealthProbe, ProbeError, ProbeResult};
    use ty_plus_online::download::{DownloadResponse, DownloadTransport};
    use ty_plus_online::offline::OfflineCatalogSearch;
    use ty_plus_online::search_cache::SearchCache;
    use ty_plus_online::search_cache::SearchCacheKey;
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

    #[derive(Debug)]
    struct RouteProbe;

    impl HealthProbe for RouteProbe {
        fn probe(&self, _url: &str) -> Result<ProbeResult, ProbeError> {
            Ok(ProbeResult { status: 200 })
        }
    }

    #[derive(Debug)]
    struct RouteCatalog;

    impl CatalogTransport for RouteCatalog {
        fn get(
            &self,
            url: &str,
            _headers: &[(String, String)],
        ) -> Result<CatalogResponse, ty_plus_online::catalog::CatalogError> {
            if url.contains("/preset/search") {
                return Ok(CatalogResponse {
                    status: 200,
                    body: serde_json::json!({
                        "items": [{
                            "preset_id": "route-preset",
                            "name": "Route Preset",
                            "category": "test"
                        }]
                    })
                    .to_string(),
                });
            }
            Err(ty_plus_online::catalog::CatalogError::Transport(
                "unexpected route catalog request".to_owned(),
            ))
        }
    }

    #[derive(Debug)]
    struct RouteDownload;

    impl DownloadTransport for RouteDownload {
        fn get(
            &self,
            _url: &str,
            _allowed_hosts: &[String],
        ) -> Result<DownloadResponse, ty_plus_online::download::DownloadError> {
            let body = b"route-download".to_vec();
            Ok(DownloadResponse {
                status: 200,
                final_url: "https://media.example.com/route.ffx".to_owned(),
                content_length: Some(body.len() as u64),
                body: Box::new(Cursor::new(body)),
            })
        }
    }

    fn fake_online_factory(root: &Path) -> OnlineBoundary {
        let config = SupabaseConfig::new("https://example.supabase.co".to_owned())
            .unwrap()
            .with_media_base_url("https://media.example.com".to_owned());
        OnlineBoundary::with_components(
            root,
            ConnectivityChecker::with_probe(config.clone(), RouteProbe),
            OfflineCatalogSearch::new(
                CatalogClient::with_transport(config.clone(), RouteCatalog),
                SearchCache::new(PersistentSearchCacheStore::new(root)),
            ),
            CatalogClient::with_transport(config.clone(), RouteCatalog),
            ty_plus_online::download::DownloadClient::with_transport(config, RouteDownload),
        )
    }

    fn assert_success(response: ResponseEnvelope, expected: Value) {
        let ResponseOutcome::Success { payload, warnings } = response.outcome else {
            panic!("expected success response, got {response:?}");
        };
        assert!(warnings.is_empty());
        assert_eq!(payload, expected);
    }

    struct LocalCatalogServer {
        base_url: String,
        requests: Arc<Mutex<Vec<String>>>,
        accepted: Arc<AtomicBool>,
        stop: mpsc::Sender<()>,
        join: Option<JoinHandle<()>>,
    }

    fn spawn_local_catalog_server() -> LocalCatalogServer {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let thread_requests = Arc::clone(&requests);
        let accepted = Arc::new(AtomicBool::new(false));
        let thread_accepted = Arc::clone(&accepted);
        let (stop, stop_receiver) = mpsc::channel();
        let join = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                if stop_receiver.try_recv().is_ok() {
                    break;
                }
                let Ok((mut stream, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(5));
                    continue;
                };
                thread_accepted.store(true, Ordering::Release);
                stream
                    .set_read_timeout(Some(Duration::from_millis(100)))
                    .unwrap();
                stream
                    .set_write_timeout(Some(Duration::from_millis(100)))
                    .unwrap();
                let mut request = Vec::new();
                let mut buffer = [0_u8; 1024];
                while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                    if stop_receiver.try_recv().is_ok() || Instant::now() >= deadline {
                        return;
                    }
                    let count = match stream.read(&mut buffer) {
                        Ok(count) => count,
                        Err(error)
                            if matches!(
                                error.kind(),
                                std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                            ) =>
                        {
                            continue;
                        }
                        Err(_) => 0,
                    };
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..count]);
                    if request.len() > 16 * 1024 {
                        break;
                    }
                }
                let request_line = String::from_utf8_lossy(&request)
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .to_owned();
                let path = request_line
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or_default()
                    .to_owned();
                thread_requests.lock().unwrap().push(path.clone());
                let body = if path == "/health" {
                    serde_json::json!({}).to_string()
                } else if path.starts_with("/preset/search") {
                    serde_json::json!({
                        "items": [{
                            "preset_id": "configured-preset",
                            "name": "Configured Preset"
                        }]
                    })
                    .to_string()
                } else {
                    serde_json::json!({"error": "not found"}).to_string()
                };
                let status = if path == "/health" || path.starts_with("/preset/search") {
                    "200 OK"
                } else {
                    "404 Not Found"
                };
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(response.as_bytes()).unwrap();
                stream.flush().unwrap();
                if thread_requests.lock().unwrap().len() >= 2 {
                    break;
                }
            }
        });
        LocalCatalogServer {
            base_url: format!("http://{address}"),
            requests,
            accepted,
            stop,
            join: Some(join),
        }
    }

    impl LocalCatalogServer {
        fn stop_and_join(&mut self) -> std::thread::Result<()> {
            let _ = self.stop.send(());
            self.join.take().map_or(Ok(()), |join| join.join())
        }

        fn finish(mut self) -> Vec<String> {
            self.stop_and_join()
                .expect("local server must join without panic");
            self.requests.lock().unwrap().clone()
        }
    }

    impl Drop for LocalCatalogServer {
        fn drop(&mut self) {
            let _ = self.stop_and_join();
        }
    }

    #[test]
    fn local_catalog_server_drop_is_bounded_with_half_open_client() {
        let server = spawn_local_catalog_server();
        let address: std::net::SocketAddr = server
            .base_url
            .strip_prefix("http://")
            .unwrap()
            .parse()
            .unwrap();
        let _client = TcpStream::connect(address).unwrap();
        let accepted_deadline = Instant::now() + Duration::from_secs(1);
        while !server.accepted.load(Ordering::Acquire) && Instant::now() < accepted_deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        assert!(server.accepted.load(Ordering::Acquire));
        let started = Instant::now();
        drop(server);
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "server Drop must join a half-open client within the bound"
        );
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
        let result = ProductionOperationExecutor::default().execute(&request, &token, &mut events);
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
        let result = ProductionOperationExecutor::default().execute(&request, &token, &mut events);
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
        request.method = MethodName::parse("online.download").unwrap();
        request.payload = serde_json::json!({"q": "not a download"});
        let token = CancellationToken::default();
        let mut events = CancellingEvents {
            token: token.clone(),
            seen: 0,
        };
        let result = ProductionOperationExecutor::default()
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
    fn configured_executor_factory_retains_explicit_online_config() {
        let config = SupabaseConfig::new("https://example.supabase.co".to_owned()).unwrap();
        let executor = ProductionOperationExecutor::with_online_config(config);
        assert!(matches!(
            executor.online_config,
            ProductOnlineConfig::Configured(_)
        ));
    }

    #[test]
    fn product_online_config_is_typed_and_invalid_inputs_disable_remote_only() {
        let configured = product_online_config_from_inputs(
            Some("https://example.supabase.co"),
            Some("publishable-key"),
            Some("https://example.supabase.co/functions/v1/typlus"),
        );
        assert!(matches!(
            configured,
            ProductOnlineConfig::Configured(ref config)
                if config.publishable_key() == Some("publishable-key")
        ));

        let incomplete = product_online_config_from_inputs(
            Some("https://example.supabase.co"),
            None,
            Some("https://example.supabase.co/functions/v1/typlus"),
        );
        assert_eq!(incomplete, ProductOnlineConfig::Invalid);

        let absent = product_online_config_from_inputs(None, None, None);
        assert_eq!(absent, ProductOnlineConfig::Unconfigured);
    }

    #[test]
    fn invalid_product_config_fails_remote_but_keeps_local_cache_available() {
        let root = tempdir_in("invalid-product-config");
        std::fs::create_dir_all(root.join("support")).unwrap();
        let executor =
            ProductionOperationExecutor::from_product_online_config(ProductOnlineConfig::Invalid);

        let mut cache_request = scan_request(&root);
        cache_request.method = MethodName::parse("online.catalog.cache.write").unwrap();
        cache_request.payload = serde_json::json!({
            "query": {"q": "local-cache"},
            "result": {"items": []}
        });
        let cache_token = CancellationToken::default();
        let mut cache_events = CancellingEvents {
            token: cache_token.clone(),
            seen: 0,
        };
        let cache_response = executor
            .execute(&cache_request, &cache_token, &mut cache_events)
            .unwrap();
        assert!(matches!(
            cache_response.outcome,
            ResponseOutcome::Success { .. }
        ));

        let mut remote_request = scan_request(&root);
        remote_request.method = MethodName::parse("online.catalog.search").unwrap();
        remote_request.payload = serde_json::json!({"q": "remote"});
        let remote_token = CancellationToken::default();
        let mut remote_events = CancellingEvents {
            token: remote_token.clone(),
            seen: 0,
        };
        let remote_response = executor
            .execute(&remote_request, &remote_token, &mut remote_events)
            .unwrap();
        assert!(matches!(
            remote_response.outcome,
            ResponseOutcome::Failure { error }
                if error.code == StableErrorCode::InternalError
                    && error.user_safe_detail == "operation failed"
        ));
        let mut download_request = scan_request(&root);
        download_request.method = MethodName::parse("online.download").unwrap();
        download_request.payload = serde_json::json!({
            "signed": {
                "url": "https://media.example.com/unconfigured.ffx",
                "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e"
            },
            "destination": "downloads/unconfigured.ffx"
        });
        let download_token = CancellationToken::default();
        let mut download_events = NoopEvents;
        let download_response = executor
            .execute(&download_request, &download_token, &mut download_events)
            .unwrap();
        assert!(matches!(
            download_response.outcome,
            ResponseOutcome::Failure { error }
                if error.code == StableErrorCode::InternalError
                    && error.user_safe_detail == "operation failed"
        ));
        assert!(
            !root
                .join("support/ty-plus/downloads/unconfigured.ffx")
                .exists()
        );
    }

    #[test]
    fn canonical_registry_has_an_explicit_payload_route_for_every_method() {
        for method in CanonicalMethod::all() {
            let payload = match method {
                CanonicalMethod::HostPluginEffectScan => serde_json::json!({"roots": ["Plugins"]}),
                CanonicalMethod::OnlineCatalogSearch
                | CanonicalMethod::OnlineCatalogCacheRead
                | CanonicalMethod::OnlineCatalogCacheDelete => serde_json::json!({"q": "route"}),
                CanonicalMethod::OnlineDownload => serde_json::json!({
                    "signed": {
                        "url": "https://media.example.com/preset.ffx",
                        "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e"
                    },
                    "destination": "downloads/route.ffx"
                }),
                CanonicalMethod::OnlineCatalogCacheWrite => serde_json::json!({
                    "query": {"q": "route-write"},
                    "result": {"items": []}
                }),
                CanonicalMethod::OnlineCatalogCacheClear => serde_json::json!({}),
                CanonicalMethod::OnlineConnectivityCheck => serde_json::json!({}),
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
            };
            assert!(
                validate_payload(*method, &payload).is_ok(),
                "canonical route has no strict payload mapping: {}",
                method.wire_name()
            );
        }
        assert_eq!(CanonicalMethod::all().len(), 12);
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

        let executor = ProductionOperationExecutor::with_test_online_factory(
            ProductOnlineConfig::Configured(
                SupabaseConfig::new("https://example.supabase.co".to_owned()).unwrap(),
            ),
            fake_online_factory,
        );
        let mut seed = scan_request(&root);
        seed.method = MethodName::parse("online.catalog.cache.write").unwrap();
        seed.payload = serde_json::json!({
            "query": {"q": "seed"},
            "result": {"items": [{
                "presetId": "seed",
                "name": "Seed",
                "description": null,
                "category": null,
                "tag": null,
                "platform": null,
                "version": null,
                "notionPageUrl": null,
                "thumbnailUrl": null
            }]}
        });
        let seed_token = CancellationToken::default();
        let mut seed_events = NoopEvents;
        assert_success(
            executor
                .execute(&seed, &seed_token, &mut seed_events)
                .unwrap(),
            Value::Null,
        );
        for method in CanonicalMethod::all() {
            let mut request = scan_request(&root);
            request.method = MethodName::parse(method.wire_name()).unwrap();
            request.payload = match method {
                CanonicalMethod::HostPluginEffectScan => {
                    serde_json::json!({"roots": ["Plugins"]})
                }
                CanonicalMethod::OnlineCatalogSearch => serde_json::json!({"q": "route"}),
                CanonicalMethod::OnlineCatalogCacheRead => serde_json::json!({"q": "seed"}),
                CanonicalMethod::OnlineCatalogCacheDelete => {
                    serde_json::json!({"q": "executor-delete-unique"})
                }
                CanonicalMethod::OnlineDownload => serde_json::json!({
                    "signed": {
                        "url": "https://media.example.com/preset.ffx",
                        "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e"
                    },
                    "destination": "downloads/route.ffx"
                }),
                CanonicalMethod::OnlineCatalogCacheWrite => serde_json::json!({
                    "query": {"q": "executor-write-unique"},
                    "result": {"items": [{
                        "presetId": "executor-write",
                        "name": "Executor Write",
                        "description": null,
                        "category": "test",
                        "tag": null,
                        "platform": null,
                        "version": null,
                        "notionPageUrl": null,
                        "thumbnailUrl": null
                    }]}
                }),
                CanonicalMethod::OnlineCatalogCacheClear => serde_json::json!({}),
                CanonicalMethod::OnlineConnectivityCheck => serde_json::json!({}),
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
            };
            let cache_root = root.join("support/ty-plus/cache/search");
            let write_key = SearchCacheKey::from_query(&CatalogQuery {
                q: Some("executor-write-unique".to_owned()),
                ..CatalogQuery::default()
            });
            let write_body = cache_root.join(format!("{}.json", write_key.key));
            let write_revision = cache_root.join(format!("{}.rev.json", write_key.key));
            let delete_key = SearchCacheKey::from_query(&CatalogQuery {
                q: Some("executor-delete-unique".to_owned()),
                ..CatalogQuery::default()
            });
            let delete_body = cache_root.join(format!("{}.json", delete_key.key));
            let delete_revision = cache_root.join(format!("{}.rev.json", delete_key.key));
            let clear_inventory = match method {
                CanonicalMethod::OnlineCatalogCacheWrite => {
                    assert!(!write_body.exists(), "write fixture must start absent");
                    assert!(!write_revision.exists(), "write revision must start absent");
                    Vec::new()
                }
                CanonicalMethod::OnlineCatalogCacheDelete => {
                    let mut setup = scan_request(&root);
                    setup.method = MethodName::parse("online.catalog.cache.write").unwrap();
                    setup.payload = serde_json::json!({
                        "query": {"q": "executor-delete-unique"},
                        "result": {"items": [{"presetId": "delete-fixture", "name": "Delete Fixture"}]}
                    });
                    let setup_token = CancellationToken::default();
                    let mut setup_events = NoopEvents;
                    assert_success(
                        executor
                            .execute(&setup, &setup_token, &mut setup_events)
                            .unwrap(),
                        Value::Null,
                    );
                    assert!(delete_body.exists(), "delete fixture body must pre-exist");
                    assert!(
                        delete_revision.exists(),
                        "delete fixture revision must pre-exist"
                    );
                    Vec::new()
                }
                CanonicalMethod::OnlineCatalogCacheClear => {
                    let mut setup = scan_request(&root);
                    setup.method = MethodName::parse("online.catalog.cache.write").unwrap();
                    setup.payload = serde_json::json!({
                        "query": {"q": "executor-clear-survivor"},
                        "result": {"items": [{"presetId": "clear-fixture", "name": "Clear Fixture"}]}
                    });
                    let setup_token = CancellationToken::default();
                    let mut setup_events = NoopEvents;
                    assert_success(
                        executor
                            .execute(&setup, &setup_token, &mut setup_events)
                            .unwrap(),
                        Value::Null,
                    );
                    let mut inventory = std::fs::read_dir(&cache_root)
                        .unwrap()
                        .map(|entry| entry.unwrap().path())
                        .filter(|path| {
                            path.file_name()
                                .and_then(|value| value.to_str())
                                .is_some_and(|name| {
                                    name.ends_with(".json") && !name.ends_with(".rev.json")
                                })
                        })
                        .collect::<Vec<_>>();
                    inventory.sort();
                    assert!(
                        !inventory.is_empty(),
                        "clear must have explicit residual inventory"
                    );
                    inventory
                }
                _ => Vec::new(),
            };
            let token = CancellationToken::default();
            let mut events = NoopEvents;
            let response = executor.execute(&request, &token, &mut events).unwrap();
            match method {
                CanonicalMethod::HostPluginEffectScan => {
                    let ResponseOutcome::Success { payload, .. } = response.outcome else {
                        panic!("host route must succeed");
                    };
                    assert_eq!(payload["rows"].as_array().map(Vec::len), Some(1));
                    assert!(
                        payload["rows"][0]["file_path"].as_str().is_some_and(
                            |path| path.ends_with(&platform_plugin_filename("fixture"))
                        )
                    );
                }
                CanonicalMethod::OnlineCatalogSearch => {
                    assert_success(
                        response,
                        serde_json::json!({
                            "items": [{
                                "preset_id": "route-preset",
                                "name": "Route Preset",
                                "description": null,
                                "category": "test",
                                "tag": null,
                                "platform": null,
                                "version": null,
                                "notion_page_url": null,
                                "thumbnail_url": null
                            }]
                        }),
                    );
                    assert!(root.join("support/ty-plus/cache/search").exists());
                }
                CanonicalMethod::OnlineDownload => {
                    let destination = root.join("support/ty-plus/downloads/route.ffx");
                    assert_success(
                        response,
                        serde_json::json!({
                            "bytes_written": 14,
                            "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e",
                            "final_url": "https://media.example.com/route.ffx",
                            "destination": "downloads/route.ffx"
                        }),
                    );
                    assert!(destination.exists());
                    assert_eq!(std::fs::read(destination).unwrap(), b"route-download");
                }
                CanonicalMethod::OnlineCatalogCacheRead => {
                    assert_success(
                        response,
                        serde_json::json!({
                            "items": [{
                                "preset_id": "seed",
                                "name": "Seed",
                                "description": null,
                                "category": null,
                                "tag": null,
                                "platform": null,
                                "version": null,
                                "notion_page_url": null,
                                "thumbnail_url": null
                            }]
                        }),
                    );
                }
                CanonicalMethod::OnlineCatalogCacheWrite => {
                    assert_success(response, Value::Null);
                    assert!(write_body.exists(), "write must publish body");
                    assert!(write_revision.exists(), "write must publish revision");
                    assert_eq!(
                        serde_json::from_slice::<Value>(&std::fs::read(&write_body).unwrap())
                            .unwrap(),
                        serde_json::json!({
                            "items": [{
                                "preset_id": "executor-write",
                                "name": "Executor Write",
                                "description": null,
                                "category": "test",
                                "tag": null,
                                "platform": null,
                                "version": null,
                                "notion_page_url": null,
                                "thumbnail_url": null
                            }]
                        })
                    );
                    let revision: Value =
                        serde_json::from_slice(&std::fs::read(&write_revision).unwrap()).unwrap();
                    assert!(
                        revision["revision"]
                            .as_str()
                            .is_some_and(|value| !value.is_empty())
                    );
                }
                CanonicalMethod::OnlineCatalogCacheDelete => {
                    assert_success(response, Value::Null);
                    assert!(!delete_body.exists(), "delete must remove body");
                    assert!(!delete_revision.exists(), "delete must remove revision");
                }
                CanonicalMethod::OnlineCatalogCacheClear => {
                    let ResponseOutcome::Success { payload, .. } = response.outcome else {
                        panic!("cache clear route must succeed");
                    };
                    assert_eq!(
                        payload["deleted"].as_u64(),
                        Some(clear_inventory.len() as u64)
                    );
                    assert!(
                        std::fs::read_dir(cache_root)
                            .map(|entries| entries.count())
                            .unwrap_or(0)
                            == 0
                    );
                }
                CanonicalMethod::OnlineConnectivityCheck => {
                    let ResponseOutcome::Success { payload, .. } = response.outcome else {
                        panic!("connectivity check route must succeed");
                    };
                    // Probe runs against a real probe; the test factory in this
                    // file defaults to an unknown state until a real
                    // configuration is exercised.
                    assert!(payload["state"].is_string());
                    assert!(payload["label"].is_string());
                    assert!(payload["checked_at"].is_string());
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
            }
        }
    }

    #[test]
    fn explicit_supabase_config_reaches_real_remote_executor_route() {
        let root = tempdir_in("executor-configured-remote");
        std::fs::create_dir_all(root.join("support")).unwrap();
        let server = spawn_local_catalog_server();
        let config = SupabaseConfig::new(server.base_url.clone())
            .unwrap()
            .with_publishable_key("configured-key".to_owned())
            .with_api_base(server.base_url.clone());
        let mut request = scan_request(&root);
        request.method = MethodName::parse("online.catalog.search").unwrap();
        request.payload = serde_json::json!({"q": "configured-route"});
        let unconfigured = ProductionOperationExecutor::default();
        let unconfigured_token = CancellationToken::default();
        let mut unconfigured_events = NoopEvents;
        let unconfigured_response = unconfigured
            .execute(&request, &unconfigured_token, &mut unconfigured_events)
            .unwrap();
        assert!(matches!(
            unconfigured_response.outcome,
            ResponseOutcome::Failure { error } if error.code == StableErrorCode::InternalError
        ));

        let executor = ProductionOperationExecutor::with_online_config(config);
        let token = CancellationToken::default();
        let mut events = NoopEvents;
        let response = executor.execute(&request, &token, &mut events).unwrap();
        assert_success(
            response,
            serde_json::json!({
                "items": [{
                    "preset_id": "configured-preset",
                    "name": "Configured Preset",
                    "description": null,
                    "category": null,
                    "tag": null,
                    "platform": null,
                    "version": null,
                    "notion_page_url": null,
                    "thumbnail_url": null
                }]
            }),
        );
        let requests = server.finish();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0], "/health");
        assert!(requests[1].starts_with("/preset/search?q=configured-route"));
    }

    #[test]
    fn configured_executor_download_has_branch_specific_success_and_side_effect() {
        let root = tempdir_in("executor-configured-download");
        std::fs::create_dir_all(root.join("support")).unwrap();
        let config = SupabaseConfig::new("https://example.supabase.co".to_owned())
            .unwrap()
            .with_media_base_url("https://media.example.com".to_owned());
        let executor = ProductionOperationExecutor::with_test_online_factory(
            ProductOnlineConfig::Configured(config),
            fake_online_factory,
        );
        let mut request = scan_request(&root);
        request.method = MethodName::parse("online.download").unwrap();
        request.payload = serde_json::json!({
            "signed": {
                "url": "https://media.example.com/route.ffx",
                "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e"
            },
            "destination": "downloads/configured.ffx"
        });
        let token = CancellationToken::default();
        let mut events = NoopEvents;
        let response = executor.execute(&request, &token, &mut events).unwrap();
        assert_success(
            response,
            serde_json::json!({
                "bytes_written": 14,
                "sha256": "583ba8e34b17e8323faabb4399899e8ac3fc6b6383cfcec31664c41772e4bf7e",
                "final_url": "https://media.example.com/route.ffx",
                "destination": "downloads/configured.ffx"
            }),
        );
        assert_eq!(
            std::fs::read(root.join("support/ty-plus/downloads/configured.ffx")).unwrap(),
            b"route-download"
        );
    }
}
