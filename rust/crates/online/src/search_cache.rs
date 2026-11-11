//! Persistent search cache with explicit-delete semantics.
//!
//! This module caches catalog search results keyed by a normalized query so
//! results remain available offline and across restarts. The contract is
//! **no automatic TTL eviction**: an entry persists until it is explicitly
//! deleted, matching the Phase 5 exit gate (`検索 cache は明示削除まで永続する`).
//!
//! Persistence is an injectable port (`CacheStore`); the online crate owns the
//! cache policy and domain mapping but not a concrete storage implementation.

use std::collections::BTreeMap;

use crate::catalog::{CatalogQuery, CatalogSearchResult};
use sha2::{Digest, Sha256};

/// Errors produced by search cache operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CacheError {
    /// The persistence store reported a failure.
    Store(String),
    /// A cached value could not be (de)serialized.
    Corrupt { key: String, detail: String },
}

impl std::fmt::Display for CacheError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Store(detail) => write!(f, "search cache store error: {detail}"),
            Self::Corrupt { key, detail } => {
                write!(f, "cached entry {key} is corrupt: {detail}")
            }
        }
    }
}

impl std::error::Error for CacheError {}

/// Persistence port for the search cache.
///
/// Implementations are supplied by the composition root (e.g. a JSON file
/// store from the storage crate). Values travel as JSON so the store stays
/// value-agnostic.
pub trait CacheStore {
    /// Caller-owned authority for one managed mutation. Production adapters
    /// bind this GAT to their storage transaction/mutation context.
    type MutationAuthority<'a>
    where
        Self: 'a;

    /// Reads the value for `key`, or `None` when absent.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the underlying store fails.
    fn read(&self, key: &str) -> Result<Option<serde_json::Value>, CacheError>;

    /// Checks whether an entry exists without requiring domain deserialization.
    ///
    /// Stores that can inspect raw entry metadata should override this method
    /// so explicit deletion can repair corrupt cached values.
    fn exists(&self, key: &str) -> Result<bool, CacheError> {
        self.read(key).map(|value| value.is_some())
    }

    /// Upserts `value` under `key`.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the underlying store fails.
    fn write(
        &self,
        authority: &Self::MutationAuthority<'_>,
        key: &str,
        value: &serde_json::Value,
    ) -> Result<(), CacheError>;

    /// Deletes the entry under `key`. Missing keys are not an error.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the underlying store fails.
    fn delete(&self, authority: &Self::MutationAuthority<'_>, key: &str) -> Result<(), CacheError>;

    /// Lists all stored keys.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the underlying store fails.
    fn list(&self) -> Result<Vec<String>, CacheError>;
}

/// A normalized, order-insensitive cache key derived from a search query.
///
/// Serializing a `BTreeMap` of the set fields guarantees that two queries
/// with identical parameters always derive the same key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchCacheKey {
    /// Canonical key used against the store.
    pub key: String,
}

impl SearchCacheKey {
    /// Derives the canonical key for a query.
    #[must_use]
    pub fn from_query(query: &CatalogQuery) -> Self {
        let mut fields = BTreeMap::new();
        if let Some(q) = &query.q {
            fields.insert("q", q.clone());
        }
        if let Some(category) = &query.category {
            fields.insert("category", category.clone());
        }
        if let Some(tag) = &query.tag {
            fields.insert("tag", tag.clone());
        }
        if let Some(platform) = &query.platform {
            fields.insert("platform", platform.clone());
        }
        if let Some(limit) = query.limit {
            fields.insert("limit", limit.to_string());
        }
        if let Some(offset) = query.offset {
            fields.insert("offset", offset.to_string());
        }
        let mut canonical = String::new();
        for (field, value) in fields {
            canonical.push_str(field);
            canonical.push('=');
            canonical.push_str(&value);
            canonical.push('&');
        }
        // Never use query text as a filename. Hashing the canonical form
        // yields a stable, separator-safe relative key for a managed store.
        let digest = Sha256::digest(canonical.as_bytes());
        Self {
            key: format!("search-{:x}", digest),
        }
    }
}

/// Persistent search cache.
///
/// Entries persist across restarts and are never evicted by a timer; the only
/// removal paths are `delete`, `clear`, or an explicit store-level removal.
#[derive(Debug, Clone)]
pub struct SearchCache<S> {
    /// The persistence port.
    store: S,
}

/// Serialized cache mutation prepared before the irreversible store write.
#[derive(Debug, Clone, PartialEq)]
pub struct PreparedCacheUpdate {
    key: String,
    value: serde_json::Value,
}

impl<S> SearchCache<S>
where
    S: CacheStore,
{
    /// Creates a search cache over the given store.
    #[must_use]
    pub fn new(store: S) -> Self {
        Self { store }
    }

    /// Upserts the cached result for a query.
    ///
    /// # Errors
    ///
    /// Returns `CacheError` when serialization or the store fails.
    pub fn update(
        &self,
        authority: &S::MutationAuthority<'_>,
        query: &CatalogQuery,
        result: &CatalogSearchResult,
    ) -> Result<(), CacheError> {
        let prepared = self.prepare_update(query, result)?;
        self.commit_update(authority, prepared)
    }

    /// Performs reversible serialization and key derivation without writing.
    pub fn prepare_update(
        &self,
        query: &CatalogQuery,
        result: &CatalogSearchResult,
    ) -> Result<PreparedCacheUpdate, CacheError> {
        let key = self.prepare_key(query);
        let value = serde_json::to_value(result).map_err(|e| CacheError::Corrupt {
            key: key.key.clone(),
            detail: e.to_string(),
        })?;
        Ok(PreparedCacheUpdate {
            key: key.key,
            value,
        })
    }

    /// Derives a deletion/read key without touching the stored value.
    #[must_use]
    pub fn prepare_key(&self, query: &CatalogQuery) -> SearchCacheKey {
        SearchCacheKey::from_query(query)
    }

    /// Checks key existence without deserializing the cached domain value.
    pub fn contains_key(&self, key: &SearchCacheKey) -> Result<bool, CacheError> {
        self.store.exists(&key.key)
    }

    /// Deletes a previously prepared key without deserializing its value.
    pub fn delete_key(
        &self,
        authority: &S::MutationAuthority<'_>,
        key: &SearchCacheKey,
    ) -> Result<(), CacheError> {
        self.store.delete(authority, &key.key)
    }

    /// Commits a previously prepared cache mutation.
    pub fn commit_update(
        &self,
        authority: &S::MutationAuthority<'_>,
        prepared: PreparedCacheUpdate,
    ) -> Result<(), CacheError> {
        self.store.write(authority, &prepared.key, &prepared.value)
    }

    /// Reads the cached result for a query, or `None` when absent.
    ///
    /// This never performs network I/O, so results are available offline.
    ///
    /// # Errors
    ///
    /// Returns `CacheError` when deserialization or the store fails.
    pub fn query(&self, query: &CatalogQuery) -> Result<Option<CatalogSearchResult>, CacheError> {
        let key = self.prepare_key(query);
        match self.store.read(&key.key)? {
            Some(value) => {
                serde_json::from_value(value)
                    .map(Some)
                    .map_err(|e| CacheError::Corrupt {
                        key: key.key.clone(),
                        detail: e.to_string(),
                    })
            }
            None => Ok(None),
        }
    }

    /// Explicitly deletes the cached result for a query.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the store fails.
    pub fn delete(
        &self,
        authority: &S::MutationAuthority<'_>,
        query: &CatalogQuery,
    ) -> Result<(), CacheError> {
        let key = self.prepare_key(query);
        self.delete_key(authority, &key)
    }

    /// Deletes every cached entry, returning how many were removed.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the store fails.
    pub fn clear(&self, authority: &S::MutationAuthority<'_>) -> Result<usize, CacheError> {
        let keys = self.store.list()?;
        self.clear_keys(authority, &keys)
    }

    /// Commits deletion of a precomputed key set without listing again.
    pub fn clear_keys(
        &self,
        authority: &S::MutationAuthority<'_>,
        keys: &[String],
    ) -> Result<usize, CacheError> {
        for key in keys {
            self.store.delete(authority, key)?;
        }
        Ok(keys.len())
    }

    /// Returns the number of stored entries.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the store fails.
    pub fn len(&self) -> Result<usize, CacheError> {
        self.store.list().map(|keys| keys.len())
    }

    /// Lists cache keys as reversible preparation for a clear mutation.
    pub fn keys(&self) -> Result<Vec<String>, CacheError> {
        self.store.list()
    }

    /// Returns true when no entries are stored.
    ///
    /// # Errors
    ///
    /// Returns `CacheError::Store` when the store fails.
    pub fn is_empty(&self) -> Result<bool, CacheError> {
        self.len().map(|len| len == 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;
    use std::path::{Path, PathBuf};

    fn sample_result() -> CatalogSearchResult {
        CatalogSearchResult {
            items: vec![crate::catalog::CatalogSearchItem {
                preset_id: "preset-1".to_string(),
                name: "Easing Pack".to_string(),
                description: Some("curves".to_string()),
                category: Some("preset".to_string()),
                tag: Some(vec!["easing".to_string(), "curve".to_string()]),
                platform: Some("win".to_string()),
                version: Some("1.0".to_string()),
                notion_page_url: None,
                thumbnail_url: None,
            }],
        }
    }

    fn query(q: &str) -> CatalogQuery {
        CatalogQuery {
            q: Some(q.to_string()),
            category: Some("preset".to_string()),
            tag: None,
            platform: None,
            limit: Some(20),
            offset: Some(0),
        }
    }

    /// In-memory store used to exercise cache policy without disk I/O.
    #[derive(Debug, Default)]
    struct MemoryStore {
        entries: RefCell<BTreeMap<String, serde_json::Value>>,
        fail: RefCell<bool>,
    }

    #[derive(Debug, Clone, Copy)]
    struct TestMutationPermit;

    const TEST_PERMIT: TestMutationPermit = TestMutationPermit;

    impl MemoryStore {
        fn new() -> Self {
            Self::default()
        }

        fn set_failing(&self, failing: bool) {
            *self.fail.borrow_mut() = failing;
        }
    }

    impl CacheStore for MemoryStore {
        type MutationAuthority<'a>
            = TestMutationPermit
        where
            Self: 'a;

        fn read(&self, key: &str) -> Result<Option<serde_json::Value>, CacheError> {
            if *self.fail.borrow() {
                return Err(CacheError::Store("injected failure".to_string()));
            }
            Ok(self.entries.borrow().get(key).cloned())
        }

        fn write(
            &self,
            _authority: &Self::MutationAuthority<'_>,
            key: &str,
            value: &serde_json::Value,
        ) -> Result<(), CacheError> {
            if *self.fail.borrow() {
                return Err(CacheError::Store("injected failure".to_string()));
            }
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
            if *self.fail.borrow() {
                return Err(CacheError::Store("injected failure".to_string()));
            }
            self.entries.borrow_mut().remove(key);
            Ok(())
        }

        fn list(&self) -> Result<Vec<String>, CacheError> {
            if *self.fail.borrow() {
                return Err(CacheError::Store("injected failure".to_string()));
            }
            Ok(self.entries.borrow().keys().cloned().collect())
        }
    }

    /// File-backed store used to prove restart persistence. Keys map to
    /// `<base_dir>/<key>.json` files; no expiry metadata is ever written.
    #[derive(Debug, Clone)]
    struct FileStore {
        base_dir: PathBuf,
    }

    impl FileStore {
        fn new(base_dir: &Path) -> Self {
            std::fs::create_dir_all(base_dir).expect("failed to create cache dir");
            Self {
                base_dir: base_dir.to_path_buf(),
            }
        }

        fn path_for(&self, key: &str) -> PathBuf {
            self.base_dir.join(format!("{key}.json"))
        }
    }

    impl CacheStore for FileStore {
        type MutationAuthority<'a>
            = TestMutationPermit
        where
            Self: 'a;

        fn read(&self, key: &str) -> Result<Option<serde_json::Value>, CacheError> {
            let path = self.path_for(key);
            if !path.exists() {
                return Ok(None);
            }
            let text =
                std::fs::read_to_string(&path).map_err(|e| CacheError::Store(e.to_string()))?;
            serde_json::from_str(&text)
                .map(Some)
                .map_err(|e| CacheError::Corrupt {
                    key: key.to_string(),
                    detail: e.to_string(),
                })
        }

        fn write(
            &self,
            _authority: &Self::MutationAuthority<'_>,
            key: &str,
            value: &serde_json::Value,
        ) -> Result<(), CacheError> {
            let path = self.path_for(key);
            let text =
                serde_json::to_string(value).map_err(|e| CacheError::Store(e.to_string()))?;
            std::fs::write(&path, text).map_err(|e| CacheError::Store(e.to_string()))
        }

        fn delete(
            &self,
            _authority: &Self::MutationAuthority<'_>,
            key: &str,
        ) -> Result<(), CacheError> {
            let path = self.path_for(key);
            if path.exists() {
                std::fs::remove_file(&path).map_err(|e| CacheError::Store(e.to_string()))?;
            }
            Ok(())
        }

        fn list(&self) -> Result<Vec<String>, CacheError> {
            if !self.base_dir.exists() {
                return Ok(Vec::new());
            }
            let mut keys = Vec::new();
            for entry in
                std::fs::read_dir(&self.base_dir).map_err(|e| CacheError::Store(e.to_string()))?
            {
                let entry = entry.map_err(|e| CacheError::Store(e.to_string()))?;
                if let Some(stem) = entry.path().file_stem().and_then(|s| s.to_str()) {
                    keys.push(stem.to_string());
                }
            }
            keys.sort();
            Ok(keys)
        }
    }

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-search-cache-{suffix}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("failed to create test dir");
        dir
    }

    #[test]
    fn key_is_order_insensitive_and_distinguishes_queries() {
        let a = CatalogQuery {
            q: Some("ease".to_string()),
            category: Some("preset".to_string()),
            tag: None,
            platform: None,
            limit: Some(20),
            offset: None,
        };
        let b = CatalogQuery {
            q: Some("ease".to_string()),
            category: Some("preset".to_string()),
            tag: None,
            platform: None,
            limit: Some(20),
            offset: None,
        };
        let different = CatalogQuery {
            q: Some("glow".to_string()),
            category: Some("preset".to_string()),
            tag: None,
            platform: None,
            limit: Some(20),
            offset: None,
        };
        assert_eq!(
            SearchCacheKey::from_query(&a),
            SearchCacheKey::from_query(&b)
        );
        assert_ne!(
            SearchCacheKey::from_query(&a),
            SearchCacheKey::from_query(&different)
        );
    }

    #[test]
    fn update_and_query_round_trip() {
        let store = MemoryStore::new();
        let cache = SearchCache::new(store);
        let result = sample_result();

        cache.update(&TEST_PERMIT, &query("ease"), &result).unwrap();
        let cached = cache.query(&query("ease")).unwrap();
        assert_eq!(cached, Some(result));

        // A different query has no entry.
        assert_eq!(cache.query(&query("glow")).unwrap(), None);
    }

    #[test]
    fn update_overwrites_existing_entry() {
        let store = MemoryStore::new();
        let cache = SearchCache::new(store);
        let first = sample_result();
        let second = CatalogSearchResult { items: Vec::new() };

        cache.update(&TEST_PERMIT, &query("ease"), &first).unwrap();
        cache.update(&TEST_PERMIT, &query("ease"), &second).unwrap();

        assert_eq!(cache.query(&query("ease")).unwrap(), Some(second));
        assert_eq!(cache.len().unwrap(), 1, "update must not duplicate rows");
    }

    #[test]
    fn delete_removes_only_the_target_query() {
        let store = MemoryStore::new();
        let cache = SearchCache::new(store);
        let result = sample_result();

        cache.update(&TEST_PERMIT, &query("ease"), &result).unwrap();
        cache.update(&TEST_PERMIT, &query("glow"), &result).unwrap();

        cache.delete(&TEST_PERMIT, &query("ease")).unwrap();
        assert_eq!(cache.query(&query("ease")).unwrap(), None);
        assert_eq!(cache.query(&query("glow")).unwrap(), Some(result.clone()));
        assert_eq!(cache.len().unwrap(), 1);
    }

    #[test]
    fn delete_missing_key_is_not_an_error() {
        let store = MemoryStore::new();
        let cache = SearchCache::new(store);
        cache.delete(&TEST_PERMIT, &query("absent")).unwrap();
        assert_eq!(cache.len().unwrap(), 0);
    }

    #[test]
    fn clear_removes_all_entries() {
        let store = MemoryStore::new();
        let cache = SearchCache::new(store);
        let result = sample_result();

        cache.update(&TEST_PERMIT, &query("ease"), &result).unwrap();
        cache.update(&TEST_PERMIT, &query("glow"), &result).unwrap();
        assert_eq!(cache.clear(&TEST_PERMIT).unwrap(), 2);
        assert_eq!(cache.len().unwrap(), 0);
        assert_eq!(cache.query(&query("ease")).unwrap(), None);
    }

    #[test]
    fn restart_persists_entries_without_any_ttl_eviction() {
        let dir = test_dir("restart");
        let first = SearchCache::new(FileStore::new(&dir));
        let result = sample_result();
        first.update(&TEST_PERMIT, &query("ease"), &result).unwrap();
        drop(first);

        // Simulated process restart: a brand-new cache over the same store.
        let second = SearchCache::new(FileStore::new(&dir));
        let cached = second.query(&query("ease")).unwrap();
        assert_eq!(cached, Some(result.clone()), "entry must survive a restart");
        assert_eq!(second.len().unwrap(), 1);

        // No automatic eviction: the entry is still there on a later read.
        assert_eq!(second.query(&query("ease")).unwrap(), Some(result.clone()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn stored_file_has_no_expiry_metadata() {
        let dir = test_dir("no-ttl");
        let store = FileStore::new(&dir);
        let cache = SearchCache::new(store.clone());
        cache
            .update(&TEST_PERMIT, &query("ease"), &sample_result())
            .unwrap();

        let keys = store.list().unwrap();
        assert_eq!(keys.len(), 1);
        let text = std::fs::read_to_string(store.path_for(&keys[0])).unwrap();
        assert!(
            !text.contains("expires_at") && !text.contains("created_at"),
            "cached file must carry no TTL metadata: {text}"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn store_failures_map_to_cache_error() {
        let store = MemoryStore::new();
        store.set_failing(true);
        let cache = SearchCache::new(store);

        assert!(matches!(
            cache.update(&TEST_PERMIT, &query("ease"), &sample_result()),
            Err(CacheError::Store(_))
        ));
        assert!(matches!(
            cache.query(&query("ease")),
            Err(CacheError::Store(_))
        ));
        assert!(matches!(
            cache.delete(&TEST_PERMIT, &query("ease")),
            Err(CacheError::Store(_))
        ));
        assert!(matches!(
            cache.clear(&TEST_PERMIT),
            Err(CacheError::Store(_))
        ));
    }

    #[test]
    fn cache_error_display() {
        assert_eq!(
            CacheError::Store("disk full".to_string()).to_string(),
            "search cache store error: disk full"
        );
        assert_eq!(
            CacheError::Corrupt {
                key: "k".to_string(),
                detail: "bad json".to_string()
            }
            .to_string(),
            "cached entry k is corrupt: bad json"
        );
    }
}
