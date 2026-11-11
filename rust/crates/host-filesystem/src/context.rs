use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use crate::HostContext;

/// Session identifier type.
pub type SessionId = String;

/// Per-session payload consumed by stateless filesystem resolvers.
///
/// Distinct from [`SessionContextStore`]: the store is a registry keyed by
/// [`SessionId`]; this struct is the value passed into operations like
/// [`crate::thumbnails::cache_root::resolve_cache_root`].
///
/// Carries only the fields those resolvers need. The managed-root path is
/// the directory the host (After Effects) considers the session's persistent
/// storage location; when it is missing or not writable, the thumbnail
/// pipeline falls back to a temp-dir cache.
#[derive(Debug, Clone)]
pub struct SessionContext {
    managed_root: Option<PathBuf>,
    /// Probe override for the managed-root writability check.
    ///
    /// `Some` short-circuits the touch-and-delete probe that the cache root
    /// resolver would otherwise run. Production construction leaves this as
    /// `None`; test fakes set it to avoid touching the real filesystem.
    managed_writable_override: Option<bool>,
}

impl SessionContext {
    /// Constructs a session context with the given managed root path.
    ///
    /// The writability probe override defaults to `None`.
    #[must_use]
    pub fn new(managed_root: Option<PathBuf>) -> Self {
        Self {
            managed_root,
            managed_writable_override: None,
        }
    }

    /// Returns the managed root path, if one is known for this session.
    #[must_use]
    pub fn managed_root(&self) -> Option<&Path> {
        self.managed_root.as_deref()
    }

    /// Returns the managed-root writability override, if one is set.
    ///
    /// Consumed by [`crate::thumbnails::cache_root`] so test fakes can
    /// control the resolver's probe without exposing the override on the
    /// public thumbnail API surface.
    #[must_use]
    pub(crate) fn managed_writable_override(&self) -> Option<bool> {
        self.managed_writable_override
    }

    /// Sets the managed-root writability override.
    ///
    /// Intended for test support. Returns the updated context so it can be
    /// chained off [`SessionContext::new`].
    #[cfg(test)]
    #[must_use]
    pub fn with_managed_writable_override(mut self, writable: bool) -> Self {
        self.managed_writable_override = Some(writable);
        self
    }
}

/// Immutable host context store for runtime sessions.
///
/// Each session (AE instance) has its own immutable context that is
/// set once during handshake and never modified.
#[derive(Debug, Clone)]
pub struct SessionContextStore {
    contexts: Arc<RwLock<HashMap<SessionId, Arc<HostContext>>>>,
}

impl SessionContextStore {
    /// Creates a new empty session context store.
    #[must_use]
    pub fn new() -> Self {
        Self {
            contexts: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Registers a host context for a session.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the context cannot be stored.
    pub fn register(
        &self,
        session_id: SessionId,
        context: HostContext,
    ) -> Result<(), SessionContextError> {
        let mut contexts = self
            .contexts
            .write()
            .map_err(|_| SessionContextError::Lock)?;
        contexts.insert(session_id, Arc::new(context));
        Ok(())
    }

    /// Returns the host context for a session.
    #[must_use]
    pub fn get(&self, session_id: &str) -> Option<Arc<HostContext>> {
        let contexts = self.contexts.read().ok()?;
        contexts.get(session_id).cloned()
    }

    /// Removes a session context.
    pub fn remove(&self, session_id: &str) -> Option<Arc<HostContext>> {
        let mut contexts = self.contexts.write().ok()?;
        contexts.remove(session_id)
    }

    /// Returns the number of registered sessions.
    #[must_use]
    pub fn session_count(&self) -> usize {
        self.contexts.read().map(|c| c.len()).unwrap_or(0)
    }

    /// Returns all registered session IDs.
    #[must_use]
    pub fn session_ids(&self) -> Vec<SessionId> {
        self.contexts
            .read()
            .map(|c| c.keys().cloned().collect())
            .unwrap_or_default()
    }
}

impl Default for SessionContextStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors that can occur during session context operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionContextError {
    /// The internal lock was poisoned.
    Lock,
}

impl std::fmt::Display for SessionContextError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Lock => write!(f, "session context lock poisoned"),
        }
    }
}

impl std::error::Error for SessionContextError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_context(app_root: &str) -> HostContext {
        HostContext {
            app_root: app_root.to_string(),
            support_root: "/Users/test/Library/Application Support".to_string(),
            ae_version: "24.0.0".to_string(),
            session_id: "session-1".to_string(),
        }
    }

    #[test]
    fn session_context_store_new_is_empty() {
        let store = SessionContextStore::new();
        assert_eq!(store.session_count(), 0);
    }

    #[test]
    fn session_context_store_register_and_get() {
        let store = SessionContextStore::new();
        let context = test_context("/Applications/Adobe After Effects 2024");
        store.register("session-1".to_string(), context).unwrap();

        let retrieved = store.get("session-1").unwrap();
        assert_eq!(retrieved.app_root, "/Applications/Adobe After Effects 2024");
    }

    #[test]
    fn session_context_store_remove() {
        let store = SessionContextStore::new();
        store
            .register("session-1".to_string(), test_context("/app"))
            .unwrap();
        store.remove("session-1");
        assert!(store.get("session-1").is_none());
    }

    #[test]
    fn session_context_store_isolates_sessions() {
        let store = SessionContextStore::new();
        store
            .register("session-1".to_string(), test_context("/app1"))
            .unwrap();
        store
            .register("session-2".to_string(), test_context("/app2"))
            .unwrap();

        assert_eq!(store.session_count(), 2);
        assert_eq!(store.get("session-1").unwrap().app_root, "/app1");
        assert_eq!(store.get("session-2").unwrap().app_root, "/app2");
    }

    #[test]
    fn session_context_store_session_ids() {
        let store = SessionContextStore::new();
        store.register("a".to_string(), test_context("/a")).unwrap();
        store.register("b".to_string(), test_context("/b")).unwrap();

        let mut ids = store.session_ids();
        ids.sort();
        assert_eq!(ids, vec!["a", "b"]);
    }
}
