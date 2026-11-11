use std::path::PathBuf;

use tokio::net::UnixListener;
use tokio::net::UnixStream;

use super::permission::{cleanup_stale_endpoint, set_socket_permissions, PermissionConfig};
use crate::codec::FrameReader;
use crate::codec::FrameWriter;
use crate::transport::{EndpointConfig, Listener, TransportError, TransportStream};

/// macOS Unix domain socket server with permission support.
pub struct UdsListener {
    listener: UnixListener,
    endpoint: PathBuf,
    #[allow(dead_code)]
    permission: PermissionConfig,
}

impl UdsListener {
    /// Creates a new UDS server with same-user permissions.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the socket cannot be created.
    pub async fn bind(config: EndpointConfig) -> Result<Self, TransportError> {
        // Clean up stale socket if requested
        if config.cleanup_stale {
            cleanup_stale_endpoint(&config.endpoint)?;
        }

        let listener = UnixListener::bind(&config.endpoint)?;

        // Set socket permissions to owner-only (0600)
        set_socket_permissions(&config.endpoint, 0o600)?;

        Ok(Self {
            listener,
            endpoint: config.endpoint,
            permission: PermissionConfig::default(),
        })
    }

    /// Returns the socket path.
    #[must_use]
    pub fn socket_path(&self) -> &PathBuf {
        &self.endpoint
    }
}

#[async_trait::async_trait]
impl Listener for UdsListener {
    type Stream = UdsStream;

    async fn accept(&self) -> Result<Self::Stream, TransportError> {
        let (stream, _addr) = self.listener.accept().await?;
        Ok(UdsStream {
            inner: stream,
            reader: FrameReader::new(),
            writer: FrameWriter::new(),
        })
    }

    fn local_addr(&self) -> Result<String, TransportError> {
        Ok(self.endpoint.to_string_lossy().to_string())
    }
}

/// macOS Unix domain socket client stream.
pub struct UdsStream {
    inner: UnixStream,
    reader: FrameReader,
    writer: FrameWriter,
}

impl UdsStream {
    /// Connects to a UDS server.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the connection fails.
    pub async fn connect(endpoint: &str) -> Result<Self, TransportError> {
        let stream = UnixStream::connect(endpoint).await?;
        Ok(Self {
            inner: stream,
            reader: FrameReader::new(),
            writer: FrameWriter::new(),
        })
    }
}

impl tokio::io::AsyncRead for UdsStream {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl tokio::io::AsyncWrite for UdsStream {
    fn poll_write(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        std::pin::Pin::new(&mut self.inner).poll_write(cx, buf)
    }

    fn poll_flush(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn uds_listener_bind() {
        let endpoint = PathBuf::from("/tmp/ty-plus-test-uds.sock");
        let config = EndpointConfig::new(endpoint.clone());

        let listener = UdsListener::bind(config).await.unwrap();
        assert_eq!(listener.local_addr().unwrap(), endpoint.to_string_lossy());

        // Verify socket file exists and has correct permissions
        let metadata = std::fs::metadata(&endpoint).unwrap();
        let mode = metadata.permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);

        // Cleanup
        let _ = std::fs::remove_file(endpoint);
    }

    #[tokio::test]
    async fn uds_listener_cleanup_stale() {
        let endpoint = PathBuf::from("/tmp/ty-plus-test-cleanup.sock");
        let config = EndpointConfig::new(endpoint.clone());

        // Create a stale socket file
        std::fs::write(&endpoint, "stale").unwrap();
        assert!(endpoint.exists());

        // Bind with cleanup should remove the stale file
        let _listener = UdsListener::bind(config).await.unwrap();
        assert!(endpoint.exists()); // New socket file exists

        // Cleanup
        let _ = std::fs::remove_file(endpoint);
    }
}
