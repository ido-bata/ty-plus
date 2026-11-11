//! Widget state storage.
//!
//! This module provides persistent widget state storage with type-specific
//! round-trip support for different widget types.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// Widget type identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WidgetType {
    /// Timeline widget.
    Timeline,
    /// Effects panel widget.
    Effects,
    /// Project panel widget.
    Project,
    /// Render queue widget.
    RenderQueue,
    /// Character map widget.
    CharacterMap,
    /// Custom widget type.
    Custom(String),
}

impl WidgetType {
    /// Returns the string representation of the widget type.
    #[must_use]
    pub fn as_str(&self) -> &str {
        match self {
            Self::Timeline => "timeline",
            Self::Effects => "effects",
            Self::Project => "project",
            Self::RenderQueue => "render_queue",
            Self::CharacterMap => "character_map",
            Self::Custom(s) => s,
        }
    }
}

/// Widget state data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetState {
    /// Widget type identifier.
    pub widget_type: WidgetType,
    /// Widget instance identifier.
    pub widget_id: String,
    /// ISO 8601 timestamp of when this state was last updated.
    pub updated_at: String,
    /// Widget-specific state data.
    pub state: serde_json::Value,
}

impl WidgetState {
    /// Creates a new widget state.
    #[must_use]
    pub fn new(widget_type: WidgetType, widget_id: &str, state: serde_json::Value) -> Self {
        Self {
            widget_type,
            widget_id: widget_id.to_string(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            state,
        }
    }

    /// Updates the widget state timestamp.
    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

/// Widget state store.
#[derive(Debug, Clone)]
pub struct WidgetStateStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl WidgetStateStore {
    /// Creates a new widget state store.
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

    /// Gets widget state by type and ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(
        &self,
        widget_type: &WidgetType,
        widget_id: &str,
    ) -> Result<Option<WidgetState>, JsonStoreError> {
        let states = self.list_all()?;
        Ok(states
            .into_iter()
            .find(|s| s.widget_type == *widget_type && s.widget_id == widget_id))
    }

    /// Saves widget state.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        state: &WidgetState,
    ) -> Result<(), JsonStoreError> {
        let mut states = self.list_all()?;

        // Remove existing state for same type + id
        states.retain(|s| !(s.widget_type == state.widget_type && s.widget_id == state.widget_id));

        // Add new state
        states.push(state.clone());

        self.store
            .write_with_context(context, "widget-states", &states, None)?;
        Ok(())
    }

    /// Deletes widget state by type and ID.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the delete fails.
    pub fn delete_with_context(
        &self,
        context: &MutationContext<'_>,
        widget_type: &WidgetType,
        widget_id: &str,
    ) -> Result<(), JsonStoreError> {
        let mut states = self.list_all()?;

        let initial_len = states.len();
        states.retain(|s| !(s.widget_type == *widget_type && s.widget_id == widget_id));

        if states.len() == initial_len {
            return Err(JsonStoreError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!(
                    "widget state not found: {}/{}",
                    widget_type.as_str(),
                    widget_id
                ),
            )));
        }

        self.store
            .write_with_context(context, "widget-states", &states, None)?;
        Ok(())
    }

    /// Lists all widget states for a given widget type.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_by_type(
        &self,
        widget_type: &WidgetType,
    ) -> Result<Vec<WidgetState>, JsonStoreError> {
        let states = self.list_all()?;
        Ok(states
            .into_iter()
            .filter(|s| s.widget_type == *widget_type)
            .collect())
    }

    /// Lists all widget states.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the list fails.
    pub fn list_all(&self) -> Result<Vec<WidgetState>, JsonStoreError> {
        let states: Option<Vec<WidgetState>> = self.store.read("widget-states")?;
        Ok(states.unwrap_or_default())
    }

    #[cfg(test)]
    pub fn save(&self, state: &WidgetState) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, state)
        })
    }
    #[cfg(test)]
    pub fn delete(&self, widget_type: &WidgetType, widget_id: &str) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.delete_with_context(context, widget_type, widget_id)
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
            "ty-plus-widget-state-test-{suffix}-{:?}",
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

    fn test_state(widget_id: &str) -> WidgetState {
        WidgetState::new(
            WidgetType::Timeline,
            widget_id,
            serde_json::json!({"scroll_position": 100}),
        )
    }

    #[test]
    fn widget_state_store_new() {
        let dir = test_dir("new");
        let store = WidgetStateStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn widget_state_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = WidgetStateStore::new(&dir);

        let state = test_state("timeline-1");
        store.save(&state).expect("save should succeed");

        let loaded = store
            .get(&WidgetType::Timeline, "timeline-1")
            .expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.widget_id, "timeline-1");
        assert_eq!(loaded.state, serde_json::json!({"scroll_position": 100}));

        cleanup(&dir);
    }

    #[test]
    fn widget_state_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = WidgetStateStore::new(&dir);

        let loaded = store
            .get(&WidgetType::Timeline, "nonexistent")
            .expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn widget_state_store_delete() {
        let dir = test_dir("delete");
        let store = WidgetStateStore::new(&dir);

        let state = test_state("timeline-1");
        store.save(&state).expect("save should succeed");

        store
            .delete(&WidgetType::Timeline, "timeline-1")
            .expect("delete should succeed");

        let loaded = store
            .get(&WidgetType::Timeline, "timeline-1")
            .expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn widget_state_store_list_by_type() {
        let dir = test_dir("list-by-type");
        let store = WidgetStateStore::new(&dir);

        let state1 = test_state("timeline-1");
        store.save(&state1).expect("save should succeed");

        let state2 = test_state("timeline-2");
        store.save(&state2).expect("save should succeed");

        let state3 = WidgetState::new(
            WidgetType::Effects,
            "effects-1",
            serde_json::json!({"filter": "blur"}),
        );
        store.save(&state3).expect("save should succeed");

        let timeline_states = store
            .list_by_type(&WidgetType::Timeline)
            .expect("list should succeed");
        assert_eq!(timeline_states.len(), 2);

        let effects_states = store
            .list_by_type(&WidgetType::Effects)
            .expect("list should succeed");
        assert_eq!(effects_states.len(), 1);

        cleanup(&dir);
    }

    #[test]
    fn widget_state_store_list_all() {
        let dir = test_dir("list-all");
        let store = WidgetStateStore::new(&dir);

        let state1 = test_state("timeline-1");
        store.save(&state1).expect("save should succeed");

        let state2 = WidgetState::new(
            WidgetType::Effects,
            "effects-1",
            serde_json::json!({"filter": "blur"}),
        );
        store.save(&state2).expect("save should succeed");

        let all_states = store.list_all().expect("list should succeed");
        assert_eq!(all_states.len(), 2);

        cleanup(&dir);
    }
}
