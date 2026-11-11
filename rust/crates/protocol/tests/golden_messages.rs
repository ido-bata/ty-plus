use serde_json::Value;
use ty_plus_protocol::{
    AcceptedEvent, DeadlineUnixMs, EventEnvelope, EventPayload, GenerateThumbnailResponse,
    IdempotencyKey, IdempotencyPolicy, InvocationContext, LookupThumbnailRequest,
    ManagedRootContext, MethodName, ProtocolVersion, RequestEnvelope, RequestId, RequestMetadata,
    ResponseEnvelope, ResponseOutcome, SessionId, Warning, WireMessage,
};

const FIXTURE_NOW_UNIX_MS: u64 = 1_700_000_000_000;

fn request_id() -> RequestId {
    RequestId::parse("request-fixture").unwrap()
}

fn session_id() -> SessionId {
    SessionId::parse("session-fixture").unwrap()
}

#[test]
fn accepted_event_and_invocation_context_are_round_trippable() {
    let request: WireMessage = serde_json::from_value(serde_json::json!({
        "kind": "request",
        "message": {
            "protocol_version": { "major": 1, "minor": 0 },
            "metadata": {
                "request_id": "request-1",
                "session_id": "session-1",
                "deadline_unix_ms": 2000,
                "cancellable": true
            },
            "context": {
                "host_context": {
                    "app_root": "C:\\Program Files\\Adobe\\After Effects 2024",
                    "support_root": "C:\\Users\\test\\AppData\\Roaming\\Adobe",
                    "session_id": "session-1"
                },
                "managed_root": "session_default"
            },
            "method": "storage.read",
            "payload": {}
        }
    }))
    .expect("request fixture must decode");
    let accepted = WireMessage::Event(EventEnvelope {
        protocol_version: ty_plus_protocol::CURRENT_PROTOCOL_VERSION,
        session_id: SessionId::parse("session-1").unwrap(),
        request_id: RequestId::parse("request-1").unwrap(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: RequestId::parse("request-1").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
        }),
    });
    assert_eq!(
        request,
        serde_json::from_value(serde_json::to_value(&request).unwrap()).unwrap()
    );
    assert_eq!(
        accepted,
        serde_json::from_value(serde_json::to_value(&accepted).unwrap()).unwrap()
    );
}

#[test]
fn accepted_event_rejects_mismatched_identity() {
    let event = EventEnvelope {
        protocol_version: ProtocolVersion::new(1, 0),
        session_id: SessionId::parse("session-1").unwrap(),
        request_id: RequestId::parse("request-1").unwrap(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: RequestId::parse("request-2").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
        }),
    };

    assert_eq!(
        event.validate(),
        Err(ty_plus_protocol::ValidationError::InvalidFormat {
            field: "accepted.identity",
        })
    );
}

fn assert_golden_roundtrip(message: &WireMessage, fixture: &str) {
    let expected: Value = serde_json::from_str(fixture).unwrap();
    assert_eq!(serde_json::to_value(message).unwrap(), expected);

    let decoded = WireMessage::decode_json_frame(fixture.as_bytes()).unwrap();
    assert_eq!(&decoded, message);
}

#[test]
fn request_envelope_matches_golden_json_and_validates_metadata() {
    let request = RequestEnvelope {
        protocol_version: ProtocolVersion::new(1, 0),
        metadata: RequestMetadata {
            request_id: request_id(),
            session_id: session_id(),
            deadline_unix_ms: DeadlineUnixMs::new(FIXTURE_NOW_UNIX_MS + 60_000),
            cancellable: true,
            idempotency_key: Some(IdempotencyKey::parse("write-fixture").unwrap()),
        },
        context: InvocationContext {
            host_context: ty_plus_protocol::HostContext {
                app_root: "C:\\Program Files\\Adobe\\After Effects 2024".to_owned(),
                support_root: "C:\\Users\\test\\AppData\\Roaming\\Adobe".to_owned(),
                session_id: "session-fixture".to_owned(),
            },
            managed_root: ManagedRootContext::SessionDefault,
        },
        method: MethodName::parse("storage.write").unwrap(),
        payload: Value::Null,
    };
    request
        .validate(FIXTURE_NOW_UNIX_MS, IdempotencyPolicy::Required)
        .unwrap();
    assert_golden_roundtrip(
        &WireMessage::Request(request),
        include_str!("fixtures/request.json"),
    );
}

#[test]
fn response_envelope_matches_golden_json() {
    let response = ResponseEnvelope {
        protocol_version: ProtocolVersion::new(1, 0),
        request_id: request_id(),
        session_id: session_id(),
        outcome: ResponseOutcome::Success {
            payload: Value::Null,
            warnings: vec![Warning::new(
                "result.partial",
                "Some optional entries were unavailable.",
            )
            .unwrap()],
        },
    };
    assert_golden_roundtrip(
        &WireMessage::Response(response),
        include_str!("fixtures/response.json"),
    );
}

#[test]
fn event_envelope_matches_golden_json() {
    let event = EventEnvelope {
        protocol_version: ProtocolVersion::new(1, 0),
        session_id: session_id(),
        request_id: request_id(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: request_id(),
            session_id: session_id(),
        }),
    };
    assert_golden_roundtrip(
        &WireMessage::Event(event),
        include_str!("fixtures/event.json"),
    );
}

#[test]
fn optional_and_null_fields_accept_the_javascript_safe_integer_boundary() {
    let decoded =
        WireMessage::decode_json_frame(include_bytes!("fixtures/optional-null-event.json"))
            .unwrap();

    let WireMessage::Event(event) = decoded else {
        panic!("fixture must contain an event");
    };
    let EventPayload::Progress(progress) = event.payload else {
        panic!("fixture must contain a progress event");
    };

    assert_eq!(progress.sequence, 9_007_199_254_740_991);
    assert_eq!(progress.completed_units, None);
    assert_eq!(progress.total_units, None);
    assert_eq!(progress.user_safe_detail, None);
}

#[test]
fn rust_preserves_uint64_values_that_javascript_must_reject() {
    let decoded =
        WireMessage::decode_json_frame(include_bytes!("fixtures/unsafe-integer-event.json"))
            .unwrap();

    let WireMessage::Event(event) = decoded else {
        panic!("fixture must contain an event");
    };
    let EventPayload::Progress(progress) = event.payload else {
        panic!("fixture must contain a progress event");
    };

    assert_eq!(progress.sequence, 9_007_199_254_740_993);
}

#[test]
fn unknown_fixture_fields_fail_closed() {
    assert!(
        WireMessage::decode_json_frame(include_bytes!("fixtures/unknown-field-request.json"),)
            .is_err()
    );
}

#[test]
fn removed_ae_version_field_is_not_accepted_as_a_canonical_request_shape() {
    let mut stale: Value = serde_json::from_str(include_str!("fixtures/request.json")).unwrap();
    stale["message"]["context"]["host_context"]["ae_version"] = Value::String("24.0.0".to_owned());
    let stale_bytes = serde_json::to_vec(&stale).unwrap();

    assert!(WireMessage::decode_json_frame(&stale_bytes).is_err());
}

#[test]
fn request_validation_uses_canonical_method_policy_instead_of_caller_metadata() {
    // Production break caught: callers must not forge cancellability or attach
    // forbidden idempotency metadata for a canonical operation.
    let mut request: RequestEnvelope = serde_json::from_value(serde_json::json!({
        "protocol_version": { "major": 1, "minor": 0 },
        "metadata": {
            "request_id": "request-policy",
            "session_id": "session-policy",
            "deadline_unix_ms": 1700000060000u64,
            "cancellable": false,
            "idempotency_key": "forged"
        },
        "context": {
            "host_context": {
                "app_root": "/Applications/After Effects",
                "support_root": "/tmp/support",
                "session_id": "session-policy"
            },
            "managed_root": "session_default"
        },
        "method": "online.catalog.search",
        "payload": { "q": "ease" }
    }))
    .unwrap();
    assert!(request
        .validate(1700000000000, IdempotencyPolicy::Forbidden)
        .is_err());

    request.metadata.cancellable = true;
    assert!(request
        .validate(1700000000000, IdempotencyPolicy::Forbidden)
        .is_ok());
}

#[test]
fn canonical_download_policy_rejects_idempotency_key_despite_permissive_fallback() {
    // Production break caught: canonical policy authority must override a caller
    // fallback and forbid idempotency metadata on non-idempotent downloads.
    let request: RequestEnvelope = serde_json::from_value(serde_json::json!({
        "protocol_version": { "major": 1, "minor": 0 },
        "metadata": {
            "request_id": "request-download-policy",
            "session_id": "session-download-policy",
            "deadline_unix_ms": 1700000060000u64,
            "cancellable": true,
            "idempotency_key": "forged"
        },
        "context": {
            "host_context": {
                "app_root": "/Applications/After Effects",
                "support_root": "/tmp/support",
                "session_id": "session-download-policy"
            },
            "managed_root": "session_default"
        },
        "method": "online.download",
        "payload": { "presetId": "preset-1", "destination": "downloads/preset.ffx" }
    }))
    .unwrap();
    assert!(request
        .validate(1700000000000, IdempotencyPolicy::Optional)
        .is_err());
}

#[test]
fn lookup_thumbnail_request_matches_schema() {
    let json = include_str!("fixtures/lookup_thumbnail_request.json");
    let msg: LookupThumbnailRequest = serde_json::from_str(json).unwrap();
    assert_eq!(msg.source_path, "/host/foo.png");
}

#[test]
fn generate_thumbnail_response_round_trips() {
    let json = include_str!("fixtures/generate_thumbnail_response.json");
    let msg: GenerateThumbnailResponse = serde_json::from_str(json).unwrap();
    assert!(msg.cache_path.ends_with(".webp"));
}
