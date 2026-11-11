//! Compile-time product online configuration for the worker executable.

use ty_plus_online::config::SupabaseConfig;
use url::Url;

/// The product configuration state embedded in one worker binary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProductOnlineConfig {
    /// Development binaries may omit all remote configuration.
    Unconfigured,
    /// A complete, typed remote configuration.
    Configured(SupabaseConfig),
    /// Partial or malformed compile-time input. Remote operations fail closed.
    Invalid,
}

/// Builds product configuration from compile-time inputs only.
#[must_use]
pub fn build_product_online_config() -> ProductOnlineConfig {
    product_online_config_from_inputs(
        option_env!("TY_PLUS_WORKER_SUPABASE_URL"),
        option_env!("TY_PLUS_WORKER_SUPABASE_PUBLISHABLE_KEY"),
        option_env!("TY_PLUS_WORKER_SUPABASE_API_BASE"),
    )
}

/// Converts explicit compile-time input values into the typed online config.
///
/// This helper is public so tests can exercise the same validation used by the
/// `option_env!` factory without mutating process-global environment state.
#[must_use]
pub fn product_online_config_from_inputs(
    url: Option<&str>,
    publishable_key: Option<&str>,
    api_base: Option<&str>,
) -> ProductOnlineConfig {
    let (Some(url), Some(publishable_key), Some(api_base)) = (url, publishable_key, api_base)
    else {
        return if url.is_none() && publishable_key.is_none() && api_base.is_none() {
            ProductOnlineConfig::Unconfigured
        } else {
            ProductOnlineConfig::Invalid
        };
    };

    if parse_product_url(url).is_none()
        || parse_product_url(api_base).is_none()
        || publishable_key.trim().is_empty()
        || publishable_key.chars().any(char::is_whitespace)
    {
        return ProductOnlineConfig::Invalid;
    }

    let Ok(config) = SupabaseConfig::new(url.to_owned()) else {
        return ProductOnlineConfig::Invalid;
    };
    ProductOnlineConfig::Configured(
        config
            .with_publishable_key(publishable_key.to_owned())
            .with_api_base(api_base.to_owned()),
    )
}

/// Parses product endpoints under one explicit policy: HTTP(S), host required,
/// no userinfo, query, or fragment. Paths are allowed for API bases.
fn parse_product_url(value: &str) -> Option<Url> {
    let parsed = Url::parse(value).ok()?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return None;
    }
    Some(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_compile_time_inputs_build_typed_config() {
        let config = product_online_config_from_inputs(
            Some("https://example.supabase.co"),
            Some("publishable-key"),
            Some("https://example.supabase.co/functions/v1/typlus"),
        );
        let ProductOnlineConfig::Configured(config) = config else {
            panic!("complete compile-time input must configure online boundary");
        };
        assert_eq!(config.url, "https://example.supabase.co");
        assert_eq!(config.publishable_key(), Some("publishable-key"));
        assert_eq!(
            config.api_base(),
            "https://example.supabase.co/functions/v1/typlus"
        );
    }

    #[test]
    fn partial_or_malformed_compile_time_inputs_are_invalid() {
        assert_eq!(
            product_online_config_from_inputs(
                Some("https://example.supabase.co"),
                None,
                Some("https://example.supabase.co/functions/v1/typlus"),
            ),
            ProductOnlineConfig::Invalid
        );
        assert_eq!(
            product_online_config_from_inputs(
                Some("not-a-url"),
                Some("publishable-key"),
                Some("https://example.supabase.co/functions/v1/typlus"),
            ),
            ProductOnlineConfig::Invalid
        );
        assert_eq!(
            product_online_config_from_inputs(
                Some("https://example.supabase.co"),
                Some(""),
                Some("https://example.supabase.co/functions/v1/typlus"),
            ),
            ProductOnlineConfig::Invalid
        );
        for invalid_url in [
            "ftp://example.supabase.co",
            "https://?query",
            "https://example.supabase.co?query",
            "https://example.supabase.co#fragment",
            "https://user:password@example.supabase.co",
        ] {
            assert_eq!(
                product_online_config_from_inputs(
                    Some(invalid_url),
                    Some("publishable-key"),
                    Some("https://example.supabase.co/functions/v1/typlus"),
                ),
                ProductOnlineConfig::Invalid,
                "URL policy must reject {invalid_url}"
            );
        }
        assert_eq!(
            product_online_config_from_inputs(
                Some("https://example.supabase.co"),
                Some("publishable-key"),
                Some("https://example.supabase.co/functions/v1/typlus?query"),
            ),
            ProductOnlineConfig::Invalid
        );
    }

    #[test]
    fn all_missing_inputs_disable_remote_without_invalid_state() {
        assert_eq!(
            product_online_config_from_inputs(None, None, None),
            ProductOnlineConfig::Unconfigured
        );
    }
}
