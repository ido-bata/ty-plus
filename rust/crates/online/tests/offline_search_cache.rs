use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use ty_plus_online::connectivity::ConnectivityState;
use ty_plus_online::offline::{decide, OfflineDecision, OnlineOperation};
use ty_plus_online::search_cache::{CacheError, CacheStore, SearchCache};
use ty_plus_online::{catalog::CatalogQuery, catalog::CatalogSearchResult};

#[derive(Debug, Clone)]
struct DurableStore {
    root: PathBuf,
}

#[derive(Debug, Clone, Copy)]
struct TestMutationPermit;

const TEST_PERMIT: TestMutationPermit = TestMutationPermit;

impl DurableStore {
    fn new(root: &Path) -> Self {
        fs::create_dir_all(root).unwrap();
        Self {
            root: root.to_path_buf(),
        }
    }

    fn path(&self, key: &str) -> PathBuf {
        self.root.join(format!("{key}.json"))
    }
}

impl CacheStore for DurableStore {
    type MutationAuthority<'a>
        = TestMutationPermit
    where
        Self: 'a;

    fn read(&self, key: &str) -> Result<Option<serde_json::Value>, CacheError> {
        let path = self.path(key);
        if !path.exists() {
            return Ok(None);
        }
        let text =
            fs::read_to_string(path).map_err(|error| CacheError::Store(error.to_string()))?;
        serde_json::from_str(&text)
            .map(Some)
            .map_err(|error| CacheError::Corrupt {
                key: key.to_string(),
                detail: error.to_string(),
            })
    }

    fn write(
        &self,
        _authority: &Self::MutationAuthority<'_>,
        key: &str,
        value: &serde_json::Value,
    ) -> Result<(), CacheError> {
        let text =
            serde_json::to_string(value).map_err(|error| CacheError::Store(error.to_string()))?;
        fs::write(self.path(key), text).map_err(|error| CacheError::Store(error.to_string()))
    }

    fn delete(
        &self,
        _authority: &Self::MutationAuthority<'_>,
        key: &str,
    ) -> Result<(), CacheError> {
        let path = self.path(key);
        if path.exists() {
            fs::remove_file(path).map_err(|error| CacheError::Store(error.to_string()))?;
        }
        Ok(())
    }

    fn list(&self) -> Result<Vec<String>, CacheError> {
        let mut keys = BTreeMap::new();
        for entry in
            fs::read_dir(&self.root).map_err(|error| CacheError::Store(error.to_string()))?
        {
            let entry = entry.map_err(|error| CacheError::Store(error.to_string()))?;
            if let Some(stem) = entry.path().file_stem().and_then(|value| value.to_str()) {
                keys.insert(stem.to_string(), ());
            }
        }
        Ok(keys.into_keys().collect())
    }
}

fn query() -> CatalogQuery {
    CatalogQuery {
        q: Some("slash/..\\hostile".to_string()),
        ..CatalogQuery::default()
    }
}

fn result() -> CatalogSearchResult {
    CatalogSearchResult { items: Vec::new() }
}

#[test]
fn offline_matrix_distinguishes_local_cache_and_network_operations() {
    assert_eq!(
        decide(ConnectivityState::Offline, OnlineOperation::SearchCache),
        OfflineDecision::LocalAllowed
    );
    assert_eq!(
        decide(ConnectivityState::Offline, OnlineOperation::CatalogSearch),
        OfflineDecision::CacheOnly
    );
    assert_eq!(
        decide(ConnectivityState::Offline, OnlineOperation::Download),
        OfflineDecision::NetworkRequired
    );
    assert_eq!(
        decide(
            ConnectivityState::Offline,
            OnlineOperation::LicensingRevalidation
        ),
        OfflineDecision::NetworkRequired
    );
    assert_eq!(
        decide(ConnectivityState::Offline, OnlineOperation::Unsupported),
        OfflineDecision::Blocked
    );
}

#[test]
fn search_cache_survives_restart_and_only_explicit_clear_removes_it() {
    let root = std::env::temp_dir().join(format!("ty-plus-offline-cache-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let cache = SearchCache::new(DurableStore::new(&root.join("cache/search")));
    cache.update(&TEST_PERMIT, &query(), &result()).unwrap();
    let stored = fs::read_dir(root.join("cache/search"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    assert!(stored
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("search-"));
    let json = fs::read_to_string(&stored).unwrap();
    assert!(!json.contains("expires_at") && !json.contains("created_at"));
    drop(cache);

    let restarted = SearchCache::new(DurableStore::new(&root.join("cache/search")));
    assert_eq!(restarted.query(&query()).unwrap(), Some(result()));
    assert_eq!(restarted.clear(&TEST_PERMIT).unwrap(), 1);
    assert_eq!(restarted.query(&query()).unwrap(), None);
    assert!(root.join("cache/search").exists());
    let _ = fs::remove_dir_all(root);
}
