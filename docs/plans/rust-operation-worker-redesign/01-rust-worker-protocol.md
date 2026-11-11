# Rust operation worker protocol and process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `rust/apps/operation-worker/` を composition root とする one-shot Rust process と、accepted / progress / final / EOF / cancel を追跡可能にする generated protocol を実装する。

**Architecture:** Rust source の wire 型を schema の正として生成し、CEP Node と worker は 4-byte big-endian length prefix + UTF-8 JSON frame を共有する。worker は一つの invocation を検証・実行し、accepted、単調な progress、唯一の final response、EOF の後に終了する。storage、distribution、CEP runner の実装はそれぞれの sub-project plan が所有し、この計画は protocol と worker 側の composition に限定する。

**Tech Stack:** Rust 1.85.0、TypeScript、React 19、CEP Node、ExtendScript、Bun 1.3.10、Vitest、Serde、Schemars。

**Spec:** [`../../architecture/runtime/operation-worker.md`](../../architecture/runtime/operation-worker.md)、[`../../decisions/2026-08-21-rust-operation-worker.md`](../../decisions/2026-08-21-rust-operation-worker.md)、[`.superpowers/sdd/architecture/operation-worker-rust-plan-audit.md`](../../../.superpowers/sdd/architecture/operation-worker-rust-plan-audit.md)

## Global Constraints

- Rust の責務名と composition root は `Rust operation worker` / `rust/apps/operation-worker/` とし、`native`、`companion runtime`、daemon を責務名にしない。
- 一つの worker は一つの invocation だけを処理し、final response と EOF の後に終了する。
- endpoint discovery、named pipe、UDS、heartbeat、single-instance process、application control root を導入しない。
- request、HostContext、managed root を argv / environment variable に入れない。
- binary は installer manifest と CEP extension root だけから解決し、registry、`PATH`、`appRoot`、固定絶対 path を探索しない。
- Windows と macOS の分岐は同じ責務の近接ファイルに同時実装し、片方を fallback、stub、後続 task にしない。
- default managed root は各 AE session support root から導出し、AE version を process、protocol、storage key に含めない。
- explicit shared root はユーザーが同じ settings location を明示選択した場合だけ使用する。
- 永続物は visible managed tree に置き、OS temp は invocation 完了に不要な disposable cache / scratch bytes に限定する。
- offline-independent operation は offline でも動作し、aescripts verification の期限到来だけを online requirement にする。
- dev / release は同じ real binary を使い、JS、ExtendScript、旧 CLI への fallback を設けない。
- `bun run ci` が実装完了の canonical gate であり、skip、`.only`、ignore、抑制、終了 code 無視は禁止する。
- storage は `03-storage-distribution-release.md`、CEP は `02-cep-runner-cutover.md` の責務とし、本計画で同じ実装を重複させない。

## Task graph

```text
OW-BASE-001
  -> OW-PRO-001 -> OW-PRO-002
  -> OW-RUST-001 -> OW-RUST-002
  -> OW-STO-001 -> OW-STO-002 -> OW-STO-003
  -> OW-RUST-003 (OW-LIC-001 は unblocked の場合のみ)
  -> OW-CEP-009 + OW-DIST-003
  -> OW-RUST-004
```

`OW-RUST-003` は `OW-STO-001` と `OW-STO-002` の public API を consumes するだけで、lock / transaction / retention / distribution を実装しない。`OW-LIC-001` が blocked の間は licensing provider を実装せず、offline-independent adapter とその test のみを進める。

### Task OW-PRO-001: protocol lifecycle types and stable errors

**Files:**
- Modify: `rust/crates/protocol/src/message.rs`
- Modify: `rust/crates/protocol/src/error.rs`
- Modify: `rust/crates/protocol/src/host_context.rs`
- Modify: `rust/crates/protocol/src/lib.rs`
- Modify: `rust/crates/protocol/src/schema.rs`
- Modify: `rust/crates/protocol/tests/golden_messages.rs`
- Modify: `rust/crates/protocol/tests/fixtures/request.json`
- Modify: `rust/crates/protocol/tests/fixtures/event.json`
- Modify: `rust/crates/protocol/tests/fixtures/error-codes.json`

**Interfaces:**
- Consumes: existing `RequestEnvelope`, `ResponseEnvelope`, `EventEnvelope`, `WireMessage`, `HostContext`, `ProgressState`, `RequestId`, `SessionId`, `CapabilitySet`。
- Produces: `InvocationContext`、`ManagedRootContext`、`AcceptedEvent`、`EventPayload::Accepted`、`StableErrorCode::{ProtocolViolation,WorkerCrashed,WorkerForcedTermination}`。`RequestEnvelope` は `context: InvocationContext` を持つ。

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum ManagedRootContext {
    SessionDefault,
    ExplicitShared { root: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvocationContext {
    pub host_context: HostContext,
    pub managed_root: ManagedRootContext,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcceptedEvent {
    pub request_id: RequestId,
    pub session_id: SessionId,
}

pub enum EventPayload {
    Accepted(AcceptedEvent),
    Progress(ProgressEvent),
    CancellationAcknowledged(CancellationAcknowledgement),
}

pub enum WireMessage {
    Request(RequestEnvelope),
    Cancel(CancelRequest),
    Response(ResponseEnvelope),
    Event(EventEnvelope),
}
```

- [ ] **Step 1: Write the failing golden test for context and accepted lifecycle.**

```rust
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
    })).expect("request fixture must decode");
    let accepted = WireMessage::Event(EventEnvelope {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        session_id: SessionId::parse("session-1").unwrap(),
        request_id: RequestId::parse("request-1").unwrap(),
        payload: EventPayload::Accepted(AcceptedEvent {
            request_id: RequestId::parse("request-1").unwrap(),
            session_id: SessionId::parse("session-1").unwrap(),
        }),
    });
    assert_eq!(request, serde_json::from_value(serde_json::to_value(request).unwrap()).unwrap());
    assert_eq!(accepted, serde_json::from_value(serde_json::to_value(accepted).unwrap()).unwrap());
}
```

- [ ] **Step 2: Run the focused RED test and record the expected compile failure.**

Run: `cargo test -p ty-plus-protocol --test golden_messages accepted_event_and_invocation_context_are_round_trippable`

Expected: `FAIL` because `InvocationContext`, `AcceptedEvent`, and the `context` request field are not defined yet.

- [ ] **Step 3: Add the lifecycle types and stable error variants with fail-closed validation.**

```rust
pub enum StableErrorCode {
    InvalidRequest,
    IncompatibleProtocol,
    ProtocolViolation,
    WorkerCrashed,
    WorkerForcedTermination,
    HostContextMissing,
    // existing domain variants remain unchanged
}

impl EventEnvelope {
    pub fn validate(&self) -> Result<(), ValidationError> {
        match &self.payload {
            EventPayload::Accepted(accepted) => {
                if accepted.request_id != self.request_id || accepted.session_id != self.session_id {
                    return Err(ValidationError::InvalidFormat { field: "accepted.identity" });
                }
                Ok(())
            }
            EventPayload::Progress(progress) => progress.validate(),
            EventPayload::CancellationAcknowledged(_) => Ok(()),
        }
    }
}
```

`StableErrorCode` の既存順序と既存 domain code は維持し、worker crash / forced termination を `Cancelled` や `InternalError` に畳み込まない。

- [ ] **Step 4: Run protocol unit and golden tests as GREEN.**

Run: `cargo test -p ty-plus-protocol --test golden_messages`

Expected: `PASS` with the new request context, accepted event, identity validation, and error-code fixture.

- [ ] **Step 5: Review the contract for boundary ownership and commit only these paths.**

Review: `rg -n "endpoint|heartbeat|named pipe|UDS|child_process|storage lock|transaction" rust/crates/protocol/src rust/crates/protocol/tests` returns no transport or domain implementation; `git diff --check` returns no output.

```powershell
git add -- rust/crates/protocol/src/message.rs rust/crates/protocol/src/error.rs rust/crates/protocol/src/host_context.rs rust/crates/protocol/src/lib.rs rust/crates/protocol/src/schema.rs rust/crates/protocol/tests/golden_messages.rs rust/crates/protocol/tests/fixtures/request.json rust/crates/protocol/tests/fixtures/event.json rust/crates/protocol/tests/fixtures/error-codes.json
git commit -m "feat(protocol): define one-shot worker lifecycle"
```

`RESTART: task=OW-PRO-001; next=cargo test -p ty-plus-protocol --test golden_messages accepted_event_and_invocation_context_are_round_trippable; last_success=protocol fixture GREEN; last_failure=none; generated=none; safe_switch=yes`

### Task OW-PRO-002: schema and TypeScript generated contract

**Files:**
- Modify (generated): `rust/crates/protocol/generated/wire.schema.json`
- Modify (generated): `src/management/ipc/generated/wire.ts`
- Modify (generated): `src/management/ipc/generated/index.ts`
- Modify: `src/management/ipc/generated/wire-contract.test.ts`
- Modify: `scripts/generate/generate-rust-protocol-schema.ts`
- Modify: `scripts/generate/generate-typescript-protocol.ts` only when the new schema construct is not representable by the existing generator
- Modify: `package.json` to add the canonical schema generation scripts

**Interfaces:**
- Consumes: OW-PRO-001 の Rust wire types、`schema::generate_schema_catalog()`、`scripts/generate/generate-typescript-protocol.ts`。
- Produces: generated `InvocationContext`、`ManagedRootContext`、`AcceptedEvent`、`EventPayload`、`WireMessage::Cancel`、stable error string union。TypeScript は Rust source を再定義せず、generated `wire.ts` だけを import する。

```ts
import type { AcceptedEvent, InvocationContext, WireMessage } from "./wire";

export function isAccepted(message: WireMessage): message is Extract<WireMessage, { kind: "event" }> {
	return message.kind === "event" && message.message.payload.event === "accepted";
}

export type OperationInvocation = {
	context: InvocationContext;
	request: Extract<WireMessage, { kind: "request" }>;
	accepted: AcceptedEvent;
};
```

- [ ] **Step 1: Add the schema-backed TypeScript contract test before regeneration.**

```ts
it("accepts accepted events and invocation root selection from the generated schema", () => {
	const accepted: WireMessage = {
		kind: "event",
		message: {
			protocol_version: { major: 1, minor: 0 },
			session_id: "session-1",
			request_id: "request-1",
			payload: {
				event: "accepted",
				data: { request_id: "request-1", session_id: "session-1" },
			},
		},
	};
	assertWireFixture(accepted);
	expect(accepted.message.payload.event).toBe("accepted");
});
```

- [ ] **Step 2: Run the generator check to capture the expected stale-schema failure.**

Run: `bun run generate:rust-protocol-schema -- --check`

Expected: `FAIL` because checked-in Rust schema does not yet include the lifecycle declarations.

- [ ] **Step 3: Regenerate schema and TypeScript from the Rust source.**

Add these exact package scripts before running generation:

```json
"generate:rust-protocol-schema": "bun scripts/generate/generate-rust-protocol-schema.ts",
"generate:typescript-protocol": "bun scripts/generate/generate-typescript-protocol.ts",
```

Run:

```powershell
bun run generate:rust-protocol-schema
bun run generate:typescript-protocol
```

Expected: `PASS`; generated files contain `InvocationContext`, `ManagedRootContext`, `AcceptedEvent`, and `ProtocolViolation` / `WorkerCrashed` / `WorkerForcedTermination` without handwritten duplicates.

- [ ] **Step 4: Run schema, generated-contract, and type checks as GREEN.**

```powershell
$generated = @(
    "rust/crates/protocol/generated/wire.schema.json",
    "src/management/ipc/generated/wire.ts",
    "src/management/ipc/generated/index.ts"
)
bun run generate:rust-protocol-schema -- --check
bun run generate:typescript-protocol -- --check
$firstHash = (Get-FileHash $generated | Sort-Object Path | ConvertTo-Json -Compress)
bun run generate:rust-protocol-schema
bun run generate:typescript-protocol
$secondHash = (Get-FileHash $generated | Sort-Object Path | ConvertTo-Json -Compress)
if ($firstHash -ne $secondHash) { throw "protocol generation is not deterministic" }
bun run vitest run src/management/ipc/generated/wire-contract.test.ts
cargo test -p ty-plus-protocol --test golden_messages
```

Expected: all commands `PASS`; both `--check` commands confirm current output, the two generation hash snapshots match, and the Windows/macOS path fixtures validate through the same schema.

- [ ] **Step 5: Review generated ownership and commit exact generated paths.**

Review: `rg -n "type InvocationContext|type AcceptedEvent|worker_crashed|worker_forced_termination" src/management/ipc/generated/wire.ts rust/crates/protocol/generated/wire.schema.json` finds each declaration once; `git diff --check` returns no output.

```powershell
git add -- rust/crates/protocol/generated/wire.schema.json src/management/ipc/generated/wire.ts src/management/ipc/generated/index.ts src/management/ipc/generated/wire-contract.test.ts scripts/generate/generate-rust-protocol-schema.ts scripts/generate/generate-typescript-protocol.ts package.json
git commit -m "chore(protocol): generate worker lifecycle contracts"
```

`RESTART: task=OW-PRO-002; next=bun run generate:rust-protocol-schema -- --check; last_success=generated schema GREEN; last_failure=none; generated=rust/crates/protocol/generated/wire.schema.json,src/management/ipc/generated/wire.ts,src/management/ipc/generated/index.ts; safe_switch=yes`

### Task OW-RUST-001: operation-worker app and 4-byte frame codec

**Files:**
- Create: `rust/apps/operation-worker/Cargo.toml`
- Create: `rust/apps/operation-worker/src/lib.rs`
- Create: `rust/apps/operation-worker/src/main.rs`
- Create: `rust/apps/operation-worker/src/codec.rs`
- Create: `rust/apps/operation-worker/tests/codec.rs`
- Modify: `rust/Cargo.toml` workspace members only
- Modify (generated): `rust/Cargo.lock` only when Cargo records the new workspace package

**Interfaces:**
- Consumes: OW-PRO-002 generated schema contract and Rust `WireMessage`, `MAX_FRAME_BYTES`, `WireMessage::decode_json_frame()`。
- Produces: `read_message<R: Read>() -> Result<Option<WireMessage>, CodecError>`、`write_message<W: Write>() -> Result<(), CodecError>`。`main.rs` is a stdin/stdout process entrypoint and does not create a server, endpoint, or reusable runtime.

```rust
pub fn read_message<R: Read>(reader: &mut R) -> Result<Option<WireMessage>, CodecError> {
    let mut prefix = [0_u8; 4];
    match reader.read(&mut prefix[..1])? {
        0 => return Ok(None),
        1 => reader.read_exact(&mut prefix[1..])?,
        _ => unreachable!("one-byte probe cannot read more than one byte"),
    }
    let length = u32::from_be_bytes(prefix) as usize;
    if length > MAX_FRAME_BYTES {
        return Err(CodecError::FrameTooLarge { length, max: MAX_FRAME_BYTES });
    }
    let mut bytes = vec![0_u8; length];
    reader.read_exact(&mut bytes)?;
    WireMessage::decode_json_frame(&bytes).map(Some).map_err(CodecError::Wire)
}

pub fn write_message<W: Write>(writer: &mut W, message: &WireMessage) -> Result<(), CodecError> {
    let bytes = serde_json::to_vec(message).map_err(CodecError::Json)?;
    validate_frame_size(bytes.len()).map_err(CodecError::Validation)?;
    writer.write_all(&(u32::try_from(bytes.len()).map_err(|_| CodecError::FrameTooLarge {
        length: bytes.len(), max: MAX_FRAME_BYTES,
    })?).to_be_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()?;
    Ok(())
}
```

- [ ] **Step 1: Write codec RED tests for fragmented prefix, EOF, malformed JSON, and 1 MiB limit.**

```rust
#[test]
fn read_message_accepts_fragmented_big_endian_frame() {
	let json = br#"{\"kind\":\"request\",\"message\":{}}"#;
	let mut input = Vec::from((json.len() as u32).to_be_bytes());
	input.extend_from_slice(json);
	let message = read_message(&mut FragmentedReader::new(input, 1));
	assert!(message.is_ok());
}

#[test]
fn read_message_rejects_oversized_frame_before_allocation() {
	let input = ((MAX_FRAME_BYTES as u32) + 1).to_be_bytes();
	assert!(matches!(read_message(&mut &input[..]), Err(CodecError::FrameTooLarge { .. })));
}
```

- [ ] **Step 2: Run the focused codec test and record the missing crate/API failure.**

Run: `cargo test -p ty-plus-operation-worker --test codec`

Expected: `FAIL` because `ty-plus-operation-worker`, `read_message`, and `write_message` do not exist yet.

- [ ] **Step 3: Create the app crate and implement only stdin/stdout framing.**

```toml
[package]
name = "ty-plus-operation-worker"
version = "0.1.0"
edition = "2024"

[dependencies]
serde_json = "1"
ty-plus-protocol = { path = "../../crates/protocol" }
```

`main.rs` calls `run_once` only after OW-RUST-002; until then it returns a typed startup error. It must not read request data from argv or environment variables.

- [ ] **Step 4: Run codec tests as GREEN and verify both target builds compile.**

Run: `cargo test -p ty-plus-operation-worker --test codec; cargo check -p ty-plus-operation-worker --target x86_64-pc-windows-msvc; cargo check -p ty-plus-operation-worker --target x86_64-apple-darwin`

Expected: codec tests `PASS`; available targets compile with the same codec and no platform transport module.

- [ ] **Step 5: Review transport scope and commit only the new app/codec paths.**

Review: `rg -n "TcpListener|UnixListener|named pipe|UDS|endpoint|heartbeat|std::env::args|var_os" rust/apps/operation-worker` returns no output; `cargo fmt --check` passes.

```powershell
git add -- rust/apps/operation-worker/Cargo.toml rust/apps/operation-worker/src/lib.rs rust/apps/operation-worker/src/main.rs rust/apps/operation-worker/src/codec.rs rust/apps/operation-worker/tests/codec.rs rust/Cargo.toml
git commit -m "feat(worker): add one-shot process entrypoint"
```

`RESTART: task=OW-RUST-001; next=cargo test -p ty-plus-operation-worker --test codec; last_success=codec GREEN; last_failure=none; generated=none; safe_switch=yes`

### Task OW-RUST-002: accepted/progress/final/EOF/cancel state machine

**Files:**
- Create: `rust/apps/operation-worker/src/lifecycle.rs`
- Create: `rust/apps/operation-worker/tests/lifecycle.rs`
- Modify: `rust/apps/operation-worker/src/lib.rs`
- Modify: `rust/apps/operation-worker/src/main.rs`
- Modify: `rust/apps/operation-worker/src/codec.rs` only for lifecycle error propagation

**Interfaces:**
- Consumes: OW-RUST-001 `read_message` / `write_message`、OW-PRO-001 `EventPayload`、`StableErrorCode`、`ProgressState`、`CancelRequest`。
- Produces: `run_once<R: Read, W: Write>(reader, writer, deps) -> Result<WorkerExit, WorkerError>`、`WorkerDependencies`、`OperationExecutor`、`EventSink`、`WorkerExit::{FinalResponseSent,RejectedBeforeAccepted}`。Accepted 前に protocol/build/capability/session context を検証し、final response なしの EOF は `WorkerCrashed` 相当の exit/error へ map する。

```rust
pub enum WorkerExit {
    FinalResponseSent,
    RejectedBeforeAccepted,
}

pub trait OperationExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        input: &mut dyn Read,
        output: &mut dyn Write,
    ) -> Result<ResponseEnvelope, WorkerError>;
}

pub struct WorkerDependencies<'a> {
    pub executor: &'a dyn OperationExecutor,
}

pub trait EventSink {
    fn progress(&mut self, event: EventEnvelope) -> Result<(), WorkerError>;
}

pub fn run_once<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    deps: &WorkerDependencies<'_>,
) -> Result<WorkerExit, WorkerError> {
    let Some(WireMessage::Request(request)) = read_message(reader)? else {
        return Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
    };
    validate_request_before_accept(&request, deps)?;
    write_message(writer, &accepted_event(&request))?;
    let final_response = deps.execute(request, reader, writer)?;
    write_message(writer, &WireMessage::Response(final_response))?;
    match read_message(reader)? {
        None => Ok(WorkerExit::FinalResponseSent),
        Some(_) => Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation)),
    }
}
```

The implementation must use an internal operation callback in `WorkerDependencies` to produce the final response; the callback is not a second wire DTO and never writes request/result payloads to stderr.

- [ ] **Step 1: Write lifecycle RED tests for accepted ordering, monotonic progress, exactly one final, EOF crash, and cancel acknowledgement.**

```rust
#[test]
fn run_once_emits_accepted_progress_final_then_eof() {
    let input = frames(&[request_frame(), cancel_frame(), end_frame()]);
    let output = run_fixture(input);
    assert_eq!(kinds(&output), ["accepted", "progress", "response"]);
}

#[test]
fn run_once_maps_eof_before_final_to_worker_crashed() {
    let input = frames(&[request_frame(), accepted_only_frame()]);
    assert!(matches!(run_fixture_result(input), Err(WorkerError::Crash(StableErrorCode::WorkerCrashed))));
}

#[test]
fn run_once_rejects_progress_sequence_regression_and_duplicate_final() {
    assert_protocol_failure(frames(&[request_frame(), progress_frame(2), progress_frame(1)]));
    assert_protocol_failure(frames(&[request_frame(), final_frame(), final_frame()]));
}
```

- [ ] **Step 2: Run the focused RED test and record missing lifecycle APIs.**

Run: `cargo test -p ty-plus-operation-worker --test lifecycle`

Expected: `FAIL` because `run_once`, `WorkerDependencies`, accepted validation, cancellation handling, and `WorkerExit` are not defined.

- [ ] **Step 3: Implement the state machine with stable failure mapping.**

```rust
enum LifecycleState {
    AwaitingRequest,
    Accepted { last_progress: Option<ProgressState>, cancel_requested: bool },
    FinalSent,
}

fn accept_progress(
    state: Option<ProgressState>,
    event: EventEnvelope,
) -> Result<ProgressState, WorkerError> {
    let EventPayload::Progress(next) = event.payload else {
        return Err(WorkerError::Protocol(StableErrorCode::ProtocolViolation));
    };
    match state {
        None => ProgressState::start(next).map_err(WorkerError::Validation),
        Some(mut previous) => {
            previous.advance(next).map_err(WorkerError::Validation)?;
            Ok(previous)
        }
    }
}
```

Cancel is acknowledged with `CancellationDecision::for_stage`; a cancellation observed before `Committing` prevents a new commit stage and returns a graceful `Cancelled` final response. A cancel observed during `Committing` returns the defined rejection acknowledgement and lets the current final response complete. Any second request, final-after-final, unknown message, frame over `MAX_FRAME_BYTES`, or final-less EOF emits no request payload and returns `ProtocolViolation` or `WorkerCrashed` as appropriate.

- [ ] **Step 4: Run lifecycle tests and the complete worker crate test suite as GREEN.**

Run: `cargo test -p ty-plus-operation-worker --test lifecycle; cargo test -p ty-plus-operation-worker`

Expected: `PASS`; stdout has exactly one accepted event and one final response for a valid invocation, progress sequence never regresses, and graceful cancel differs from `WorkerForcedTermination`.

- [ ] **Step 5: Review lifecycle ownership and commit exact worker paths.**

Review: `rg -n "println!|eprintln!|WorkerCrashed|WorkerForcedTermination|FinalResponseSent|read_message" rust/apps/operation-worker/src rust/apps/operation-worker/tests` confirms redacted diagnostics only and one lifecycle entrypoint; `cargo fmt --check` and `git diff --check` pass.

```powershell
git add -- rust/apps/operation-worker/src/lifecycle.rs rust/apps/operation-worker/src/lib.rs rust/apps/operation-worker/src/main.rs rust/apps/operation-worker/src/codec.rs rust/apps/operation-worker/tests/lifecycle.rs
git commit -m "feat(worker): enforce invocation lifecycle"
```

`RESTART: task=OW-RUST-002; next=cargo test -p ty-plus-operation-worker --test lifecycle; last_success=accepted-progress-final-EOF-cancel GREEN; last_failure=none; generated=none; safe_switch=yes`

### Task OW-RUST-003: per-invocation composition and domain adapters

**Files:**
- Create: `rust/apps/operation-worker/src/context.rs`
- Create: `rust/apps/operation-worker/src/storage_dispatch.rs`
- Create: `rust/apps/operation-worker/src/host_filesystem_dispatch.rs`
- Create: `rust/apps/operation-worker/src/online_dispatch.rs`
- Create: `rust/apps/operation-worker/tests/invocation.rs`
- Create: `rust/apps/operation-worker/tests/host_filesystem.rs`
- Create: `rust/apps/operation-worker/tests/online.rs`
- Modify: `rust/apps/operation-worker/src/lib.rs`
- Create (OW-LIC-001 が unblocked の場合のみ): `rust/apps/operation-worker/src/licensing_dispatch.rs`
- Create (OW-LIC-001 が unblocked の場合のみ): `rust/apps/operation-worker/tests/licensing.rs`

**Interfaces:**
- **Depends:** `OW-STO-001`, `OW-STO-002`, `OW-STO-003`。`OW-LIC-001` は unblocked の場合のみ追加依存。
- Consumes: OW-RUST-002 `WorkerDependencies`、OW-STO-001 の `acquire_operation_lock`、OW-STO-002 の `Transaction` / recovery API、OW-STO-003 の retention / persistent cache / offline matrix policy、`HostSessionRoots` / `ManagedRootSelection`、existing `HostContext` / `PluginEffectScanRequest`、`OnlineComposition` / offline matrix、OW-LIC-001 の official licensing API（unblocked 時のみ）。
- Produces: `Invocation`、`ResolvedInvocation`、`resolve_invocation()`、`dispatch_plugin_effect_scan()`、`dispatch_online()`。各 invocation が新しい `PersistenceIoHandler`、host-filesystem adapter、online/offline adapter を組み立て、process-global root / scheduler / credential provider を持たない。

```rust
pub struct Invocation {
    pub context: InvocationContext,
    pub request: RequestEnvelope,
}

pub struct ResolvedInvocation {
    pub managed_root: ResolvedStorageRoots,
    pub storage: StorageBoundary,
    pub host_filesystem: HostFilesystemBoundary,
    pub online: OnlineBoundary,
}

pub fn resolve_invocation(invocation: &Invocation) -> Result<ResolvedInvocation, InvocationError> {
    let host = &invocation.context.host_context;
    let session = HostSessionRoots::new(
        SessionAppRoot::new(Path::new(&host.app_root))?,
        SessionSupportRoot::new(Path::new(&host.support_root))?,
    );
    let selection = match &invocation.context.managed_root {
        ManagedRootContext::SessionDefault => ManagedRootSelection::SessionDefault,
        ManagedRootContext::ExplicitShared { root } => ManagedRootSelection::ExplicitShared(
            SharedBrowseRoot::new(Path::new(root))?,
        ),
    };
    let roots = session.resolve_storage(selection);
    recover_before_operation(roots.managed_root())?;
    let _lock = acquire_operation_lock(roots.managed_root(), LOCK_TIMEOUT)?;
    Ok(ResolvedInvocation::new(roots))
}
```

`OW-STO-001` と `OW-STO-002` の lock / transaction / recovery を呼び出すだけで、ここに別実装を作らない。`OW-LIC-001` が blocked の間は `verify_license_at_invocation` を呼べる adapter を作らず、offline-independent operation を licensing online state から独立させる。

- [ ] **Step 1: Write invocation RED tests for session default, explicit shared root, no AE-version key, and path escape.**

```rust
#[test]
fn resolve_invocation_uses_support_root_for_session_default() {
    let resolved = resolve_invocation(&invocation(ManagedRootContext::SessionDefault)).unwrap();
    assert_eq!(resolved.managed_root.source(), ManagedRootSource::SessionDefault);
    assert!(!resolved.managed_root.managed_root().to_string_lossy().contains("24.0.0"));
}

#[test]
fn resolve_invocation_rejects_shared_root_escape_and_missing_root() {
    assert!(resolve_invocation(&invocation(ManagedRootContext::ExplicitShared {
        root: String::from("relative/root"),
    })).is_err());
}
```

- [ ] **Step 2: Run focused RED tests and record missing composition APIs.**

Run: `cargo test -p ty-plus-operation-worker --test invocation; cargo test -p ty-plus-operation-worker --test host_filesystem; cargo test -p ty-plus-operation-worker --test online`

Expected: `FAIL` because per-invocation composition and adapter functions are not defined; no storage or CEP implementation is added to make the tests pass.

- [ ] **Step 3: Implement the composition root and adapters against existing domain crates.**

```rust
pub fn dispatch_plugin_effect_scan(
    ctx: &HostContext,
    request: PluginEffectScanRequest,
    events: &mut impl EventSink,
) -> Result<PluginEffectScanResult, HostFilesystemError> {
    ctx.validate()?;
    request.validate()?;
    scan::run(ctx, request, |progress| events.progress(progress))
}

pub fn dispatch_online(
    invocation: &ResolvedInvocation,
    method: &MethodName,
    payload: Value,
    events: &mut impl EventSink,
) -> Result<Value, OperationError> {
    if offline::is_offline_independent(method) {
        return offline::dispatch(invocation.storage(), method, payload, events);
    }
    online::dispatch(invocation.online(), invocation.storage(), method, payload, events)
}
```

The adapter must pass `HostContext` from the invocation; Rust never discovers `appRoot`. Storage writes go through OW-STO-001/002 lock and same-directory transaction APIs. Search cache and retention remain storage-owned. Online downloads verify and commit as one operation and return no partial success. Windows and macOS use the adjacent platform implementations already owned by `host-filesystem`; no generic fallback or mock-only branch is introduced.

- [ ] **Step 4: Run adapter tests and focused crate checks as GREEN.**

Run: `cargo test -p ty-plus-operation-worker --test invocation; cargo test -p ty-plus-operation-worker --test host_filesystem; cargo test -p ty-plus-operation-worker --test online`

Expected: `PASS`; offline-independent calls succeed without connectivity, expired licensing is not consulted unless OW-LIC-001 is unblocked and the operation requires it, and every invocation creates independent boundaries.

- [ ] **Step 5: Review that this task does not duplicate storage, distribution, CEP, or blocked licensing work, then commit exact paths.**

Review: `rg -n "child_process|build-operation-worker|installer|acquire_operation_lock|Transaction::new" rust/apps/operation-worker/src` shows only calls to storage APIs and no duplicate implementations; `rg -n "mock worker|fallback|deferred" rust/apps/operation-worker` returns no output; `cargo fmt --check` passes.

```powershell
git add -- rust/apps/operation-worker/src/context.rs rust/apps/operation-worker/src/storage_dispatch.rs rust/apps/operation-worker/src/host_filesystem_dispatch.rs rust/apps/operation-worker/src/online_dispatch.rs rust/apps/operation-worker/src/lib.rs rust/apps/operation-worker/tests/invocation.rs rust/apps/operation-worker/tests/host_filesystem.rs rust/apps/operation-worker/tests/online.rs
git commit -m "feat(worker): compose operations per invocation"
```

OW-LIC-001 が unblock されても、この task に licensing file を追加しない。公式 artifact を根拠に OW-LIC-001 を実装 task へ改訂し、独立した review と commit を定義してから着手する。

`RESTART: task=OW-RUST-003; next=cargo test -p ty-plus-operation-worker --test invocation; last_success=per-invocation adapter GREEN; last_failure=none; generated=none; safe_switch=yes`

### Task OW-RUST-004: old apps/runtime deletion gate

**Depends:** `OW-CEP-009`, `OW-DIST-003`

**Files:**
- Delete only after every gate below passes: `rust/apps/runtime/Cargo.toml`
- Delete only after every gate below passes: `rust/apps/runtime/src/codec.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/dispatcher.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/handshake.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/lib.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/main.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/online_dispatch.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/preset_install.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/session.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/transport.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/control_root.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/endpoint.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/instance_lock.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/macos.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/macos_transport.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/mod.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/permission.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/recovery.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/windows.rs`
- Delete only after every gate below passes: `rust/apps/runtime/src/platform/windows_transport.rs`
- Modify: `rust/Cargo.toml` to remove the `apps/runtime` workspace member and retain `apps/operation-worker`
- Modify: `rust/Cargo.lock` to remove packages reachable only from `apps/runtime`
- Modify: `scripts/check/check-rust-runtime-boundaries.ts` and its fixtures to assert worker-only runtime ownership

**Interfaces:**
- Consumes: OW-RUST-001〜003 green evidence、OW-CEP-009 の TS resident transport/lifecycle/multiplex deletion、OW-DIST-003 の paired real binary and cross-process install lease evidence、`bun run check:rust-runtime-boundaries`。
- Produces: `cargo metadata --locked` に `operation-worker` が存在し `runtime` が存在しない workspace、resident endpoint / control-root / session registry / online dispatch の product reference がない cutover 後の Rust tree。

```text
React operation
  -> OperationInvoker
  -> one real operation-worker process
  -> request / accepted / progress* / final / EOF / exit
  -> next operation starts a new process
```

- [ ] **Step 1: Capture the deletion gate RED scan before deleting any old runtime file.**

Run: `rg -n "RuntimeTransport|RuntimeLifecycle|SurfaceMultiplex|ty-plus-runtime|endpoint\.json|named pipe|UDS|heartbeat|single-instance|application control root|build:cli|ty-plus-cli" src rust scripts package.json`

Expected: `FAIL` with live references until OW-CEP-009 and OW-DIST-003 have completed; no deletion occurs at this step.

- [ ] **Step 2: Verify the two required upstream cutovers and real artifact evidence.**

Run: `git log -1 --format=%s -- src/management/ipc/transport.ts src/management/ipc/lifecycle-runtime.ts src/management/ipc/multiplex.ts; bun run check:operation-worker-artifacts; bun run check:rust-runtime-boundaries`

Expected: OW-CEP-009 deletion commit and OW-DIST-003 artifact/drain checks are present; both Windows and macOS manifest entries point to real binaries; boundary check reports the worker as the only Rust app path.

- [ ] **Step 3: Delete the old runtime app and remove only its workspace references.**

```powershell
Remove-Item -LiteralPath rust/apps/runtime -Recurse
```

Then update `rust/Cargo.toml`, `rust/Cargo.lock`, and the boundary fixtures. Do not delete `rust/crates/storage`, `rust/crates/host-filesystem`, `rust/crates/online`, or any distribution/CEP file in this task.

- [ ] **Step 4: Run the full deletion verification as GREEN.**

Run: `rg -n "RuntimeTransport|RuntimeLifecycle|SurfaceMultiplex|ty-plus-runtime|endpoint\.json|named pipe|UDS|heartbeat|single-instance|application control root|build:cli|ty-plus-cli" src rust scripts package.json; cargo metadata --locked; cargo test --workspace --locked; bun run check:rust-runtime-boundaries; bun run ci`

Expected: the reference scan returns only explicitly historical/superseded documentation, `cargo metadata --locked` lists `operation-worker` and no `runtime`, all tests pass, and `bun run ci` finishes with no actionable warnings.

- [ ] **Step 5: Review deletion safety and commit the exact gate paths.**

Review: two consecutive real invocations have distinct process identities; a crash does not block the next invocation; non-idempotent writes are not retried; no endpoint/discovery/heartbeat/process identity file is created; `git diff --check` passes.

```powershell
git add -- rust/apps/runtime rust/Cargo.toml rust/Cargo.lock scripts/check/check-rust-runtime-boundaries.ts scripts/check/fixtures
git commit -m "refactor(worker): remove resident runtime app"
```

`RESTART: task=OW-RUST-004; next=bun run ci; last_success=old runtime deletion gate GREEN; last_failure=none; generated=none; safe_switch=yes`

## Self-review before handoff

- [ ] **Spec coverage:** protocol lifecycle, generated schema, one-shot worker, cancellation/crash distinction, per-invocation storage/host/online composition, offline behavior, licensing blocker, and old runtime deletion gate each map to one of the six exact tasks.
- [ ] **Boundary review:** storage lock/transaction and distribution/CEP runner implementation are referenced as consumed upstream work, not reimplemented here; `OW-RUST-004` is explicitly blocked on `OW-CEP-009` and `OW-DIST-003`.
- [ ] **Forbidden-marker scan:** `rg -n "deferred implementation|unspecified behavior|future detail|similar task reference" docs/plans/rust-operation-worker-redesign/01-rust-worker-protocol.md` returns no output.
- [ ] **Link review:** `Test-Path docs/architecture/runtime/operation-worker.md`, `Test-Path docs/decisions/2026-08-21-rust-operation-worker.md`, and `Test-Path .superpowers/sdd/architecture/operation-worker-rust-plan-audit.md` each return `True`.
- [ ] **Type consistency:** `InvocationContext` → `RequestEnvelope.context` → `Invocation` → `ResolvedInvocation` → adapter dispatch signatures are consistent across OW-PRO-001, OW-PRO-002, OW-RUST-002, and OW-RUST-003.
- [ ] **Commit scope:** every task uses exact `git add -- <paths>` and an English commit subject matching `task-ledger.md`; no status, ledger, source, test, stage, or commit is changed by this plan reconstruction.
