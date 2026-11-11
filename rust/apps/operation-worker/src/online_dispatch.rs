//! Online/offline adapter for one invocation.

use std::{
    cell::{Cell, RefCell},
    io::{self, Write},
    path::{Path, PathBuf},
};

use serde_json::Value;
use ty_plus_host_filesystem::platform::{list_directory, read_entry, remove_entry};
use ty_plus_online::catalog::{
    CatalogClient, CatalogQuery, CatalogSearchResult, CatalogTransport, ReqwestCatalogTransport,
};
use ty_plus_online::config::SupabaseConfig;
use ty_plus_online::connectivity::{
    ConnectivityChecker, ConnectivityState, ConnectivityStatus, HealthProbe, ReqwestProbe,
};
use ty_plus_online::download::{
    CancelFlag, DownloadClient, DownloadReceipt, DownloadTransport, ReqwestDownloadTransport,
    SignedDownload,
};
use ty_plus_online::offline::{OfflineCatalogSearch, SearchError, SearchOutcome};
use ty_plus_online::search_cache::{CacheError, CacheStore, SearchCache};
use ty_plus_protocol::{
    CanonicalMethod, MethodName, OnlineCacheWriteRequest, OnlineCatalogQuery,
    OnlineCatalogSearchItem, OnlineCatalogSearchResult, OnlineDownloadRequest,
};
use ty_plus_storage::{MutationContext, RegisteredPath, Transaction};

use crate::{CancellationToken, EventSink, ResolvedInvocation};

/// The online composition owned by one invocation. It is intentionally
/// concrete and injectable: no environment lookup or process-global client is
/// used to create it.
pub struct OnlineBoundary {
    managed_root: PathBuf,
    service: RefCell<Option<Box<dyn OnlineService>>>,
}

impl std::fmt::Debug for OnlineBoundary {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("OnlineBoundary")
            .field("managed_root", &self.managed_root)
            .field("configured", &self.service.borrow().is_some())
            .finish()
    }
}

impl OnlineBoundary {
    #[must_use]
    pub fn unconfigured(managed_root: &Path) -> Self {
        Self {
            managed_root: managed_root.to_path_buf(),
            service: RefCell::new(None),
        }
    }

    /// Builds the real per-invocation network composition from explicit config.
    #[must_use]
    pub fn from_config(managed_root: &Path, config: SupabaseConfig) -> Self {
        let service = OnlineComposition::from_config(managed_root, config);
        Self {
            managed_root: managed_root.to_path_buf(),
            service: RefCell::new(Some(Box::new(service))),
        }
    }

    /// Builds a composition with explicit transports for deterministic tests.
    #[must_use]
    pub fn with_components<P, T, D>(
        managed_root: &Path,
        checker: ConnectivityChecker<P>,
        search: OfflineCatalogSearch<T, PersistentSearchCacheStore>,
        catalog: CatalogClient<T>,
        downloader: DownloadClient<D>,
    ) -> Self
    where
        P: HealthProbe + 'static,
        T: CatalogTransport + 'static,
        D: DownloadTransport + 'static,
    {
        let service = OnlineComposition {
            checker,
            search,
            catalog,
            downloader,
        };
        Self {
            managed_root: managed_root.to_path_buf(),
            service: RefCell::new(Some(Box::new(service))),
        }
    }

    #[must_use]
    pub fn managed_root(&self) -> &Path {
        &self.managed_root
    }

    fn service(&self) -> Result<std::cell::RefMut<'_, Box<dyn OnlineService>>, OperationError> {
        let service = self.service.borrow_mut();
        if service.is_none() {
            return Err(OperationError::NetworkConfigurationUnavailable);
        }
        Ok(std::cell::RefMut::map(service, |value| {
            value.as_mut().expect("checked configured service")
        }))
    }
}

trait OnlineService {
    fn search(
        &mut self,
        query: &CatalogQuery,
        authority: &MutationContext<'_>,
        before_commit: &mut dyn FnMut() -> Result<(), OnlineServiceError>,
    ) -> Result<SearchOutcome, OnlineServiceError>;

    fn download(
        &mut self,
        signed: Option<&SignedDownload>,
        preset_id: Option<&str>,
        destination: &RegisteredPath,
        authority: &MutationContext<'_>,
        callbacks: &DownloadCallbacks<'_>,
    ) -> Result<DownloadReceipt, OnlineServiceError>;

    /// Returns the current connectivity status without mutating any state.
    fn connectivity_status(&mut self) -> ConnectivityStatus;
}

struct OnlineComposition<P, T, D>
where
    P: HealthProbe,
    T: CatalogTransport,
    D: DownloadTransport,
{
    checker: ConnectivityChecker<P>,
    search: OfflineCatalogSearch<T, PersistentSearchCacheStore>,
    catalog: CatalogClient<T>,
    downloader: DownloadClient<D>,
}

struct DownloadCallbacks<'a> {
    progress: &'a dyn Fn(u64, u64),
    cancel: &'a CancelFlag,
    before_commit: &'a dyn Fn() -> Result<(), OnlineServiceError>,
}

impl OnlineComposition<ReqwestProbe, ReqwestCatalogTransport, ReqwestDownloadTransport> {
    fn from_config(root: &Path, config: SupabaseConfig) -> Self {
        let catalog = CatalogClient::new(config.clone());
        let search = OfflineCatalogSearch::new(
            CatalogClient::new(config.clone()),
            SearchCache::new(PersistentSearchCacheStore::new(root)),
        );
        Self {
            checker: ConnectivityChecker::new(config.clone()),
            search,
            catalog,
            downloader: DownloadClient::new(config),
        }
    }
}

impl<P, T, D> OnlineService for OnlineComposition<P, T, D>
where
    P: HealthProbe,
    T: CatalogTransport,
    D: DownloadTransport,
{
    fn connectivity_status(&mut self) -> ConnectivityStatus {
        self.checker.check().clone()
    }

    fn search(
        &mut self,
        query: &CatalogQuery,
        authority: &MutationContext<'_>,
        before_commit: &mut dyn FnMut() -> Result<(), OnlineServiceError>,
    ) -> Result<SearchOutcome, OnlineServiceError> {
        let state = self.checker.check().state.clone();
        self.search
            .search_with_pre_commit(state.clone(), query, authority, &mut || {
                before_commit().map_err(|_| {
                    SearchError::Cache(CacheError::Store("pre-commit hook failed".to_owned()))
                })
            })
            .map_err(|error| match error {
                SearchError::Offline if state == ConnectivityState::Offline => {
                    OnlineServiceError::CacheMiss
                }
                SearchError::Offline => OnlineServiceError::NetworkFailure,
                SearchError::Catalog(error) => OnlineServiceError::Catalog(error.to_string()),
                SearchError::Cache(error) => OnlineServiceError::Cache(error.to_string()),
            })
    }

    fn download(
        &mut self,
        signed: Option<&SignedDownload>,
        preset_id: Option<&str>,
        destination: &RegisteredPath,
        authority: &MutationContext<'_>,
        callbacks: &DownloadCallbacks<'_>,
    ) -> Result<DownloadReceipt, OnlineServiceError> {
        let state = self.checker.check().state.clone();
        if state != ConnectivityState::Online {
            return Err(OnlineServiceError::NetworkFailure);
        }
        let resolved = match (signed, preset_id) {
            (Some(signed), _) => signed.clone(),
            (None, Some(preset_id)) => {
                let descriptor = self
                    .catalog
                    .download_url(preset_id)
                    .map_err(|error| OnlineServiceError::Catalog(error.to_string()))?;
                SignedDownload {
                    url: descriptor.url,
                    sha256: descriptor.sha256,
                    expires_in: descriptor.expires_in,
                }
            }
            (None, None) => {
                return Err(OnlineServiceError::Catalog(
                    "signed download or preset_id is required".to_owned(),
                ));
            }
        };
        let mut transaction = Transaction::prepare(
            authority.guard(),
            destination.clone(),
            authority.invocation_id().clone(),
        )
        .map_err(|error| OnlineServiceError::Storage(error.to_string()))?;
        let mut sink = TransactionSink {
            transaction: Some(transaction),
        };
        let result = self.downloader.download(
            &resolved,
            &mut sink,
            Some(callbacks.cancel),
            Some(callbacks.progress),
        );
        match result {
            Ok(receipt) => {
                if let Err(error) = sink.flush() {
                    if let Some(transaction) = sink.transaction.take() {
                        let _ = transaction.abort();
                    }
                    return Err(OnlineServiceError::Storage(error.to_string()));
                }
                transaction = sink
                    .transaction
                    .take()
                    .expect("transaction sink owns the active transaction");
                if let Err(error) = (callbacks.before_commit)() {
                    let _ = transaction.abort();
                    return Err(error);
                }
                transaction
                    .commit()
                    .map_err(|error| OnlineServiceError::Storage(error.to_string()))?;
                Ok(receipt)
            }
            Err(error) => {
                if let Some(transaction) = sink.transaction.take() {
                    let _ = transaction.abort();
                }
                Err(OnlineServiceError::Download(error.to_string()))
            }
        }
    }
}

struct TransactionSink<'a> {
    transaction: Option<Transaction<'a>>,
}

impl Write for TransactionSink<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let transaction = self
            .transaction
            .as_mut()
            .ok_or_else(|| io::Error::other("transaction sink is closed"))?;
        transaction
            .write_all(bytes)
            .map_err(|error| io::Error::other(error.to_string()))?;
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        let transaction = self
            .transaction
            .as_mut()
            .ok_or_else(|| io::Error::other("transaction sink is closed"))?;
        transaction
            .flush()
            .map_err(|error| io::Error::other(error.to_string()))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum OnlineServiceError {
    CacheMiss,
    NetworkFailure,
    Catalog(String),
    Cache(String),
    Download(String),
    Storage(String),
}

pub fn dispatch_online(
    invocation: &ResolvedInvocation,
    method: &MethodName,
    payload: Value,
    cancellation: &CancellationToken,
    events: &mut dyn EventSink,
) -> Result<Value, OperationError> {
    cancellation
        .checkpoint()
        .map_err(|_| OperationError::Cancelled)?;
    let operation = method
        .canonical()
        .ok_or_else(|| OperationError::Unsupported(method.to_string()))?;

    if matches!(
        operation,
        CanonicalMethod::OnlineCatalogCacheRead
            | CanonicalMethod::OnlineCatalogCacheWrite
            | CanonicalMethod::OnlineCatalogCacheDelete
            | CanonicalMethod::OnlineCatalogCacheClear
    ) {
        let cache = SearchCache::new(PersistentSearchCacheStore::new(
            invocation.storage().managed_root().as_path(),
        ));
        let authority = invocation.storage().mutation_context();
        return match operation {
            CanonicalMethod::OnlineCatalogCacheRead => {
                cancellation
                    .checkpoint()
                    .map_err(|_| OperationError::Cancelled)?;
                let query = query_from_payload(payload)?;
                let result = cache
                    .query(&query)
                    .map_err(|error| OperationError::Cache(error.to_string()))?
                    .ok_or(OperationError::CacheMiss)?;
                serde_json::to_value(result)
                    .map_err(|error| OperationError::Cache(error.to_string()))
            }
            CanonicalMethod::OnlineCatalogCacheWrite => {
                cancellation
                    .checkpoint()
                    .map_err(|_| OperationError::Cancelled)?;
                let request = cache_write_from_payload(payload)?;
                let prepared = cache
                    .prepare_update(&request.query, &request.result)
                    .map_err(|error| OperationError::Cache(error.to_string()))?;
                emit_committing_progress(invocation, events, cancellation, 0)?;
                cache
                    .commit_update(&authority, prepared)
                    .map_err(|error| OperationError::Cache(error.to_string()))?;
                Ok(Value::Null)
            }
            CanonicalMethod::OnlineCatalogCacheDelete => {
                cancellation
                    .checkpoint()
                    .map_err(|_| OperationError::Cancelled)?;
                let query = query_from_payload(payload)?;
                let key = cache.prepare_key(&query);
                if !cache
                    .contains_key(&key)
                    .map_err(|error| OperationError::Cache(error.to_string()))?
                {
                    return Ok(Value::Null);
                }
                emit_committing_progress(invocation, events, cancellation, 0)?;
                cache
                    .delete_key(&authority, &key)
                    .map_err(|error| OperationError::Cache(error.to_string()))?;
                Ok(Value::Null)
            }
            CanonicalMethod::OnlineCatalogCacheClear => {
                cancellation
                    .checkpoint()
                    .map_err(|_| OperationError::Cancelled)?;
                let keys = cache
                    .keys()
                    .map_err(|error| OperationError::Cache(error.to_string()))?;
                if keys.is_empty() {
                    return Ok(serde_json::json!({"deleted": 0}));
                }
                emit_committing_progress(invocation, events, cancellation, 0)?;
                let deleted = cache
                    .clear_keys(&authority, &keys)
                    .map_err(|error| OperationError::Cache(error.to_string()))?;
                Ok(serde_json::json!({"deleted": deleted}))
            }
            CanonicalMethod::OnlineCatalogSearch
            | CanonicalMethod::OnlineConnectivityCheck
            | CanonicalMethod::OnlineDownload
            | CanonicalMethod::HostPluginEffectScan
            | CanonicalMethod::HostThumbnailLookup
            | CanonicalMethod::HostThumbnailGenerate
            | CanonicalMethod::HostThumbnailLookupOrGenerate
            | CanonicalMethod::HostThumbnailBatch => Err(OperationError::Unsupported(
                operation.wire_name().to_string(),
            )),
        };
    }

    if operation == CanonicalMethod::OnlineCatalogSearch {
        let query = query_from_payload(payload)?;
        let authority = invocation.storage().mutation_context();
        let mut service = invocation.online().service()?;
        let mut before_commit = || {
            emit_committing_progress(invocation, events, cancellation, 0)
                .map_err(|error| OnlineServiceError::Storage(error.to_string()))
        };
        let result = service
            .search(&query, &authority, &mut before_commit)
            .map_err(OperationError::from)?;
        return serde_json::to_value(match result {
            SearchOutcome::Fresh(result) | SearchOutcome::Cached(result) => result,
        })
        .map_err(|error| OperationError::Cache(error.to_string()));
    }

    if operation == CanonicalMethod::OnlineDownload {
        let request = download_from_payload(payload)?;
        let destination = RegisteredPath::new(&request.destination)
            .map_err(|error| OperationError::InvalidPayload(error.to_string()))?;
        let authority = invocation.storage().mutation_context();
        let progress_error = RefCell::new(None);
        let cancel = CancelFlag::with_upstream_probe({
            let cancellation = cancellation.clone();
            move || cancellation.is_cancelled()
        });
        let event_sink = RefCell::new(events as &mut dyn EventSink);
        let sequence = Cell::new(0u64);
        let progress = |completed: u64, total: u64| {
            let next_sequence = sequence.get() + 1;
            sequence.set(next_sequence);
            if progress_error.borrow().is_some() {
                return;
            }
            if let Err(error) = event_sink
                .borrow_mut()
                .progress(ty_plus_protocol::EventEnvelope {
                    protocol_version: invocation.protocol_version,
                    session_id: invocation.session_id.clone(),
                    request_id: invocation.request_id.clone(),
                    payload: ty_plus_protocol::EventPayload::Progress(
                        ty_plus_protocol::ProgressEvent {
                            sequence: next_sequence,
                            stage: ty_plus_protocol::ProgressStage::Downloading,
                            completed_units: Some(completed),
                            total_units: Some(total),
                            user_safe_detail: None,
                        },
                    ),
                })
            {
                *progress_error.borrow_mut() = Some(error.to_string());
                cancel.cancel();
            }
        };
        let mut service = invocation.online().service()?;
        let before_commit = || {
            emit_committing_progress(
                invocation,
                *event_sink.borrow_mut(),
                cancellation,
                sequence.get(),
            )
            .map_err(|error| OnlineServiceError::Storage(error.to_string()))
        };
        let callbacks = DownloadCallbacks {
            progress: &progress,
            cancel: &cancel,
            before_commit: &before_commit,
        };
        let result = service.download(
            request.signed.as_ref(),
            request.preset_id.as_deref(),
            &destination,
            &authority,
            &callbacks,
        );
        if let Some(error) = progress_error.into_inner() {
            return Err(OperationError::Progress(error));
        }
        let receipt = result.map_err(OperationError::from)?;
        return Ok(serde_json::json!({
            "bytes_written": receipt.bytes_written,
            "sha256": receipt.sha256,
            "final_url": receipt.final_url,
            "destination": request.destination,
        }));
    }

    if operation == CanonicalMethod::OnlineConnectivityCheck {
        let mut service = invocation.online().service()?;
        let status = service.connectivity_status();
        return serde_json::to_value(connectivity_status_to_dto(&status))
            .map_err(|error| OperationError::Cache(error.to_string()));
    }

    Err(OperationError::Unsupported(method.to_string()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OperationError {
    CacheMiss,
    NetworkFailure,
    NetworkConfigurationUnavailable,
    Unsupported(String),
    InvalidPayload(String),
    Cache(String),
    Network(String),
    Download(String),
    Storage(String),
    Progress(String),
    Cancelled,
}

impl std::fmt::Display for OperationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CacheMiss => f.write_str("catalog cache miss while offline"),
            Self::NetworkFailure => f.write_str("network operation failed and cache missed"),
            Self::NetworkConfigurationUnavailable => {
                f.write_str("online network configuration unavailable for this invocation")
            }
            Self::Unsupported(method) => write!(f, "unsupported online method: {method}"),
            Self::InvalidPayload(detail) => write!(f, "invalid online payload: {detail}"),
            Self::Cache(detail) => write!(f, "online cache failed: {detail}"),
            Self::Network(detail) => write!(f, "online catalog failed: {detail}"),
            Self::Download(detail) => write!(f, "online download failed: {detail}"),
            Self::Storage(detail) => write!(f, "online storage failed: {detail}"),
            Self::Progress(detail) => write!(f, "online progress failed: {detail}"),
            Self::Cancelled => f.write_str("online operation cancelled"),
        }
    }
}

impl std::error::Error for OperationError {}

impl From<OnlineServiceError> for OperationError {
    fn from(error: OnlineServiceError) -> Self {
        match error {
            OnlineServiceError::CacheMiss => Self::CacheMiss,
            OnlineServiceError::NetworkFailure => Self::NetworkFailure,
            OnlineServiceError::Catalog(detail) => Self::Network(detail),
            OnlineServiceError::Cache(detail) => Self::Cache(detail),
            OnlineServiceError::Download(detail) => Self::Download(detail),
            OnlineServiceError::Storage(detail) => Self::Storage(detail),
        }
    }
}

/// Convert a typed connectivity status into the snake_case wire DTO.
#[must_use]
pub fn connectivity_status_to_dto(
    status: &ConnectivityStatus,
) -> ty_plus_protocol::ConnectivityStatusDto {
    ty_plus_protocol::ConnectivityStatusDto {
        state: status.state.to_string(),
        label: status.label.clone(),
        checked_at: status.checked_at.clone(),
        error_message: status.error_message.clone(),
    }
}

fn query_from_payload(payload: Value) -> Result<CatalogQuery, OperationError> {
    let query: OnlineCatalogQuery = serde_json::from_value(payload)
        .map_err(|error| OperationError::InvalidPayload(error.to_string()))?;
    Ok(CatalogQuery {
        q: query.q,
        category: query.category,
        tag: query.tag,
        platform: query.platform,
        limit: query.limit,
        offset: query.offset,
    })
}

/// Validates a canonical online payload before invocation storage is opened.
pub fn validate_online_payload(
    method: CanonicalMethod,
    payload: &Value,
) -> Result<(), OperationError> {
    match method {
        CanonicalMethod::OnlineCatalogSearch
        | CanonicalMethod::OnlineCatalogCacheRead
        | CanonicalMethod::OnlineCatalogCacheDelete => {
            query_from_payload(payload.clone()).map(|_| ())
        }
        CanonicalMethod::OnlineDownload => download_from_payload(payload.clone()).map(|_| ()),
        CanonicalMethod::OnlineCatalogCacheWrite => {
            cache_write_from_payload(payload.clone()).map(|_| ())
        }
        CanonicalMethod::OnlineCatalogCacheClear => {
            if payload.as_object().is_some_and(|object| object.is_empty()) {
                Ok(())
            } else {
                Err(OperationError::InvalidPayload(
                    "cache clear payload must be an empty object".to_owned(),
                ))
            }
        }
        CanonicalMethod::OnlineConnectivityCheck => {
            if payload.as_object().is_some_and(|object| object.is_empty()) {
                Ok(())
            } else {
                Err(OperationError::InvalidPayload(
                    "connectivity check payload must be an empty object".to_owned(),
                ))
            }
        }
        CanonicalMethod::HostPluginEffectScan => Err(OperationError::Unsupported(
            "host operation is not owned by online adapter".to_owned(),
        )),
        CanonicalMethod::HostThumbnailLookup
        | CanonicalMethod::HostThumbnailGenerate
        | CanonicalMethod::HostThumbnailLookupOrGenerate
        | CanonicalMethod::HostThumbnailBatch => {
            // Thumbnail operations are handled by the host filesystem dispatch,
            // not the online adapter.
            Err(OperationError::Unsupported(
                "host thumbnail operation is not owned by online adapter".to_owned(),
            ))
        }
    }
}

fn emit_committing_progress(
    invocation: &ResolvedInvocation,
    events: &mut dyn EventSink,
    cancellation: &CancellationToken,
    sequence: u64,
) -> Result<(), OperationError> {
    cancellation
        .checkpoint()
        .map_err(|_| OperationError::Cancelled)?;
    events
        .progress(ty_plus_protocol::EventEnvelope {
            protocol_version: invocation.protocol_version,
            session_id: invocation.session_id.clone(),
            request_id: invocation.request_id.clone(),
            payload: ty_plus_protocol::EventPayload::Progress(ty_plus_protocol::ProgressEvent {
                sequence: sequence + 1,
                stage: ty_plus_protocol::ProgressStage::Committing,
                completed_units: None,
                total_units: None,
                user_safe_detail: None,
            }),
        })
        .map_err(|error| OperationError::Progress(error.to_string()))
}

struct CacheWriteRequest {
    query: CatalogQuery,
    result: CatalogSearchResult,
}

struct DownloadRequest {
    signed: Option<SignedDownload>,
    preset_id: Option<String>,
    destination: String,
}

fn download_from_payload(payload: Value) -> Result<DownloadRequest, OperationError> {
    let request: OnlineDownloadRequest = serde_json::from_value(payload)
        .map_err(|error| OperationError::InvalidPayload(error.to_string()))?;
    if request.signed.is_some() && request.preset_id.is_some() {
        return Err(OperationError::InvalidPayload(
            "signed download and presetId are mutually exclusive".to_owned(),
        ));
    }
    if request.signed.is_none() && request.preset_id.is_none() {
        return Err(OperationError::InvalidPayload(
            "signed download or preset_id is missing".to_owned(),
        ));
    }
    let signed = request
        .signed
        .map(|signed| {
            let expires_in = signed
                .expires_in
                .map(u32::try_from)
                .transpose()
                .map_err(|_| OperationError::InvalidPayload("expiresIn exceeds u32".to_owned()))?;
            Ok::<SignedDownload, OperationError>(SignedDownload {
                url: signed.url,
                sha256: signed.sha256,
                expires_in,
            })
        })
        .transpose()?;
    Ok(DownloadRequest {
        signed,
        preset_id: request.preset_id,
        destination: request.destination,
    })
}

fn cache_write_from_payload(payload: Value) -> Result<CacheWriteRequest, OperationError> {
    let request: OnlineCacheWriteRequest = serde_json::from_value(payload)
        .map_err(|error| OperationError::InvalidPayload(error.to_string()))?;
    Ok(CacheWriteRequest {
        query: catalog_query_from_dto(request.query),
        result: catalog_result_from_dto(request.result),
    })
}

fn catalog_query_from_dto(query: OnlineCatalogQuery) -> CatalogQuery {
    CatalogQuery {
        q: query.q,
        category: query.category,
        tag: query.tag,
        platform: query.platform,
        limit: query.limit,
        offset: query.offset,
    }
}

fn catalog_result_from_dto(result: OnlineCatalogSearchResult) -> CatalogSearchResult {
    CatalogSearchResult {
        items: result
            .items
            .into_iter()
            .map(catalog_item_from_dto)
            .collect(),
    }
}

fn catalog_item_from_dto(
    item: OnlineCatalogSearchItem,
) -> ty_plus_online::catalog::CatalogSearchItem {
    ty_plus_online::catalog::CatalogSearchItem {
        preset_id: item.preset_id,
        name: item.name,
        description: item.description,
        category: item.category,
        tag: item.tag,
        platform: item.platform,
        version: item.version,
        notion_page_url: item.notion_page_url,
        thumbnail_url: item.thumbnail_url,
    }
}

/// Managed-tree search cache adapter. Every write is authorized by the
/// caller-owned MutationContext and committed through storage's transaction.
#[derive(Debug, Clone)]
pub struct PersistentSearchCacheStore {
    managed_root: PathBuf,
}

impl PersistentSearchCacheStore {
    #[must_use]
    pub fn new(managed_root: &Path) -> Self {
        Self {
            managed_root: managed_root.to_path_buf(),
        }
    }

    fn relative_path(&self, key: &str) -> Result<RegisteredPath, CacheError> {
        RegisteredPath::new(
            Path::new("cache")
                .join("search")
                .join(format!("{key}.json")),
        )
        .map_err(|error| CacheError::Store(error.to_string()))
    }

    fn validate_authority(&self, context: &MutationContext<'_>) -> Result<(), CacheError> {
        if context.guard().managed_root().as_path() != self.managed_root {
            return Err(CacheError::Store(
                "cache root does not match mutation context".to_owned(),
            ));
        }
        Ok(())
    }
}

impl CacheStore for PersistentSearchCacheStore {
    type MutationAuthority<'a>
        = MutationContext<'a>
    where
        Self: 'a;

    fn read(&self, key: &str) -> Result<Option<Value>, CacheError> {
        let relative = self.relative_path(key)?;
        match read_entry(&self.managed_root, relative.as_path()) {
            Ok(bytes) => {
                serde_json::from_slice(&bytes)
                    .map(Some)
                    .map_err(|error| CacheError::Corrupt {
                        key: key.to_owned(),
                        detail: error.to_string(),
                    })
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(CacheError::Store(error.to_string())),
        }
    }

    fn exists(&self, key: &str) -> Result<bool, CacheError> {
        let relative = self.relative_path(key)?;
        match read_entry(&self.managed_root, relative.as_path()) {
            Ok(_) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(CacheError::Store(error.to_string())),
        }
    }

    fn write(
        &self,
        context: &Self::MutationAuthority<'_>,
        key: &str,
        value: &Value,
    ) -> Result<(), CacheError> {
        self.validate_authority(context)?;
        let relative = self.relative_path(key)?;
        let bytes =
            serde_json::to_vec(value).map_err(|error| CacheError::Store(error.to_string()))?;
        let mut transaction =
            Transaction::prepare(context.guard(), relative, context.invocation_id().clone())
                .map_err(|error| CacheError::Store(error.to_string()))?;
        transaction
            .write_all(&bytes)
            .and_then(|_| transaction.flush())
            .and_then(|_| transaction.commit().map(|_| ()))
            .map_err(|error| CacheError::Store(error.to_string()))
    }

    fn delete(&self, context: &Self::MutationAuthority<'_>, key: &str) -> Result<(), CacheError> {
        self.validate_authority(context)?;
        let relative = self.relative_path(key)?;
        match remove_entry(&self.managed_root, relative.as_path()) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(CacheError::Store(error.to_string())),
        }
        let revision = relative.as_path().with_extension("rev.json");
        match remove_entry(&self.managed_root, &revision) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(CacheError::Store(error.to_string())),
        }
    }

    fn list(&self) -> Result<Vec<String>, CacheError> {
        let entries = match list_directory(&self.managed_root, Path::new("cache/search")) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(CacheError::Store(error.to_string())),
        };
        let mut keys = Vec::new();
        for entry in entries {
            let Some(name) = entry
                .file_name()
                .and_then(|value| value.to_str())
                .map(str::to_owned)
            else {
                continue;
            };
            if !name.ends_with(".json") || name.ends_with(".rev.json") {
                continue;
            }
            if let Some(stem) = entry.file_stem().and_then(|value| value.to_str()) {
                keys.push(stem.to_owned());
            }
        }
        keys.sort();
        Ok(keys)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::ops::Deref;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use ty_plus_online::catalog::{CatalogResponse, CatalogTransport};
    use ty_plus_online::connectivity::{HealthProbe, ProbeError, ProbeResult};
    use ty_plus_online::download::{DownloadResponse, DownloadTransport};
    use ty_plus_online::offline::OfflineCatalogSearch;
    use ty_plus_online::search_cache::SearchCacheKey;
    use ty_plus_protocol::{
        EventEnvelope, HostContext, InvocationContext, ManagedRootContext, MethodName,
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

    #[derive(Debug)]
    struct OnlineProbe;

    impl HealthProbe for OnlineProbe {
        fn probe(&self, _url: &str) -> Result<ProbeResult, ProbeError> {
            Ok(ProbeResult { status: 200 })
        }
    }

    #[derive(Debug)]
    struct UnusedCatalog;

    impl CatalogTransport for UnusedCatalog {
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
    struct DownloadBody;

    impl DownloadTransport for DownloadBody {
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

    struct CancelAfterCommitting {
        token: CancellationToken,
    }

    impl EventSink for CancelAfterCommitting {
        fn progress(&mut self, event: EventEnvelope) -> Result<(), crate::WorkerError> {
            if matches!(
                event.payload,
                ty_plus_protocol::EventPayload::Progress(progress)
                    if progress.stage == ty_plus_protocol::ProgressStage::Committing
            ) {
                self.token.cancel();
            }
            Ok(())
        }
    }

    #[test]
    fn cancellation_after_committing_event_completes_download_commit() {
        let root = tempdir_in("online-commit-cancel");
        let app_root = root.join("app");
        let support_root = root.join("support");
        std::fs::create_dir_all(&app_root).unwrap();
        std::fs::create_dir_all(&support_root).unwrap();
        let invocation = crate::Invocation::for_test(
            InvocationContext {
                host_context: HostContext {
                    app_root: app_root.to_string_lossy().into_owned(),
                    support_root: support_root.to_string_lossy().into_owned(),
                    session_id: "online-commit-cancel".to_owned(),
                },
                managed_root: ManagedRootContext::SessionDefault,
            },
            "online.test",
        );
        let resolved_initial = invocation.resolve().unwrap();
        let managed_root = resolved_initial.managed_root().managed_root().to_path_buf();
        drop(resolved_initial);
        let config = SupabaseConfig::new("https://example.supabase.co".to_owned())
            .unwrap()
            .with_media_base_url("https://media.example.com".to_owned());
        let online = OnlineBoundary::with_components(
            &managed_root,
            ConnectivityChecker::with_probe(config.clone(), OnlineProbe),
            OfflineCatalogSearch::new(
                CatalogClient::with_transport(config.clone(), UnusedCatalog),
                SearchCache::new(PersistentSearchCacheStore::new(&managed_root)),
            ),
            CatalogClient::with_transport(config.clone(), UnusedCatalog),
            DownloadClient::with_transport(config, DownloadBody),
        );
        let resolved = crate::resolve_invocation_with_online(&invocation, online).unwrap();
        let token = CancellationToken::default();
        let mut events = CancelAfterCommitting {
            token: token.clone(),
        };
        let result = dispatch_online(
            &resolved,
            &MethodName::parse("online.download").unwrap(),
            serde_json::json!({
                "signed": {
                    "url": "https://media.example.com/preset.ffx",
                    "sha256": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
                },
                "destination": "downloads/committing-cancel.ffx"
            }),
            &token,
            &mut events,
        );
        assert!(
            result.is_ok(),
            "commit stage must finish after cancellation"
        );
        assert!(token.is_cancelled());
        assert!(
            managed_root
                .join("downloads/committing-cancel.ffx")
                .exists()
        );
    }

    #[test]
    fn cancellation_after_committing_event_completes_cache_write_commit() {
        let app_root = tempdir_in("online-cache-commit-app");
        let support_root = tempdir_in("online-cache-commit-support");
        let invocation = crate::Invocation::for_test(
            InvocationContext {
                host_context: HostContext {
                    app_root: app_root.to_string_lossy().into_owned(),
                    support_root: support_root.to_string_lossy().into_owned(),
                    session_id: "online-cache-commit-cancel".to_owned(),
                },
                managed_root: ManagedRootContext::SessionDefault,
            },
            "online.test",
        );
        let resolved = invocation.resolve().unwrap();
        let managed_root = resolved.managed_root().managed_root().to_path_buf();
        let token = CancellationToken::default();
        let mut events = CancelAfterCommitting {
            token: token.clone(),
        };
        let result = dispatch_online(
            &resolved,
            &MethodName::parse("online.catalog.cache.write").unwrap(),
            serde_json::json!({
                "query": {"q": "cache-commit-cancel"},
                "result": {"items": []}
            }),
            &token,
            &mut events,
        );
        assert!(
            result.is_ok(),
            "cache commit must finish after cancellation"
        );
        assert!(token.is_cancelled());
        let key = SearchCacheKey::from_query(&CatalogQuery {
            q: Some("cache-commit-cancel".to_owned()),
            ..CatalogQuery::default()
        });
        assert!(
            managed_root
                .join("cache/search")
                .join(format!("{}.json", key.key))
                .exists()
        );
    }
}
