//! Online configuration.
//!
//! This module provides configuration for HTTP client operations,
//! with secrets separated from build inputs.

use serde::{Deserialize, Serialize};

/// Supabase configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SupabaseConfig {
    /// Supabase project URL.
    pub url: String,
    /// Publishable key (client-side, safe to expose).
    pub publishable_key: Option<String>,
    /// API base URL (defaults to `{url}/functions/v1/typlus`).
    pub api_base: String,
    /// Media base URL for asset downloads.
    pub media_base_url: Option<String>,
}

impl SupabaseConfig {
    /// Creates a new Supabase configuration.
    ///
    /// # Errors
    ///
    /// Returns `ConfigError` if the URL is missing or invalid.
    pub fn new(url: String) -> Result<Self, ConfigError> {
        let url = url.trim_end_matches('/').to_string();
        if url.is_empty() {
            return Err(ConfigError::MissingUrl);
        }

        let api_base = format!("{url}/functions/v1/typlus");

        Ok(Self {
            url,
            publishable_key: None,
            api_base,
            media_base_url: None,
        })
    }

    /// Sets the publishable key.
    #[must_use]
    pub fn with_publishable_key(mut self, key: String) -> Self {
        self.publishable_key = Some(key);
        self
    }

    /// Sets a custom API base URL.
    #[must_use]
    pub fn with_api_base(mut self, base: String) -> Self {
        self.api_base = base.trim_end_matches('/').to_string();
        self
    }

    /// Sets the media base URL.
    #[must_use]
    pub fn with_media_base_url(mut self, url: String) -> Self {
        self.media_base_url = Some(url);
        self
    }

    /// Returns the API base URL.
    #[must_use]
    pub fn api_base(&self) -> &str {
        &self.api_base
    }

    /// Returns the publishable key if set.
    #[must_use]
    pub fn publishable_key(&self) -> Option<&str> {
        self.publishable_key.as_deref()
    }
}

/// Configuration errors.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigError {
    /// Missing Supabase URL.
    MissingUrl,
    /// Invalid URL format.
    InvalidUrl(String),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingUrl => write!(f, "SUPABASE_URL is required"),
            Self::InvalidUrl(url) => write!(f, "invalid URL: {url}"),
        }
    }
}

impl std::error::Error for ConfigError {}

/// Resolves configuration from environment variables.
///
/// # Errors
///
/// Returns `ConfigError` if required environment variables are missing.
pub fn resolve_from_env() -> Result<SupabaseConfig, ConfigError> {
    let url = std::env::var("SUPABASE_URL").unwrap_or_default();
    let mut config = SupabaseConfig::new(url)?;

    if let Ok(key) = std::env::var("SUPABASE_PUBLISHABLE_KEY") {
        config = config.with_publishable_key(key);
    } else if let Ok(key) = std::env::var("SUPABASE_ANON_KEY") {
        config = config.with_publishable_key(key);
    }

    if let Ok(base) = std::env::var("TY_PLUS_API_BASE") {
        config = config.with_api_base(base);
    }

    if let Ok(media) = std::env::var("TY_PLUS_MEDIA_BASE_URL") {
        config = config.with_media_base_url(media);
    }

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_requires_url() {
        assert_eq!(
            SupabaseConfig::new("".to_string()),
            Err(ConfigError::MissingUrl)
        );
    }

    #[test]
    fn config_strips_trailing_slashes() {
        let config = SupabaseConfig::new("https://example.com/".to_string()).unwrap();
        assert_eq!(config.url, "https://example.com");
    }

    #[test]
    fn config_builds_default_api_base() {
        let config = SupabaseConfig::new("https://example.com".to_string()).unwrap();
        assert_eq!(config.api_base, "https://example.com/functions/v1/typlus");
    }

    #[test]
    fn config_with_custom_api_base() {
        let config = SupabaseConfig::new("https://example.com".to_string())
            .unwrap()
            .with_api_base("https://custom.api/base".to_string());
        assert_eq!(config.api_base, "https://custom.api/base");
    }

    #[test]
    fn config_with_publishable_key() {
        let config = SupabaseConfig::new("https://example.com".to_string())
            .unwrap()
            .with_publishable_key("test-key".to_string());
        assert_eq!(config.publishable_key(), Some("test-key"));
    }
}
