//! Online method dispatch: connectivity check, catalog search, and download.
//!
//! This module is the runtime composition root for the online crate. It owns
//! the concrete HTTP transports, the persistent search cache store, and the
//! preset installer, and exposes the three wire methods that the TypeScript
//! runtime gateway calls over IPC (`NET-010`):
//!
//! - `online.connectivity.check`
//! - `online.catalog.search`
//! - `online.download`
//!
//! Wire DTOs live here (the protocol crate only carries the envelope); domain
//! mapping belongs to the TypeScript runtime gateway mapper.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use ty_plus_host_filesystem::platform::{list_directory, read_entry, remove_entry};
use ty_plus_online::catalog::{
    CatalogClient, CatalogQuery, CatalogSearchResult, CatalogTransport, ReqwestCatalogTransport,
};
use ty_plus_online::config::SupabaseConfig;
use ty_plus_online::connectivity::{
    ConnectivityChecker, ConnectivityState, ConnectivityStatus, HealthProbe, ReqwestProbe,
};
use ty_plus_online::download::{DownloadTransport, ReqwestDownloadTransport, SignedDownload};
use ty_plus_online::offline::{
    require_online, OfflineCatalogSearch, OnlineOperation, SearchOutcome,
};
use ty_plus_online::search_cache::{CacheError, CacheStore, SearchCache};
use ty_plus_storage::{InvocationId, MutationContext, RegisteredPath, Transaction};

use crate::preset_install::{InstallRequest, PresetInstaller, PresetRecord};

// ===== Wire DTOs =====

/// Wire form of `ConnectivityStatus` for `online.connectivity.check`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectivityStatusDto {
    /// Current state: "unknown" | "online" | "offline" | "checking".
    pub state: String,
    /// Human-readable label.
    pub label: String,
    /// ISO 8601 timestamp of last check.
    pub checked_at: String,
    /// Error message if offline.
    pub error_message: Option<String>,
}

impl From<&ConnectivityStatus> for ConnectivityStatusDto {
    fn from(status: &ConnectivityStatus) -> Self {
        Self {
            state: status.state.to_string(),
            label: status.label.clone(),
            checked_at: status.checked_at.clone(),
            error_message: status.error_message.clone(),
        }
    }
}

/// Wire form of a catalog search query for `online.catalog.search`.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogSearchRequest {
    /// Free-text search term.
    pub q: Option<String>,
    /// Category filter.
    pub category: Option<String>,
    /// Tag filter.
    pub tag: Option<String>,
    /// Platform filter.
    pub platform: Option<String>,
    /// Maximum rows to return.
    pub limit: Option<u32>,
    /// Row offset for pagination.
    pub offset: Option<u32>,
}

impl From<&CatalogSearchRequest> for CatalogQuery {
    fn from(request: &CatalogSearchRequest) -> Self {
        Self {
            q: request.q.clone(),
            category: request.category.clone(),
            tag: request.tag.clone(),
            platform: request.platform.clone(),
            limit: request.limit,
            offset: request.offset,
        }
    }
}

/// Wire form of a download request for `online.download`.
///
/// The signed URL resolution, streamed download, integrity verification, and
/// local catalog record commit all complete inside the runtime; the caller
/// supplies only the cloud preset id, the resolved destination path, and the
/// record to commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DownloadRequest {
    /// Cloud preset id resolved against the catalog.
    pub preset_id: String,
    /// Absolute destination path of the asset on disk.
    pub destination: String,
    /// Record committed after the asset is safely on disk.
    pub record: PresetRecord,
}

/// Wire response of `online.download`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DownloadResponse {
    /// Bytes written to disk.
    pub bytes_written: u64,
    /// Verified SHA-256 hex digest of the received body.
    pub sha256: String,
    /// Final URL after redirects.
    pub final_url: String,
    /// Destination path the asset was committed to.
    pub destination: String,
}

// ===== Persistent search cache store =====

/// File-backed `CacheStore` for the online search cache.
///
/// Keys are derived from a canonical query string and may contain arbitrary
/// user text, so each key is hex-encoded as its UTF-8 bytes for the filename.
/// The file body is the raw cached value (a `CatalogSearchResult`) with **no
/// TTL metadata**, matching the NET-008 "no automatic TTL eviction" contract.
#[derive(Debug, Clone)]
pub struct FileCacheStore {
    /// Directory holding one `<hex(key)>.json` file per entry.
    base_dir: PathBuf,
    /// Managed root used for capability-scoped reads and listings.
    managed_root: Option<PathBuf>,
}

impl FileCacheStore {
    /// Creates a store rooted at `base_dir` without touching the filesystem.
    ///
    /// The first managed write creates the cache directory through the
    /// caller-owned mutation context and transaction capability.
    #[must_use]
    pub fn new(base_dir: PathBuf) -> Self {
        Self {
            base_dir,
            managed_root: None,
        }
    }

    /// Creates a store with the managed root required for no-follow reads.
    #[must_use]
    pub fn with_managed_root(base_dir: PathBuf, managed_root: PathBuf) -> Self {
        Self {
            base_dir,
            managed_root: Some(managed_root),
        }
    }

    fn key_from_path(&self, path: &Path) -> Option<String> {
        let stem = path.file_stem()?.to_str()?;
        let bytes = hex_decode(stem).ok()?;
        String::from_utf8(bytes).ok()
    }

    fn registered_path(
        &self,
        context: &MutationContext<'_>,
        key: &str,
    ) -> Result<RegisteredPath, CacheError> {
        let root = context.guard().managed_root().as_path();
        if let Some(expected_root) = &self.managed_root {
            if expected_root != root {
                return Err(CacheError::Store(
                    "cache root does not match mutation context".to_string(),
                ));
            }
        }
        self.relative_path(root, key)
    }

    fn relative_path(&self, root: &Path, key: &str) -> Result<RegisteredPath, CacheError> {
        let base = self
            .base_dir
            .strip_prefix(root)
            .map_err(|_| CacheError::Store("cache root is outside managed root".to_string()))?;
        RegisteredPath::new(base.join(format!("{}.json", hex_encode(key.as_bytes()))))
            .map_err(|error| CacheError::Store(error.to_string()))
    }
}

impl CacheStore for FileCacheStore {
    type MutationAuthority<'a>
        = MutationContext<'a>
    where
        Self: 'a;

    fn read(&self, key: &str) -> Result<Option<serde_json::Value>, CacheError> {
        let Some(root) = &self.managed_root else {
            return Ok(None);
        };
        let relative = self.relative_path(root, key)?;
        let bytes = match read_entry(root, relative.as_path()) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(CacheError::Store(error.to_string())),
        };
        serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| CacheError::Corrupt {
                key: key.to_string(),
                detail: e.to_string(),
            })
    }

    fn write(
        &self,
        context: &Self::MutationAuthority<'_>,
        key: &str,
        value: &serde_json::Value,
    ) -> Result<(), CacheError> {
        let relative = self.registered_path(context, key)?;
        let text = serde_json::to_string(value).map_err(|e| CacheError::Store(e.to_string()))?;
        let mut transaction =
            Transaction::prepare(context.guard(), relative, context.invocation_id().clone())
                .map_err(|e| CacheError::Store(e.to_string()))?;
        transaction
            .write_all(text.as_bytes())
            .and_then(|_| transaction.flush())
            .and_then(|_| transaction.commit().map(|_| ()))
            .map_err(|e| CacheError::Store(e.to_string()))
    }

    fn delete(&self, context: &Self::MutationAuthority<'_>, key: &str) -> Result<(), CacheError> {
        let relative = self.registered_path(context, key)?;
        match remove_entry(context.guard().managed_root().as_path(), relative.as_path()) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(CacheError::Store(error.to_string())),
        }
    }

    fn list(&self) -> Result<Vec<String>, CacheError> {
        let Some(root) = &self.managed_root else {
            return Ok(Vec::new());
        };
        let base = self
            .base_dir
            .strip_prefix(root)
            .map_err(|_| CacheError::Store("cache root is outside managed root".to_string()))?;
        let mut keys = Vec::new();
        let entries = match list_directory(root, base) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(keys),
            Err(error) => return Err(CacheError::Store(error.to_string())),
        };
        for entry in entries {
            let relative = RegisteredPath::new(
                self.base_dir
                    .strip_prefix(root)
                    .map_err(|_| {
                        CacheError::Store("cache root is outside managed root".to_string())
                    })?
                    .join(&entry),
            )
            .map_err(|error| CacheError::Store(error.to_string()))?;
            match read_entry(root, relative.as_path()) {
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                Err(error) => return Err(CacheError::Store(error.to_string())),
            }
            if let Some(key) = self.key_from_path(&entry) {
                keys.push(key);
            }
        }
        keys.sort();
        Ok(keys)
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn hex_decode(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err("odd hex length".to_string());
    }
    let mut out = Vec::with_capacity(value.len() / 2);
    let bytes = value.as_bytes();
    for pair in bytes.chunks(2) {
        let high = hex_nibble(pair[0])?;
        let low = hex_nibble(pair[1])?;
        out.push((high << 4) | low);
    }
    Ok(out)
}

fn hex_nibble(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(format!("invalid hex byte: {}", byte as char)),
    }
}

// ===== Composition =====

/// Composition root for online operations.
///
/// Generic parameters exist so tests can inject fake transports, a fake
/// probe, and an in-memory cache store; production uses the defaults.
pub struct OnlineComposition<
    P = ReqwestProbe,
    T = ReqwestCatalogTransport,
    D = ReqwestDownloadTransport,
    S = FileCacheStore,
> where
    P: HealthProbe,
    T: CatalogTransport,
    D: DownloadTransport,
    S: CacheStore,
{
    /// Resolved Supabase configuration; `None` when environment variables are
    /// absent (online operations then fail with an explicit message instead of
    /// touching the network).
    config: Option<SupabaseConfig>,
    /// Connectivity checker with its current status.
    connectivity: Mutex<ConnectivityChecker<P>>,
    /// Offline-aware catalog search over the persistent cache.
    search: OfflineCatalogSearch<T, S>,
    /// Catalog client used for signed-URL resolution.
    catalog: CatalogClient<T>,
    /// Install orchestration (download + verify + transaction + record).
    installer: PresetInstaller<D>,
}

impl OnlineComposition {
    /// Creates the composition from the process environment and storage root.
    ///
    /// The preset catalog record is committed to `<root>/presets/presets.json`
    /// and the search cache lives under `<root>/cache/search/`.
    #[must_use]
    pub fn new(root: &Path) -> Self {
        Self::with_config(ty_plus_online::config::resolve_from_env().ok(), root)
    }

    /// Creates the composition with an explicit configuration.
    #[must_use]
    pub fn with_config(config: Option<SupabaseConfig>, root: &Path) -> Self {
        let catalog_path = root.join("presets").join("presets.json");
        let cache_dir = root.join("cache").join("search");

        let fallback = SupabaseConfig::new("https://unconfigured.invalid".to_string())
            .expect("static fallback config");
        let effective = config.clone().unwrap_or(fallback);

        let catalog = CatalogClient::new(effective.clone());
        let search = OfflineCatalogSearch::new(
            CatalogClient::new(effective.clone()),
            SearchCache::new(FileCacheStore::with_managed_root(
                cache_dir,
                root.to_path_buf(),
            )),
        );
        let installer = PresetInstaller::new(effective, &catalog_path);
        let connectivity = ConnectivityChecker::new(config.clone().unwrap_or_else(|| {
            SupabaseConfig::new("https://unconfigured.invalid".to_string())
                .expect("static fallback config")
        }));

        Self::with_components(config, connectivity, search, catalog, installer)
    }
}

impl<P, T, D, S> OnlineComposition<P, T, D, S>
where
    P: HealthProbe,
    T: CatalogTransport,
    D: DownloadTransport,
    S: CacheStore,
{
    /// Creates the composition from explicit components (test injection).
    #[must_use]
    pub fn with_components(
        config: Option<SupabaseConfig>,
        connectivity: ConnectivityChecker<P>,
        search: OfflineCatalogSearch<T, S>,
        catalog: CatalogClient<T>,
        installer: PresetInstaller<D>,
    ) -> Self {
        Self {
            config,
            connectivity: Mutex::new(connectivity),
            search,
            catalog,
            installer,
        }
    }

    /// Runs `online.connectivity.check`.
    ///
    /// # Errors
    ///
    /// Returns a message when online is not configured or the checker lock is
    /// poisoned.
    pub fn connectivity_check(&self) -> Result<ConnectivityStatusDto, String> {
        self.require_config()?;
        let mut checker = self
            .connectivity
            .lock()
            .map_err(|_| "connectivity checker lock poisoned".to_string())?;
        Ok(ConnectivityStatusDto::from(checker.check()))
    }

    /// Runs `online.catalog.search` honoring the offline policy.
    ///
    /// # Errors
    ///
    /// Returns a message when online is not configured, the search is offline
    /// with no cached result, the catalog call fails for a non-network reason,
    /// or the cache layer fails.
    pub fn catalog_search(
        &self,
        request: &CatalogSearchRequest,
        authority: &S::MutationAuthority<'_>,
    ) -> Result<CatalogSearchResult, String> {
        self.require_config()?;
        let query = CatalogQuery::from(request);
        let state = self.current_state();
        match self.search.search(state, &query, authority) {
            Ok(SearchOutcome::Fresh(result)) => Ok(result),
            Ok(SearchOutcome::Cached(result)) => Ok(result),
            Err(error) => Err(error.to_string()),
        }
    }

    /// Runs `online.download`: resolves the signed URL, downloads and verifies
    /// into a same-directory transaction, then commits the asset and record.
    ///
    /// # Errors
    ///
    /// Returns a message when online is not configured, the operation is
    /// offline (download is online-only), URL resolution fails, or the install
    /// orchestration fails at any stage.
    #[cfg(test)]
    pub fn download(&self, request: &DownloadRequest) -> Result<DownloadResponse, String> {
        self.download_with_invocation(request, &InvocationId::new("test-online-download"))
    }

    /// Runs a download using the operation identity supplied by the dispatcher.
    pub fn download_with_invocation(
        &self,
        request: &DownloadRequest,
        invocation_id: &InvocationId,
    ) -> Result<DownloadResponse, String> {
        self.require_config()?;
        let state = self.current_state();
        require_online(state, OnlineOperation::Download).map_err(|e| e.to_string())?;

        let dto = self
            .catalog
            .download_url(&request.preset_id)
            .map_err(|e| e.to_string())?;
        let signed = SignedDownload {
            url: dto.url,
            sha256: dto.sha256,
            expires_in: dto.expires_in,
        };
        let install_request = InstallRequest {
            signed,
            destination: PathBuf::from(&request.destination),
            record: request.record.clone(),
        };
        let receipt = self
            .installer
            .install_with_invocation(&install_request, invocation_id, None, None)
            .map_err(|e| e.to_string())?;

        Ok(DownloadResponse {
            bytes_written: receipt.bytes_written,
            sha256: receipt.sha256,
            final_url: receipt.final_url,
            destination: request.destination.clone(),
        })
    }

    fn require_config(&self) -> Result<(), String> {
        if self.config.is_some() {
            Ok(())
        } else {
            Err("online not configured: SUPABASE_URL is required".to_string())
        }
    }

    fn current_state(&self) -> ConnectivityState {
        self.connectivity
            .lock()
            .map(|checker| checker.status().state.clone())
            .unwrap_or(ConnectivityState::Unknown)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;
    use std::io::Cursor;
    use std::rc::Rc;

    use ty_plus_online::catalog::{CatalogError, CatalogResponse};
    use ty_plus_online::connectivity::{ConnectivityState, ProbeError, ProbeResult};
    use ty_plus_online::download::{DownloadError, DownloadResponse as DownloadStream};

    fn test_config() -> SupabaseConfig {
        SupabaseConfig::new("https://example.supabase.co".to_string()).unwrap()
    }

    // ---- Fakes ----

    #[derive(Debug, Default, Clone)]
    struct FakeCatalogTransport {
        responses: RefCell<Vec<CatalogResponse>>,
    }

    impl FakeCatalogTransport {
        fn with(response: CatalogResponse) -> Self {
            Self {
                responses: RefCell::new(vec![response]),
            }
        }
    }

    impl CatalogTransport for FakeCatalogTransport {
        fn get(
            &self,
            _url: &str,
            _headers: &[(String, String)],
        ) -> Result<CatalogResponse, CatalogError> {
            let mut responses = self.responses.borrow_mut();
            if responses.is_empty() {
                return Err(CatalogError::Transport("no mock response".to_string()));
            }
            Ok(responses.remove(0))
        }
    }

    #[derive(Debug, Default, Clone)]
    struct MemoryStore {
        entries: Rc<RefCell<BTreeMap<String, serde_json::Value>>>,
    }

    #[derive(Debug, Clone, Copy)]
    struct TestMutationPermit;

    const TEST_PERMIT: TestMutationPermit = TestMutationPermit;

    impl CacheStore for MemoryStore {
        type MutationAuthority<'a>
            = TestMutationPermit
        where
            Self: 'a;

        fn read(&self, key: &str) -> Result<Option<serde_json::Value>, CacheError> {
            Ok(self.entries.borrow().get(key).cloned())
        }

        fn write(
            &self,
            _authority: &Self::MutationAuthority<'_>,
            key: &str,
            value: &serde_json::Value,
        ) -> Result<(), CacheError> {
            self.entries
                .borrow_mut()
                .insert(key.to_string(), value.clone());
            Ok(())
        }

        fn delete(
            &self,
            _authority: &Self::MutationAuthority<'_>,
            key: &str,
        ) -> Result<(), CacheError> {
            self.entries.borrow_mut().remove(key);
            Ok(())
        }

        fn list(&self) -> Result<Vec<String>, CacheError> {
            Ok(self.entries.borrow().keys().cloned().collect())
        }
    }

    #[derive(Debug)]
    struct FakeProbe {
        outcome: RefCell<Result<ProbeResult, ProbeError>>,
    }

    impl FakeProbe {
        fn offline() -> Self {
            Self {
                outcome: RefCell::new(Err(ProbeError::Offline)),
            }
        }

        fn online() -> Self {
            Self {
                outcome: RefCell::new(Ok(ProbeResult { status: 200 })),
            }
        }
    }

    impl HealthProbe for FakeProbe {
        fn probe(&self, _url: &str) -> Result<ProbeResult, ProbeError> {
            self.outcome.borrow().clone()
        }
    }

    #[derive(Debug)]
    struct FakeDownloadTransport {
        body: Vec<u8>,
        error: Option<DownloadError>,
        final_url: String,
    }

    impl FakeDownloadTransport {
        fn ok(body: &[u8]) -> Self {
            Self {
                body: body.to_vec(),
                error: None,
                final_url: "https://media.example.com/preset.ffx".to_string(),
            }
        }
    }

    impl DownloadTransport for FakeDownloadTransport {
        fn get(
            &self,
            _url: &str,
            _allowed_hosts: &[String],
        ) -> Result<DownloadStream, DownloadError> {
            if let Some(error) = &self.error {
                return Err(error.clone());
            }
            let body = self.body.clone();
            Ok(DownloadStream {
                status: 200,
                final_url: self.final_url.clone(),
                content_length: Some(body.len() as u64),
                body: Box::new(Cursor::new(body)),
            })
        }
    }

    #[derive(Debug, Clone)]
    struct RecordingCommitter {
        committed: Rc<RefCell<Vec<PresetRecord>>>,
    }

    impl RecordingCommitter {
        fn new() -> Self {
            Self {
                committed: Rc::new(RefCell::new(Vec::new())),
            }
        }
    }

    impl crate::preset_install::RecordCommitter for RecordingCommitter {
        fn commit(
            &self,
            record: &PresetRecord,
            _context: &ty_plus_storage::MutationContext<'_>,
        ) -> Result<(), String> {
            self.committed.borrow_mut().push(record.clone());
            Ok(())
        }
    }

    fn search_query() -> CatalogSearchRequest {
        CatalogSearchRequest {
            q: Some("ease".to_string()),
            ..Default::default()
        }
    }

    fn composition(
        config: Option<SupabaseConfig>,
        probe: FakeProbe,
        transport: FakeCatalogTransport,
        store: MemoryStore,
    ) -> OnlineComposition<FakeProbe, FakeCatalogTransport, FakeDownloadTransport, MemoryStore>
    {
        let effective = config.clone().unwrap_or_else(|| {
            SupabaseConfig::new("https://example.supabase.co".to_string()).unwrap()
        });
        let catalog = CatalogClient::with_transport(effective.clone(), transport.clone());
        let search = OfflineCatalogSearch::new(
            CatalogClient::with_transport(effective.clone(), transport),
            SearchCache::new(store),
        );
        let installer = PresetInstaller::with_transport_and_committer(
            effective.clone(),
            FakeDownloadTransport::ok(b"data"),
            Box::new(RecordingCommitter::new()),
        );
        let checker = ConnectivityChecker::with_probe(effective, probe);
        OnlineComposition::with_components(config, checker, search, catalog, installer)
    }

    // ---- DTO mapping ----

    #[test]
    fn connectivity_status_maps_to_dto() {
        let status = ConnectivityStatus {
            state: ConnectivityState::Offline,
            label: "Cloud sync failed".to_string(),
            checked_at: "2026-01-01T00:00:00Z".to_string(),
            error_message: Some("network unavailable".to_string()),
        };
        let dto = ConnectivityStatusDto::from(&status);
        assert_eq!(dto.state, "offline");
        assert_eq!(dto.error_message.as_deref(), Some("network unavailable"));
    }

    #[test]
    fn search_request_maps_to_catalog_query() {
        let request = CatalogSearchRequest {
            q: Some("ease".to_string()),
            category: Some("preset".to_string()),
            limit: Some(20),
            ..Default::default()
        };
        let query = CatalogQuery::from(&request);
        assert_eq!(query.q.as_deref(), Some("ease"));
        assert_eq!(query.category.as_deref(), Some("preset"));
        assert_eq!(query.limit, Some(20));
    }

    // ---- Handlers ----

    #[test]
    fn unconfigured_composition_fails_explicitly() {
        let probe = FakeProbe::online();
        let transport = FakeCatalogTransport::default();
        let composition = composition(None, probe, transport, MemoryStore::default());

        assert!(composition.connectivity_check().is_err());
        assert!(composition
            .catalog_search(&search_query(), &TEST_PERMIT)
            .is_err());
        assert!(composition.download(&download_request()).is_err());
    }

    #[test]
    fn connectivity_check_reports_state_from_probe() {
        let composition = composition(
            Some(test_config()),
            FakeProbe::offline(),
            FakeCatalogTransport::default(),
            MemoryStore::default(),
        );
        let status = composition.connectivity_check().unwrap();
        assert_eq!(status.state, "offline");
    }

    #[test]
    fn catalog_search_serves_cache_while_offline() {
        let result = CatalogSearchResult {
            items: vec![ty_plus_online::catalog::CatalogSearchItem {
                preset_id: "p1".to_string(),
                name: "Easing Pack".to_string(),
                description: None,
                category: Some("preset".to_string()),
                tag: None,
                platform: None,
                version: None,
                notion_page_url: None,
                thumbnail_url: None,
            }],
        };
        let store = MemoryStore::default();
        let query = CatalogQuery::from(&search_query());
        SearchCache::new(store.clone())
            .update(&TEST_PERMIT, &query, &result)
            .unwrap();

        let composition = composition(
            Some(test_config()),
            FakeProbe::offline(),
            FakeCatalogTransport::default(),
            store,
        );

        assert_eq!(composition.connectivity_check().unwrap().state, "offline");
        let outcome = composition
            .catalog_search(&search_query(), &TEST_PERMIT)
            .unwrap();
        assert_eq!(outcome.items.len(), 1);
        assert_eq!(outcome.items[0].preset_id, "p1");
    }

    #[test]
    fn catalog_search_offline_without_cache_is_an_error() {
        let composition = composition(
            Some(test_config()),
            FakeProbe::offline(),
            FakeCatalogTransport::default(),
            MemoryStore::default(),
        );

        let error = composition
            .catalog_search(&search_query(), &TEST_PERMIT)
            .unwrap_err();
        assert!(error.contains("offline"), "unexpected error: {error}");
    }

    #[test]
    fn download_fails_explicitly_while_offline() {
        let composition = composition(
            Some(test_config()),
            FakeProbe::offline(),
            FakeCatalogTransport::default(),
            MemoryStore::default(),
        );

        assert_eq!(composition.connectivity_check().unwrap().state, "offline");
        let error = composition.download(&download_request()).unwrap_err();
        assert!(error.contains("requires a network connection"));
    }

    #[test]
    fn download_online_resolves_url_and_installs() {
        let sha = sha256_hex(b"data");
        let transport = FakeCatalogTransport::with(CatalogResponse {
            status: 200,
            body: serde_json::json!({
                "url": "https://media.example.com/preset.ffx?token=abc",
                "sha256": sha,
                "expires_in": 3600,
            })
            .to_string(),
        });
        let composition = composition(
            Some(test_config()),
            FakeProbe::online(),
            transport,
            MemoryStore::default(),
        );

        assert_eq!(composition.connectivity_check().unwrap().state, "online");
        let response = composition.download(&download_request()).unwrap();
        let expected_destination = test_destination();
        assert_eq!(response.sha256, sha);
        assert_eq!(response.bytes_written, 4);
        assert_eq!(response.destination, expected_destination);
    }

    fn test_destination() -> String {
        std::env::temp_dir()
            .join(format!(
                "ty-plus-runtime-installed-{}.ffx",
                std::process::id()
            ))
            .display()
            .to_string()
    }

    fn download_request() -> DownloadRequest {
        let destination = test_destination();
        DownloadRequest {
            preset_id: "cloud-id".to_string(),
            destination: destination.clone(),
            record: PresetRecord {
                id: "local-id".to_string(),
                r#type: "preset".to_string(),
                title: "Easing Pack".to_string(),
                file_path: destination,
                description: None,
                category: Some("preset".to_string()),
                source_catalog_id: "cloud-id".to_string(),
            },
        }
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        let mut out = String::with_capacity(64);
        for byte in Sha256::digest(bytes) {
            out.push_str(&format!("{byte:02x}"));
        }
        out
    }

    // ---- FileCacheStore ----

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-online-dispatch-{suffix}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("failed to create test dir");
        dir
    }

    fn with_file_context<T>(root: &Path, operation: impl FnOnce(&MutationContext<'_>) -> T) -> T {
        let managed_root = ty_plus_storage::ManagedRoot::new(root).expect("managed test root");
        let guard = ty_plus_storage::OperationLock::acquire(
            &managed_root,
            std::time::Instant::now() + std::time::Duration::from_secs(5),
        )
        .expect("test operation lock");
        let invocation = InvocationId::new("runtime-file-cache-test");
        let context = MutationContext::new(&guard, &invocation);
        operation(&context)
    }

    #[test]
    fn file_cache_store_round_trips_keys_with_hostile_characters() {
        let dir = test_dir("hostile");
        let store = FileCacheStore::with_managed_root(dir.join("cache/search"), dir.clone());

        let key = "q=cam&category=preset&platform=win:mac?extras/".to_string();
        with_file_context(&dir, |context| {
            store
                .write(context, &key, &serde_json::json!({ "items": [] }))
                .unwrap();
        });
        assert_eq!(
            store.read(&key).unwrap(),
            Some(serde_json::json!({ "items": [] }))
        );
        assert_eq!(store.list().unwrap(), vec![key.clone()]);

        with_file_context(&dir, |context| {
            store.delete(context, &key).unwrap();
        });
        assert!(store.read(&key).unwrap().is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_cache_store_persists_across_instances() {
        let dir = test_dir("persist");
        let cache_dir = dir.join("cache/search");
        let key = "q=ease".to_string();

        {
            let store = FileCacheStore::with_managed_root(cache_dir.clone(), dir.clone());
            with_file_context(&dir, |context| {
                store
                    .write(context, &key, &serde_json::json!({ "items": [] }))
                    .unwrap();
            });
        }
        let store = FileCacheStore::with_managed_root(cache_dir, dir.clone());
        assert_eq!(
            store.read(&key).unwrap(),
            Some(serde_json::json!({ "items": [] }))
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_cache_store_handles_missing_key() {
        let dir = test_dir("missing");
        let store = FileCacheStore::with_managed_root(dir.join("cache/search"), dir.clone());
        assert!(store.read("q=absent").unwrap().is_none());
        assert!(store.list().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_cache_store_constructor_and_reads_do_not_create_directory() {
        let parent = test_dir("pure-constructor");
        let dir = parent.join("cache").join("search");
        let store = FileCacheStore::new(dir.clone());

        assert!(!dir.exists());
        assert!(store.read("q=absent").unwrap().is_none());
        assert!(store.list().unwrap().is_empty());
        assert!(!dir.exists());

        let _ = std::fs::remove_dir_all(parent);
    }

    #[test]
    fn file_cache_store_delete_missing_is_not_an_error() {
        let dir = test_dir("delete-missing");
        let store = FileCacheStore::with_managed_root(dir.join("cache/search"), dir.clone());
        with_file_context(&dir, |context| {
            store.delete(context, "q=absent").unwrap();
        });
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn hex_encoding_round_trips() {
        for value in ["", "a", "ab", "q=cam&category=preset", "日本語"] {
            let encoded = hex_encode(value.as_bytes());
            assert_eq!(hex_decode(&encoded).unwrap(), value.as_bytes());
        }
        assert!(hex_decode("abc").is_err());
        assert!(hex_decode("zz").is_err());
    }
}
