# Live Rust operation worker and After Effects host verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** generated operation policy、実行中 cancel、即時 progress、real Rust executable composition、content-addressed dev package、CEP production invocation を接続し、Windows の実 process と After Effects から同じ packaged worker を起動した証拠を残す。

**Architecture:** Rust は request 後の stdin を control stream として別 reader で所有し、executor へ共有 cancellation token を渡す。accepted / progress / cancellation acknowledgement / final は発生時に stdout へ flush し、normal final は stdin EOF を待たない。CEP Node は production manifest から一つの worker を起動し、cancel を一度だけ送り、grace timeout の場合だけ対象 child を強制終了する。dev と release は同じ content-addressed tree と manifest contract を使う。

**Tech Stack:** Rust 1.85.0、Bun 1.3.10、TypeScript、Vitest、CEP Node、After Effects CEP、4-byte big-endian framed UTF-8 JSON。

**Spec:** [`../../architecture/runtime/operation-worker.md`](../../architecture/runtime/operation-worker.md)、[`../../architecture/runtime/host-boundary.md`](../../architecture/runtime/host-boundary.md)、[`../../decisions/2026-08-21-rust-operation-worker.md`](../../decisions/2026-08-21-rust-operation-worker.md)。

## Global Constraints

- 実行単位の名称は `Rust operation worker` とし、`native`、`companion runtime`、daemon を責務名または実行形態にしない。
- 一つの operation は一つの process を起動し、process、pipe、request identity、memory を再利用しない。
- request 後の stdin は cancel frame だけを受け付け、normal final は stdin EOF を待たない。
- accepted、progress、cancellation acknowledgement、final は lifecycle transition ごとに flush し、final の後に frame を送らない。
- retry policy は generated canonical operation policy と `ProtocolError.retryable` だけを正とし、caller-supplied boolean を正典にしない。
- retry は `retryCount === 0 && idempotent && retryEligible && !commitObserved` の場合だけ許可する。
- cancelled、forced termination、protocol violation、binary validation failure、write / non-idempotent operation は暗黙 retry しない。
- scheduler の同時実行数は正確に 4。bulk kill、process group kill、unbounded timer を使わない。
- dev / release は同じ real Rust binary と manifest layout を使い、JS、ExtendScript、旧 CLI、mock worker、missing binary fallback を設けない。
- persistent artifact は visible extension / managed tree に置く。OS temp は一 invocation で破棄できる scratch だけに使い、worker package、manifest、host verification source-of-truth を置かない。
- Windows と macOS の build、manifest、launch、forced termination、error mapping を同じ task の近接 file / test で実装し、片方を no-op または fallback にしない。
- current OS の実 process test と After Effects host verification は synthetic fixture test で代替しない。
- 検証成果物、launch log、framed lifecycle log、screenshot は `.tmp/` 配下だけに保存する。
- canonical completion gate は `bun run ci`。skip、`.only`、ignore、抑制、終了 code 無視を行わない。
- 既存 dirty hunk を reset、上書き、一括 stage、一括 commit しない。commit 前に exact path の unstaged / staged diff を確認する。

---

## Exact dirty-worktree commit protocol

各 task の review 後、次の task-specific path listだけに対して順に `git diff -- <paths>`、
`git add -- <paths>`、`git diff --cached -- <paths>` を実行する。`git add .`、directory stage、
unscoped `git diff --exit-code` を使わない。

- OW-LIVE-001 paths: `rust/crates/protocol/src/metadata.rs rust/crates/protocol/src/message.rs rust/crates/protocol/src/scan.rs rust/crates/protocol/src/schema.rs rust/crates/protocol/src/lib.rs rust/crates/protocol/tests/golden_messages.rs rust/crates/protocol/tests/schema_snapshot.rs rust/apps/operation-worker/src/online_dispatch.rs rust/apps/operation-worker/src/storage_dispatch.rs rust/apps/operation-worker/src/host_filesystem_dispatch.rs rust/apps/operation-worker/tests/online.rs rust/apps/operation-worker/tests/host_filesystem.rs rust/crates/host-filesystem/src/lib.rs rust/crates/host-filesystem/src/scan.rs rust/crates/host-filesystem/src/scan/task.rs rust/crates/host-filesystem/src/scan/adversarial.rs rust/crates/host-filesystem/src/scan/macos.rs rust/crates/host-filesystem/src/scan/windows.rs scripts/generate/generate-rust-protocol-schema.ts scripts/generate/generate-typescript-protocol.ts rust/crates/protocol/generated/wire.schema.json src/management/ipc/generated/wire.ts src/management/ipc/generated/wire-contract.test.ts`
- OW-LIVE-002 paths: `rust/apps/operation-worker/src/cancellation.rs rust/apps/operation-worker/src/lifecycle.rs rust/apps/operation-worker/src/lib.rs rust/apps/operation-worker/src/main.rs rust/apps/operation-worker/tests/lifecycle.rs rust/apps/operation-worker/tests/live_control_stream.rs`
- OW-LIVE-003 paths: `docs/architecture/runtime/operation-worker.md rust/apps/operation-worker/src/executor.rs rust/apps/operation-worker/src/product_online_config.rs rust/apps/operation-worker/src/main.rs rust/apps/operation-worker/src/lib.rs rust/apps/operation-worker/src/host_filesystem_dispatch.rs rust/apps/operation-worker/src/online_dispatch.rs rust/apps/operation-worker/src/storage_dispatch.rs rust/apps/operation-worker/Cargo.toml rust/apps/operation-worker/tests/executable_process.rs rust/apps/operation-worker/tests/host_filesystem.rs rust/apps/operation-worker/tests/online.rs rust/apps/operation-worker/tests/storage.rs rust/crates/online/src/download.rs rust/crates/online/src/offline.rs rust/crates/online/src/search_cache.rs rust/crates/online/src/lib.rs rust/crates/online/tests/offline_search_cache.rs`
- OW-CEP-004 paths: `src/management/ipc/operation-worker-scheduler.ts src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-scheduler.test-fixtures.ts src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/index.ts`
- OW-HOST-001 paths: `src/management/ipc/operation-worker-composition.ts src/management/ipc/operation-worker-composition.test.ts scripts/verify/verify-operation-worker-process.ts scripts/verify/verify-operation-worker-process.test.ts src/management/ipc/index.ts package.json`
- OW-HOST-002 paths: `scripts/verify/verify-ae-operation-worker.ts scripts/verify/verify-ae-operation-worker.test.ts src/management/ipc/operation-worker-host-verification.ts src/management/ipc/operation-worker-host-verification.test.ts src/management/ae/cep/entry/panel.tsx package.json`

---

### Task OW-LIVE-001: Canonical operation policy and payload authority

**Files:**
- Modify: `rust/crates/protocol/src/metadata.rs`
- Modify: `rust/crates/protocol/src/message.rs`
- Modify: `rust/crates/protocol/src/scan.rs`
- Modify: `rust/crates/protocol/src/schema.rs`
- Modify: `rust/crates/protocol/src/lib.rs`
- Modify: `rust/crates/protocol/tests/golden_messages.rs`
- Modify: `rust/crates/protocol/tests/schema_snapshot.rs`
- Modify: `rust/apps/operation-worker/src/online_dispatch.rs`
- Modify: `rust/apps/operation-worker/src/storage_dispatch.rs`
- Modify: `rust/apps/operation-worker/src/host_filesystem_dispatch.rs`
- Modify: `rust/apps/operation-worker/tests/online.rs`
- Modify: `rust/apps/operation-worker/tests/host_filesystem.rs`
- Modify: `rust/crates/host-filesystem/src/lib.rs`
- Modify: `rust/crates/host-filesystem/src/scan.rs`
- Modify: `rust/crates/host-filesystem/src/scan/task.rs`
- Modify: `rust/crates/host-filesystem/src/scan/adversarial.rs`
- Modify: `rust/crates/host-filesystem/src/scan/macos.rs`
- Modify: `rust/crates/host-filesystem/src/scan/windows.rs`
- Modify: `scripts/generate/generate-rust-protocol-schema.ts`
- Modify: `scripts/generate/generate-typescript-protocol.ts`
- Modify generated: `rust/crates/protocol/generated/wire.schema.json`
- Modify generated: `src/management/ipc/generated/wire.ts`
- Modify: `src/management/ipc/generated/wire-contract.test.ts`

**Interfaces:**
- Produces Rust `CanonicalOperationPolicy { idempotency_key: IdempotencyPolicy, retry_class: RetryClass, cancellable: bool, retry_crash_before_accept: bool }` and `CanonicalMethod::operation_policy()`.
- Produces generated TypeScript `canonicalOperationPolicies: Readonly<Record<CanonicalMethod, CanonicalOperationPolicy>>`.
- Adds `CanonicalMethod::HostPluginEffectScan` and makes `PluginEffectScanRequest` the only accepted payload shape for that method.
- `PluginEffectScanRequest.roots` are normalized relative paths beneath `RequestEnvelope.context.host_context.app_root`. Absolute paths、`..`、drive/UNC prefixes、empty componentsを拒否する。外部root scanが将来必要なら別capability/methodを追加し、このmethodのauthorityを拡張しない。
- Keeps the outer `RequestEnvelope` JSON compatible. Method-owned decoders reject aliases and unknown fields instead of accepting both camelCase and snake_case.

- [ ] **Step 1: Write Rust RED tests for the policy registry.**

Add assertions that every `CanonicalMethod` has exactly one policy, `HostPluginEffectScan` is idempotent and cancellable, cache read/search are idempotent, download/cache write/delete/clear are not implicitly retryable, and duplicate or missing registry entries fail generation.

- [ ] **Step 2: Write generated TypeScript RED tests.**

```ts
expect(canonicalOperationPolicies.host_plugin_effect_scan).toEqual({
  cancellable: true,
  idempotencyKey: "optional",
  retryClass: "idempotent",
  retryCrashBeforeAccept: false,
});
expect(Object.keys(canonicalOperationPolicies).sort()).toEqual(
  canonicalMethods.toSorted(),
);
```

- [ ] **Step 3: Run RED commands.**

Run: `cd rust && cargo test -p ty-plus-protocol`

Run: `bun run vitest run src/management/ipc/generated/wire-contract.test.ts`

Expected: FAIL because the canonical policy registry and generated TS value do not exist.

- [ ] **Step 4: Implement the single-source registry and strict payload decoding.**

Use this public shape and generate the TS value from the Rust-owned schema metadata rather than maintaining a second handwritten table:

```rust
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, JsonSchema)]
pub struct CanonicalOperationPolicy {
    pub idempotency_key: IdempotencyPolicy,
    pub retry_class: RetryClass,
    pub cancellable: bool,
    pub retry_crash_before_accept: bool,
}

impl CanonicalMethod {
    pub const fn operation_policy(self) -> CanonicalOperationPolicy;
}
```

`RequestEnvelope::validate` must compare request metadata with this policy. A caller cannot make a non-cancellable method cancellable or attach an idempotency key where the policy forbids it.

Replace `online_dispatch.rs` alias-tolerant `serde_json::Value` field lookup with method-owned strict deserialization using `#[serde(deny_unknown_fields, rename_all = "camelCase")]`. Tests reject `preset_id`, simultaneous alias forms, unknown keys, and a payload belonging to another canonical method.

Update the existing storage recovery classifier exhaustively: `HostPluginEffectScan` performs no managed-storage recovery and returns `Ok(())`. The compiler failure from adding the canonical method is the RED proof for this required downstream match; do not add a wildcard that would hide later canonical methods.

Move the `HostScanRoot` capability slice forward from OW-LIVE-003 so this task does not leave the workspace in a false-green or known-red authority state. `HostScanRoot` opens the ExtendScript-supplied `HostContext.app_root` once, retains the directory handle, and accepts only validated relative roots. Both platform implementations classify and open children no-follow from retained handles; they never reconstruct an ambient absolute path、use process CWD、or fall back to `app_root.join(root)` traversal. The existing scan task consumes this capability rather than exporting ambient `Vec<PathBuf>` roots.

Capability RED/GREEN tests cover a relative `Plugins` root under a temporary app root、CWD independence、absolute/parent/drive/UNC/empty rejection at the capability boundary、app-root rename/replacement after open、root and nested symlink/reparse replacement、external sentinel non-observation、and preserved success/progress/progress-abort behavior in operation-worker tests. Windows and macOS implementations remain adjacent and neither platform may be a no-op.

- [ ] **Step 5: Regenerate and run GREEN commands.**

Run: `bun run generate:rust-protocol-schema`

Run: `bun run generate:typescript-protocol`

Run: `cd rust && cargo test -p ty-plus-protocol`

Run: `bun run vitest run src/management/ipc/generated/wire-contract.test.ts src/management/ipc/operation-worker-frame.test.ts`

Expected: PASS. After the first generator run, copy the exact bytes of `rust/crates/protocol/generated/wire.schema.json` and `src/management/ipc/generated/wire.ts` under `.tmp/operation-worker-verification/ow-live-001/first-run/`. Run both generators a second time, compute SHA-256 for each first-run/current pair, and require the hashes to match. This compares generator run 1 with run 2 even when generated output intentionally differs from `HEAD`; do not use a clean-worktree diff as a freshness assertion.

- [ ] **Step 6: Review and commit exact files.**

Commit: `feat(protocol): generate canonical operation policy`

---

### Task OW-LIVE-002: Live control stream, cancellation token, and immediate progress

**Depends on:** OW-LIVE-001.

**Files:**
- Create: `rust/apps/operation-worker/src/cancellation.rs`
- Modify: `rust/apps/operation-worker/src/lifecycle.rs`
- Modify: `rust/apps/operation-worker/src/lib.rs`
- Modify: `rust/apps/operation-worker/src/main.rs`
- Modify: `rust/apps/operation-worker/tests/lifecycle.rs`
- Create: `rust/apps/operation-worker/tests/live_control_stream.rs`

**Interfaces:**
- Produces cloneable `CancellationToken` with `is_cancelled()` and `checkpoint() -> Result<(), WorkerError>`.
- Changes `OperationExecutor::execute` to receive `&CancellationToken` and `&mut dyn EventSink`; it no longer receives stdin as `dyn Read`.
- `EventSink::progress` validates identity/sequence/stage and flushes the accepted progress frame before returning.
- Production control input owns the blocking reader on a dedicated thread. Only the matching first cancel is accepted; wrong identity, malformed frame, a second request, or a second cancel records `ProtocolViolation`.

- [ ] **Step 1: Write live-input RED tests.**

Use a blocking test pipe/channel, not a preloaded `Cursor`. Prove all of the following:

- executor begins while stdin remains open;
- normal executor completion produces final without stdin EOF;
- a cancel written after accepted changes the shared token while execute is running;
- the first cancel emits one acknowledgement;
- committing rejects cancellation and lets the final complete;
- a second cancel or non-cancel control frame fails closed;
- a progress frame is observable by the reader before executor completion;
- a crash after flushed `committing` leaves that frame observable before process failure.

- [ ] **Step 2: Run RED tests.**

Run: `cd rust && cargo test -p ty-plus-operation-worker --test live_control_stream -- --nocapture`

Expected: FAIL because `CancellationToken` and live control input do not exist and current final waits for EOF.

- [ ] **Step 3: Implement the lifecycle coordinator.**

Use one serialized coordinator for state and output ordering. The public executor contract is:

```rust
pub trait OperationExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError>;
}
```

The output coordinator must serialize accepted/progress/ack/final under one state transition so final remains the last frame. Do not call `input.drain()` before final and do not reconstruct cancel polling through a blocking executor read.

The production stdin reader thread is process-scoped and owns only stdin, shared cancellation state, and the serialized output coordinator. `run_once` writes final without joining that blocking reader; `main` returns immediately after final flush and process exit terminates the reader. Finite test readers are joined and must prove no thread remains after EOF. No shutdown path may wait for stdin EOF before final.

- [ ] **Step 4: Run lifecycle GREEN and regression tests.**

Run: `cd rust && cargo test -p ty-plus-operation-worker --test lifecycle --test live_control_stream --test codec`

Expected: PASS; tests complete while the simulated stdin writer remains open.

- [ ] **Step 5: Run Rust quality checks and commit.**

Run: `cd rust && cargo fmt --all -- --check`

Run: `cd rust && cargo clippy -p ty-plus-operation-worker --all-targets --all-features -- -D warnings`

Commit: `feat(worker): stream lifecycle control`

---

### Task OW-LIVE-003: Production executable composition and cancellation propagation

**Depends on:** OW-LIVE-002 and the existing storage/host-filesystem/online adapters.

**Files:**
- Modify: `docs/architecture/runtime/operation-worker.md`
- Create: `rust/apps/operation-worker/src/executor.rs`
- Create: `rust/apps/operation-worker/src/product_online_config.rs`
- Modify: `rust/apps/operation-worker/src/main.rs`
- Modify: `rust/apps/operation-worker/src/lib.rs`
- Modify: `rust/apps/operation-worker/src/host_filesystem_dispatch.rs`
- Modify: `rust/apps/operation-worker/src/online_dispatch.rs`
- Modify: `rust/apps/operation-worker/src/storage_dispatch.rs`
- Modify: `rust/apps/operation-worker/Cargo.toml`
- Modify: `rust/crates/online/src/download.rs`
- Modify: `rust/crates/online/src/offline.rs`
- Modify: `rust/crates/online/src/search_cache.rs`
- Modify: `rust/crates/online/src/lib.rs` only when the minimal hook must be exported
- Modify: `rust/crates/online/tests/offline_search_cache.rs`
- Create: `rust/apps/operation-worker/tests/executable_process.rs`
- Modify: `rust/apps/operation-worker/tests/host_filesystem.rs`
- Modify: `rust/apps/operation-worker/tests/online.rs`
- Create or Modify: `rust/apps/operation-worker/tests/storage.rs` only when existing owned tests cannot prove the storage commit boundary
**Interfaces:**
- Replaces `UnavailableExecutor` with `ProductionOperationExecutor`.
- Builds the optional typed product online configuration exclusively from Rust compile-time inputs. Runtime environment, request payload, worker manifest, PATH, and AE discovery are not configuration sources; missing development inputs disable remote operations only, while release packaging must require all validated values.
- Routes every generated `CanonicalMethod` through one exhaustive Rust match. Unknown method/payload combinations are rejected before domain mutation.
- `HostPluginEffectScan` resolves the request `HostContext.app_root` and consumes the host-filesystem-owned `HostScanRoot` capability introduced by OW-LIVE-001, without rediscovering or hardcoding an AE version.
- `ty-plus-host-filesystem` retains the already-defined `HostScanRoot` authority. OW-LIVE-003 adds cancellation checkpoints and production executor composition; it does not add a second scanner or return to ambient `PathBuf` traversal.
- Each payload root is app-root-relative and can only narrow the `HostScanRoot` authority. Tests reject absolute、parent、drive、UNC、empty、symlink、junction/reparse escape roots and adversarial replacement; neither platform falls back to absolute `std::fs` traversal.
- Online download receives the lifecycle `CancellationToken` through an invocation-scoped `CancelFlag` probe that observes later token changes without a detached monitor thread or busy polling. Online-owned cache mutation exposes an exact pre-commit hook so fresh search and download preserve `checkpoint -> flushed Committing -> irreversible mutation`; a route-wide early `Committing` event is forbidden. Storage mutation checks cancellation before entering `Committing` and never after irreversible commit begins.

- [ ] **Step 1: Write executable RED tests.**

Spawn the Cargo-built `ty-plus-operation-worker` as a real child with piped stdio. Send a framed `HostPluginEffectScan` request targeting a deterministic fixture tree and assert accepted, progress, final success, stdout EOF, exit code 0, and no request bytes in stderr.

Add a second real-process `HostPluginEffectScan` cancellation smoke with `MAX_SCAN_ROOTS` distinct payload roots and enough nonempty nested directories to exercise at least 64 scanned directories. Wait for accepted or the first progress event, send cancel, and record `cancelObserved: true | false` explicitly. This smoke proves framing and process wiring only and is explicitly non-authoritative because an OS-pipe flush does not synchronize the test reader with the executor; `false` is not promoted to deterministic cancellation evidence. Do not raise the protocol root limit only to make this smoke larger.

The authoritative late-cancellation proof remains the deterministic `OW-LIVE-002` lifecycle test: its controllable executor signals that execution has started, blocks before the next cancellation checkpoint, the test sends cancel through the concurrent stdin reader, waits for the token observation, then releases the executor. It must assert one acknowledgement, no `committing` progress, graceful cancelled final, and EOF. `OW-LIVE-003` additionally proves that `HostPluginEffectScan` checks the same token before every real batch by a direct executor test; the process smoke is not used to claim deterministic timing.

- [ ] **Step 2: Run RED.**

Run: `cd rust && cargo test -p ty-plus-operation-worker --test executable_process -- --nocapture`

Expected: FAIL because `main.rs` still constructs `UnavailableExecutor`.

- [ ] **Step 3: Implement the exhaustive production executor.**

```rust
pub struct ProductionOperationExecutor;

impl OperationExecutor for ProductionOperationExecutor {
    fn execute(
        &self,
        request: &RequestEnvelope,
        cancellation: &CancellationToken,
        events: &mut dyn EventSink,
    ) -> Result<ResponseEnvelope, WorkerError> {
        let canonical = request
            .method
            .canonical()
            .ok_or_else(|| WorkerError::unsupported_method(&request.method))?;

        match canonical {
            CanonicalMethod::HostPluginEffectScan => {
                execute_plugin_effect_scan(request, cancellation, events)
            }
            CanonicalMethod::OnlineCatalogSearch
            | CanonicalMethod::OnlineDownload
            | CanonicalMethod::OnlineCatalogCacheRead
            | CanonicalMethod::OnlineCatalogCacheWrite
            | CanonicalMethod::OnlineCatalogCacheDelete
            | CanonicalMethod::OnlineCatalogCacheClear => {
                execute_online_request(request, cancellation, events)
            }
        }
    }
}
```

The implementation must not keep `UnavailableExecutor`, a default wildcard returning `InternalError`, or a JS/old-runtime fallback.

- [ ] **Step 4: Run domain and real-process GREEN.**

Run: `cd rust && cargo test -p ty-plus-operation-worker --test invocation --test host_filesystem --test online --test executable_process -- --nocapture`

Expected: PASS with at least one real child process completing the host-filesystem operation. The real-process cancellation smoke must not hang or corrupt framing; deterministic late-cancel acceptance comes from the `OW-LIVE-002` gated lifecycle test plus the direct production-executor cancellation-checkpoint test.

- [ ] **Step 5: Run crate checks and commit.**

Run: `cd rust && cargo clippy -p ty-plus-operation-worker --all-targets --all-features -- -D warnings`

Commit: `feat(worker): execute production operations`

---

### Task OW-CEP-004: Cancellable runner, safe retry, and max-four scheduler

**Depends on:** OW-LIVE-001 through OW-LIVE-003 and OW-CEP-003.

**Files:**
- Create: `src/management/ipc/operation-worker-scheduler.ts`
- Create: `src/management/ipc/operation-worker-scheduler.test.ts`
- Create: `src/management/ipc/operation-worker-scheduler.test-fixtures.ts`
- Modify: `src/management/ipc/operation-worker-runner.ts`
- Modify: `src/management/ipc/operation-worker-runner.test.ts`
- Modify: `src/management/ipc/index.ts`

**Interfaces:**
- `OperationWorkerRunner.invoke` keeps stdin open after the request frame.
- An `AbortSignal` sends one generated cancel frame to the same child. It races graceful final/close against `CancelPolicy.graceMs` and kills only on timeout.
- `OperationWorkerAttemptError` is the only retry input and carries immutable `attempt: { accepted: boolean; commitObserved: boolean; retryEligible: boolean }`. The runner derives `retryEligible` from a correlated final `ProtocolError.retryable`, or from a pre-accepted crash only when generated `retryCrashBeforeAccept` is true. Cancellation, forced termination, protocol violation, binary validation failure, and any crash after accepted are false.
- `OperationInvocationFactory.create(identity)` receives a scheduler-created fresh request id and one logical-job idempotency key. Request id changes on retry; idempotency key remains stable. The scheduler rejects a factory result whose encoded identity does not match these values.
- `RetryState` contains `retryCount`, generated policy, and the runner-owned attempt metadata; caller-supplied `WorkerJob.idempotency` and caller-supplied retry booleans are removed.
- `OperationWorkerScheduler` owns a FIFO queue and exactly four active runners. Every retry creates a fresh invocation and runner.

```ts
export interface OperationAttemptIdentity {
  readonly requestId: RequestId;
  readonly idempotencyKey?: IdempotencyKey;
}

export interface OperationInvocationFactory<Request, Response> {
  create(identity: OperationAttemptIdentity): OperationInvocation<Request, Response>;
}

export interface WorkerAttemptMetadata {
  readonly accepted: boolean;
  readonly commitObserved: boolean;
  readonly retryEligible: boolean;
}

export class OperationWorkerAttemptError extends OperationWorkerError {
  readonly attempt: WorkerAttemptMetadata;
}
```

- [ ] **Step 1: Replace the obsolete TS-only plan tests with RED tests matching the live Rust contract.**

Cover: stdin remains open, one cancel frame, cancel write backpressure, final/EPIPE race, graceful final without kill, forced termination only after grace, actual close after kill, commit progress observed before crash, non-retryable error, one safe retry, fresh request identity, FIFO, max 4, stop accepting, bounded drain, no bulk kill.

The retry test asserts different request ids, the same generated idempotency key, a fresh runner/child, and rejection when a factory reuses the first request id.

- [ ] **Step 2: Run RED.**

Run: `bun run vitest run src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-runner.test.ts`

Expected: FAIL because the current runner closes stdin immediately and scheduler is absent.

- [ ] **Step 3: Implement cancel and retry.**

```ts
export const canRetry = (state: RetryState): boolean =>
  state.retryCount === 0 &&
  state.policy.retryClass === "idempotent" &&
  state.attempt.retryEligible &&
  !state.attempt.commitObserved;
```

Use a single settled-state guard. A graceful final clears the grace timer and prevents `kill()`. Timeout calls only that child's platform-specific forced termination and resolves only after the real `close` event.

- [ ] **Step 4: Implement FIFO scheduling and bounded drain.**

Reject constructor limits other than 4. `stopAccepting()` rejects new jobs. Existing queued jobs remain ordered; `drain(deadlineMs)` returns `true` only when active and queue are empty, and returns `false` at the deadline without killing active workers.

- [ ] **Step 5: Run GREEN and commit.**

Run: `bun run vitest run src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/operation-worker-frame.test.ts`

Run: `bun run typecheck && bun run typecheck:test`

Commit: `feat(ipc): schedule cancellable workers`

---

## Distribution checkpoint: consume OW-DIST-001 through OW-DIST-003

**Authoritative plan:** [`03-storage-distribution-release.md`](03-storage-distribution-release.md)。

この計画は build / signing / manifest / install lease file を重複所有しない。実行順は次に固定する。

```text
OW-LIVE-003
  -> OW-DIST-001 (native Windows artifact + native macOS universal artifact)
     -> OW-DIST-003 development lane (current-platform unsigned-development manifest + shared lease)
        -> OW-HOST-001 / OW-HOST-002
     -> OW-DIST-002 release lane (signed pair + post-sign hash + final release manifest)
        -> release package / OW-CLEAN-001
```

- `OW-DIST-001` は Windows runner と macOS runner で real artifact を別々に生成する。macOS は
  `cargo build --target aarch64-apple-darwin` と
  `cargo build --target x86_64-apple-darwin` の後に `lipo -create` し、CI artifact metadata
  に target、commit、SHA-256 を記録する。Windows 上の PE fixture を macOS artifact として
  handoff しない。
- `OW-DIST-002` は release signing credential がある native runner だけで署名し、署名後 bytes
  を hash して paired release manifest を生成する。unsigned bytes、placeholder certificate、
  pre-sign hash を release manifest に入れない。
- `OW-DIST-003` は current-platform の real Cargo artifactを使う明示的
  `development-unsigned` trust mode と、release manifest の両方に同じ shared/exclusive
  install leaseを適用する。development manifest はcurrent platform entryだけを持ち、
  installer/release packageの入力にはできない。release buildはdevelopment manifestを拒否する。
- OW-HOST-001/002 は current OS の development manifest で実機検証できるため、macOS signing
  credentialをWindows host verificationの前提にしない。ただしrelease completeと
  Windows/macOS pair completeはOW-DIST-002のnative artifact evidenceなしでは宣言しない。

### Task OW-HOST-001: Production CEP composition and real Windows child smoke

**Depends on:** OW-CEP-004, OW-DIST-003 development lane, and immutable host context provider OW-CEP-005 from [`02-cep-runner-cutover.md`](02-cep-runner-cutover.md). After OW-CEP-004 is reviewed, execution returns to OW-CEP-005 and records its commit before this task starts.

**Files:**
- Create: `src/management/ipc/operation-worker-composition.ts`
- Create: `src/management/ipc/operation-worker-composition.test.ts`
- Create: `scripts/verify/verify-operation-worker-process.ts`
- Create: `scripts/verify/verify-operation-worker-process.test.ts`
- Modify: `src/management/ipc/index.ts`
- Modify: `package.json`

**Interfaces:**
- Production composition loads `worker/manifest.json` from the active CEP extension root, resolves the current platform artifact, constructs the real runner/scheduler, and accepts immutable host context from the ExtendScript provider.
- `bun run verify:operation-worker:process` invokes `HostPluginEffectScan` through production manifest loader/resolver/runner, not by spawning `rust/target` directly.
- Verification writes a redacted JSON evidence record to `.tmp/operation-worker-verification/windows-process.json` containing artifact SHA-256, request identity, accepted/progress/final sequence, exit code, and close observation.

- [ ] **Step 1: Write RED production-composition tests.**

Prove manifest absence fails before spawn, current-platform binary is selected, request context is immutable, and no fake child or alternate path is accepted.

- [ ] **Step 2: Run RED.**

Run: `bun run vitest run src/management/ipc/operation-worker-composition.test.ts scripts/verify/verify-operation-worker-process.test.ts`

Expected: FAIL because production composition and process verifier do not exist.

- [ ] **Step 3: Implement production composition and verifier.**

The verifier must call the same exported construction used by CEP. Test-only dependency injection is permitted in unit tests, but the command itself must reject injected spawn/resolver implementations.

- [ ] **Step 4: Run the real Windows process.**

Run: `bun run verify:operation-worker:process`

Expected: PASS using `dist/cep-dev/worker/manifest.json`; the deterministic nonempty `HostPluginEffectScan` fixture emits at least one progress event, followed by final success, stdout EOF, and child close with exit code 0.

- [ ] **Step 5: Review evidence and commit.**

Commit: `feat(ipc): compose packaged operation worker`

---

### Task OW-HOST-002: After Effects CEP launch and worker invocation evidence

**Depends on:** OW-HOST-001 and the CEP host verification skill.

**Files:**
- Create: `scripts/verify/verify-ae-operation-worker.ts`
- Create: `scripts/verify/verify-ae-operation-worker.test.ts`
- Create: `src/management/ipc/operation-worker-host-verification.ts`
- Create: `src/management/ipc/operation-worker-host-verification.test.ts`
- Modify: `src/management/ae/cep/entry/panel.tsx`
- Modify: `package.json`

**Interfaces:**
- Product code, Rust, and the verifier do not discover an AE executable、installation directory、or AE version. The verification task attaches to an already-running After Effects CEP debug target; launching AE is an external developer action and never becomes worker authority.
- The loaded panel requests `app.path` through ExtendScript and constructs immutable `HostContext.app_root` from that value. It then invokes `HostPluginEffectScan` through production composition and records CEP load plus worker lifecycle evidence. Rust receives the supplied authority and never derives it from the executable path、registry、environment、or filesystem search.
- `operation-worker-host-verification.ts` is a development-only exported verification entrypoint that calls the same production composition as product gateways; it does not add a second spawn path or a mock operation. `panel.tsx` exposes it only in development as `globalThis.__TY_PLUS_VERIFY_OPERATION_WORKER__`.
- `verify-ae-operation-worker.ts` reads the CEP debug port, selects the loaded `app.ty-plus` panel target from the Chrome DevTools JSON endpoint, calls `Runtime.evaluate` over its WebSocket with `globalThis.__TY_PLUS_VERIFY_OPERATION_WORKER__()`, and waits for the returned promise. It never invokes the worker from the external script itself.

- [ ] **Step 1: Write RED host-verifier tests.**

Cover no running CEP target、multiple debug targets with exact extension selection、spaces and Unicode in ExtendScript-supplied `app.path`、no AE version/executable path in worker request or storage identity、worker manifest missing、and CEP invocation failure.

- [ ] **Step 2: Run RED.**

Run: `bun run vitest run scripts/verify/verify-ae-operation-worker.test.ts src/management/ipc/operation-worker-host-verification.test.ts`

Expected: FAIL on the current incomplete loaded-panel verification path.

- [ ] **Step 3: Implement attachment to the loaded CEP panel.**

The external verifier reads the deployed `.debug` ports and attaches only to a running `app.ty-plus` panel target. It does not launch AE、locate `AfterFX.exe`、or construct `appRoot`. The in-panel development entrypoint obtains `app.path` through the existing ExtendScript bridge and passes it through the same production composition used by product gateways.

- [ ] **Step 4: Deploy and attach to an explicitly running AE session.**

Run: `bun run host:deploy`

Expected: the user CEP installation points to the built extension tree and worker manifest validation succeeds. Start the intended After Effects instance explicitly outside the product/verifier, open the ty-plus panel, and require the verifier to find its CEP debug target. Absence of a running target is reported as an external host-state blocker; no executable discovery or substitute Adobe host is attempted.

- [ ] **Step 5: Perform visible CEP verification.**

Using the `cep-host-verification` skill, open the ty-plus panel in After Effects, run `bun run verify:ae-operation-worker` so the loaded CEP panel evaluates `globalThis.__TY_PLUS_VERIFY_OPERATION_WORKER__()`, and capture:

- visible panel loaded in After Effects;
- immutable `appRoot` sourced from the running AE session;
- packaged worker artifact SHA-256 and content-addressed path;
- accepted/progress/final/EOF/exit 0 sequence;
- no CEP console error;
- screenshot and redacted lifecycle log under `.tmp/operation-worker-verification/`.

- [ ] **Step 6: Run canonical gate and commit.**

Run: `bun run ci`

Expected: PASS with no actionable warning. Known baseline debt must be fixed in its owning file before this task can be `complete`; it is not waived by the host evidence.

Commit: `test(host): verify operation worker in after effects`

---

## Final review and completion contract

- [ ] Independent whole-path review confirms protocol policy, live cancellation, commit-safe retry, executable composition, package layout, Windows process evidence, and After Effects evidence.
- [ ] `bun run ci` passes without skip, ignore, suppression, or ignored exit code.
- [ ] `docs/plans/rust-operation-worker-redesign/status.md` records exact commit hashes, focused commands, canonical gate result, artifact paths, and the current platform host evidence.
- [ ] Windows implementation and real evidence are present. macOS implementation and compile/fixture tests are present in the same commits; signed/notarized macOS host evidence is recorded when the required machine and credentials are available and is never replaced by a Windows binary.
- [ ] Only after these checks may OW-HOST-002 be marked `complete`; earlier tasks remain `reviewed` when the canonical gate is blocked by unrelated existing debt.
