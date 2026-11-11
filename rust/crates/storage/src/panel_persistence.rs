//! Panel persistence storage.
//!
//! This module provides persistent panel state storage with support for
//! multi-panel isolation.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// Panel state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelState {
    /// Unique identifier for this panel.
    pub panel_id: String,
    /// Panel type.
    pub panel_type: String,
    /// ISO 8601 timestamp of when this state was last updated.
    pub updated_at: String,
    /// Panel-specific state data.
    pub state: serde_json::Value,
}

impl PanelState {
    /// Creates a new panel state.
    #[must_use]
    pub fn new(panel_id: &str, panel_type: &str, state: serde_json::Value) -> Self {
        Self {
            panel_id: panel_id.to_string(),
            panel_type: panel_type.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            state,
        }
    }

    /// Updates the panel state timestamp.
    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

/// Panel persistence store.
#[derive(Debug, Clone)]
pub struct PanelPersistenceStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl PanelPersistenceStore {
    /// Creates a new panel persistence store.
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

    /// Gets a panel state by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self, panel_id: &str) -> Result<Option<PanelState>, JsonStoreError> {
        let states = self.list()?;
        Ok(states.into_iter().find(|s| s.panel_id == panel_id))
    }

    /// Saves a panel state.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        state: &PanelState,
    ) -> Result<(), JsonStoreError> {
        let mut states = self.list()?;

        // Remove existing state with same panel_id
        states.retain(|s| s.panel_id != state.panel_id);

        // Add new state
        states.push(state.clone());

        self.store
            .write_with_context(context, "panel-states", &states, None)?;
        Ok(())
    }

    /// Deletes a panel state by ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        panel_id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut states = self.list()?;

        let initial_len = states.len();
        states.retain(|s| s.panel_id != panel_id);

        if states.len() == initial_len {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("panel with ID {panel_id} not found"),
            )));
        }

        self.store
            .write_with_context(context, "panel-states", &states, None)?;
        Ok(())
    }

    /// Lists all panel states.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list(&self) -> Result<Vec<PanelState>, JsonStoreError> {
        let states: Option<Vec<PanelState>> = self.store.read("panel-states")?;
        Ok(states.unwrap_or_default())
    }

    /// Lists all panel states for a given panel type.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_by_type(&self, panel_type: &str) -> Result<Vec<PanelState>, JsonStoreError> {
        let states = self.list()?;
        Ok(states
            .into_iter()
            .filter(|s| s.panel_type == panel_type)
            .collect())
    }

    /// Clears all panel states.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the clear fails.
    pub fn clear_with_context(&self, context: &MutationContext<'_>) -> Result<(), JsonStoreError> {
        let empty: Vec<PanelState> = Vec::new();
        self.store
            .write_with_context(context, "panel-states", &empty, None)?;
        Ok(())
    }

    #[cfg(test)]
    pub fn save(&self, state: &PanelState) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, state)
        })
    }
    #[cfg(test)]
    pub fn delete(&self, panel_id: &str) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.delete_with_context(context, panel_id)
        })
    }
    #[cfg(test)]
    pub fn clear(&self) -> Result<(), JsonStoreError> {
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
            "ty-plus-panel-test-{suffix}-{:?}",
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

    fn test_state() -> PanelState {
        PanelState::new(
            "panel-1",
            "timeline",
            serde_json::json!({"collapsed": false}),
        )
    }

    #[test]
    fn panel_persistence_store_new() {
        let dir = test_dir("new");
        let store = PanelPersistenceStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn panel_persistence_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = PanelPersistenceStore::new(&dir);

        let state = test_state();
        store.save(&state).expect("save should succeed");

        let loaded = store.get("panel-1").expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.panel_id, "panel-1");
        assert_eq!(loaded.panel_type, "timeline");

        cleanup(&dir);
    }

    #[test]
    fn panel_persistence_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = PanelPersistenceStore::new(&dir);

        let loaded = store.get("nonexistent").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn panel_persistence_store_delete() {
        let dir = test_dir("delete");
        let store = PanelPersistenceStore::new(&dir);

        let state = test_state();
        store.save(&state).expect("save should succeed");

        store.delete("panel-1").expect("delete should succeed");

        let loaded = store.get("panel-1").expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn panel_persistence_store_list() {
        let dir = test_dir("list");
        let store = PanelPersistenceStore::new(&dir);

        let state1 = test_state();
        store.save(&state1).expect("save should succeed");

        let state2 = PanelState::new("panel-2", "effects", serde_json::json!({"filter": "blur"}));
        store.save(&state2).expect("save should succeed");

        let states = store.list().expect("list should succeed");
        assert_eq!(states.len(), 2);

        cleanup(&dir);
    }

    #[test]
    fn panel_persistence_store_list_by_type() {
        let dir = test_dir("list-by-type");
        let store = PanelPersistenceStore::new(&dir);

        let state1 = test_state();
        store.save(&state1).expect("save should succeed");

        let state2 = PanelState::new("panel-2", "effects", serde_json::json!({"filter": "blur"}));
        store.save(&state2).expect("save should succeed");

        let timeline_states = store.list_by_type("timeline").expect("list should succeed");
        assert_eq!(timeline_states.len(), 1);

        let effects_states = store.list_by_type("effects").expect("list should succeed");
        assert_eq!(effects_states.len(), 1);

        cleanup(&dir);
    }

    #[test]
    fn panel_persistence_store_clear() {
        let dir = test_dir("clear");
        let store = PanelPersistenceStore::new(&dir);

        let state = test_state();
        store.save(&state).expect("save should succeed");

        store.clear().expect("clear should succeed");

        let states = store.list().expect("list should succeed");
        assert_eq!(states.len(), 0);

        cleanup(&dir);
    }
}
