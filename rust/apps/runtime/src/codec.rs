use std::io::{self, Read, Write};

use ty_plus_protocol::{WireMessage, MAX_FRAME_BYTES};

/// Errors that can occur during frame encoding/decoding.
#[derive(Debug)]
pub enum CodecError {
    /// IO error during read/write.
    Io(io::Error),
    /// Frame exceeds maximum size.
    FrameTooLarge {
        max_bytes: usize,
        actual_bytes: usize,
    },
    /// Invalid frame header (non-zero high bit or zero length).
    InvalidFrameHeader,
    /// JSON deserialization failed.
    Json(serde_json::Error),
    /// Wire message validation failed.
    Wire(ty_plus_protocol::WireDecodeError),
}

impl std::fmt::Display for CodecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "IO error: {error}"),
            Self::FrameTooLarge {
                max_bytes,
                actual_bytes,
            } => {
                write!(f, "frame too large: {actual_bytes} bytes (max {max_bytes})")
            }
            Self::InvalidFrameHeader => write!(f, "invalid frame header"),
            Self::Json(error) => write!(f, "JSON error: {error}"),
            Self::Wire(error) => write!(f, "wire error: {error}"),
        }
    }
}

impl std::error::Error for CodecError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Wire(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for CodecError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for CodecError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<ty_plus_protocol::WireDecodeError> for CodecError {
    fn from(error: ty_plus_protocol::WireDecodeError) -> Self {
        Self::Wire(error)
    }
}

/// Frame header: 4 bytes big-endian length with high bit reserved for future use.
///
/// The high bit (bit 31) must be 0 for current frames. This allows future
/// extensions (e.g., compression, encryption) without breaking compatibility.
const FRAME_HEADER_SIZE: usize = 4;
const HIGH_BIT: u32 = 1 << 31;

/// Encodes a wire message into a length-prefixed frame.
///
/// Format: `[4-byte big-endian length][JSON payload]`
///
/// The length does not include the header itself.
///
/// # Errors
///
/// Returns `Err` if serialization fails or the frame exceeds `MAX_FRAME_BYTES`.
pub fn encode_frame(message: &WireMessage) -> Result<Vec<u8>, CodecError> {
    let json = serde_json::to_vec(message)?;
    if json.len() > MAX_FRAME_BYTES {
        return Err(CodecError::FrameTooLarge {
            max_bytes: MAX_FRAME_BYTES,
            actual_bytes: json.len(),
        });
    }
    let length = (json.len() as u32).to_be_bytes();
    let mut frame = Vec::with_capacity(FRAME_HEADER_SIZE + json.len());
    frame.extend_from_slice(&length);
    frame.extend_from_slice(&json);
    Ok(frame)
}

/// Decodes a length-prefixed frame into a wire message.
///
/// # Errors
///
/// Returns `Err` if the header is invalid, the frame is too large,
/// or JSON deserialization fails.
pub fn decode_frame(bytes: &[u8]) -> Result<WireMessage, CodecError> {
    if bytes.len() < FRAME_HEADER_SIZE {
        return Err(CodecError::InvalidFrameHeader);
    }
    let length_bytes: [u8; 4] = bytes[..FRAME_HEADER_SIZE]
        .try_into()
        .map_err(|_| CodecError::InvalidFrameHeader)?;
    let length = u32::from_be_bytes(length_bytes);
    if length & HIGH_BIT != 0 {
        return Err(CodecError::InvalidFrameHeader);
    }
    let length = length as usize;
    if length > MAX_FRAME_BYTES {
        return Err(CodecError::FrameTooLarge {
            max_bytes: MAX_FRAME_BYTES,
            actual_bytes: length,
        });
    }
    if bytes.len() < FRAME_HEADER_SIZE + length {
        return Err(CodecError::InvalidFrameHeader);
    }
    let json = &bytes[FRAME_HEADER_SIZE..FRAME_HEADER_SIZE + length];
    let message = WireMessage::decode_json_frame(json)?;
    Ok(message)
}

/// Reads a single frame from a reader.
///
/// This handles the length-prefix framing and returns the complete frame bytes.
/// It reads exactly `FRAME_HEADER_SIZE + length` bytes.
///
/// # Errors
///
/// Returns `Err` on IO error, invalid header, or frame too large.
pub fn read_frame<R: Read>(reader: &mut R) -> Result<Vec<u8>, CodecError> {
    let mut header = [0u8; FRAME_HEADER_SIZE];
    reader.read_exact(&mut header)?;
    let length_bytes: [u8; 4] = header;
    let length = u32::from_be_bytes(length_bytes);
    if length & HIGH_BIT != 0 {
        return Err(CodecError::InvalidFrameHeader);
    }
    let length = length as usize;
    if length > MAX_FRAME_BYTES {
        return Err(CodecError::FrameTooLarge {
            max_bytes: MAX_FRAME_BYTES,
            actual_bytes: length,
        });
    }
    let mut payload = vec![0u8; length];
    reader.read_exact(&mut payload)?;
    let mut frame = Vec::with_capacity(FRAME_HEADER_SIZE + length);
    frame.extend_from_slice(&header);
    frame.extend_from_slice(&payload);
    Ok(frame)
}

/// Writes a single frame to a writer.
///
/// This handles the length-prefix framing.
///
/// # Errors
///
/// Returns `Err` on IO error or frame too large.
pub fn write_frame<W: Write>(writer: &mut W, frame: &[u8]) -> Result<(), CodecError> {
    if frame.len() < FRAME_HEADER_SIZE {
        return Err(CodecError::InvalidFrameHeader);
    }
    writer.write_all(frame)?;
    writer.flush()?;
    Ok(())
}

/// Partial read state for incremental frame reading.
///
/// This allows reading frames from a stream that may not provide
/// all bytes at once (e.g., non-blocking IO or network streams).
#[derive(Debug, Default)]
pub struct FrameReader {
    buffer: Vec<u8>,
    header_received: bool,
    expected_length: usize,
}

impl FrameReader {
    /// Creates a new frame reader.
    #[must_use]
    pub fn new() -> Self {
        Self {
            buffer: Vec::new(),
            header_received: false,
            expected_length: 0,
        }
    }

    /// Feeds bytes into the reader and returns complete frames.
    ///
    /// Returns a list of complete frame byte vectors. The reader
    /// accumulates partial data until a complete frame is available.
    ///
    /// # Errors
    ///
    /// Returns `Err` on invalid header or frame too large.
    pub fn feed(&mut self, data: &[u8]) -> Result<Vec<Vec<u8>>, CodecError> {
        self.buffer.extend_from_slice(data);
        let mut frames = Vec::new();

        loop {
            if !self.header_received {
                if self.buffer.len() < FRAME_HEADER_SIZE {
                    break;
                }
                let length_bytes: [u8; 4] = self.buffer[..FRAME_HEADER_SIZE]
                    .try_into()
                    .map_err(|_| CodecError::InvalidFrameHeader)?;
                let length = u32::from_be_bytes(length_bytes);
                if length & HIGH_BIT != 0 {
                    return Err(CodecError::InvalidFrameHeader);
                }
                self.expected_length = length as usize;
                if self.expected_length > MAX_FRAME_BYTES {
                    return Err(CodecError::FrameTooLarge {
                        max_bytes: MAX_FRAME_BYTES,
                        actual_bytes: self.expected_length,
                    });
                }
                self.header_received = true;
            }

            let total_length = FRAME_HEADER_SIZE + self.expected_length;
            if self.buffer.len() < total_length {
                break;
            }

            let frame: Vec<u8> = self.buffer.drain(..total_length).collect();
            frames.push(frame);
            self.header_received = false;
            self.expected_length = 0;
        }

        Ok(frames)
    }

    /// Returns true if the reader has buffered data.
    #[must_use]
    pub fn has_buffered_data(&self) -> bool {
        !self.buffer.is_empty()
    }

    /// Clears the internal buffer.
    pub fn clear(&mut self) {
        self.buffer.clear();
        self.header_received = false;
        self.expected_length = 0;
    }
}

/// Partial write state for incremental frame writing.
///
/// This allows writing frames to a stream that may not accept
/// all bytes at once (e.g., non-blocking IO or network streams).
#[derive(Debug)]
pub struct FrameWriter {
    buffer: Vec<u8>,
}

impl FrameWriter {
    /// Creates a new frame writer.
    #[must_use]
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    /// Queues a frame for writing.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the frame is invalid.
    pub fn enqueue(&mut self, frame: &[u8]) -> Result<(), CodecError> {
        if frame.len() < FRAME_HEADER_SIZE {
            return Err(CodecError::InvalidFrameHeader);
        }
        self.buffer.extend_from_slice(frame);
        Ok(())
    }

    /// Writes as many bytes as possible to the writer.
    ///
    /// Returns the number of bytes written. The caller should call
    /// this repeatedly until `is_empty()` returns true.
    ///
    /// # Errors
    ///
    /// Returns `Err` on IO error.
    pub fn write_to<W: Write>(&mut self, writer: &mut W) -> Result<usize, io::Error> {
        if self.buffer.is_empty() {
            return Ok(0);
        }
        let bytes_written = writer.write(&self.buffer)?;
        self.buffer.drain(..bytes_written);
        Ok(bytes_written)
    }

    /// Flushes the writer.
    ///
    /// # Errors
    ///
    /// Returns `Err` on IO error.
    pub fn flush<W: Write>(&mut self, writer: &mut W) -> Result<(), io::Error> {
        writer.flush()
    }

    /// Returns true if the buffer is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Returns the number of bytes waiting to be written.
    #[must_use]
    pub fn len(&self) -> usize {
        self.buffer.len()
    }
}

impl Default for FrameWriter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use ty_plus_protocol::{
        DeadlineUnixMs, HostContext, IdempotencyKey, InvocationContext, ManagedRootContext,
        RequestEnvelope, RequestId, RequestMetadata, SessionId, WireMessage,
        CURRENT_PROTOCOL_VERSION,
    };

    fn test_request() -> WireMessage {
        WireMessage::Request(RequestEnvelope {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            metadata: RequestMetadata {
                request_id: RequestId::parse("test-request-1").unwrap(),
                session_id: SessionId::parse("test-session-1").unwrap(),
                deadline_unix_ms: DeadlineUnixMs::new(2_000_000_000_000),
                cancellable: true,
                idempotency_key: Some(IdempotencyKey::parse("test-key-1").unwrap()),
            },
            context: InvocationContext {
                host_context: HostContext {
                    app_root: "C:\\test-app".to_owned(),
                    support_root: "C:\\test-support".to_owned(),
                    session_id: "test-session-1".to_owned(),
                },
                managed_root: ManagedRootContext::SessionDefault,
            },
            method: ty_plus_protocol::MethodName::parse("test.method").unwrap(),
            payload: serde_json::json!({"key": "value"}),
        })
    }

    #[test]
    fn encode_decode_roundtrip() {
        let message = test_request();
        let frame = encode_frame(&message).unwrap();
        let decoded = decode_frame(&frame).unwrap();
        assert_eq!(message, decoded);
    }

    #[test]
    fn frame_header_is_4_bytes() {
        let message = test_request();
        let frame = encode_frame(&message).unwrap();
        assert!(frame.len() >= FRAME_HEADER_SIZE);
        let length = u32::from_be_bytes(frame[..FRAME_HEADER_SIZE].try_into().unwrap());
        assert_eq!(length as usize, frame.len() - FRAME_HEADER_SIZE);
    }

    #[test]
    fn read_frame_from_stream() {
        let message = test_request();
        let frame = encode_frame(&message).unwrap();
        let mut cursor = Cursor::new(&frame);
        let read_frame = read_frame(&mut cursor).unwrap();
        assert_eq!(frame, read_frame);
    }

    #[test]
    fn write_frame_to_stream() {
        let message = test_request();
        let frame = encode_frame(&message).unwrap();
        let mut output = Vec::new();
        write_frame(&mut output, &frame).unwrap();
        assert_eq!(output, frame);
    }

    #[test]
    fn partial_read_frame() {
        let message = test_request();
        let frame = encode_frame(&message).unwrap();
        let mut reader = FrameReader::new();

        // Feed header only
        let frames = reader.feed(&frame[..FRAME_HEADER_SIZE]).unwrap();
        assert!(frames.is_empty());
        assert!(reader.has_buffered_data());

        // Feed half the payload
        let half = frame.len() / 2;
        let frames = reader.feed(&frame[FRAME_HEADER_SIZE..half]).unwrap();
        assert!(frames.is_empty());

        // Feed rest
        let frames = reader.feed(&frame[half..]).unwrap();
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0], frame);
    }

    #[test]
    fn partial_write_frame() {
        let message = test_request();
        let frame = encode_frame(&message).unwrap();
        let mut writer = FrameWriter::new();

        writer.enqueue(&frame).unwrap();
        assert!(!writer.is_empty());
        assert_eq!(writer.len(), frame.len());

        let mut output = Vec::new();
        // Write only some bytes
        let written = writer.write_to(&mut output).unwrap();
        assert!(written > 0);
        assert!(writer.len() < frame.len());

        // Write rest
        while !writer.is_empty() {
            writer.write_to(&mut output).unwrap();
        }
        assert_eq!(output, frame);
    }

    #[test]
    fn multiple_frames_in_stream() {
        let message1 = test_request();
        let message2 = test_request();
        let frame1 = encode_frame(&message1).unwrap();
        let frame2 = encode_frame(&message2).unwrap();

        let mut combined = frame1.clone();
        combined.extend_from_slice(&frame2);

        let mut reader = FrameReader::new();
        let frames = reader.feed(&combined).unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0], frame1);
        assert_eq!(frames[1], frame2);
    }

    #[test]
    fn invalid_header_high_bit_rejected() {
        let mut frame = vec![0x80, 0x00, 0x00, 0x00]; // High bit set
        frame.extend_from_slice(b"test");
        let result = decode_frame(&frame);
        assert!(matches!(result, Err(CodecError::InvalidFrameHeader)));
    }

    #[test]
    fn empty_frame_rejected() {
        let result = decode_frame(&[]);
        assert!(matches!(result, Err(CodecError::InvalidFrameHeader)));
    }

    #[test]
    fn truncated_frame_rejected() {
        let message = test_request();
        let frame = encode_frame(&message).unwrap();
        let truncated = &frame[..frame.len() - 1];
        let result = decode_frame(truncated);
        assert!(matches!(result, Err(CodecError::InvalidFrameHeader)));
    }
}
