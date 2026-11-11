//! Catalog query operations.
//!
//! This module provides the HTTP client for the preset catalog search
//! endpoint. Wire DTOs stay here; mapping to the existing domain model
//! belongs to the TypeScript gateway mapper (`NET-005`).

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::config::SupabaseConfig;

/// Catalog search query parameters.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogQuery {
    /// Free-text search term.
    pub q: Option<String>,
    /// Category filter.
    pub category: Option<String>,
    /// Tag filter.
    pub tag: Option<String>,
    /// Platform filter.
    pub platform: Option<String>,
    /// Maximum rows to return.
    pub limit: Option<u32>,
    /// Row offset for pagination.
    pub offset: Option<u32>,
}

/// A single catalog search row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogSearchItem {
    /// Preset identifier.
    pub preset_id: String,
    /// Display name.
    pub name: String,
    /// Optional description.
    pub description: Option<String>,
    /// Category filter value.
    pub category: Option<String>,
    /// Tags.
    pub tag: Option<Vec<String>>,
    /// Platform.
    pub platform: Option<String>,
    /// Version.
    pub version: Option<String>,
    /// Public Notion page URL.
    pub notion_page_url: Option<String>,
    /// Thumbnail URL.
    pub thumbnail_url: Option<String>,
}

/// Catalog search result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogSearchResult {
    /// Matched rows.
    pub items: Vec<CatalogSearchItem>,
}

/// Signed download descriptor resolved for a single preset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PresetDownloadDto {
    /// Signed URL to stream from.
    pub url: String,
    /// Expected SHA-256 hex digest (64 lowercase hex chars).
    pub sha256: String,
    /// Optional signed URL expiry, in seconds.
    pub expires_in: Option<u32>,
}

/// Errors produced by catalog query operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CatalogError {
    /// Non-success HTTP status with a user-safe detail.
    Http { status: u16, detail: String },
    /// Transport failure (DNS, timeout, connection).
    Transport(String),
    /// Response body did not match the expected shape.
    InvalidResponse(String),
}

impl std::fmt::Display for CatalogError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Http { status, detail } => {
                write!(f, "catalog request failed (HTTP {status}): {detail}")
            }
            Self::Transport(detail) => write!(f, "catalog network error: {detail}"),
            Self::InvalidResponse(detail) => {
                write!(f, "catalog response invalid: {detail}")
            }
        }
    }
}

impl std::error::Error for CatalogError {}

/// A raw HTTP response from the transport.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogResponse {
    /// HTTP status code.
    pub status: u16,
    /// Response body.
    pub body: String,
}

/// Catalog HTTP transport abstraction.
///
/// The real implementation uses `reqwest`. Tests inject a fake transport so
/// status codes, pagination, and error mapping are deterministic.
pub trait CatalogTransport {
    /// Performs a GET against `url` with the given headers.
    ///
    /// # Errors
    ///
    /// Returns `CatalogError::Transport` when the request cannot complete.
    fn get(&self, url: &str, headers: &[(String, String)])
        -> Result<CatalogResponse, CatalogError>;
}

/// Default `reqwest`-backed catalog transport.
#[derive(Debug)]
pub struct ReqwestCatalogTransport {
    client: reqwest::blocking::Client,
}

impl ReqwestCatalogTransport {
    /// Creates a transport with the given request timeout.
    #[must_use]
    pub fn with_timeout(timeout: Duration) -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(timeout)
            .build()
            .expect("failed to build HTTP client");
        Self { client }
    }
}

impl Default for ReqwestCatalogTransport {
    fn default() -> Self {
        Self::with_timeout(DEFAULT_CATALOG_TIMEOUT)
    }
}

impl CatalogTransport for ReqwestCatalogTransport {
    fn get(
        &self,
        url: &str,
        headers: &[(String, String)],
    ) -> Result<CatalogResponse, CatalogError> {
        let mut request = self.client.get(url);
        for (name, value) in headers {
            request = request.header(name, value);
        }
        let response = request.send().map_err(|e| {
            if e.is_timeout() {
                CatalogError::Transport("connection timed out".to_string())
            } else if e.is_connect() {
                CatalogError::Transport("network unavailable".to_string())
            } else {
                CatalogError::Transport(e.to_string())
            }
        })?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .map_err(|e| CatalogError::Transport(e.to_string()))?;
        Ok(CatalogResponse { status, body })
    }
}

/// Default timeout for catalog requests.
pub const DEFAULT_CATALOG_TIMEOUT: Duration = Duration::from_secs(15);

/// Catalog query client.
pub struct CatalogClient<T = ReqwestCatalogTransport> {
    /// Supabase configuration.
    config: SupabaseConfig,
    /// HTTP transport.
    transport: T,
}

impl CatalogClient<ReqwestCatalogTransport> {
    /// Creates a catalog client with the default transport.
    #[must_use]
    pub fn new(config: SupabaseConfig) -> Self {
        Self::with_transport(config, ReqwestCatalogTransport::default())
    }
}

impl<T> CatalogClient<T>
where
    T: CatalogTransport,
{
    /// Creates a catalog client with an explicit transport.
    #[must_use]
    pub fn with_transport(config: SupabaseConfig, transport: T) -> Self {
        Self { config, transport }
    }

    /// Searches the preset catalog.
    ///
    /// # Errors
    ///
    /// Returns `CatalogError` on transport failure, non-success HTTP status,
    /// or an invalid response shape.
    pub fn search(&self, query: &CatalogQuery) -> Result<CatalogSearchResult, CatalogError> {
        let url = format!(
            "{}/preset/search{}",
            self.config.api_base(),
            build_query_string(query)
        );
        let headers = build_headers(&self.config);
        let response = self.transport.get(&url, &headers)?;

        if !(200..300).contains(&response.status) {
            return Err(CatalogError::Http {
                status: response.status,
                detail: format!("preset search failed: HTTP {}", response.status),
            });
        }

        parse_search_result(&response.body)
    }

    /// Resolves the signed download descriptor for a single preset.
    ///
    /// This is the Rust counterpart of the removed TypeScript
    /// `getPresetDownloadUrl` transport: the direct Supabase/S3 transport is
    /// now owned entirely by the runtime.
    ///
    /// # Errors
    ///
    /// Returns `CatalogError` on transport failure, non-success HTTP status,
    /// or an invalid response shape.
    pub fn download_url(&self, preset_id: &str) -> Result<PresetDownloadDto, CatalogError> {
        let url = format!("{}/preset/{preset_id}/download", self.config.api_base());
        let headers = build_headers(&self.config);
        let response = self.transport.get(&url, &headers)?;

        if !(200..300).contains(&response.status) {
            return Err(CatalogError::Http {
                status: response.status,
                detail: format!("preset download URL failed: HTTP {}", response.status),
            });
        }

        parse_download_dto(&response.body)
    }
}

fn parse_download_dto(body: &str) -> Result<PresetDownloadDto, CatalogError> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| CatalogError::InvalidResponse(format!("JSON parse error: {e}")))?;
    if !value.is_object() {
        return Err(CatalogError::InvalidResponse(
            "download response must be an object".to_string(),
        ));
    }
    let url = optional_string(&value, &["url"])
        .ok_or_else(|| CatalogError::InvalidResponse("download must include url".to_string()))?;
    let sha256 = optional_string(&value, &["sha256"])
        .ok_or_else(|| CatalogError::InvalidResponse("download must include sha256".to_string()))?;
    let expires_in = value
        .get("expires_in")
        .or_else(|| value.get("expiresIn"))
        .and_then(serde_json::Value::as_u64)
        .map(|seconds| seconds.min(u32::MAX as u64) as u32);
    Ok(PresetDownloadDto {
        url,
        sha256,
        expires_in,
    })
}

fn build_headers(config: &SupabaseConfig) -> Vec<(String, String)> {
    let mut headers = vec![("Accept".to_string(), "application/json".to_string())];
    if let Some(key) = config.publishable_key() {
        headers.push(("apikey".to_string(), key.to_string()));
        headers.push(("Authorization".to_string(), format!("Bearer {key}")));
    }
    headers
}

fn build_query_string(query: &CatalogQuery) -> String {
    let mut parts: Vec<(String, String)> = Vec::new();
    if let Some(q) = &query.q {
        if !q.is_empty() {
            parts.push(("q".to_string(), q.clone()));
        }
    }
    if let Some(category) = &query.category {
        if !category.is_empty() {
            parts.push(("category".to_string(), category.clone()));
        }
    }
    if let Some(tag) = &query.tag {
        if !tag.is_empty() {
            parts.push(("tag".to_string(), tag.clone()));
        }
    }
    if let Some(platform) = &query.platform {
        if !platform.is_empty() {
            parts.push(("platform".to_string(), platform.clone()));
        }
    }
    if let Some(limit) = query.limit {
        parts.push(("limit".to_string(), limit.to_string()));
    }
    if let Some(offset) = query.offset {
        parts.push(("offset".to_string(), offset.to_string()));
    }
    if parts.is_empty() {
        return String::new();
    }
    format!(
        "?{}",
        parts
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("&")
    )
}

fn parse_search_result(body: &str) -> Result<CatalogSearchResult, CatalogError> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| CatalogError::InvalidResponse(format!("JSON parse error: {e}")))?;
    let items = value
        .get("items")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            CatalogError::InvalidResponse("response must be { items: array }".to_string())
        })?;

    let rows = items
        .iter()
        .map(parse_search_item)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(CatalogSearchResult { items: rows })
}

fn parse_search_item(value: &serde_json::Value) -> Result<CatalogSearchItem, CatalogError> {
    if !value.is_object() {
        return Err(CatalogError::InvalidResponse(
            "search item must be an object".to_string(),
        ));
    }
    let preset_id = value
        .get("preset_id")
        .or_else(|| value.get("presetId"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| CatalogError::InvalidResponse("item must include presetId".to_string()))?
        .to_string();
    let name = value
        .get("name")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| CatalogError::InvalidResponse("item must include name".to_string()))?
        .to_string();

    let tag = value
        .get("tag")
        .and_then(serde_json::Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter_map(serde_json::Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        });

    Ok(CatalogSearchItem {
        preset_id,
        name,
        description: optional_string(value, &["description"]),
        category: optional_string(value, &["category"]),
        tag,
        platform: optional_string(value, &["platform"]),
        version: optional_string(value, &["version"]),
        notion_page_url: optional_string(
            value,
            &[
                "notion_page_url",
                "notionPageUrl",
                "public_url",
                "publicUrl",
            ],
        ),
        thumbnail_url: optional_string(value, &["thumbnail_url", "thumbnailUrl"]),
    })
}

fn optional_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = value.get(*key).and_then(serde_json::Value::as_str) {
            return Some(s.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Default)]
    struct FakeTransport {
        responses: Vec<CatalogResponse>,
        requested: std::cell::RefCell<Vec<RecordedRequest>>,
    }

    type RecordedRequest = (String, Vec<(String, String)>);

    impl FakeTransport {
        fn with(response: CatalogResponse) -> Self {
            Self {
                responses: vec![response],
                requested: std::cell::RefCell::new(Vec::new()),
            }
        }
    }

    impl CatalogTransport for FakeTransport {
        fn get(
            &self,
            url: &str,
            headers: &[(String, String)],
        ) -> Result<CatalogResponse, CatalogError> {
            self.requested
                .borrow_mut()
                .push((url.to_string(), headers.to_vec()));
            self.responses
                .first()
                .cloned()
                .ok_or_else(|| CatalogError::Transport("no mock response".to_string()))
        }
    }

    fn test_config() -> SupabaseConfig {
        SupabaseConfig::new("https://example.supabase.co".to_string())
            .unwrap()
            .with_publishable_key("sb_publishable_test".to_string())
    }

    fn json_body(items: Vec<serde_json::Value>) -> String {
        serde_json::json!({ "items": items }).to_string()
    }

    fn row(id: &str, name: &str) -> serde_json::Value {
        serde_json::json!({ "preset_id": id, "name": name })
    }

    #[test]
    fn search_builds_correct_endpoint_and_headers() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: json_body(vec![row("p1", "One")]),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let result = client
            .search(&CatalogQuery {
                q: Some("cam".to_string()),
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();

        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].preset_id, "p1");

        let (url, headers) = &client.transport.requested.borrow()[0];
        assert_eq!(
            url,
            "https://example.supabase.co/functions/v1/typlus/preset/search?q=cam&limit=10"
        );
        let header_map: std::collections::HashMap<&str, &str> = headers
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        assert_eq!(header_map.get("apikey"), Some(&"sb_publishable_test"));
        assert_eq!(
            header_map.get("Authorization"),
            Some(&"Bearer sb_publishable_test")
        );
        assert_eq!(header_map.get("Accept"), Some(&"application/json"));
    }

    #[test]
    fn pagination_params_are_encoded() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: json_body(vec![]),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let _ = client
            .search(&CatalogQuery {
                offset: Some(20),
                limit: Some(5),
                ..Default::default()
            })
            .unwrap();

        let (url, _) = &client.transport.requested.borrow()[0];
        assert!(url.ends_with("?limit=5&offset=20"), "unexpected URL: {url}");
    }

    #[test]
    fn search_maps_row_fields_with_snake_and_camel_case() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: json_body(vec![serde_json::json!({
                "presetId": "p-camel",
                "name": "Camel Row",
                "description": "desc",
                "category": "script",
                "tag": ["cam", "fx"],
                "platform": "ae",
                "version": "1.0",
                "notionPageUrl": "https://notion.so/camel",
                "thumbnailUrl": "https://cdn.example/t.png",
            })]),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let result = client.search(&CatalogQuery::default()).unwrap();
        let item = &result.items[0];
        assert_eq!(item.preset_id, "p-camel");
        assert_eq!(item.name, "Camel Row");
        assert_eq!(item.description.as_deref(), Some("desc"));
        assert_eq!(item.category.as_deref(), Some("script"));
        assert_eq!(
            item.tag.as_deref(),
            Some(["cam".to_string(), "fx".to_string()].as_slice())
        );
        assert_eq!(item.platform.as_deref(), Some("ae"));
        assert_eq!(item.version.as_deref(), Some("1.0"));
        assert_eq!(
            item.notion_page_url.as_deref(),
            Some("https://notion.so/camel")
        );
        assert_eq!(
            item.thumbnail_url.as_deref(),
            Some("https://cdn.example/t.png")
        );
    }

    #[test]
    fn http_error_maps_to_catalog_error_with_status() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 500,
            body: "boom".to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.search(&CatalogQuery::default()).unwrap_err();
        assert!(matches!(error, CatalogError::Http { status: 500, .. }));
    }

    #[test]
    fn not_found_maps_to_catalog_error() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 404,
            body: String::new(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.search(&CatalogQuery::default()).unwrap_err();
        assert!(matches!(error, CatalogError::Http { status: 404, .. }));
    }

    #[test]
    fn invalid_response_shape_is_rejected() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: "{}".to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.search(&CatalogQuery::default()).unwrap_err();
        assert!(matches!(error, CatalogError::InvalidResponse(_)));
    }

    #[test]
    fn malformed_json_is_rejected() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: "not json".to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.search(&CatalogQuery::default()).unwrap_err();
        assert!(matches!(error, CatalogError::InvalidResponse(_)));
    }

    #[test]
    fn transport_failure_maps_to_transport_error() {
        let transport = FakeTransport {
            responses: Vec::new(),
            requested: std::cell::RefCell::new(Vec::new()),
        };
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.search(&CatalogQuery::default()).unwrap_err();
        assert!(matches!(error, CatalogError::Transport(_)));
    }

    #[test]
    fn empty_items_are_allowed() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: json_body(vec![]),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let result = client.search(&CatalogQuery::default()).unwrap();
        assert!(result.items.is_empty());
    }

    #[test]
    fn catalog_error_display() {
        assert_eq!(
            CatalogError::Http {
                status: 500,
                detail: "boom".to_string()
            }
            .to_string(),
            "catalog request failed (HTTP 500): boom"
        );
        assert_eq!(
            CatalogError::Transport("timeout".to_string()).to_string(),
            "catalog network error: timeout"
        );
    }

    #[test]
    fn download_url_builds_correct_endpoint_and_headers() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: serde_json::json!({
                "url": "https://media.example.com/p.ffx?token=abc",
                "sha256": "0".repeat(64),
                "expires_in": 3600,
            })
            .to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let dto = client.download_url("preset-1").unwrap();
        assert_eq!(dto.url, "https://media.example.com/p.ffx?token=abc");
        assert_eq!(dto.sha256, "0".repeat(64));
        assert_eq!(dto.expires_in, Some(3600));

        let (url, headers) = &client.transport.requested.borrow()[0];
        assert_eq!(
            url,
            "https://example.supabase.co/functions/v1/typlus/preset/preset-1/download"
        );
        let header_map: std::collections::HashMap<&str, &str> = headers
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        assert_eq!(header_map.get("apikey"), Some(&"sb_publishable_test"));
    }

    #[test]
    fn download_url_accepts_camel_case_expiry() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: serde_json::json!({
                "url": "https://media.example.com/p.ffx",
                "sha256": "1".repeat(64),
                "expiresIn": 60,
            })
            .to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let dto = client.download_url("preset-1").unwrap();
        assert_eq!(dto.expires_in, Some(60));
    }

    #[test]
    fn download_url_requires_url_and_sha256() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: serde_json::json!({ "expires_in": 3600 }).to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.download_url("preset-1").unwrap_err();
        assert!(matches!(error, CatalogError::InvalidResponse(_)));
    }

    #[test]
    fn download_url_maps_http_error() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 500,
            body: "boom".to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.download_url("preset-1").unwrap_err();
        assert!(matches!(error, CatalogError::Http { status: 500, .. }));
    }

    #[test]
    fn download_url_rejects_non_object_response() {
        let transport = FakeTransport::with(CatalogResponse {
            status: 200,
            body: "[1, 2]".to_string(),
        });
        let client = CatalogClient::with_transport(test_config(), transport);

        let error = client.download_url("preset-1").unwrap_err();
        assert!(matches!(error, CatalogError::InvalidResponse(_)));
    }
}
