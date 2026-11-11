//! Signed URL validation and streamed download operations.
//!
//! This module validates a signed download URL, streams the body to a caller
//! sink while verifying content length and SHA-256 integrity, and enforces a
//! redirect policy that refuses to leave the allowed host set. Downloads are
//! cancellable; every failure mode is fail-safe and never calls asset commit
//! (that belongs to the storage orchestration in a later task).

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use sha2::{Digest, Sha256};
use url::Url;

use crate::config::SupabaseConfig;

/// A signed download URL plus its integrity contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedDownload {
    /// Signed URL to stream from.
    pub url: String,
    /// Expected SHA-256 hex digest (64 lowercase hex chars).
    pub sha256: String,
    /// Optional signed URL expiry, in seconds.
    pub expires_in: Option<u32>,
}

impl SignedDownload {
    /// Validates the URL shape and hash format without performing network I/O.
    ///
    /// # Errors
    ///
    /// Returns `DownloadError::InvalidSignedUrl` when the URL is not an https
    /// URL or the expected digest is not 64 lowercase hex characters.
    pub fn validate(&self) -> Result<(), DownloadError> {
        validate_signed_url(&self.url)?;
        if !is_hex64(&self.sha256) {
            return Err(DownloadError::InvalidSignedUrl(
                "expected sha256 must be 64 hex characters".to_string(),
            ));
        }
        Ok(())
    }
}

/// Result of a verified streamed download.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadReceipt {
    /// Bytes written to the sink.
    pub bytes_written: u64,
    /// Verified SHA-256 hex digest of the received body.
    pub sha256: String,
    /// Final URL after redirects.
    pub final_url: String,
}

/// Errors produced by download operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DownloadError {
    /// The signed URL failed shape validation.
    InvalidSignedUrl(String),
    /// A redirect left the allowed host set.
    RedirectEscape {
        /// Host the download started on.
        from: String,
        /// Host the redirect attempted to reach.
        to: String,
    },
    /// Non-success HTTP status.
    Http { status: u16, detail: String },
    /// Content length did not match the bytes received.
    LengthMismatch { expected: u64, actual: u64 },
    /// SHA-256 digest did not match the expected value.
    HashMismatch { expected: String, actual: String },
    /// The download was cancelled by the caller.
    Cancelled,
    /// Transport failure (DNS, timeout, connection).
    Transport(String),
    /// Writing to the sink failed.
    Write(String),
}

impl std::fmt::Display for DownloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidSignedUrl(detail) => write!(f, "invalid signed URL: {detail}"),
            Self::RedirectEscape { from, to } => {
                write!(
                    f,
                    "redirect escape: {from} redirected to disallowed host {to}"
                )
            }
            Self::Http { status, detail } => write!(f, "download failed (HTTP {status}): {detail}"),
            Self::LengthMismatch { expected, actual } => {
                write!(
                    f,
                    "content length mismatch: expected {expected} bytes, got {actual}"
                )
            }
            Self::HashMismatch { expected, actual } => {
                write!(
                    f,
                    "integrity check failed: expected sha256 {expected}, got {actual}"
                )
            }
            Self::Cancelled => write!(f, "download cancelled"),
            Self::Transport(detail) => write!(f, "download network error: {detail}"),
            Self::Write(detail) => write!(f, "download write error: {detail}"),
        }
    }
}

impl std::error::Error for DownloadError {}

/// An HTTP response streamed to the caller.
pub struct DownloadResponse {
    /// HTTP status code.
    pub status: u16,
    /// Final URL after redirects.
    pub final_url: String,
    /// Content length when advertised.
    pub content_length: Option<u64>,
    /// Response body reader.
    pub body: Box<dyn Read + Send>,
}

impl std::fmt::Debug for DownloadResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DownloadResponse")
            .field("status", &self.status)
            .field("final_url", &self.final_url)
            .field("content_length", &self.content_length)
            .finish_non_exhaustive()
    }
}

/// Download HTTP transport abstraction.
///
/// The real implementation uses `reqwest` with a redirect policy restricted to
/// the allowed host set. Tests inject a fake transport so redirect escapes,
/// length mismatches, hash failures, and cancellation are deterministic.
pub trait DownloadTransport {
    /// Performs a GET against `url`, following redirects only within
    /// `allowed_hosts`.
    ///
    /// # Errors
    ///
    /// Returns `DownloadError` when the request cannot complete.
    fn get(&self, url: &str, allowed_hosts: &[String]) -> Result<DownloadResponse, DownloadError>;
}

/// Default `reqwest`-backed download transport.
///
/// Redirects are followed manually so every hop is validated against the
/// allowed host set; the inner client never follows redirects on its own.
#[derive(Debug)]
pub struct ReqwestDownloadTransport {
    client: reqwest::blocking::Client,
}

impl ReqwestDownloadTransport {
    /// Creates a transport with the given request timeout and no automatic
    /// redirect following.
    #[must_use]
    pub fn with_timeout(timeout: std::time::Duration) -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(timeout)
            .redirect(reqwest::redirect::Policy::custom(|attempt| attempt.stop()))
            .build()
            .expect("failed to build HTTP client");
        Self { client }
    }
}

impl Default for ReqwestDownloadTransport {
    fn default() -> Self {
        Self::with_timeout(DEFAULT_DOWNLOAD_TIMEOUT)
    }
}

impl DownloadTransport for ReqwestDownloadTransport {
    fn get(&self, url: &str, allowed_hosts: &[String]) -> Result<DownloadResponse, DownloadError> {
        let mut response = self.client.get(url).send().map_err(map_reqwest_error)?;
        let mut hops = 0;
        while (300..400).contains(&response.status().as_u16()) {
            if hops >= MAX_REDIRECTS {
                return Err(DownloadError::Transport("too many redirects".to_string()));
            }
            let location = response
                .headers()
                .get("location")
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| DownloadError::Http {
                    status: response.status().as_u16(),
                    detail: "redirect without Location header".to_string(),
                })?;
            let next = response
                .url()
                .join(location)
                .map_err(|e| DownloadError::Transport(format!("invalid redirect target: {e}")))?;
            let next_host = next.host_str().unwrap_or_default().to_string();
            if !allowed_hosts.iter().any(|host| host == &next_host) {
                return Err(DownloadError::RedirectEscape {
                    from: response.url().host_str().unwrap_or_default().to_string(),
                    to: next_host,
                });
            }
            hops += 1;
            response = self
                .client
                .get(next.as_str())
                .send()
                .map_err(map_reqwest_error)?;
        }

        let status = response.status().as_u16();
        let final_url = response.url().to_string();
        let content_length = response
            .headers()
            .get("content-length")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let body: Box<dyn Read + Send> = Box::new(response);

        Ok(DownloadResponse {
            status,
            final_url,
            content_length,
            body,
        })
    }
}

/// Maximum redirect hops followed by the transport.
const MAX_REDIRECTS: usize = 10;

fn map_reqwest_error(error: reqwest::Error) -> DownloadError {
    if error.is_timeout() {
        DownloadError::Transport("download timed out".to_string())
    } else if error.is_connect() {
        DownloadError::Transport("network unavailable".to_string())
    } else {
        DownloadError::Transport(error.to_string())
    }
}

/// Default timeout for a single download request.
pub const DEFAULT_DOWNLOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);

/// A shared cancellation flag checked while streaming a download.
#[derive(Clone, Default)]
pub struct CancelFlag {
    cancelled: Arc<AtomicBool>,
    upstream_probe: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
}

impl std::fmt::Debug for CancelFlag {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("CancelFlag")
            .field("cancelled", &self.is_cancelled())
            .field("has_upstream_probe", &self.upstream_probe.is_some())
            .finish()
    }
}

impl CancelFlag {
    /// Creates an un-cancelled flag.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates an invocation-scoped flag that reads lifecycle cancellation on
    /// every download checkpoint. The probe is retained only by this flag.
    #[must_use]
    pub fn with_upstream_probe(probe: impl Fn() -> bool + Send + Sync + 'static) -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            upstream_probe: Some(Arc::new(probe)),
        }
    }

    /// Requests cancellation. Already-written bytes stay in the sink; the
    /// download returns `DownloadError::Cancelled` at the next chunk boundary.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }

    /// Returns true when cancellation was requested.
    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
            || self.upstream_probe.as_ref().is_some_and(|probe| probe())
    }
}

/// Signed URL validation policy.
fn validate_signed_url(url: &str) -> Result<Url, DownloadError> {
    let parsed = Url::parse(url)
        .map_err(|e| DownloadError::InvalidSignedUrl(format!("unparsable URL: {e}")))?;
    if parsed.scheme() != "https" {
        return Err(DownloadError::InvalidSignedUrl(
            "signed URL must use https".to_string(),
        ));
    }
    if parsed.host_str().is_none() {
        return Err(DownloadError::InvalidSignedUrl(
            "signed URL must include a host".to_string(),
        ));
    }
    Ok(parsed)
}

/// Returns true for a 64-character lowercase hex string.
fn is_hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Build the allowed host set for a download: the signed URL host plus the
/// configured Supabase and media hosts.
fn allowed_hosts(signed: &Url, config: &SupabaseConfig) -> Vec<String> {
    let mut hosts = Vec::new();
    if let Some(host) = signed.host_str() {
        hosts.push(host.to_string());
    }
    for candidate in [
        config.url.as_str(),
        config.media_base_url.as_deref().unwrap_or(""),
    ] {
        if candidate.is_empty() {
            continue;
        }
        if let Ok(parsed) = Url::parse(candidate) {
            if let Some(host) = parsed.host_str() {
                if !hosts.iter().any(|h| h == host) {
                    hosts.push(host.to_string());
                }
            }
        }
    }
    hosts
}

/// Download client.
pub struct DownloadClient<T = ReqwestDownloadTransport> {
    /// Supabase configuration.
    config: SupabaseConfig,
    /// HTTP transport.
    transport: T,
}

impl DownloadClient<ReqwestDownloadTransport> {
    /// Creates a download client with the default transport.
    #[must_use]
    pub fn new(config: SupabaseConfig) -> Self {
        Self::with_transport(config, ReqwestDownloadTransport::default())
    }
}

impl<T> DownloadClient<T>
where
    T: DownloadTransport,
{
    /// Creates a download client with an explicit transport.
    #[must_use]
    pub fn with_transport(config: SupabaseConfig, transport: T) -> Self {
        Self { config, transport }
    }

    /// Streams a signed download to `sink`, verifying content length and
    /// SHA-256. Returns a receipt with the verified digest.
    ///
    /// # Errors
    ///
    /// Returns `DownloadError` on invalid input, redirect escape, HTTP error,
    /// length mismatch, hash mismatch, cancellation, transport failure, or
    /// sink write failure.
    pub fn download<W: Write>(
        &self,
        signed: &SignedDownload,
        sink: &mut W,
        cancel: Option<&CancelFlag>,
        on_progress: Option<&dyn Fn(u64, u64)>,
    ) -> Result<DownloadReceipt, DownloadError> {
        if cancel.is_some_and(|flag| flag.is_cancelled()) {
            return Err(DownloadError::Cancelled);
        }
        signed.validate()?;

        let parsed = validate_signed_url(&signed.url)?;
        let hosts = allowed_hosts(&parsed, &self.config);
        let response = self.transport.get(&signed.url, &hosts)?;

        // Defense in depth: the transport already refuses cross-host redirects,
        // but verify the effective host never left the allowed set.
        if let Some(host) = Url::parse(&response.final_url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string))
        {
            if !hosts.iter().any(|allowed| allowed == &host) {
                return Err(DownloadError::RedirectEscape {
                    from: parsed.host_str().unwrap_or_default().to_string(),
                    to: host,
                });
            }
        }

        if !(200..300).contains(&response.status) {
            return Err(DownloadError::Http {
                status: response.status,
                detail: format!("download failed: HTTP {}", response.status),
            });
        }

        let mut reader = response.body;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        let mut bytes_written: u64 = 0;

        loop {
            if cancel.is_some_and(|flag| flag.is_cancelled()) {
                return Err(DownloadError::Cancelled);
            }
            let n = reader
                .read(&mut buffer)
                .map_err(|e| DownloadError::Transport(e.to_string()))?;
            if n == 0 {
                break;
            }
            sink.write_all(&buffer[..n])
                .map_err(|e| DownloadError::Write(e.to_string()))?;
            hasher.update(&buffer[..n]);
            bytes_written += n as u64;
            if let Some(report) = on_progress {
                report(bytes_written, response.content_length.unwrap_or(0));
            }
        }

        if let Some(expected) = response.content_length {
            if bytes_written != expected {
                return Err(DownloadError::LengthMismatch {
                    expected,
                    actual: bytes_written,
                });
            }
        }

        let actual_hex = hex_encode(&hasher.finalize());
        if actual_hex != signed.sha256 {
            return Err(DownloadError::HashMismatch {
                expected: signed.sha256.clone(),
                actual: actual_hex.clone(),
            });
        }

        Ok(DownloadReceipt {
            bytes_written,
            sha256: actual_hex,
            final_url: response.final_url,
        })
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::io::Cursor;

    fn sha256_hex(bytes: &[u8]) -> String {
        hex_encode(&Sha256::digest(bytes))
    }

    fn test_config() -> SupabaseConfig {
        SupabaseConfig::new("https://example.supabase.co".to_string())
            .unwrap()
            .with_media_base_url("https://media.example.com".to_string())
    }

    struct FakeTransport {
        status: u16,
        body: Vec<u8>,
        content_length: Option<u64>,
        final_url: String,
        error: Option<DownloadError>,
        requested: RefCell<Vec<(String, Vec<String>)>>,
    }

    impl FakeTransport {
        fn ok(body: &[u8], content_length: Option<u64>) -> Self {
            Self {
                status: 200,
                body: body.to_vec(),
                content_length,
                final_url: "https://media.example.com/preset.ffx".to_string(),
                error: None,
                requested: RefCell::new(Vec::new()),
            }
        }

        fn failing(error: DownloadError) -> Self {
            Self {
                status: 200,
                body: Vec::new(),
                content_length: None,
                final_url: "https://media.example.com/preset.ffx".to_string(),
                error: Some(error),
                requested: RefCell::new(Vec::new()),
            }
        }

        fn with_final_url(mut self, final_url: String) -> Self {
            self.final_url = final_url;
            self
        }
    }

    impl DownloadTransport for FakeTransport {
        fn get(
            &self,
            url: &str,
            allowed_hosts: &[String],
        ) -> Result<DownloadResponse, DownloadError> {
            self.requested
                .borrow_mut()
                .push((url.to_string(), allowed_hosts.to_vec()));
            if let Some(error) = &self.error {
                return Err(error.clone());
            }
            let body = self.body.clone();
            Ok(DownloadResponse {
                status: self.status,
                final_url: self.final_url.clone(),
                content_length: self.content_length,
                body: Box::new(Cursor::new(body)),
            })
        }
    }

    fn run_download(
        body: &[u8],
        expected_sha: &str,
        content_length: Option<u64>,
    ) -> Result<(DownloadReceipt, Vec<u8>), DownloadError> {
        let transport = FakeTransport::ok(body, content_length);
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx?token=abc".to_string(),
            sha256: expected_sha.to_string(),
            expires_in: Some(3600),
        };
        let mut sink = Vec::new();
        let receipt = client.download(&signed, &mut sink, None, None)?;
        Ok((receipt, sink))
    }

    #[test]
    fn download_streams_and_verifies_hash() {
        let body = b"ffx preset bytes";
        let sha = sha256_hex(body);
        let (receipt, sink) = run_download(body, &sha, Some(body.len() as u64)).unwrap();
        assert_eq!(receipt.bytes_written, body.len() as u64);
        assert_eq!(receipt.sha256, sha);
        assert_eq!(sink, body);
    }

    #[test]
    fn download_rejects_invalid_signed_url_scheme() {
        let transport = FakeTransport::ok(b"", None);
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "http://media.example.com/preset.ffx".to_string(),
            sha256: sha256_hex(b""),
            expires_in: None,
        };
        let mut sink = Vec::new();
        let error = client.download(&signed, &mut sink, None, None).unwrap_err();
        assert!(matches!(error, DownloadError::InvalidSignedUrl(_)));
    }

    #[test]
    fn download_rejects_bad_hash_format() {
        let transport = FakeTransport::ok(b"", None);
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx".to_string(),
            sha256: "not-a-hex-digest".to_string(),
            expires_in: None,
        };
        let mut sink = Vec::new();
        let error = client.download(&signed, &mut sink, None, None).unwrap_err();
        assert!(matches!(error, DownloadError::InvalidSignedUrl(_)));
    }

    #[test]
    fn download_passes_signed_and_config_hosts_as_allowed() {
        let transport = FakeTransport::ok(b"data", None);
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx".to_string(),
            sha256: sha256_hex(b"data"),
            expires_in: None,
        };
        let mut sink = Vec::new();
        let _ = client.download(&signed, &mut sink, None, None).unwrap();
        let (_, hosts) = &client.transport.requested.borrow()[0];
        assert!(hosts.iter().any(|h| h == "media.example.com"));
        assert!(hosts.iter().any(|h| h == "example.supabase.co"));
    }

    #[test]
    fn download_maps_http_error() {
        let transport = FakeTransport::ok(b"", None)
            .with_final_url("https://media.example.com/missing.ffx".to_string());
        let mut transport = transport;
        transport.status = 404;
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/missing.ffx".to_string(),
            sha256: sha256_hex(b""),
            expires_in: None,
        };
        let mut sink = Vec::new();
        let error = client.download(&signed, &mut sink, None, None).unwrap_err();
        assert!(matches!(error, DownloadError::Http { status: 404, .. }));
    }

    #[test]
    fn download_detects_length_mismatch() {
        let body = b"short";
        let error = run_download(body, &sha256_hex(body), Some(999)).unwrap_err();
        assert!(matches!(
            error,
            DownloadError::LengthMismatch {
                expected: 999,
                actual: 5
            }
        ));
    }

    #[test]
    fn download_detects_hash_mismatch() {
        let body = b"tampered";
        let error = run_download(body, &"0".repeat(64), None).unwrap_err();
        assert!(matches!(
            error,
            DownloadError::HashMismatch { expected, .. } if expected == "0".repeat(64)
        ));
    }

    #[test]
    fn download_reports_progress() {
        let body = b"1234567890";
        let sha = sha256_hex(body);
        let transport = FakeTransport::ok(body, Some(body.len() as u64));
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx".to_string(),
            sha256: sha,
            expires_in: None,
        };
        let mut sink = Vec::new();
        let last = std::cell::Cell::new(0u64);
        let receipt = client
            .download(
                &signed,
                &mut sink,
                None,
                Some(&|loaded, _total| {
                    last.set(loaded);
                }),
            )
            .unwrap();
        assert_eq!(last.get(), receipt.bytes_written);
    }

    #[test]
    fn download_maps_transport_error() {
        let transport =
            FakeTransport::failing(DownloadError::Transport("network unavailable".to_string()));
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx".to_string(),
            sha256: sha256_hex(b""),
            expires_in: None,
        };
        let mut sink = Vec::new();
        let error = client.download(&signed, &mut sink, None, None).unwrap_err();
        assert!(matches!(error, DownloadError::Transport(_)));
    }

    #[test]
    fn download_cancels_before_start() {
        let transport = FakeTransport::ok(b"data", None);
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx".to_string(),
            sha256: sha256_hex(b"data"),
            expires_in: None,
        };
        let flag = CancelFlag::new();
        flag.cancel();
        let mut sink = Vec::new();
        let error = client
            .download(&signed, &mut sink, Some(&flag), None)
            .unwrap_err();
        assert!(matches!(error, DownloadError::Cancelled));
    }

    #[test]
    fn redirect_escape_is_detected() {
        let transport = FakeTransport::ok(b"evil", None)
            .with_final_url("https://evil.example.net/preset.ffx".to_string());
        let client = DownloadClient::with_transport(test_config(), transport);
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx".to_string(),
            sha256: sha256_hex(b"evil"),
            expires_in: None,
        };
        let mut sink = Vec::new();
        let error = client.download(&signed, &mut sink, None, None).unwrap_err();
        assert!(matches!(error, DownloadError::RedirectEscape { .. }));
        assert!(sink.is_empty(), "escaped download must not write bytes");
    }

    #[test]
    fn cancel_flag_reports_state() {
        let flag = CancelFlag::new();
        assert!(!flag.is_cancelled());
        flag.cancel();
        assert!(flag.is_cancelled());
    }

    #[test]
    fn cancel_flag_reads_lifecycle_probe_after_construction_and_releases_it_on_drop() {
        let upstream = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let weak = std::sync::Arc::downgrade(&upstream);
        let flag = CancelFlag::with_upstream_probe({
            let upstream = std::sync::Arc::clone(&upstream);
            move || upstream.load(std::sync::atomic::Ordering::Acquire)
        });
        assert!(!flag.is_cancelled());
        upstream.store(true, std::sync::atomic::Ordering::Release);
        assert!(flag.is_cancelled());
        drop(flag);
        drop(upstream);
        assert!(
            weak.upgrade().is_none(),
            "probe must not outlive invocation flag"
        );
    }

    #[test]
    fn download_reads_upstream_probe_at_each_chunk_boundary() {
        let upstream = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = CancelFlag::with_upstream_probe({
            let upstream = std::sync::Arc::clone(&upstream);
            move || upstream.load(std::sync::atomic::Ordering::Acquire)
        });
        let body = vec![b'x'; 16 * 1024];
        let client = DownloadClient::with_transport(
            test_config(),
            FakeTransport::ok(&body, Some(body.len() as u64)),
        );
        let signed = SignedDownload {
            url: "https://media.example.com/preset.ffx".to_string(),
            sha256: sha256_hex(&body),
            expires_in: None,
        };
        let mut sink = Vec::new();
        let error = client
            .download(
                &signed,
                &mut sink,
                Some(&flag),
                Some(&|_, _| {
                    upstream.store(true, std::sync::atomic::Ordering::Release);
                }),
            )
            .unwrap_err();
        assert!(matches!(error, DownloadError::Cancelled));
        assert!(
            !sink.is_empty(),
            "cancellation should be observed after a chunk"
        );
    }

    #[test]
    fn error_display() {
        assert_eq!(DownloadError::Cancelled.to_string(), "download cancelled");
        assert_eq!(
            DownloadError::LengthMismatch {
                expected: 10,
                actual: 5
            }
            .to_string(),
            "content length mismatch: expected 10 bytes, got 5"
        );
        assert_eq!(
            DownloadError::RedirectEscape {
                from: "a.example".to_string(),
                to: "b.example".to_string()
            }
            .to_string(),
            "redirect escape: a.example redirected to disallowed host b.example"
        );
    }
}
