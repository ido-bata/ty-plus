use std::{cell::RefCell, io::Cursor};

use ty_plus_online::catalog::{CatalogClient, CatalogQuery, CatalogResponse, CatalogTransport};
use ty_plus_online::config::SupabaseConfig;
use ty_plus_online::connectivity::{ConnectivityChecker, HealthProbe, ProbeError, ProbeResult};
use ty_plus_online::download::{DownloadClient, DownloadResponse, DownloadTransport};
use ty_plus_online::offline::OfflineCatalogSearch;
use ty_plus_online::search_cache::{SearchCache, SearchCacheKey};
use ty_plus_operation_worker::PersistentSearchCacheStore;
use ty_plus_operation_worker::{
    CancellationToken, EventSink, Invocation, OnlineBoundary, OperationError, WorkerError,
    dispatch_online as dispatch_online_with_token, resolve_invocation_with_online,
};

fn dispatch_online(
    invocation: &ty_plus_operation_worker::ResolvedInvocation,
    method: &ty_plus_protocol::MethodName,
    payload: serde_json::Value,
    events: &mut dyn EventSink,
) -> Result<serde_json::Value, OperationError> {
    dispatch_online_with_token(
        invocation,
        method,
        payload,
        &CancellationToken::default(),
        events,
    )
}
use ty_plus_protocol::{
    EventEnvelope, HostContext, InvocationContext, ManagedRootContext, MethodName,
};

#[derive(Default)]
struct Events;

impl EventSink for Events {
    fn progress(&mut self, _event: EventEnvelope) -> Result<(), WorkerError> {
        Ok(())
    }
}

struct FailingEvents;

impl EventSink for FailingEvents {
    fn progress(&mut self, _event: EventEnvelope) -> Result<(), WorkerError> {
        Err(WorkerError::Protocol(
            ty_plus_protocol::StableErrorCode::ProtocolViolation,
        ))
    }
}

struct FailingCommittingEvents;

impl EventSink for FailingCommittingEvents {
    fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError> {
        if matches!(
            event.payload,
            ty_plus_protocol::EventPayload::Progress(progress)
                if progress.stage == ty_plus_protocol::ProgressStage::Committing
        ) {
            return Err(WorkerError::Protocol(
                ty_plus_protocol::StableErrorCode::ProtocolViolation,
            ));
        }
        Ok(())
    }
}

#[derive(Debug)]
struct OnlineProbe;

impl HealthProbe for OnlineProbe {
    fn probe(&self, _url: &str) -> Result<ProbeResult, ProbeError> {
        Ok(ProbeResult { status: 200 })
    }
}

#[derive(Debug)]
struct OfflineProbe;

impl HealthProbe for OfflineProbe {
    fn probe(&self, _url: &str) -> Result<ProbeResult, ProbeError> {
        Err(ProbeError::Offline)
    }
}

#[derive(Debug)]
struct UnusedCatalogTransport;

impl CatalogTransport for UnusedCatalogTransport {
    fn get(
        &self,
        _url: &str,
        _headers: &[(String, String)],
    ) -> Result<CatalogResponse, ty_plus_online::catalog::CatalogError> {
        Err(ty_plus_online::catalog::CatalogError::Transport(
            "unused test catalog transport".to_owned(),
        ))
    }
}

#[derive(Debug)]
struct ResponseCatalogTransport {
    responses: RefCell<Vec<Result<CatalogResponse, ty_plus_online::catalog::CatalogError>>>,
}

impl ResponseCatalogTransport {
    fn new(response: Result<CatalogResponse, ty_plus_online::catalog::CatalogError>) -> Self {
        Self {
            responses: RefCell::new(vec![response]),
        }
    }
}

impl CatalogTransport for ResponseCatalogTransport {
    fn get(
        &self,
        _url: &str,
        _headers: &[(String, String)],
    ) -> Result<CatalogResponse, ty_plus_online::catalog::CatalogError> {
        self.responses.borrow_mut().pop().unwrap_or_else(|| {
            Err(ty_plus_online::catalog::CatalogError::Transport(
                "no response".to_owned(),
            ))
        })
    }
}

#[derive(Debug)]
struct DownloadBodyTransport;

impl DownloadTransport for DownloadBodyTransport {
    fn get(
        &self,
        _url: &str,
        _allowed_hosts: &[String],
    ) -> Result<DownloadResponse, ty_plus_online::download::DownloadError> {
        Ok(DownloadResponse {
            status: 200,
            final_url: "https://media.example.com/preset.ffx".to_owned(),
            content_length: Some(5),
            body: Box::new(Cursor::new(b"hello".to_vec())),
        })
    }
}

/// Fixture root scoped to the running test.
///
/// Every test in this file used to share one fixed path, so their first-time
/// directory creation raced and a fresh temp root failed at `OperationLock`
/// with `ENOENT` (Issue #200). Rust's harness runs each test on its own
/// thread, which isolates tests from each other while keeping the path stable
/// *inside* one test — `configured_fresh_search_persists_and_restart_offline_serves_cache`
/// calls `invocation()` twice and has to see its own earlier writes.
fn fixture_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "ow-rust-003-{label}-{:?}",
        std::thread::current().id()
    ))
}

fn invocation() -> Invocation {
    let root = fixture_path("online-support");
    std::fs::create_dir_all(&root).unwrap();
    let app = fixture_path("online-app");
    std::fs::create_dir_all(&app).unwrap();
    Invocation::for_test(
        InvocationContext {
            host_context: HostContext {
                app_root: app.to_string_lossy().into(),
                support_root: root.to_string_lossy().into(),
                session_id: "session-online".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        "online.test",
    )
}

#[test]
fn offline_independent_operation_does_not_require_connectivity() {
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.write").unwrap(),
        serde_json::json!({
            "query": {"q": "ease"},
            "result": {"items": []}
        }),
        &mut events,
    );
    assert!(result.is_ok());
}

#[test]
fn search_cache_write_and_read_use_the_invocation_transaction_authority() {
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.write").unwrap(),
        serde_json::json!({
            "query": {"q": "ease"},
            "result": {"items": []}
        }),
        &mut events,
    )
    .unwrap();
    let cached = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.read").unwrap(),
        serde_json::json!({"q": "ease"}),
        &mut events,
    )
    .unwrap();
    assert_eq!(cached, serde_json::json!({"items": []}));
}

#[test]
fn explicit_delete_removes_corrupt_cache_entry_without_deserializing_it() {
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let root = resolved.managed_root().managed_root().to_path_buf();
    let query = CatalogQuery {
        q: Some("corrupt-delete".to_owned()),
        ..CatalogQuery::default()
    };
    let key = SearchCacheKey::from_query(&query);
    let cache_path = root.join("cache/search").join(format!("{}.json", key.key));
    std::fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
    std::fs::write(&cache_path, b"not-json").unwrap();

    let mut events = Events;
    let deleted = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.delete").unwrap(),
        serde_json::json!({"q": "corrupt-delete"}),
        &mut events,
    )
    .unwrap();
    assert_eq!(deleted, serde_json::Value::Null);
    assert!(
        !cache_path.exists(),
        "explicit delete must repair corrupt entry"
    );
}

#[test]
fn catalog_search_without_explicit_config_fails_instead_of_claiming_offline_success() {
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    let error = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.search").unwrap(),
        serde_json::json!({"q": "ease"}),
        &mut events,
    )
    .unwrap_err();
    assert!(
        error.to_string().contains("configuration"),
        "unexpected error: {error}"
    );
}

#[test]
fn legacy_and_unknown_online_methods_are_blocked() {
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    for method in ["catalog.search", "catalog.cache.read", "online.unknown"] {
        let error = dispatch_online(
            &resolved,
            &MethodName::parse(method).unwrap(),
            serde_json::json!({"q": "ease"}),
            &mut events,
        )
        .unwrap_err();
        assert!(matches!(error, OperationError::Unsupported(_)));
    }
}

#[test]
fn configured_fresh_search_persists_and_restart_offline_serves_cache() {
    let first = invocation();
    let first_roots = first.resolve().unwrap();
    let root = first_roots.managed_root().managed_root().to_path_buf();
    drop(first_roots);
    let config = SupabaseConfig::new("https://example.supabase.co".to_owned()).unwrap();
    let response = CatalogResponse {
        status: 200,
        body: r#"{"items":[{"preset_id":"fresh-1","name":"Fresh"}]}"#.to_owned(),
    };
    let first_search = OfflineCatalogSearch::new(
        CatalogClient::with_transport(config.clone(), ResponseCatalogTransport::new(Ok(response))),
        SearchCache::new(PersistentSearchCacheStore::new(&root)),
    );
    let first_online = OnlineBoundary::with_components(
        &root,
        ConnectivityChecker::with_probe(config.clone(), OnlineProbe),
        first_search,
        CatalogClient::with_transport(
            config.clone(),
            ResponseCatalogTransport::new(Err(ty_plus_online::catalog::CatalogError::Transport(
                "unused".to_owned(),
            ))),
        ),
        DownloadClient::with_transport(config.clone(), DownloadBodyTransport),
    );
    let first_resolved = resolve_invocation_with_online(&first, first_online).unwrap();
    let mut events = Events;
    let query = serde_json::json!({"q": "fresh-restart"});
    let fresh = dispatch_online(
        &first_resolved,
        &MethodName::parse("online.catalog.search").unwrap(),
        query.clone(),
        &mut events,
    )
    .unwrap();
    assert_eq!(fresh["items"][0]["preset_id"], "fresh-1");
    drop(first_resolved);
    drop(first);

    let second = invocation();
    let second_roots = second.resolve().unwrap();
    assert_eq!(second_roots.managed_root().managed_root(), root);
    drop(second_roots);
    let offline_search = OfflineCatalogSearch::new(
        CatalogClient::with_transport(config.clone(), UnusedCatalogTransport),
        SearchCache::new(PersistentSearchCacheStore::new(&root)),
    );
    let offline_online = OnlineBoundary::with_components(
        &root,
        ConnectivityChecker::with_probe(config.clone(), OfflineProbe),
        offline_search,
        CatalogClient::with_transport(config.clone(), UnusedCatalogTransport),
        DownloadClient::with_transport(config, DownloadBodyTransport),
    );
    let second_resolved = resolve_invocation_with_online(&second, offline_online).unwrap();
    let cached = dispatch_online(
        &second_resolved,
        &MethodName::parse("online.catalog.search").unwrap(),
        query,
        &mut events,
    )
    .unwrap();
    assert_eq!(cached["items"][0]["preset_id"], "fresh-1");
}

#[test]
fn download_progress_sink_failure_aborts_transaction_without_commit() {
    let invocation = invocation();
    let resolved_roots = invocation.resolve().unwrap();
    let root = resolved_roots.managed_root().managed_root().to_path_buf();
    drop(resolved_roots);

    let config = SupabaseConfig::new("https://example.supabase.co".to_owned())
        .unwrap()
        .with_media_base_url("https://media.example.com".to_owned());
    let checker = ConnectivityChecker::with_probe(config.clone(), OnlineProbe);
    let search = OfflineCatalogSearch::new(
        CatalogClient::with_transport(config.clone(), UnusedCatalogTransport),
        SearchCache::new(PersistentSearchCacheStore::new(&root)),
    );
    let online = OnlineBoundary::with_components(
        &root,
        checker,
        search,
        CatalogClient::with_transport(config.clone(), UnusedCatalogTransport),
        DownloadClient::with_transport(config, DownloadBodyTransport),
    );
    let resolved = resolve_invocation_with_online(&invocation, online).unwrap();
    let mut events = FailingEvents;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.download").unwrap(),
        serde_json::json!({
            "signed": {
                "url": "https://media.example.com/preset.ffx",
                "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
            },
            "destination": "downloads/preset.ffx"
        }),
        &mut events,
    );
    assert!(matches!(result, Err(OperationError::Progress(_))));
    assert!(!root.join("downloads/preset.ffx").exists());
}

#[test]
fn committing_flush_failure_keeps_download_mutation_at_zero() {
    let invocation = invocation();
    let resolved_roots = invocation.resolve().unwrap();
    let root = resolved_roots.managed_root().managed_root().to_path_buf();
    drop(resolved_roots);
    let config = SupabaseConfig::new("https://example.supabase.co".to_owned())
        .unwrap()
        .with_media_base_url("https://media.example.com".to_owned());
    let online = OnlineBoundary::with_components(
        &root,
        ConnectivityChecker::with_probe(config.clone(), OnlineProbe),
        OfflineCatalogSearch::new(
            CatalogClient::with_transport(config.clone(), UnusedCatalogTransport),
            SearchCache::new(PersistentSearchCacheStore::new(&root)),
        ),
        CatalogClient::with_transport(config.clone(), UnusedCatalogTransport),
        DownloadClient::with_transport(config, DownloadBodyTransport),
    );
    let resolved = resolve_invocation_with_online(&invocation, online).unwrap();
    let mut events = FailingCommittingEvents;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.download").unwrap(),
        serde_json::json!({
            "signed": {
                "url": "https://media.example.com/preset.ffx",
                "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
            },
            "destination": "downloads/committing-failure.ffx"
        }),
        &mut events,
    );
    assert!(matches!(result, Err(OperationError::Storage(_))));
    assert!(!root.join("downloads/committing-failure.ffx").exists());
}

#[test]
fn committing_flush_failure_keeps_cache_write_at_zero() {
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let root = resolved.managed_root().managed_root().to_path_buf();
    let mut events = FailingCommittingEvents;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.write").unwrap(),
        serde_json::json!({
            "query": {"q": "committing-cache-failure"},
            "result": {"items": []}
        }),
        &mut events,
    );
    assert!(matches!(result, Err(OperationError::Progress(_))));
    let key = SearchCacheKey::from_query(&CatalogQuery {
        q: Some("committing-cache-failure".to_owned()),
        ..CatalogQuery::default()
    });
    assert!(
        !root
            .join("cache/search")
            .join(format!("{}.json", key.key))
            .exists()
    );
}

#[test]
fn online_payload_decoders_reject_snake_case_aliases_unknown_fields_and_wrong_methods() {
    // Production break caught: alias-tolerant Value lookup lets callers bypass
    // method-owned payload contracts and route another method's payload.
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    for payload in [
        serde_json::json!({"preset_id": "legacy", "destination": "x"}),
        serde_json::json!({"presetId": "legacy", "destination": "x", "signed": {"url": "https://media.example.com/preset.ffx", "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"}}),
        serde_json::json!({"q": "ease", "unknown": true}),
    ] {
        let result = dispatch_online(
            &resolved,
            &MethodName::parse("online.download").unwrap(),
            payload,
            &mut events,
        );
        assert!(matches!(result, Err(OperationError::InvalidPayload(_))));
    }
}

#[test]
fn download_rejects_a_valid_search_payload_as_a_wrong_method_payload() {
    // Production break caught: method dispatch must not accept a payload owned by
    // another canonical method merely because it is valid JSON.
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.download").unwrap(),
        serde_json::json!({"q": "ease"}),
        &mut events,
    );
    assert!(matches!(result, Err(OperationError::InvalidPayload(_))));
}

#[test]
fn download_rejects_wrong_preset_id_type_and_invalid_expiry_values() {
    // Production break caught: strict camelCase DTO decoding must reject wrong
    // types and checked integer conversions instead of silently treating values as absent or truncating.
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    for payload in [
        serde_json::json!({"presetId": 42, "destination": "x"}),
        serde_json::json!({"signed": {"url": "https://media.example.com/preset.ffx", "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", "expiresIn": -1}, "destination": "x"}),
        serde_json::json!({"signed": {"url": "https://media.example.com/preset.ffx", "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", "expiresIn": 4294967296u64}, "destination": "x"}),
    ] {
        let result = dispatch_online(
            &resolved,
            &MethodName::parse("online.download").unwrap(),
            payload,
            &mut events,
        );
        assert!(matches!(result, Err(OperationError::InvalidPayload(_))));
    }
}

#[test]
fn cache_write_rejects_unknown_fields_inside_query_and_result_dtos() {
    // Production break caught: nested method-owned DTOs must deny unknown fields,
    // not let serde_json silently discard cache data supplied by another contract.
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    for payload in [
        serde_json::json!({"query": {"q": "ease", "unknown": true}, "result": {"items": []}}),
        serde_json::json!({"query": {"q": "ease"}, "result": {"items": [], "unknown": true}}),
    ] {
        let result = dispatch_online(
            &resolved,
            &MethodName::parse("online.catalog.cache.write").unwrap(),
            payload,
            &mut events,
        );
        assert!(matches!(result, Err(OperationError::InvalidPayload(_))));
    }
}

#[test]
fn cache_write_rejects_item_missing_required_preset_id() {
    // Production break caught: a missing required catalog item identifier must not
    // default to an empty string and reach persistence.
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.write").unwrap(),
        serde_json::json!({
            "query": {"q": "ease"},
            "result": {"items": [{"name": "Missing ID"}]}
        }),
        &mut events,
    );
    assert!(matches!(result, Err(OperationError::InvalidPayload(_))));
}

#[test]
fn cache_write_rejects_item_missing_required_name() {
    // Production break caught: a missing required catalog item name must not
    // default to an empty string and reach persistence.
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.write").unwrap(),
        serde_json::json!({
            "query": {"q": "ease"},
            "result": {"items": [{"presetId": "preset-1"}]}
        }),
        &mut events,
    );
    assert!(matches!(result, Err(OperationError::InvalidPayload(_))));
}

#[test]
fn cache_write_rejects_unknown_item_field_with_valid_surrounding_payload() {
    // Production break caught: nested catalog item aliases/fields must be denied
    // even when the enclosing cache request is otherwise valid.
    let invocation = invocation();
    let resolved = invocation.resolve().unwrap();
    let mut events = Events;
    let result = dispatch_online(
        &resolved,
        &MethodName::parse("online.catalog.cache.write").unwrap(),
        serde_json::json!({
            "query": {"q": "ease"},
            "result": {"items": [{"presetId": "preset-1", "name": "Known", "legacy": true}]}
        }),
        &mut events,
    );
    assert!(matches!(result, Err(OperationError::InvalidPayload(_))));
}
