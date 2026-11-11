use std::io::{self, Read};

use ty_plus_operation_worker::{CodecError, read_message, write_message};
use ty_plus_protocol::{
    AcceptedEvent, EventEnvelope, EventPayload, MAX_FRAME_BYTES, RequestId, SessionId, WireMessage,
};

struct FragmentedReader {
    bytes: Vec<u8>,
    offset: usize,
    chunk_size: usize,
}

impl FragmentedReader {
    fn new(bytes: Vec<u8>, chunk_size: usize) -> Self {
        Self {
            bytes,
            offset: 0,
            chunk_size,
        }
    }
}

impl Read for FragmentedReader {
    fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
        if self.offset == self.bytes.len() {
            return Ok(0);
        }
        let amount = self
            .chunk_size
            .min(destination.len())
            .min(self.bytes.len() - self.offset);
        destination[..amount].copy_from_slice(&self.bytes[self.offset..self.offset + amount]);
        self.offset += amount;
        Ok(amount)
    }
}

fn valid_message_bytes() -> Vec<u8> {
    serde_json::to_vec(&WireMessage::Event(EventEnvelope {
        protocol_version: ty_plus_protocol::CURRENT_PROTOCOL_VERSION,
        session_id: SessionId::parse("session-1").unwrap(),
        request_id: RequestId::parse("request-1").unwrap(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: RequestId::parse("request-1").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
        }),
    }))
    .unwrap()
}

#[test]
fn read_message_accepts_fragmented_big_endian_frame() {
    let json = valid_message_bytes();
    let mut input = Vec::from((json.len() as u32).to_be_bytes());
    input.extend_from_slice(&json);
    let message = read_message(&mut FragmentedReader::new(input, 1));
    assert!(message.is_ok());
    assert!(message.unwrap().is_some());
}

#[test]
fn read_message_returns_none_at_clean_eof() {
    assert!(read_message(&mut io::empty()).unwrap().is_none());
}

#[test]
fn read_message_rejects_truncated_frame_at_eof() {
    let input = [0_u8, 0, 0, 1];
    assert!(matches!(
        read_message(&mut &input[..]),
        Err(CodecError::Io(_))
    ));
}

#[test]
fn read_message_rejects_malformed_json() {
    let json = br#"{\"kind\":\"event\",\"message\":}"#;
    let mut input = Vec::from((json.len() as u32).to_be_bytes());
    input.extend_from_slice(json);
    assert!(matches!(
        read_message(&mut &input[..]),
        Err(CodecError::Wire(_))
    ));
}

#[test]
fn read_message_rejects_oversized_frame_before_allocation() {
    let input = ((MAX_FRAME_BYTES as u32) + 1).to_be_bytes();
    assert!(matches!(
        read_message(&mut &input[..]),
        Err(CodecError::FrameTooLarge { .. })
    ));
}

#[test]
fn write_message_emits_big_endian_length_and_json_bytes() {
    let message = WireMessage::Event(EventEnvelope {
        protocol_version: ty_plus_protocol::CURRENT_PROTOCOL_VERSION,
        session_id: SessionId::parse("session-1").unwrap(),
        request_id: RequestId::parse("request-1").unwrap(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: RequestId::parse("request-1").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
        }),
    });
    let expected = serde_json::to_vec(&message).unwrap();
    let mut output = Vec::new();
    write_message(&mut output, &message).unwrap();
    assert_eq!(
        u32::from_be_bytes(output[..4].try_into().unwrap()) as usize,
        expected.len()
    );
    assert_eq!(&output[4..], expected.as_slice());
}
