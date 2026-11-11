use std::fmt;
use std::io::{self, Read, Write};

use ty_plus_protocol::{
    MAX_FRAME_BYTES, ValidationError, WireDecodeError, WireMessage, validate_frame_size,
};

#[derive(Debug)]
pub enum CodecError {
    Io(io::Error),
    Json(serde_json::Error),
    Wire(WireDecodeError),
    Validation(ValidationError),
    FrameTooLarge { length: usize, max: usize },
}

impl fmt::Display for CodecError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "frame I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "frame JSON encoding failed: {error}"),
            Self::Wire(error) => write!(formatter, "wire frame rejected: {error}"),
            Self::Validation(error) => write!(formatter, "frame validation failed: {error}"),
            Self::FrameTooLarge { length, max } => {
                write!(
                    formatter,
                    "frame is too large: {length} bytes (maximum {max})"
                )
            }
        }
    }
}

impl std::error::Error for CodecError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Wire(error) => Some(error),
            Self::Validation(error) => Some(error),
            Self::FrameTooLarge { .. } => None,
        }
    }
}

impl From<io::Error> for CodecError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// Reads one complete big-endian length-prefixed JSON message.
pub fn read_message<R: Read + ?Sized>(reader: &mut R) -> Result<Option<WireMessage>, CodecError> {
    let mut prefix = [0_u8; 4];
    match reader.read(&mut prefix[..1])? {
        0 => return Ok(None),
        1 => reader.read_exact(&mut prefix[1..])?,
        _ => unreachable!("one-byte probe cannot read more than one byte"),
    }
    let length = u32::from_be_bytes(prefix) as usize;
    if length > MAX_FRAME_BYTES {
        return Err(CodecError::FrameTooLarge {
            length,
            max: MAX_FRAME_BYTES,
        });
    }
    let mut bytes = vec![0_u8; length];
    reader.read_exact(&mut bytes)?;
    WireMessage::decode_json_frame(&bytes)
        .map(Some)
        .map_err(CodecError::Wire)
}

/// Writes one complete big-endian length-prefixed JSON message and flushes it.
pub fn write_message<W: Write + ?Sized>(
    writer: &mut W,
    message: &WireMessage,
) -> Result<(), CodecError> {
    let bytes = serde_json::to_vec(message).map_err(CodecError::Json)?;
    validate_frame_size(bytes.len()).map_err(CodecError::Validation)?;
    let length = u32::try_from(bytes.len()).map_err(|_| CodecError::FrameTooLarge {
        length: bytes.len(),
        max: MAX_FRAME_BYTES,
    })?;
    writer.write_all(&length.to_be_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()?;
    Ok(())
}
