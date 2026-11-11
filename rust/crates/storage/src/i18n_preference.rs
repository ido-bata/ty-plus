//! i18n preference storage.
//!
//! This module provides persistent i18n preference storage with support for
//! locale round-trip and missing file fallback.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{
    json_store::{JsonFileStore, JsonStoreError},
    MutationContext,
};

/// i18n preference data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct I18nPreference {
    /// ISO 8601 timestamp of when this preference was last updated.
    pub updated_at: String,
    /// Preferred locale code (e.g., "en", "ja").
    pub locale: String,
    /// Preferred language name.
    pub language: Option<String>,
}

impl I18nPreference {
    /// Creates a new i18n preference.
    #[must_use]
    pub fn new(locale: &str) -> Self {
        Self {
            updated_at: chrono::Utc::now().to_rfc3339(),
            locale: locale.to_string(),
            language: None,
        }
    }

    /// Updates the preference timestamp.
    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

/// i18n preference store.
#[derive(Debug, Clone)]
pub struct I18nPreferenceStore {
    /// The underlying JSON file store.
    store: JsonFileStore,
}

impl I18nPreferenceStore {
    /// Creates a new i18n preference store.
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

    /// Gets the current i18n preference.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get(&self) -> Result<Option<I18nPreference>, JsonStoreError> {
        self.store.read("i18n-preference")
    }

    /// Saves an i18n preference.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the save fails.
    pub fn save_with_context(
        &self,
        context: &MutationContext<'_>,
        preference: &I18nPreference,
    ) -> Result<(), JsonStoreError> {
        self.store
            .write_with_context(context, "i18n-preference", preference, None)?;
        Ok(())
    }

    /// Gets or creates a default i18n preference.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the get fails.
    pub fn get_or_create_default_with_context(
        &self,
        context: &MutationContext<'_>,
    ) -> Result<I18nPreference, JsonStoreError> {
        if let Some(preference) = self.get()? {
            return Ok(preference);
        }

        let preference = I18nPreference::new("en");
        self.save_with_context(context, &preference)?;
        Ok(preference)
    }

    /// Updates the locale preference.
    ///
    /// # Errors
    ///
    /// Returns `JsonStoreError` if the update fails.
    pub fn set_locale_with_context(
        &self,
        context: &MutationContext<'_>,
        locale: &str,
    ) -> Result<I18nPreference, JsonStoreError> {
        let mut preference = self.get_or_create_default_with_context(context)?;
        preference.locale = locale.to_string();
        preference.touch();
        self.save_with_context(context, &preference)?;
        Ok(preference)
    }

    #[cfg(test)]
    pub fn save(&self, preference: &I18nPreference) -> Result<(), JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.save_with_context(context, preference)
        })
    }

    #[cfg(test)]
    pub fn get_or_create_default(&self) -> Result<I18nPreference, JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.get_or_create_default_with_context(context)
        })
    }

    #[cfg(test)]
    pub fn set_locale(&self, locale: &str) -> Result<I18nPreference, JsonStoreError> {
        crate::operation_lock::with_test_context(self.base_dir(), |context| {
            self.set_locale_with_context(context, locale)
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
            "ty-plus-i18n-test-{suffix}-{:?}",
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
    fn i18n_preference_store_new() {
        let dir = test_dir("new");
        let store = I18nPreferenceStore::new(&dir);
        assert_eq!(store.base_dir(), dir);
        cleanup(&dir);
    }

    #[test]
    fn i18n_preference_store_save_and_get() {
        let dir = test_dir("save-get");
        let store = I18nPreferenceStore::new(&dir);

        let pref = I18nPreference::new("ja");
        store.save(&pref).expect("save should succeed");

        let loaded = store.get().expect("get should succeed");
        assert!(loaded.is_some());

        let loaded = loaded.unwrap();
        assert_eq!(loaded.locale, "ja");

        cleanup(&dir);
    }

    #[test]
    fn i18n_preference_store_get_nonexistent() {
        let dir = test_dir("get-nonexistent");
        let store = I18nPreferenceStore::new(&dir);

        let loaded = store.get().expect("get should succeed");
        assert!(loaded.is_none());

        cleanup(&dir);
    }

    #[test]
    fn i18n_preference_store_get_or_create_default() {
        let dir = test_dir("default");
        let store = I18nPreferenceStore::new(&dir);

        // First call creates default
        let pref = store
            .get_or_create_default()
            .expect("get_or_create should succeed");
        assert_eq!(pref.locale, "en");

        // Second call returns existing
        let pref2 = store
            .get_or_create_default()
            .expect("get_or_create should succeed");
        assert_eq!(pref2.locale, "en");

        cleanup(&dir);
    }

    #[test]
    fn i18n_preference_store_set_locale() {
        let dir = test_dir("set-locale");
        let store = I18nPreferenceStore::new(&dir);

        let pref = store.set_locale("ja").expect("set_locale should succeed");
        assert_eq!(pref.locale, "ja");

        let loaded = store.get().expect("get should succeed").unwrap();
        assert_eq!(loaded.locale, "ja");

        cleanup(&dir);
    }
}
