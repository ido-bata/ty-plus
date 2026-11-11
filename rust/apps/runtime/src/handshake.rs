use serde::{Deserialize, Serialize};

use crate::transport::TransportError;

/// Protocol version for the IPC handshake.
pub const PROTOCOL_VERSION: u32 = 1;

/// Maximum supported protocol version.
pub const MAX_PROTOCOL_VERSION: u32 = 1;

/// Handshake message sent from host to runtime.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HandshakeRequest {
    /// Protocol version requested by the host.
    pub version: u32,
    /// Capabilities supported by the host.
    pub capabilities: Vec<String>,
    /// Random nonce for session identification.
    pub nonce: [u8; 32],
    /// Optional host identifier.
    pub host_id: Option<String>,
}

impl HandshakeRequest {
    /// Creates a new handshake request with a random nonce.
    #[must_use]
    pub fn new() -> Self {
        let mut nonce = [0u8; 32];
        for (i, byte) in nonce.iter_mut().enumerate() {
            *byte = (std::process::id() as u8).wrapping_add(i as u8);
        }

        Self {
            version: PROTOCOL_VERSION,
            capabilities: vec![],
            nonce,
            host_id: None,
        }
    }

    /// Creates a handshake request with specific parameters.
    #[must_use]
    pub fn with_params(
        version: u32,
        capabilities: Vec<String>,
        nonce: [u8; 32],
        host_id: Option<String>,
    ) -> Self {
        Self {
            version,
            capabilities,
            nonce,
            host_id,
        }
    }
}

impl Default for HandshakeRequest {
    fn default() -> Self {
        Self::new()
    }
}

/// Handshake response sent from runtime to host.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HandshakeResponse {
    /// Protocol version selected by the runtime.
    pub version: u32,
    /// Capabilities supported by the runtime.
    pub capabilities: Vec<String>,
    /// Nonce echoed from the request for verification.
    pub nonce: [u8; 32],
    /// Whether the handshake was successful.
    pub accepted: bool,
    /// Reason for rejection if not accepted.
    pub rejection_reason: Option<String>,
}

impl HandshakeResponse {
    /// Creates an accepted handshake response.
    #[must_use]
    pub fn accept(request: &HandshakeRequest, capabilities: Vec<String>) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            capabilities,
            nonce: request.nonce,
            accepted: true,
            rejection_reason: None,
        }
    }

    /// Creates a rejected handshake response.
    #[must_use]
    pub fn reject(request: &HandshakeRequest, reason: &str) -> Self {
        Self {
            version: request.version,
            capabilities: vec![],
            nonce: request.nonce,
            accepted: false,
            rejection_reason: Some(reason.to_string()),
        }
    }

    /// Creates a rejected handshake response for version mismatch.
    #[must_use]
    pub fn reject_version_mismatch(request: &HandshakeRequest) -> Self {
        Self::reject(
            request,
            &format!(
                "protocol version mismatch: requested {}, supported 1-{}",
                request.version, MAX_PROTOCOL_VERSION
            ),
        )
    }
}

/// Handshake validator for the runtime side.
pub struct HandshakeValidator {
    /// Required capabilities from the host.
    required_capabilities: Vec<String>,
}

impl HandshakeValidator {
    /// Creates a new handshake validator.
    #[must_use]
    pub fn new(required_capabilities: Vec<String>) -> Self {
        Self {
            required_capabilities,
        }
    }

    /// Validates a handshake request and returns a response.
    #[must_use]
    pub fn validate(&self, request: &HandshakeRequest) -> HandshakeResponse {
        // Check protocol version
        if request.version < 1 || request.version > MAX_PROTOCOL_VERSION {
            return HandshakeResponse::reject_version_mismatch(request);
        }

        // Check required capabilities
        for required in &self.required_capabilities {
            if !request.capabilities.contains(required) {
                return HandshakeResponse::reject(
                    request,
                    &format!("missing required capability: {required}"),
                );
            }
        }

        HandshakeResponse::accept(request, vec![])
    }

    /// Validates a handshake response from the runtime.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the response is invalid or rejected.
    pub fn validate_response(
        &self,
        response: &HandshakeResponse,
        original_request: &HandshakeRequest,
    ) -> Result<(), TransportError> {
        // Check nonce matches
        if response.nonce != original_request.nonce {
            return Err(TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "nonce mismatch in handshake response",
            )));
        }

        // Check if accepted
        if !response.accepted {
            let reason = response
                .rejection_reason
                .clone()
                .unwrap_or_else(|| "unknown".to_string());
            return Err(TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::ConnectionRefused,
                format!("handshake rejected: {reason}"),
            )));
        }

        // Check version matches
        if response.version != original_request.version {
            return Err(TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "version mismatch in handshake response",
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handshake_request_new_has_valid_nonce() {
        let request = HandshakeRequest::new();
        assert_eq!(request.version, PROTOCOL_VERSION);
        assert_eq!(request.nonce.len(), 32);
    }

    #[test]
    fn handshake_request_with_params() {
        let nonce = [42u8; 32];
        let request = HandshakeRequest::with_params(
            1,
            vec!["feature1".to_string()],
            nonce,
            Some("host-1".to_string()),
        );
        assert_eq!(request.version, 1);
        assert_eq!(request.capabilities, vec!["feature1"]);
        assert_eq!(request.nonce, nonce);
        assert_eq!(request.host_id.as_deref(), Some("host-1"));
    }

    #[test]
    fn handshake_response_accept() {
        let request = HandshakeRequest::new();
        let response = HandshakeResponse::accept(&request, vec!["capability1".to_string()]);
        assert!(response.accepted);
        assert_eq!(response.nonce, request.nonce);
        assert_eq!(response.capabilities, vec!["capability1"]);
    }

    #[test]
    fn handshake_response_reject() {
        let request = HandshakeRequest::new();
        let response = HandshakeResponse::reject(&request, "test rejection");
        assert!(!response.accepted);
        assert_eq!(response.rejection_reason.as_deref(), Some("test rejection"));
    }

    #[test]
    fn handshake_response_reject_version_mismatch() {
        let request = HandshakeRequest::with_params(99, vec![], [0u8; 32], None);
        let response = HandshakeResponse::reject_version_mismatch(&request);
        assert!(!response.accepted);
        assert!(response
            .rejection_reason
            .as_deref()
            .unwrap()
            .contains("version mismatch"));
    }

    #[test]
    fn handshake_validator_accepts_valid_request() {
        let validator = HandshakeValidator::new(vec![]);
        let request = HandshakeRequest::new();
        let response = validator.validate(&request);
        assert!(response.accepted);
    }

    #[test]
    fn handshake_validator_rejects_version_mismatch() {
        let validator = HandshakeValidator::new(vec![]);
        let request = HandshakeRequest::with_params(99, vec![], [0u8; 32], None);
        let response = validator.validate(&request);
        assert!(!response.accepted);
    }

    #[test]
    fn handshake_validator_rejects_missing_capability() {
        let validator = HandshakeValidator::new(vec!["required_feature".to_string()]);
        let request = HandshakeRequest::new();
        let response = validator.validate(&request);
        assert!(!response.accepted);
        assert!(response
            .rejection_reason
            .as_deref()
            .unwrap()
            .contains("missing required capability"));
    }

    #[test]
    fn handshake_validator_accepts_with_required_capability() {
        let validator = HandshakeValidator::new(vec!["required_feature".to_string()]);
        let request =
            HandshakeRequest::with_params(1, vec!["required_feature".to_string()], [0u8; 32], None);
        let response = validator.validate(&request);
        assert!(response.accepted);
    }

    #[test]
    fn validate_response_accepts_valid_response() {
        let validator = HandshakeValidator::new(vec![]);
        let request = HandshakeRequest::new();
        let response = HandshakeResponse::accept(&request, vec![]);
        assert!(validator.validate_response(&response, &request).is_ok());
    }

    #[test]
    fn validate_response_rejects_nonce_mismatch() {
        let validator = HandshakeValidator::new(vec![]);
        let request = HandshakeRequest::new();
        let mut response = HandshakeResponse::accept(&request, vec![]);
        response.nonce = [99u8; 32];
        assert!(validator.validate_response(&response, &request).is_err());
    }

    #[test]
    fn validate_response_rejects_rejected_response() {
        let validator = HandshakeValidator::new(vec![]);
        let request = HandshakeRequest::new();
        let response = HandshakeResponse::reject(&request, "test");
        assert!(validator.validate_response(&response, &request).is_err());
    }

    #[test]
    fn validate_response_rejects_version_mismatch() {
        let validator = HandshakeValidator::new(vec![]);
        let request = HandshakeRequest::new();
        let mut response = HandshakeResponse::accept(&request, vec![]);
        response.version = 99;
        assert!(validator.validate_response(&response, &request).is_err());
    }
}
