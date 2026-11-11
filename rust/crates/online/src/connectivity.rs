//! Connectivity operations.
//!
//! This module provides a network connectivity check against the product Edge
//! function and an explicit offline state machine. Local features never depend
//! on this check completing; online-only operations use it to decide whether a
//! remote call is worth attempting.

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::config::SupabaseConfig;

/// Connectivity state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConnectivityState {
    /// Not yet checked.
    Unknown,
    /// Online and connected.
    Online,
    /// Offline or connection failed.
    Offline,
    /// Connection check in progress.
    Checking,
}

impl std::fmt::Display for ConnectivityState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unknown => write!(f, "unknown"),
            Self::Online => write!(f, "online"),
            Self::Offline => write!(f, "offline"),
            Self::Checking => write!(f, "checking"),
        }
    }
}

/// Connectivity status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectivityStatus {
    /// Current state.
    pub state: ConnectivityState,
    /// Human-readable label.
    pub label: String,
    /// ISO 8601 timestamp of last check.
    pub checked_at: String,
    /// Error message if offline.
    pub error_message: Option<String>,
}

/// Outcome of a single health probe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeResult {
    /// HTTP status code of the health response.
    pub status: u16,
}

impl ProbeResult {
    /// Returns true when the health endpoint reported success.
    #[must_use]
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

/// Transport-level failures that prevent a health probe from completing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProbeError {
    /// DNS resolution failed.
    Dns,
    /// Network unreachable, connection refused, or no route to host.
    Offline,
    /// The request timed out.
    Timeout,
    /// Another transport error.
    Other(String),
}

impl std::fmt::Display for ProbeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Dns => write!(f, "DNS resolution failed"),
            Self::Offline => write!(f, "network unavailable"),
            Self::Timeout => write!(f, "connection timed out"),
            Self::Other(detail) => write!(f, "network error: {detail}"),
        }
    }
}

impl std::error::Error for ProbeError {}

/// HTTP health probe abstraction.
///
/// The real implementation uses `reqwest`. Tests inject a fake probe so that
/// offline, DNS failure, and timeout scenarios are deterministic.
pub trait HealthProbe {
    /// Performs a lightweight GET against `url`.
    ///
    /// # Errors
    ///
    /// Returns `ProbeError` when the request cannot be completed.
    fn probe(&self, url: &str) -> Result<ProbeResult, ProbeError>;
}

/// Default `reqwest`-backed probe with a fixed timeout.
#[derive(Debug)]
pub struct ReqwestProbe {
    client: reqwest::blocking::Client,
}

impl ReqwestProbe {
    /// Creates a probe with the given request timeout.
    #[must_use]
    pub fn with_timeout(timeout: Duration) -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(timeout)
            .build()
            .expect("failed to build HTTP client");
        Self { client }
    }
}

impl Default for ReqwestProbe {
    fn default() -> Self {
        Self::with_timeout(DEFAULT_CHECK_TIMEOUT)
    }
}

impl HealthProbe for ReqwestProbe {
    fn probe(&self, url: &str) -> Result<ProbeResult, ProbeError> {
        let response = self.client.get(url).send().map_err(map_reqwest_error)?;
        Ok(ProbeResult {
            status: response.status().as_u16(),
        })
    }
}

fn map_reqwest_error(error: reqwest::Error) -> ProbeError {
    if error.is_timeout() {
        return ProbeError::Timeout;
    }
    if error.is_connect() {
        return ProbeError::Offline;
    }
    if error.is_request() {
        // DNS failures typically surface as connect errors; keep a stable
        // classification when the transport reports them directly.
        return ProbeError::Dns;
    }
    ProbeError::Other(error.to_string())
}

/// Default timeout for a connectivity health check.
pub const DEFAULT_CHECK_TIMEOUT: Duration = Duration::from_secs(10);

/// Connectivity checker.
pub struct ConnectivityChecker<P = ReqwestProbe> {
    /// Supabase configuration.
    config: SupabaseConfig,
    /// HTTP probe used for the health check.
    probe: P,
    /// Current status.
    status: ConnectivityStatus,
    /// Last successful check time.
    last_success: Option<Instant>,
    /// How often to recheck (default: 5 minutes).
    recheck_interval: Duration,
}

impl ConnectivityChecker<ReqwestProbe> {
    /// Creates a new connectivity checker with the default probe.
    #[must_use]
    pub fn new(config: SupabaseConfig) -> Self {
        Self::with_probe(config, ReqwestProbe::default())
    }
}

impl<P> ConnectivityChecker<P>
where
    P: HealthProbe,
{
    /// Creates a new connectivity checker with an explicit probe.
    #[must_use]
    pub fn with_probe(config: SupabaseConfig, probe: P) -> Self {
        Self {
            config,
            probe,
            status: ConnectivityStatus {
                state: ConnectivityState::Unknown,
                label: "Not checked".to_string(),
                checked_at: String::new(),
                error_message: None,
            },
            last_success: None,
            recheck_interval: Duration::from_secs(300),
        }
    }

    /// Returns the current connectivity status.
    #[must_use]
    pub fn status(&self) -> &ConnectivityStatus {
        &self.status
    }

    /// Checks if the service is online.
    ///
    /// Performs a lightweight health check against the Supabase Edge function
    /// and records an explicit online/offline state.
    #[must_use]
    pub fn check(&mut self) -> &ConnectivityStatus {
        self.status.state = ConnectivityState::Checking;

        let url = format!("{}/health", self.config.api_base());

        match self.probe.probe(&url) {
            Ok(result) if result.is_success() => {
                self.status = ConnectivityStatus {
                    state: ConnectivityState::Online,
                    label: "Ty Plus OK".to_string(),
                    checked_at: now_rfc3339(),
                    error_message: None,
                };
                self.last_success = Some(Instant::now());
            }
            Ok(result) => {
                let error = format!("HTTP {}", result.status);
                self.status = ConnectivityStatus {
                    state: ConnectivityState::Offline,
                    label: "Cloud sync failed".to_string(),
                    checked_at: now_rfc3339(),
                    error_message: Some(error),
                };
            }
            Err(error) => {
                self.status = ConnectivityStatus {
                    state: ConnectivityState::Offline,
                    label: "Cloud sync failed".to_string(),
                    checked_at: now_rfc3339(),
                    error_message: Some(error.to_string()),
                };
            }
        }

        &self.status
    }

    /// Returns true if a recheck is needed based on the interval.
    #[must_use]
    pub fn needs_recheck(&self) -> bool {
        match self.last_success {
            Some(last) => last.elapsed() >= self.recheck_interval,
            None => true,
        }
    }

    /// Sets the recheck interval.
    pub fn set_recheck_interval(&mut self, interval: Duration) {
        self.recheck_interval = interval;
    }
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Debug)]
    struct FakeProbe {
        outcome: RefCell<Result<ProbeResult, ProbeError>>,
        requested_url: RefCell<String>,
    }

    impl FakeProbe {
        fn ok(status: u16) -> Self {
            Self {
                outcome: RefCell::new(Ok(ProbeResult { status })),
                requested_url: RefCell::new(String::new()),
            }
        }

        fn fail(error: ProbeError) -> Self {
            Self {
                outcome: RefCell::new(Err(error)),
                requested_url: RefCell::new(String::new()),
            }
        }
    }

    impl HealthProbe for FakeProbe {
        fn probe(&self, url: &str) -> Result<ProbeResult, ProbeError> {
            *self.requested_url.borrow_mut() = url.to_string();
            self.outcome.borrow().clone()
        }
    }

    fn test_config() -> SupabaseConfig {
        SupabaseConfig::new("https://example.supabase.co".to_string()).unwrap()
    }

    #[test]
    fn connectivity_starts_unknown() {
        let checker = ConnectivityChecker::with_probe(test_config(), FakeProbe::ok(200));
        assert_eq!(checker.status().state, ConnectivityState::Unknown);
        assert!(checker.status().checked_at.is_empty());
    }

    #[test]
    fn needs_recheck_when_never_checked() {
        let checker = ConnectivityChecker::with_probe(test_config(), FakeProbe::ok(200));
        assert!(checker.needs_recheck());
    }

    #[test]
    fn recheck_interval_can_be_set() {
        let mut checker = ConnectivityChecker::with_probe(test_config(), FakeProbe::ok(200));
        checker.set_recheck_interval(Duration::from_secs(60));
        assert_eq!(checker.recheck_interval, Duration::from_secs(60));
    }

    #[test]
    fn state_display() {
        assert_eq!(ConnectivityState::Online.to_string(), "online");
        assert_eq!(ConnectivityState::Offline.to_string(), "offline");
        assert_eq!(ConnectivityState::Unknown.to_string(), "unknown");
        assert_eq!(ConnectivityState::Checking.to_string(), "checking");
    }

    #[test]
    fn probe_hits_health_endpoint() {
        let mut checker = ConnectivityChecker::with_probe(test_config(), FakeProbe::ok(200));
        let _ = checker.check();
        let url = checker.probe.requested_url.borrow().clone();
        assert_eq!(
            url,
            "https://example.supabase.co/functions/v1/typlus/health"
        );
    }

    #[test]
    fn online_when_probe_succeeds() {
        let mut checker = ConnectivityChecker::with_probe(test_config(), FakeProbe::ok(200));
        let status = checker.check();
        assert_eq!(status.state, ConnectivityState::Online);
        assert_eq!(status.label, "Ty Plus OK");
        assert!(status.error_message.is_none());
        assert!(!status.checked_at.is_empty());
    }

    #[test]
    fn offline_on_http_error() {
        let mut checker = ConnectivityChecker::with_probe(test_config(), FakeProbe::ok(503));
        let status = checker.check();
        assert_eq!(status.state, ConnectivityState::Offline);
        assert_eq!(status.error_message.as_deref(), Some("HTTP 503"));
    }

    #[test]
    fn offline_when_probe_fails() {
        let mut checker =
            ConnectivityChecker::with_probe(test_config(), FakeProbe::fail(ProbeError::Offline));
        let status = checker.check();
        assert_eq!(status.state, ConnectivityState::Offline);
        assert_eq!(status.error_message.as_deref(), Some("network unavailable"));
    }

    #[test]
    fn offline_on_dns_failure() {
        let mut checker =
            ConnectivityChecker::with_probe(test_config(), FakeProbe::fail(ProbeError::Dns));
        let status = checker.check();
        assert_eq!(status.state, ConnectivityState::Offline);
        assert_eq!(
            status.error_message.as_deref(),
            Some("DNS resolution failed")
        );
    }

    #[test]
    fn offline_on_timeout() {
        let mut checker =
            ConnectivityChecker::with_probe(test_config(), FakeProbe::fail(ProbeError::Timeout));
        let status = checker.check();
        assert_eq!(status.state, ConnectivityState::Offline);
        assert_eq!(
            status.error_message.as_deref(),
            Some("connection timed out")
        );
    }

    #[test]
    fn successful_check_delays_recheck() {
        let mut checker = ConnectivityChecker::with_probe(test_config(), FakeProbe::ok(200));
        let _ = checker.check();
        assert!(!checker.needs_recheck());
    }

    #[test]
    fn failed_check_still_requires_recheck() {
        let mut checker =
            ConnectivityChecker::with_probe(test_config(), FakeProbe::fail(ProbeError::Offline));
        let _ = checker.check();
        assert!(checker.needs_recheck());
    }

    #[test]
    fn probe_result_success_range() {
        assert!(ProbeResult { status: 200 }.is_success());
        assert!(ProbeResult { status: 299 }.is_success());
        assert!(!ProbeResult { status: 300 }.is_success());
        assert!(!ProbeResult { status: 404 }.is_success());
    }

    #[test]
    fn probe_error_display() {
        assert_eq!(ProbeError::Dns.to_string(), "DNS resolution failed");
        assert_eq!(ProbeError::Offline.to_string(), "network unavailable");
        assert_eq!(ProbeError::Timeout.to_string(), "connection timed out");
    }
}
