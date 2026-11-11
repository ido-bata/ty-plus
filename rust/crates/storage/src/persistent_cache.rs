//! Persistent search and candidates cache.
//!
//! This module provides a cache for search results and candidates
//! that persists across restarts.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// A durable cache entry. There is intentionally no timestamp or expiry
/// metadata; removal is explicit through `delete` or `clear`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry<T> {
    /// The cached value.
    pub value: T,
}

impl<T> CacheEntry<T> {
    /// Creates a new cache entry.
    pub fn new(value: T) -> Self {
        Self { value }
    }
}

/// Persistent cache for search results and candidates.
#[derive(Debug, Clone)]
pub struct PersistentCache {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl PersistentCache {
    /// Creates a new persistent cache.
    #[must_use]
    pub fn new(base_dir: &Path) -> Self {
        Self {
            store: JsonFileStore::new(base_dir),
        }
    }

    /// Returns the base directory.
    #[must_use]
    pub fn base_dir(&self) -> &Path {
        self.store.base_dir()
    }

    /// Gets a cached value by key.
    ///
    /// Returns `None` when the key does not exist. Entries never expire by
    /// elapsed time.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the read fails.
    pub fn get<T>(&self, key: &str) -> Result<Option<T>, JsonStoreError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let entry: Option<CacheEntry<T>> = self.store.read(key)?;

        Ok(entry.map(|entry| entry.value))
    }

    /// Sets a cached value by key.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the write fails.
    pub fn set_with_context<T>(
        &self,
        context: &MutationContext<'_>,
        key: &str,
        value: T,
    ) -> Result<(), JsonStoreError>
    where
        T: Serialize,
    {
        let entry = CacheEntry::new(value);
        self.store.write_with_context(context, key, &entry, None)?;
        Ok(())
    }

    /// Deletes a cached value by key.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        key: &str,
    ) -> Result<(), JsonStoreError> {
        self.store.delete_with_context(context, key)
    }

    /// Explicitly removes every persistent cache entry.
    pub fn clear_with_context(
        &self,
        context: &MutationContext<'_>,
    ) -> Result<usize, JsonStoreError> {
        let keys = self.store.list_keys()?;
        for key in &keys {
            self.store.delete_with_context(context, key)?;
        }
        Ok(keys.len())
    }

    /// Lists every cache key. No read performs an eviction.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_keys(&self) -> Result<Vec<String>, JsonStoreError> {
        self.store.list_keys()
    }

    #[cfg(test)]
    pub fn set<T>(&self, key: &str, value: T) -> Result<(), JsonStoreError>
    where
        T: Serialize,
    {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.set_with_context(context, key, value)
        })
    }

    #[cfg(test)]
    pub fn delete(&self, key: &str) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.delete_with_context(context, key)
        })
    }

    #[cfg(test)]
    pub fn clear(&self) -> Result<usize, JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.clear_with_context(context)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn test_dir(suffix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ty-plus-cache-test-{suffix}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("failed to create test dir");
        dir
    }

    fn cleanup(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn cache_new() {
        let dir = test_dir("new");
        let cache = PersistentCache::new(&dir);
        assert_eq!(cache.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn cache_set_and_get() {
        let dir = test_dir("set-get");
        let cache = PersistentCache::new(&dir);

        cache.set("key1", "value1").expect("set should succeed");

        let result: Option<String> = cache.get("key1").expect("get should succeed");
        assert_eq!(result, Some("value1".to_string()));

        cleanup(&dir);
    }

    #[test]
    fn cache_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let cache = PersistentCache::new(&dir);

        let result: Option<String> = cache.get("nonexistent").expect("get should succeed");
        assert!(result.is_none());

        cleanup(&dir);
    }

    #[test]
    fn cache_entries_are_permanent_until_explicit_delete() {
        let dir = test_dir("permanent");
        let cache = PersistentCache::new(&dir);

        cache.set("key1", "value1").expect("set should succeed");

        let result: Option<String> = cache.get("key1").expect("get should succeed");
        assert_eq!(result, Some("value1".to_string()));

        cleanup(&dir);
    }

    #[test]
    fn cache_delete() {
        let dir = test_dir("delete");
        let cache = PersistentCache::new(&dir);

        cache.set("key1", "value1").expect("set should succeed");
        assert!(cache
            .get::<String>("key1")
            .expect("get should succeed")
            .is_some());

        cache.delete("key1").expect("delete should succeed");
        assert!(cache
            .get::<String>("key1")
            .expect("get should succeed")
            .is_none());

        cleanup(&dir);
    }

    #[test]
    fn cache_list_keys() {
        let dir = test_dir("list");
        let cache = PersistentCache::new(&dir);

        cache.set("alpha", 1).expect("set should succeed");
        cache.set("beta", 2).expect("set should succeed");
        cache.set("gamma", 3).expect("set should succeed");

        let mut keys = cache.list_keys().expect("list should succeed");
        keys.sort();

        assert_eq!(keys, vec!["alpha", "beta", "gamma"]);

        cleanup(&dir);
    }

    #[test]
    fn cache_clear_removes_only_when_explicitly_requested() {
        let dir = test_dir("clear");
        let cache = PersistentCache::new(&dir);

        cache.set("key1", "value1").expect("set should succeed");
        cache.set("key2", "value2").expect("set should succeed");

        let cleared = cache.clear().expect("clear should succeed");
        assert_eq!(cleared, 2);

        // Explicit clear removes both entries.
        let result: Option<String> = cache.get("key1").expect("get should succeed");
        assert!(result.is_none());

        let result: Option<String> = cache.get("key2").expect("get should succeed");
        assert!(result.is_none());

        cleanup(&dir);
    }
}
