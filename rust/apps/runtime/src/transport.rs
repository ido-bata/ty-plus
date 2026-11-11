use std::path::PathBuf;

use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::CodecError;

/// Errors that can occur during transport operations.
#[derive(Debug)]
pub enum TransportError {
    /// IO error during transport operation.
    Io(std::io::Error),
    /// Codec error during frame encoding/decoding.
    Codec(CodecError),
    /// Connection was closed unexpectedly.
    ConnectionClosed,
    /// Endpoint path is invalid.
    InvalidEndpoint(String),
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "transport IO error: {error}"),
            Self::Codec(error) => write!(f, "codec error: {error}"),
            Self::ConnectionClosed => write!(f, "connection closed"),
            Self::InvalidEndpoint(path) => write!(f, "invalid endpoint: {path}"),
        }
    }
}

impl std::error::Error for TransportError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Codec(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for TransportError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<CodecError> for TransportError {
    fn from(error: CodecError) -> Self {
        Self::Codec(error)
    }
}

/// A bidirectional transport stream.
pub trait TransportStream: AsyncRead + AsyncWrite + Send + Unpin + 'static {}

/// Server-side listener for incoming connections.
#[async_trait::async_trait]
pub trait Listener: Send + Sync {
    /// The type of stream produced by this listener.
    type Stream: TransportStream;

    /// Accepts a new connection.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the accept operation fails.
    async fn accept(&self) -> Result<Self::Stream, TransportError>;

    /// Returns the local endpoint address.
    fn local_addr(&self) -> Result<String, TransportError>;
}

/// Client-side connector for outgoing connections.
#[async_trait::async_trait]
pub trait Connector: Send + Sync {
    /// The type of stream produced by this connector.
    type Stream: TransportStream;

    /// Connects to a remote endpoint.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the connection fails.
    async fn connect(&self, endpoint: &str) -> Result<Self::Stream, TransportError>;
}

/// Endpoint configuration for a transport.
#[derive(Debug, Clone)]
pub struct EndpointConfig {
    /// The endpoint path or address.
    pub endpoint: PathBuf,
    /// Whether to clean up stale endpoints on startup.
    pub cleanup_stale: bool,
}

impl EndpointConfig {
    /// Creates a new endpoint configuration.
    #[must_use]
    pub fn new(endpoint: PathBuf) -> Self {
        Self {
            endpoint,
            cleanup_stale: true,
        }
    }
}

/// Marker trait for streams that are both readable and writable.
impl<T: AsyncRead + AsyncWrite + Send + Unpin + 'static> TransportStream for T {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_error_display() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "not found");
        let error = TransportError::Io(io_error);
        assert!(error.to_string().contains("transport IO error"));

        let error = TransportError::ConnectionClosed;
        assert_eq!(error.to_string(), "connection closed");

        let error = TransportError::InvalidEndpoint("/bad/path".to_string());
        assert!(error.to_string().contains("invalid endpoint"));
    }

    #[test]
    fn endpoint_config_defaults() {
        let config = EndpointConfig::new(PathBuf::from("/tmp/test"));
        assert_eq!(config.endpoint, PathBuf::from("/tmp/test"));
        assert!(config.cleanup_stale);
    }
}
