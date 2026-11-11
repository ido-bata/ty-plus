use std::fmt;

use serde::{Deserialize, Serialize};

/// Endpoint name for IPC communication.
///
/// Endpoint names are used to identify specific communication channels
/// between the runtime and its clients. They follow a hierarchical
/// naming convention using dots as separators.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct EndpointName(String);

impl EndpointName {
    /// Maximum length of an endpoint name.
    pub const MAX_LENGTH: usize = 128;

    /// Creates a new endpoint name.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the name is empty, too long, or contains invalid characters.
    pub fn new(name: impl Into<String>) -> Result<Self, EndpointError> {
        let name = name.into();
        Self::validate(&name)?;
        Ok(Self(name))
    }

    /// Returns the endpoint name as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Validates an endpoint name string.
    fn validate(name: &str) -> Result<(), EndpointError> {
        if name.is_empty() {
            return Err(EndpointError::Empty);
        }
        if name.len() > Self::MAX_LENGTH {
            return Err(EndpointError::TooLong {
                max: Self::MAX_LENGTH,
                actual: name.len(),
            });
        }
        if !name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_')
        {
            return Err(EndpointError::InvalidCharacters);
        }
        if name.starts_with('.') || name.ends_with('.') {
            return Err(EndpointError::InvalidPosition);
        }
        if name.contains("..") {
            return Err(EndpointError::ConsecutiveDots);
        }
        Ok(())
    }
}

impl fmt::Display for EndpointName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Errors that can occur when creating an endpoint name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EndpointError {
    /// The endpoint name is empty.
    Empty,
    /// The endpoint name is too long.
    TooLong { max: usize, actual: usize },
    /// The endpoint name contains invalid characters.
    InvalidCharacters,
    /// The endpoint name starts or ends with a dot.
    InvalidPosition,
    /// The endpoint name contains consecutive dots.
    ConsecutiveDots,
}

impl fmt::Display for EndpointError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(f, "endpoint name must not be empty"),
            Self::TooLong { max, actual } => {
                write!(f, "endpoint name too long: {actual} bytes (max {max})")
            }
            Self::InvalidCharacters => {
                write!(f, "endpoint name may only contain alphanumeric characters, dots, hyphens, and underscores")
            }
            Self::InvalidPosition => {
                write!(f, "endpoint name must not start or end with a dot")
            }
            Self::ConsecutiveDots => {
                write!(f, "endpoint name must not contain consecutive dots")
            }
        }
    }
}

impl std::error::Error for EndpointError {}

/// Predefined endpoint names for common services.
pub mod endpoints {
    use super::EndpointName;

    /// Runtime health check endpoint.
    pub fn runtime_health() -> EndpointName {
        EndpointName::new("runtime.health").expect("valid endpoint name")
    }

    /// Storage read/write endpoint.
    pub fn storage() -> EndpointName {
        EndpointName::new("storage").expect("valid endpoint name")
    }

    /// Host filesystem operations endpoint.
    pub fn host_filesystem() -> EndpointName {
        EndpointName::new("host-filesystem").expect("valid endpoint name")
    }

    /// Online/network operations endpoint.
    pub fn online() -> EndpointName {
        EndpointName::new("online").expect("valid endpoint name")
    }

    /// Licensing operations endpoint.
    pub fn licensing() -> EndpointName {
        EndpointName::new("licensing").expect("valid endpoint name")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_endpoint_names_are_accepted() {
        let valid = [
            "runtime.health",
            "storage",
            "host-filesystem",
            "online",
            "licensing",
            "my-endpoint",
            "my_endpoint",
            "a.b.c",
        ];
        for name in valid {
            assert!(EndpointName::new(name).is_ok(), "failed for: {name}");
        }
    }

    #[test]
    fn empty_endpoint_name_is_rejected() {
        assert_eq!(EndpointName::new(""), Err(EndpointError::Empty));
    }

    #[test]
    fn too_long_endpoint_name_is_rejected() {
        let long_name = "a".repeat(EndpointName::MAX_LENGTH + 1);
        assert!(matches!(
            EndpointName::new(&long_name),
            Err(EndpointError::TooLong { .. })
        ));
    }

    #[test]
    fn invalid_characters_are_rejected() {
        let invalid = ["runtime/health", "runtime health", "runtime:health"];
        for name in invalid {
            assert_eq!(
                EndpointName::new(name),
                Err(EndpointError::InvalidCharacters),
                "failed for: {name}"
            );
        }
    }

    #[test]
    fn leading_dot_is_rejected() {
        assert_eq!(
            EndpointName::new(".runtime.health"),
            Err(EndpointError::InvalidPosition)
        );
    }

    #[test]
    fn trailing_dot_is_rejected() {
        assert_eq!(
            EndpointName::new("runtime.health."),
            Err(EndpointError::InvalidPosition)
        );
    }

    #[test]
    fn consecutive_dots_are_rejected() {
        assert_eq!(
            EndpointName::new("runtime..health"),
            Err(EndpointError::ConsecutiveDots)
        );
    }

    #[test]
    fn endpoint_name_display_matches_input() {
        let name = EndpointName::new("runtime.health").unwrap();
        assert_eq!(name.to_string(), "runtime.health");
        assert_eq!(name.as_str(), "runtime.health");
    }

    #[test]
    fn predefined_endpoints_are_valid() {
        assert!(!endpoints::runtime_health().as_str().is_empty());
        assert!(!endpoints::storage().as_str().is_empty());
        assert!(!endpoints::host_filesystem().as_str().is_empty());
        assert!(!endpoints::online().as_str().is_empty());
        assert!(!endpoints::licensing().as_str().is_empty());
    }
}
