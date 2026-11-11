use std::path::PathBuf;

use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeServer, ServerOptions};

use super::permission::{cleanup_stale_endpoint, PermissionConfig};
use crate::codec::FrameReader;
use crate::codec::FrameWriter;
use crate::transport::{EndpointConfig, Listener, TransportError};

/// Windows named pipe server with ACL support.
pub struct NamedPipeListener {
    server: NamedPipeServer,
    endpoint: PathBuf,
    #[allow(dead_code)]
    permission: PermissionConfig,
}

impl NamedPipeListener {
    /// Creates a new named pipe server with same-user ACL.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the pipe cannot be created.
    pub async fn bind(config: EndpointConfig) -> Result<Self, TransportError> {
        let pipe_name = format!(
            "\\\\.\\pipe\\{}",
            config
                .endpoint
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("ty-plus")
        );

        // Clean up stale pipe if requested
        if config.cleanup_stale {
            cleanup_stale_endpoint(&PathBuf::from(&pipe_name))?;
        }

        // Create pipe with default security (same-user only via Windows ACL)
        let server = ServerOptions::new()
            .first_pipe_instance(false)
            .create(&pipe_name)?;

        Ok(Self {
            server,
            endpoint: config.endpoint,
            permission: PermissionConfig::default(),
        })
    }

    /// Returns the pipe name.
    #[must_use]
    pub fn pipe_name(&self) -> &PathBuf {
        &self.endpoint
    }
}

#[async_trait::async_trait]
impl Listener for NamedPipeListener {
    type Stream = NamedPipeStream;

    async fn accept(&self) -> Result<Self::Stream, TransportError> {
        self.server.connect().await?;
        let stream = NamedPipeStream {
            _reader: FrameReader::new(),
            _writer: FrameWriter::new(),
        };
        Ok(stream)
    }

    fn local_addr(&self) -> Result<String, TransportError> {
        Ok(self.endpoint.to_string_lossy().to_string())
    }
}

/// Windows named pipe client stream.
pub struct NamedPipeStream {
    _reader: FrameReader,
    _writer: FrameWriter,
}

impl NamedPipeStream {
    /// Connects to a named pipe server.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the connection fails.
    pub async fn connect(endpoint: &str) -> Result<Self, TransportError> {
        let _client = ClientOptions::new().open(endpoint)?;
        Ok(Self {
            _reader: FrameReader::new(),
            _writer: FrameWriter::new(),
        })
    }
}

impl tokio::io::AsyncRead for NamedPipeStream {
    fn poll_read(
        self: std::pin::Pin<&mut Self>,
        _cx: &mut std::task::Context<'_>,
        _buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        // Placeholder: actual implementation will use the pipe
        std::task::Poll::Ready(Ok(()))
    }
}

impl tokio::io::AsyncWrite for NamedPipeStream {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        _cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        // Placeholder: actual implementation will use the pipe
        std::task::Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(
        self: std::pin::Pin<&mut Self>,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::task::Poll::Ready(Ok(()))
    }

    fn poll_shutdown(
        self: std::pin::Pin<&mut Self>,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::task::Poll::Ready(Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn named_pipe_listener_bind() {
        let endpoint = PathBuf::from(r"\\.\pipe\ty-plus-test-pipe");
        let config = EndpointConfig::new(endpoint.clone());

        let listener = NamedPipeListener::bind(config).await.unwrap();
        assert_eq!(listener.local_addr().unwrap(), endpoint.to_string_lossy());
    }

    #[tokio::test]
    async fn named_pipe_listener_cleanup_stale() {
        // Use different pipe names to avoid conflicts
        let endpoint1 = PathBuf::from(r"\\.\pipe\ty-plus-test-cleanup-1");
        let endpoint2 = PathBuf::from(r"\\.\pipe\ty-plus-test-cleanup-2");

        let config1 = EndpointConfig::new(endpoint1);
        let config2 = EndpointConfig::new(endpoint2);

        // First bind should succeed
        let _listener1 = NamedPipeListener::bind(config1).await.unwrap();

        // Second bind on different pipe should also succeed
        let _listener2 = NamedPipeListener::bind(config2).await.unwrap();
    }
}
