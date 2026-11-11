//! Offline policy applied to online operations.
//!
//! Local features never depend on the network: only online-only operations
//! report a connection failure, and they never stop local storage or AE
//! operations. This module decides, per operation and connectivity state,
//! whether the operation proceeds normally, proceeds from the persistent
//! search cache, or fails with an explicit offline error.

use crate::catalog::{
    CatalogClient, CatalogError, CatalogQuery, CatalogSearchResult, CatalogTransport,
};
use crate::connectivity::ConnectivityState;
use crate::search_cache::{CacheError, CacheStore, SearchCache};

/// Online operations subject to the offline policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnlineOperation {
    /// The connectivity check itself; it probes to (re)discover the state.
    ConnectivityCheck,
    /// Catalog search; serves the persistent cache when offline.
    CatalogSearch,
    /// Signed-URL download; online-only.
    Download,
    /// Search cache read/write; always local.
    SearchCache,
    /// aescripts licensing revalidation; online-only when due.
    LicensingRevalidation,
    /// An operation not recognized by this policy.
    Unsupported,
}

/// What an operation may do under the current connectivity state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OfflineDecision {
    /// The operation is local and is allowed without network access.
    LocalAllowed,
    /// The operation proceeds with cached/local data only.
    CacheOnly,
    /// The operation requires a live network connection.
    NetworkRequired,
    /// The operation is not recognized and must not be run.
    Blocked,
}

/// Applies the offline policy to a single operation.
///
/// The decision is made for one operation rather than for the whole product.
/// Local operations remain available while offline, catalog search degrades to
/// its durable cache, and network-only work is reported explicitly.
#[must_use]
pub fn decide(state: ConnectivityState, operation: OnlineOperation) -> OfflineDecision {
    match operation {
        OnlineOperation::SearchCache => OfflineDecision::LocalAllowed,
        OnlineOperation::Unsupported => OfflineDecision::Blocked,
        OnlineOperation::CatalogSearch if state == ConnectivityState::Offline => {
            OfflineDecision::CacheOnly
        }
        OnlineOperation::CatalogSearch
        | OnlineOperation::ConnectivityCheck
        | OnlineOperation::Download
        | OnlineOperation::LicensingRevalidation => OfflineDecision::NetworkRequired,
    }
}

/// Result of a connectivity-aware catalog search.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchOutcome {
    /// Result fetched from the network.
    Fresh(CatalogSearchResult),
    /// Result served from the persistent search cache.
    Cached(CatalogSearchResult),
}

impl SearchOutcome {
    /// Returns true when the result came from the persistent cache.
    #[must_use]
    pub fn from_cache(&self) -> bool {
        matches!(self, Self::Cached(_))
    }
}

/// Errors produced by a connectivity-aware catalog search.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchError {
    /// No cached result and the network is unavailable.
    Offline,
    /// The catalog request failed for a non-network reason.
    Catalog(CatalogError),
    /// The cache layer failed.
    Cache(CacheError),
}

impl std::fmt::Display for SearchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Offline => write!(f, "offline and no cached catalog result"),
            Self::Catalog(detail) => write!(f, "catalog error: {detail}"),
            Self::Cache(detail) => write!(f, "search cache error: {detail}"),
        }
    }
}

impl std::error::Error for SearchError {}

/// Catalog search that honors the offline policy.
///
/// Online it searches the network and refreshes the persistent cache. Offline,
/// or when a network call fails, it serves the cache; a cache miss produces an
/// explicit `Offline` error instead of hanging or leaking a transport error.
pub struct OfflineCatalogSearch<T, S> {
    /// Catalog HTTP client.
    client: CatalogClient<T>,
    /// Persistent search cache.
    cache: SearchCache<S>,
}

impl<T, S> OfflineCatalogSearch<T, S>
where
    T: CatalogTransport,
    S: CacheStore,
{
    /// Creates a connectivity-aware search over the given client and cache.
    #[must_use]
    pub fn new(client: CatalogClient<T>, cache: SearchCache<S>) -> Self {
        Self { client, cache }
    }

    /// Searches the catalog under `state`.
    ///
    /// # Errors
    ///
    /// Returns `SearchError::Offline` when offline and the cache misses,
    /// `SearchError::Catalog` on a non-network catalog failure, and
    /// `SearchError::Cache` when the cache layer fails.
    pub fn search(
        &self,
        state: ConnectivityState,
        query: &CatalogQuery,
        authority: &S::MutationAuthority<'_>,
    ) -> Result<SearchOutcome, SearchError> {
        let mut no_op = || Ok(());
        self.search_with_pre_commit(state, query, authority, &mut no_op)
    }

    /// Searches while invoking the supplied hook immediately before the
    /// fresh-result cache mutation. Cache hits and network failures do not
    /// invoke the hook because they perform no cache commit.
    pub fn search_with_pre_commit(
        &self,
        state: ConnectivityState,
        query: &CatalogQuery,
        authority: &S::MutationAuthority<'_>,
        before_commit: &mut dyn FnMut() -> Result<(), SearchError>,
    ) -> Result<SearchOutcome, SearchError> {
        match decide(state, OnlineOperation::CatalogSearch) {
            OfflineDecision::NetworkRequired => {
                self.search_network(query, authority, before_commit)
            }
            OfflineDecision::CacheOnly => self.search_cached(query),
            OfflineDecision::LocalAllowed | OfflineDecision::Blocked => Err(SearchError::Offline),
        }
    }

    fn search_network(
        &self,
        query: &CatalogQuery,
        authority: &S::MutationAuthority<'_>,
        before_commit: &mut dyn FnMut() -> Result<(), SearchError>,
    ) -> Result<SearchOutcome, SearchError> {
        match self.client.search(query) {
            Ok(result) => {
                let prepared = self
                    .cache
                    .prepare_update(query, &result)
                    .map_err(SearchError::Cache)?;
                before_commit()?;
                self.cache
                    .commit_update(authority, prepared)
                    .map_err(SearchError::Cache)?;
                Ok(SearchOutcome::Fresh(result))
            }
            Err(CatalogError::Transport(_)) => self.search_cached(query),
            Err(other) => Err(SearchError::Catalog(other)),
        }
    }

    fn search_cached(&self, query: &CatalogQuery) -> Result<SearchOutcome, SearchError> {
        match self.cache.query(query) {
            Ok(Some(result)) => Ok(SearchOutcome::Cached(result)),
            Ok(None) => Err(SearchError::Offline),
            Err(error) => Err(SearchError::Cache(error)),
        }
    }
}

/// Explicit offline failure for an online-only operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OfflineError {
    /// Operation that requires a live connection.
    operation: &'static str,
}

impl std::fmt::Display for OfflineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "operation '{}' requires a network connection",
            self.operation
        )
    }
}

impl std::error::Error for OfflineError {}

/// Guards an online-only operation: fails explicitly while offline.
///
/// # Errors
///
/// Returns `OfflineError` when a network-required operation is attempted
/// while the state is explicitly offline.
pub fn require_online(
    state: ConnectivityState,
    operation: OnlineOperation,
) -> Result<(), OfflineError> {
    if state == ConnectivityState::Offline
        && matches!(
            operation,
            OnlineOperation::Download | OnlineOperation::LicensingRevalidation
        )
    {
        Err(OfflineError {
            operation: match operation {
                OnlineOperation::Download => "download",
                OnlineOperation::CatalogSearch => "catalog search",
                OnlineOperation::ConnectivityCheck => "connectivity check",
                OnlineOperation::SearchCache => "search cache",
                OnlineOperation::LicensingRevalidation => "licensing revalidation",
                OnlineOperation::Unsupported => "unsupported operation",
            },
        })
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    fn all_operations() -> [OnlineOperation; 5] {
        [
            OnlineOperation::ConnectivityCheck,
            OnlineOperation::CatalogSearch,
            OnlineOperation::Download,
            OnlineOperation::SearchCache,
            OnlineOperation::LicensingRevalidation,
        ]
    }

    #[test]
    fn online_operations_have_explicit_network_or_local_decisions() {
        for operation in all_operations() {
            let expected = if operation == OnlineOperation::SearchCache {
                OfflineDecision::LocalAllowed
            } else {
                OfflineDecision::NetworkRequired
            };
            assert_eq!(
                decide(ConnectivityState::Online, operation),
                expected,
                "{operation:?} must proceed online"
            );
        }
    }

    #[test]
    fn checking_all_operations_are_explicit() {
        for operation in all_operations() {
            let expected = if operation == OnlineOperation::SearchCache {
                OfflineDecision::LocalAllowed
            } else {
                OfflineDecision::NetworkRequired
            };
            assert_eq!(decide(ConnectivityState::Checking, operation), expected);
        }
    }

    #[test]
    fn unknown_all_operations_are_explicit() {
        for operation in all_operations() {
            let expected = if operation == OnlineOperation::SearchCache {
                OfflineDecision::LocalAllowed
            } else {
                OfflineDecision::NetworkRequired
            };
            assert_eq!(decide(ConnectivityState::Unknown, operation), expected);
        }
    }

    #[test]
    fn offline_check_requires_network_but_cache_is_local() {
        assert_eq!(
            decide(
                ConnectivityState::Offline,
                OnlineOperation::ConnectivityCheck
            ),
            OfflineDecision::NetworkRequired
        );
        assert_eq!(
            decide(ConnectivityState::Offline, OnlineOperation::SearchCache),
            OfflineDecision::LocalAllowed
        );
    }

    #[test]
    fn offline_search_is_cache_only() {
        assert_eq!(
            decide(ConnectivityState::Offline, OnlineOperation::CatalogSearch),
            OfflineDecision::CacheOnly
        );
    }

    #[test]
    fn catalog_search_is_network_required_except_when_offline() {
        assert_eq!(
            decide(ConnectivityState::Online, OnlineOperation::CatalogSearch),
            OfflineDecision::NetworkRequired
        );
        assert_eq!(
            decide(ConnectivityState::Unknown, OnlineOperation::CatalogSearch),
            OfflineDecision::NetworkRequired
        );
        assert_eq!(
            decide(ConnectivityState::Checking, OnlineOperation::CatalogSearch),
            OfflineDecision::NetworkRequired
        );
        assert_eq!(
            decide(ConnectivityState::Offline, OnlineOperation::CatalogSearch),
            OfflineDecision::CacheOnly
        );
    }

    #[test]
    fn offline_download_requires_network_explicitly() {
        assert_eq!(
            decide(ConnectivityState::Offline, OnlineOperation::Download),
            OfflineDecision::NetworkRequired
        );
    }

    #[derive(Debug, Default)]
    struct FakeTransport {
        responses: Vec<CatalogResponse>,
        requested: RefCell<Vec<String>>,
    }

    impl FakeTransport {
        fn failing() -> Self {
            Self {
                responses: Vec::new(),
                requested: RefCell::new(Vec::new()),
            }
        }

        fn with(response: CatalogResponse) -> Self {
            Self {
                responses: vec![response],
                requested: RefCell::new(Vec::new()),
            }
        }
    }

    impl CatalogTransport for FakeTransport {
        fn get(
            &self,
            url: &str,
            _headers: &[(String, String)],
        ) -> Result<CatalogResponse, CatalogError> {
            self.requested.borrow_mut().push(url.to_string());
            self.responses
                .first()
                .cloned()
                .ok_or_else(|| CatalogError::Transport("no mock response".to_string()))
        }
    }

    #[derive(Debug, Default)]
    struct MemoryStore {
        entries: RefCell<BTreeMap<String, serde_json::Value>>,
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

    type CatalogResponse = super::super::catalog::CatalogResponse;
    type CachedTransport = super::super::catalog::CatalogClient<FakeTransport>;
    type CachedStore = super::super::search_cache::SearchCache<MemoryStore>;

    fn client() -> CachedTransport {
        CatalogClient::with_transport(
            crate::config::SupabaseConfig::new("https://example.supabase.co".to_string()).unwrap(),
            FakeTransport::failing(),
        )
    }

    fn client_with_rows() -> CachedTransport {
        let body =
            serde_json::json!({ "items": [{ "preset_id": "p1", "name": "One" }] }).to_string();
        CatalogClient::with_transport(
            crate::config::SupabaseConfig::new("https://example.supabase.co".to_string()).unwrap(),
            FakeTransport::with(CatalogResponse { status: 200, body }),
        )
    }

    fn store() -> CachedStore {
        SearchCache::new(MemoryStore::default())
    }

    fn store_with(query: &CatalogQuery, result: &CatalogSearchResult) -> CachedStore {
        let store = store();
        let _ = store.update(&TEST_PERMIT, query, result);
        store
    }

    fn query() -> CatalogQuery {
        CatalogQuery {
            q: Some("cam".to_string()),
            ..Default::default()
        }
    }

    fn cached_result() -> CatalogSearchResult {
        CatalogSearchResult {
            items: vec![crate::catalog::CatalogSearchItem {
                preset_id: "p1".to_string(),
                name: "One".to_string(),
                description: None,
                category: None,
                tag: None,
                platform: None,
                version: None,
                notion_page_url: None,
                thumbnail_url: None,
            }],
        }
    }

    #[test]
    fn online_search_returns_fresh_and_refreshes_cache() {
        let service = OfflineCatalogSearch::new(client_with_rows(), store());
        let outcome = service
            .search(ConnectivityState::Online, &query(), &TEST_PERMIT)
            .unwrap();

        assert!(matches!(outcome, SearchOutcome::Fresh(_)));
        assert!(!outcome.from_cache());
    }

    #[test]
    fn fresh_search_runs_pre_commit_hook_before_cache_update_only() {
        let service = OfflineCatalogSearch::new(client_with_rows(), store());
        let hook_calls = std::cell::Cell::new(0_u8);
        let mut before_commit = || {
            hook_calls.set(hook_calls.get() + 1);
            Ok(())
        };
        let outcome = service
            .search_with_pre_commit(
                ConnectivityState::Online,
                &query(),
                &TEST_PERMIT,
                &mut before_commit,
            )
            .unwrap();
        assert!(matches!(outcome, SearchOutcome::Fresh(_)));
        assert_eq!(hook_calls.get(), 1);

        let cached = OfflineCatalogSearch::new(client(), store_with(&query(), &cached_result()));
        let mut offline_hook = || {
            hook_calls.set(hook_calls.get() + 1);
            Ok(())
        };
        let offline = cached
            .search_with_pre_commit(
                ConnectivityState::Offline,
                &query(),
                &TEST_PERMIT,
                &mut offline_hook,
            )
            .unwrap();
        assert!(matches!(offline, SearchOutcome::Cached(_)));
        assert_eq!(
            hook_calls.get(),
            1,
            "cache hit must not enter commit boundary"
        );
    }

    #[test]
    fn fresh_search_hook_failure_leaves_cache_unwritten() {
        let service = OfflineCatalogSearch::new(client_with_rows(), store());
        let mut failing_hook = || {
            Err(SearchError::Cache(CacheError::Store(
                "committing flush failed".to_owned(),
            )))
        };
        assert!(service
            .search_with_pre_commit(
                ConnectivityState::Online,
                &query(),
                &TEST_PERMIT,
                &mut failing_hook,
            )
            .is_err());

        let mut no_op = || Ok(());
        assert!(matches!(
            service.search_with_pre_commit(
                ConnectivityState::Offline,
                &query(),
                &TEST_PERMIT,
                &mut no_op,
            ),
            Err(SearchError::Offline)
        ));
    }

    #[test]
    fn offline_with_cache_serves_cached_result() {
        let service = OfflineCatalogSearch::new(client(), store_with(&query(), &cached_result()));

        let outcome = service
            .search(ConnectivityState::Offline, &query(), &TEST_PERMIT)
            .unwrap();
        assert!(matches!(outcome, SearchOutcome::Cached(ref result) if result.items.len() == 1));
        assert!(outcome.from_cache());
    }

    #[test]
    fn offline_without_cache_is_explicit_offline() {
        let service = OfflineCatalogSearch::new(client(), store());
        let error = service
            .search(ConnectivityState::Offline, &query(), &TEST_PERMIT)
            .unwrap_err();
        assert!(matches!(error, SearchError::Offline));
    }

    #[test]
    fn network_transport_failure_falls_back_to_cache() {
        let service = OfflineCatalogSearch::new(client(), store_with(&query(), &cached_result()));

        let outcome = service
            .search(ConnectivityState::Unknown, &query(), &TEST_PERMIT)
            .unwrap();
        assert!(matches!(outcome, SearchOutcome::Cached(_)));
    }

    #[test]
    fn non_transport_catalog_error_is_propagated() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 500,
            body: "boom".to_string(),
        });
        let client = CatalogClient::with_transport(
            crate::config::SupabaseConfig::new("https://example.supabase.co".to_string()).unwrap(),
            transport,
        );
        let service = OfflineCatalogSearch::new(client, store());

        let error = service
            .search(ConnectivityState::Online, &query(), &TEST_PERMIT)
            .unwrap_err();
        assert!(matches!(
            error,
            SearchError::Catalog(CatalogError::Http { status: 500, .. })
        ));
    }

    #[test]
    fn require_online_fails_only_online_only_operations() {
        assert!(require_online(ConnectivityState::Online, OnlineOperation::Download).is_ok());
        assert!(require_online(ConnectivityState::Offline, OnlineOperation::CatalogSearch).is_ok());
        assert!(require_online(ConnectivityState::Offline, OnlineOperation::Download).is_err());
        assert!(require_online(
            ConnectivityState::Offline,
            OnlineOperation::ConnectivityCheck
        )
        .is_ok());
    }

    #[test]
    fn offline_error_display() {
        let error =
            require_online(ConnectivityState::Offline, OnlineOperation::Download).unwrap_err();
        assert_eq!(
            error.to_string(),
            "operation 'download' requires a network connection"
        );
    }

    #[test]
    fn search_error_display() {
        assert_eq!(
            SearchError::Offline.to_string(),
            "offline and no cached catalog result"
        );
        assert_eq!(
            SearchError::Catalog(CatalogError::Transport("timeout".to_string())).to_string(),
            "catalog error: catalog network error: timeout"
        );
    }
}
