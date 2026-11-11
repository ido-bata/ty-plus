# CEP one-shot operation worker cutover 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CEP Node を、manifest で検証した worker の one-shot 起動、frame I/O、cancel/retry/scheduling、immutable host context、責任別 gateway、常駐 transport 削除へ切り替える。

**Architecture:** React は責任別の TypeScript gateway を呼び、CEP Node は一つの operation ごとに一つの real Rust operation worker を起動する。CEP Node の permanent な `child_process` 境界は `src/management/ipc/operation-worker-runner.ts` だけとし、ExtendScript の host context は invocation ごとに凍結して渡す。Rust protocol/worker、storage/online policy、paired artifact、cross-process install lease は上流計画の成果物をこの計画で再定義しない。

**Tech Stack:** Bun `1.3.10`、TypeScript、React 19、CEP Node、Vitest、Node `child_process`（`shell: false`）、生成済み Rust protocol の TypeScript 型。

**Spec:** [`docs/architecture/runtime/operation-worker.md`](../../architecture/runtime/operation-worker.md)、[`docs/architecture/runtime/host-boundary.md`](../../architecture/runtime/host-boundary.md)、[`docs/decisions/2026-08-21-rust-operation-worker.md`](../../decisions/2026-08-21-rust-operation-worker.md)、protocol/worker の上流 [`01-rust-worker-protocol.md`](01-rust-worker-protocol.md)、storage/distribution の上流 [`03-storage-distribution-release.md`](03-storage-distribution-release.md)。

## Global Constraints

- 対象 host は After Effects のみであり、Premiere Pro は対象外とする。
- protocol/schema、生成型、Rust worker composition は [`01-rust-worker-protocol.md`](01-rust-worker-protocol.md) の OW-PRO-001、OW-PRO-002、OW-RUST-003 が所有する。この計画は Rust file、protocol source、schema、生成型を変更しない。
- managed storage、offline/search cache、retention、storage/online policy は [`03-storage-distribution-release.md`](03-storage-distribution-release.md) が所有する。この計画は Rust storage/online file や policy shape を変更せず、TypeScript gateway と callsite だけを変更する。
- paired Windows/macOS binary、manifest の生成・署名・package、installer shared/exclusive lease と deadline abort は [`03-storage-distribution-release.md`](03-storage-distribution-release.md) の OW-DIST-001、OW-DIST-002、OW-DIST-003 が所有する。この計画は build/artifact/installer task を重複させない。
- 一つの operation は一つの real Rust process を起動し、accepted、monotonic progress、唯一の final、EOF の後に終了する。daemon、endpoint discovery、named pipe、UDS、heartbeat、single-instance process、process-global session state は導入しない。
- frame は OW-PRO-002 の `WireMessage` と `protocolLimits.maxFrameBytes` を使う 4-byte big-endian length prefix + UTF-8 JSON とする。1 frame の上限は protocol の 1 MiB を変更しない。
- spawn は `shell: false`、piped stdin/stdout/stderr、Windows の `windowsHide: true` とし、request/context は argv または environment variable に入れない。
- binary は CEP extension root と OW-DIST-001/002 の manifest だけから解決する。relative path は `worker/versions/<artifact-sha256>/<platform>/operation-worker(.exe)` に固定し、digest segment と manifest hash を一致させる。registry、environment、`PATH`、`appRoot` の走査、固定 absolute path、JS/ExtendScript fallback は禁止する。
- cancel は同じ child へ cancel frame を一度だけ送り、grace deadline 後に対象 child だけを強制終了する。forced termination は graceful cancellation と異なる stable error とする。
- retry は protocol metadata が idempotent と宣言し、commit stage 未観測の場合に最大一回だけ許可する。write と non-idempotent operation は暗黙 retry しない。scheduler の同時実行数は最大 4 とする。
- `appRoot`、support root、session id は ExtendScript から取得し invocation ごとに immutable とする。AE version は process、protocol、storage key に含めない。
- source code の identifier、comment、test 名、file 名は英語、内部 plan の説明文は日本語とする。commit subject は指定された英語文字列を使う。
- 既存 dirty hunk を reset、上書き、一括 stage、commit しない。future executor は commit 前に `git diff -- <exact path>` と `git diff --cached -- <exact path>` を確認する。
- 各 task は focused RED、期待される失敗、最小実装、focused GREEN、review、RESTART を持つ。skip、`.only`、ignore、一括抑制、終了 code の無視は行わない。

---

## 上流成果物との境界

- `OW-PRO-002` の生成済み `WireMessage`、protocol limits、error contract を [`01-rust-worker-protocol.md`](01-rust-worker-protocol.md) から **Consumes** する。
- `OW-RUST-003` の per-invocation worker composition と invocation response lifecycle を [`01-rust-worker-protocol.md`](01-rust-worker-protocol.md) から **Consumes** する。
- `OW-CEP-002` が canonical manifest と signature/hash contract を所有し、`OW-DIST-001`/`OW-DIST-002` はその contract を consume して paired binary を生成・署名する。
- `OW-DIST-003` の dev real binary と cross-process install lease boundary を [`03-storage-distribution-release.md`](03-storage-distribution-release.md) から **Consumes** する。
- この計画内に protocol Rust/schema generation、Rust worker implementation、storage/online policy、artifact build/package、installer implementation の task は置かない。

---

### Task OW-CEP-001: TypeScript 4-byte frame codec

**Consumes:** OW-PRO-002（[`01-rust-worker-protocol.md`](01-rust-worker-protocol.md) の生成済み `WireMessage`、`protocolLimits.maxFrameBytes`、wire error contract）。

**Files:**
- Create: `src/management/ipc/operation-worker-frame.ts`
- Create: `src/management/ipc/operation-worker-frame.test.ts`
- Modify: `src/management/ipc/index.ts`

**Interfaces:**
- `encodeOperationWorkerFrame(message: WireMessage): Uint8Array`。
- `class OperationWorkerFrameDecoder` の `push(chunk: Uint8Array): readonly WireMessage[]` と `finish(): void`。
- `OperationWorkerFrameError` は `frame_zero_length`、`frame_length_invalid`、`frame_too_large`、`frame_truncated`、`frame_utf8_invalid`、`frame_json_invalid`、`frame_message_invalid` を持つ。
- module は `child_process`、filesystem、network、resident process state を import しない。

- [ ] **Step 1: 断片化・複数 frame・上限の RED test を書く**

```ts
import { describe, expect, it } from "vitest";
import { encodeOperationWorkerFrame, OperationWorkerFrameDecoder } from "./operation-worker-frame";
import { requestFixture } from "./generated/wire-contract-fixtures";

describe("operation worker frame codec", () => {
  it("reassembles a header and payload delivered in separate chunks", () => {
    const frame = encodeOperationWorkerFrame(requestFixture);
    const decoder = new OperationWorkerFrameDecoder();

    expect(decoder.push(frame.slice(0, 2))).toEqual([]);
    expect(decoder.push(frame.slice(2))).toEqual([requestFixture]);
    decoder.finish();
  });

  it("rejects a zero-length frame and a high-bit length header", () => {
    const decoder = new OperationWorkerFrameDecoder();
    expect(() => decoder.push(Uint8Array.from([0, 0, 0, 0]))).toThrow("frame_zero_length");
    expect(() => decoder.push(Uint8Array.from([0x80, 0, 0, 1]))).toThrow("frame_length_invalid");
  });
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-frame.test.ts`

Expected: FAIL because `operation-worker-frame.ts` が存在せず、OW-PRO-002 の generated frame を TypeScript で encode/decode できない。

- [ ] **Step 3: UTF-8 byte length と big-endian length prefix を実装する**

```ts
export const encodeOperationWorkerFrame = (message: WireMessage): Uint8Array => {
  const payload = new TextEncoder().encode(JSON.stringify(message));
  if (payload.byteLength > protocolLimits.maxFrameBytes) {
    throw new OperationWorkerFrameError("frame_too_large");
  }

  const frame = new Uint8Array(4 + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, payload.byteLength, false);
  frame.set(payload, 4);
  return frame;
};
```

保持 buffer に chunk を追加し、4 byte header から payload byte 数を読み、完全な payload だけを decode する。改行分割、JavaScript string length、newline JSON、frame の自動切り捨ては使用しない。`finish()` は残存 header/payload を truncated error にする。

- [ ] **Step 4: focused GREEN と protocol limit 境界を確認する**

Run: `bun run vitest run src/management/ipc/operation-worker-frame.test.ts`

Expected: PASS。fragmented chunk、複数 frame、exact `protocolLimits.maxFrameBytes`、oversized、zero-length、high-bit、invalid UTF-8/JSON、truncated EOF、unknown generated message が stable error または decoded message になる。

- [ ] **Step 5: review と exact commit を行う**

Review: generated `WireMessage` と limit だけを import し、Rust/schema を再定義していないこと、codec が process と I/O resource を保持しないこと、UTF-8 byte length が payload の実測値であることを確認する。

```text
git diff --check -- src/management/ipc/operation-worker-frame.ts src/management/ipc/operation-worker-frame.test.ts src/management/ipc/index.ts
git diff -- src/management/ipc/operation-worker-frame.ts src/management/ipc/operation-worker-frame.test.ts src/management/ipc/index.ts
git diff --cached -- src/management/ipc/operation-worker-frame.ts src/management/ipc/operation-worker-frame.test.ts src/management/ipc/index.ts
git add -- src/management/ipc/operation-worker-frame.ts src/management/ipc/operation-worker-frame.test.ts src/management/ipc/index.ts
git commit -m "feat(ipc): add worker frame codec"
```

**RESTART:** `git status --short` で exact path と既存 dirty hunk を再確認し、最初の failing frame assertion から focused test を再実行する。

### Task OW-CEP-002: Manifest-only binary resolver

**Depends on:** OW-CEP-001。

**Consumes:** OW-CEP-001 の codec error boundary と canonical operation-worker spec。このtaskがmanifest型の唯一のownerであり、OW-DIST-001/002/003は生成・署名・package時にこのcontractをconsumeする。

**Files:**
- Create: `src/management/ipc/operation-worker-binary.ts`
- Create: `src/management/ipc/operation-worker-binary.test.ts`
- Modify: `src/management/ipc/index.ts`
- Modify: `scripts/check/check-rust-runtime-boundaries.ts`

**Interfaces:**
- `export type OperationWorkerPlatform = "windows" | "macos"`。
- `export interface ArtifactSignature { readonly algorithm: "authenticode" | "codesign"; readonly value: string; readonly certificateSha256: string }`。
- `export interface OperationWorkerArtifact { readonly relativePath: string; readonly sha256: string; readonly signature: ArtifactSignature }`。
- `export interface OperationWorkerManifest { readonly productVersion: string; readonly extensionVersion: string; readonly protocolVersion: ProtocolVersion; readonly capabilities: readonly string[]; readonly workers: Readonly<Record<OperationWorkerPlatform, OperationWorkerArtifact>> }`。
- `export interface ResolveWorkerBinaryInput { readonly extensionRoot: string; readonly manifest: OperationWorkerManifest; readonly platform: OperationWorkerPlatform; readonly expectedProductVersion: string; readonly expectedExtensionVersion: string; readonly expectedProtocolVersion: ProtocolVersion; readonly expectedCapabilities: readonly string[] }`。
- `export interface ResolvedWorkerBinary { readonly absolutePath: string; readonly sha256: string; readonly signature: ArtifactSignature }`。
- `resolveOperationWorkerBinary(input: ResolveWorkerBinaryInput): Promise<ResolvedWorkerBinary>`。
- resolver 内部 helper は `validateManifestRelativePath(path: string): string`、`assertManifestMetadata(manifest: OperationWorkerManifest, productVersion: string, extensionVersion: string, protocolVersion: ProtocolVersion, capabilities: readonly string[]): void`、`assertPairedArtifacts(manifest: OperationWorkerManifest): void`、`inspectExecutableFile(path: string, platform: OperationWorkerPlatform): Promise<{ readonly sha256: string }>`、`validateArtifactSignatureMetadata(artifact: OperationWorkerArtifact, platform: OperationWorkerPlatform): boolean` の exact signature を持つ。file headerとhashは同じopen file handleから読む。
- missing binary、path traversal、wrong platform、version/capability mismatch、signature mismatch、hash mismatch は stable `binary_missing` または `binary_manifest_mismatch` として spawn 前に拒否する。
- Authenticode / codesign とcertificate fingerprintの実検証は `OW-DIST-002` だけが所有する。runtime resolverはpackage時に検証済みの署名metadataのplatform bindingを検査し、OS command、native addon、別verifier processを起動しない。
- `scripts/check/check-rust-runtime-boundaries.ts` はこのfileだけのNode filesystem accessをpermanent CEP binary-resolution boundaryとしてexact path + match countで許可する。domain filesystemの一般許可やdirectory wildcardは追加しない。

- [ ] **Step 1: canonical manifest の missing、traversal、hash/version/platform RED test を書く**

```ts
import { expect, it } from "vitest";
import { resolveOperationWorkerBinary, type OperationWorkerArtifact, type OperationWorkerManifest } from "./operation-worker-binary";

const artifact = (relativePath: string, digest: string): OperationWorkerArtifact => ({
  relativePath,
  sha256: digest,
  signature: { algorithm: relativePath.endsWith(".exe") ? "authenticode" : "codesign", value: "signature-worker", certificateSha256: "c".repeat(64) },
});

const manifest: OperationWorkerManifest = {
  productVersion: "1.0.0",
  extensionVersion: "1.0.0",
  protocolVersion: { major: 1, minor: 0 },
  capabilities: ["storage"],
  workers: {
    windows: artifact(`worker/versions/${"a".repeat(64)}/windows/operation-worker.exe`, "a".repeat(64)),
    macos: artifact(`worker/versions/${"b".repeat(64)}/macos/operation-worker`, "b".repeat(64)),
  },
};

it("rejects a manifest path that escapes the CEP extension root", async () => {
  const traversal: OperationWorkerManifest = Object.assign({}, manifest, { workers: Object.assign({}, manifest.workers, { windows: artifact("../worker.exe", "a".repeat(64)) }) });
  await expect(resolveOperationWorkerBinary({ extensionRoot: "C:/Extension", manifest: traversal, platform: "windows", expectedProductVersion: "1.0.0", expectedExtensionVersion: "1.0.0", expectedProtocolVersion: { major: 1, minor: 0 }, expectedCapabilities: ["storage"] })).rejects.toMatchObject({ code: "binary_manifest_mismatch" });
});

it("fails closed when the selected platform entry is absent", async () => {
  const missing = Object.assign({}, manifest, { workers: { windows: manifest.workers.windows } }) as unknown as OperationWorkerManifest;
  await expect(resolveOperationWorkerBinary({ extensionRoot: "C:/Extension", manifest: missing, platform: "macos", expectedProductVersion: "1.0.0", expectedExtensionVersion: "1.0.0", expectedProtocolVersion: { major: 1, minor: 0 }, expectedCapabilities: ["storage"] })).rejects.toMatchObject({ code: "binary_missing" });
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-binary.test.ts`

Expected: FAIL because manifest-only resolver がなく、missing/mismatch を spawn 前の stable error に変換できない。

- [ ] **Step 3: extension-root containment と paired manifest / executable / hash verification を実装する**

```ts
export const resolveOperationWorkerBinary = async (input: ResolveWorkerBinaryInput): Promise<ResolvedWorkerBinary> => {
  const artifact = input.manifest.workers[input.platform];
  if (!artifact) throw new WorkerBinaryError("binary_missing");
  assertManifestMetadata(input.manifest, input.expectedProductVersion, input.expectedExtensionVersion, input.expectedProtocolVersion, input.expectedCapabilities);
  assertPairedArtifacts(input.manifest);

  const relativePath = validateManifestRelativePath(artifact.relativePath);
  const absolutePath = resolve(input.extensionRoot, relativePath);
  const outsideRoot = relative(input.extensionRoot, absolutePath);
  if (outsideRoot.startsWith("..") || isAbsolute(outsideRoot)) throw new WorkerBinaryError("binary_manifest_mismatch");

  const { sha256 } = await inspectExecutableFile(absolutePath, input.platform);
  if (sha256 !== artifact.sha256 || !validateArtifactSignatureMetadata(artifact, input.platform)) throw new WorkerBinaryError("binary_manifest_mismatch");
  return { absolutePath, sha256, signature: artifact.signature };
};
```

`OperationWorkerManifest.workers` は必ず `Readonly<Record<OperationWorkerPlatform, OperationWorkerArtifact>>` とし、artifact の `relativePath`、`sha256`、`signature` を欠落させない。registry、environment、`PATH`、`appRoot`、固定 absolute path は読み込まない。

- [ ] **Step 4: focused GREEN を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-binary.test.ts`

Expected: PASS。Windows/macOS 各 entry、path traversal、wrong platform、missing file、product/extension/protocol/capability mismatch、両entryのmalformed/inherited field、signature metadata mismatch、hash mismatch、PE/Mach-O header不一致が fail-closed になり、成功時だけ検証済み `ResolvedWorkerBinary` が返る。

- [ ] **Step 5: review と exact commit を行う**

Review: canonical manifest type が DIST-001/002 の producer と一致し、resolver が extension root + manifest だけを使い、missing binary に fallback を返さないことを確認する。artifact build、署名、package、installer をこの task に追加しない。

```text
git diff --check -- src/management/ipc/operation-worker-binary.ts src/management/ipc/operation-worker-binary.test.ts src/management/ipc/index.ts scripts/check/check-rust-runtime-boundaries.ts
git diff -- src/management/ipc/operation-worker-binary.ts src/management/ipc/operation-worker-binary.test.ts src/management/ipc/index.ts scripts/check/check-rust-runtime-boundaries.ts
git diff --cached -- src/management/ipc/operation-worker-binary.ts src/management/ipc/operation-worker-binary.test.ts src/management/ipc/index.ts scripts/check/check-rust-runtime-boundaries.ts
git add -- src/management/ipc/operation-worker-binary.ts src/management/ipc/operation-worker-binary.test.ts src/management/ipc/index.ts scripts/check/check-rust-runtime-boundaries.ts
git commit -m "feat(ipc): resolve packaged worker binary"
```

**RESTART:** canonical manifest fixture の platform、relative path、hash、signature、version を再確認し、最初の resolver assertion から再開する。

### Task OW-CEP-003: One-shot CEP runner only

**Depends on:** OW-CEP-002。

**Consumes:** OW-RUST-003（[`01-rust-worker-protocol.md`](01-rust-worker-protocol.md) の per-invocation worker composition と generated invocation lifecycle）、OW-CEP-001、OW-CEP-002。

**Files:**
- Create: `src/management/ipc/operation-worker-runner.ts`
- Create: `src/management/ipc/operation-worker-runner.test.ts`
- Create: `src/management/ipc/operation-worker-runner.test-fixtures.ts`
- Modify: `src/management/ipc/index.ts`

**Rust boundary:** この task は CEP TypeScript runner だけを扱う。`rust/` 配下の file、Rust protocol、schema、generated output、Rust worker composition は変更しない。

**Interfaces:**
- `export type ImmutableHostContext = Readonly<{ appRoot: string; supportRoot: string; sessionId: string; managedRoot?: string }>`。AE version はstorage/process/protocol keyへ含めない。
- `export interface OperationMethod<Request, Response> { readonly name: string; readonly idempotency: "idempotent" | "non-idempotent"; readonly cancellable: boolean; readonly encode: (payload: Request, context: ImmutableHostContext) => WireMessage; readonly decode: (message: WireMessage) => Response }`。
- `export interface WorkerRunOptions { readonly signal?: AbortSignal; readonly onProgress?: (event: WorkerProgress) => void }`。
- `export interface WorkerProgress { readonly sequence: number; readonly stage: string; readonly payload: WireMessage }`。
- `export interface OperationInvocation<Request> { readonly request: Request; readonly method: OperationMethod<Request, unknown>; readonly context: ImmutableHostContext; readonly buildId: string; readonly capabilities: readonly string[] }`。
- `export interface OperationWorkerRunner { invoke<Request, Response>(invocation: OperationInvocation<Request>, options?: WorkerRunOptions): Promise<Response>; stopAccepting(): void; drain(deadlineMs: number): Promise<boolean> }`。
- `export interface WorkerChild { sendCancelFrame(): void; kill(): void }`、`waitForFinal(child: WorkerChild, graceMs: number): Promise<void>`、`OperationWorkerError` は runner の cancel/error mapping が使う exact boundary である。
- `export interface RunnerConstruction { resolveBinary(input: ResolveWorkerBinaryInput): Promise<ResolvedWorkerBinary>; spawnChild(path: string, options: WorkerSpawnOptions): WorkerChild; platform: OperationWorkerPlatform; extensionRoot: string }` と `export interface WorkerSpawnOptions { shell: false; windowsHide: boolean; cwd: string; stdio: ["pipe", "pipe", "pipe"]; env: Readonly<Record<"TY_PLUS_WORKER_ARTIFACT_SHA256", string>> }`。bootstrap digest は request payload や path discovery ではなく、worker が shared lease 下で自身を再検証するためだけに使う。
- `createOperationWorkerRunner(input: RunnerConstruction): OperationWorkerRunner`。`OperationWorkerError` は `worker_crashed`、`protocol_violation`、`worker_forced_termination` を stable code として返す。
- `ImmutableHostContext` の型契約はこのtaskが所有し、OW-CEP-005はprovider implementationだけを所有する。protocol 所有の invocation field は OW-RUST-003 の generated contract を参照する。

- [ ] **Step 1: fake child の lifecycle RED test を書く**

```ts
import { expect, it } from "vitest";
import { createOperationWorkerRunner } from "./operation-worker-runner";
import { invocationFixture, finalFrame, acceptedFrame, progressFrame, fakeChildWithFrames } from "./operation-worker-runner.test-fixtures";

it("requires accepted, monotonic progress, one final, and EOF", async () => {
  const child = fakeChildWithFrames([acceptedFrame, progressFrame(1), finalFrame]);
  const runner = createOperationWorkerRunner({
    resolveBinary: async () => ({ absolutePath: "C:/Extension/worker.exe", sha256: "hash", signature: { algorithm: "authenticode", value: "signature", certificateSha256: "c".repeat(64) } }),
    spawnChild: () => child,
    platform: "windows",
    extensionRoot: "C:/Extension",
  });

  await expect(runner.invoke(invocationFixture)).resolves.toEqual({ ok: true });
  expect(child.stdinFrames).toHaveLength(1);
  expect(child.stdoutKinds).toEqual(["accepted", "progress", "final"]);
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-runner.test.ts`

Expected: FAIL because one-shot spawn、accepted/progress/final/EOF validation、stable crash mapping が未実装である。

- [ ] **Step 3: exact spawn shape と lifecycle parser を実装する**

```ts
const child = spawn(binary.absolutePath, [], {
  shell: false,
  windowsHide: platform === "windows",
  cwd: extensionRoot,
  env: { TY_PLUS_WORKER_ARTIFACT_SHA256: binary.sha256 },
  stdio: ["pipe", "pipe", "pipe"],
});

child.stdin.write(encodeOperationWorkerFrame(invocation.method.encode(invocation.request, invocation.context)));
for await (const message of decodeWorkerStdout(child.stdout)) {
  if (message.kind === "accepted") assertAcceptedFirst(message);
  if (message.kind === "progress") onProgress(assertMonotonicProgress(message));
  if (message.kind === "final") resolveFinalOnce(message);
}
```

request は argv/env に渡さず、OW-CEP-002 の resolver 結果だけを `spawn` に渡す。resolver の
`sha256` だけは request/context から分離した `TY_PLUS_WORKER_ARTIFACT_SHA256` bootstrap metadata
として渡す。test は resolver 検証後に manifest が新 digest へ切り替わる race でも spawn path が
旧 content-addressed bytes を指すこと、digest metadata 以外の operation payload が argv/env へ
出ないことを固定する。worker 側の shared lease と self-verification は OW-DIST-003 が所有する。
stdout は OW-CEP-001 の decoder で parse し、stderr は redacted diagnostic のみ記録する。child
は invocation 完了後に close listener を解放し、別 operation へ再利用しない。

- [ ] **Step 4: lifecycle、failure、platform の GREEN を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-runner.test.ts`

Expected: PASS。accepted 前の reject、accepted/progress/final/EOF、duplicate final、progress sequence regression、malformed frame、stderr redaction、spawn error、missing final crash、Windows hidden option、macOS branch、argv/env に request がないこと、bootstrap digestだけがenvにあること、manifest switch raceで旧content-addressed pathが維持されることを確認する。Rust test、Rust file 編集、schema generator はこの task の command に含めない。

- [ ] **Step 5: review と exact commit を行う**

Review: `child_process` import が runner だけにあり、runner が process/pipe を保持して reconnect しないこと、`shell: false` と piped stdio が固定されていること、OW-RUST-003 の lifecycle を TypeScript 側で再定義していないことを確認する。

```text
rg -n "from \"node:child_process\"|require\(.*child_process" src/management/ipc/operation-worker-runner.ts
git diff --check -- src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/operation-worker-runner.test-fixtures.ts src/management/ipc/index.ts
git diff -- src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/operation-worker-runner.test-fixtures.ts src/management/ipc/index.ts
git diff --cached -- src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/operation-worker-runner.test-fixtures.ts src/management/ipc/index.ts
git add -- src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/operation-worker-runner.test-fixtures.ts src/management/ipc/index.ts
git commit -m "feat(ipc): run one operation worker"
```

**RESTART:** fake child の active/close state を確認し、focused runner test の最初の lifecycle failure から再開する。`rust/` の変更を作成しない。

### Task OW-CEP-004: Cancel、forced termination、idempotent retry、max-4 scheduler

> **Superseded:** この section の TS-only stdin / cancel snippet は実 Rust lifecycle と両立しないため実行禁止。正典は [`04-live-worker-host-verification.md`](04-live-worker-host-verification.md) の OW-LIVE-001〜003 と改訂版 OW-CEP-004。OW-CEP-005 以降は改訂版 OW-CEP-004 の reviewed commit を consume する。

**Depends on:** OW-CEP-003。

**Consumes:** OW-CEP-003 の runner と stable error、OW-RUST-003 の idempotency/commit-stage metadata。

**Files:**
- Create: `src/management/ipc/operation-worker-scheduler.ts`
- Create: `src/management/ipc/operation-worker-scheduler.test.ts`
- Create: `src/management/ipc/operation-worker-scheduler.test-fixtures.ts`
- Modify: `src/management/ipc/operation-worker-runner.ts`
- Modify: `src/management/ipc/operation-worker-runner.test.ts`
- Modify: `src/management/ipc/index.ts`

**Interfaces:**
- `export interface RunnerFactory { create(): OperationWorkerRunner }`。
- `export interface WorkerJob<Result> { readonly invocation: OperationInvocation<unknown>; readonly run: (runner: OperationWorkerRunner, options: WorkerRunOptions) => Promise<Result>; readonly idempotency: "idempotent" | "non-idempotent" }`。
- `export interface RetryState { readonly retryCount: number; readonly idempotent: boolean; readonly commitObserved: boolean }`。
- `export interface CancelPolicy { readonly graceMs: number; readonly forceErrorCode: "worker_forced_termination" }`。
- `export class OperationWorkerScheduler { constructor(factory: RunnerFactory, limit: 4 = 4); enqueue<Result>(job: WorkerJob<Result>): Promise<Result>; stopAccepting(): void; drain(deadlineMs: number): Promise<boolean>; activeCount(): number }`。実行時の `limit` は常に 4 と検証する。
- `canRetry(state: RetryState): boolean` は `retryCount === 0 && idempotent && !commitObserved` だけを true にする。
- cancel は同じ runner/child に一つの cancel frame を送り、grace 経過後だけ対象 child を強制終了する。bulk kill、process group kill、無制限 timer は使わない。

- [ ] **Step 1: cancel/retry/scheduler RED test を書く**

```ts
import { expect, it } from "vitest";
import { OperationWorkerScheduler, canRetry } from "./operation-worker-scheduler";
import { deferredRunnerFactory } from "./operation-worker-scheduler.test-fixtures";

it("allows one idempotent retry only before commit", () => {
  expect(canRetry({ retryCount: 0, idempotent: true, commitObserved: false })).toBe(true);
  expect(canRetry({ retryCount: 1, idempotent: true, commitObserved: false })).toBe(false);
  expect(canRetry({ retryCount: 0, idempotent: false, commitObserved: false })).toBe(false);
  expect(canRetry({ retryCount: 0, idempotent: true, commitObserved: true })).toBe(false);
});

it("keeps a fifth job queued while four workers are active", async () => {
  const runnerFactory = deferredRunnerFactory();
  const scheduler = new OperationWorkerScheduler(runnerFactory, 4);
  const jobs = Array.from({ length: 5 }, (_, index) => scheduler.enqueue(workerJob(index)));

  expect(scheduler.activeCount()).toBe(4);
  expect(runnerFactory.started()).toHaveLength(4);
  runnerFactory.release(0);
  await expect(jobs[0]).resolves.toBe(0);
  expect(runnerFactory.started()).toHaveLength(5);
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-runner.test.ts`

Expected: FAIL because cancel grace、forced error、retry guard、FIFO queue、max-4 active limit、bounded drain が未実装である。

- [ ] **Step 3: cancel と retry guard を実装する**

```ts
export const canRetry = (state: RetryState): boolean =>
  state.retryCount === 0 && state.idempotent && !state.commitObserved;

const cancelOneWorker = async (child: WorkerChild, policy: CancelPolicy): Promise<never> => {
  child.sendCancelFrame();
  await waitForFinal(child, policy.graceMs);
  child.kill();
  throw new OperationWorkerError(policy.forceErrorCode);
};
```

progress で commit stage を観測した時点から retry 不可にし、write/non-idempotent の failure はそのまま返す。retry 時は runner を新たに作り、前 process の stdin/stdout、request id、memory、pipe を再利用しない。

- [ ] **Step 4: FIFO max-4 scheduler と bounded drain を実装する**

```ts
const MAX_ACTIVE_WORKERS = 4;

private pump(): void {
  while (this.accepting && this.active.size < MAX_ACTIVE_WORKERS && this.queue.length > 0) {
    const job = this.queue.shift();
    if (job) void this.start(job);
  }
}
```

`stopAccepting()` 後は新規 job を開始せず、queued job を deadline 時に stable update-abort として処理する。`drain(deadlineMs)` は active と queue が空なら `true`、deadline 到達時に active worker を殺さず `false` を返す。

- [ ] **Step 5: focused GREEN を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-runner.test.ts`

Expected: PASS。graceful cancel、commit-stage 後の retry 拒否、forced termination error、idempotent の一回 retry、write の retry なし、fresh process identity、FIFO、active 最大 4、stop accepting、deadline drain、bulk kill なしを確認する。

- [ ] **Step 6: review と exact commit を行う**

Review: retry が最大一回で commit 観測後に行われないこと、cancel が同じ child に一回だけ送られること、forced termination が対象 child だけであること、scheduler limit が 4 以外を受け付けないことを確認する。

```text
git diff --check -- src/management/ipc/operation-worker-scheduler.ts src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-scheduler.test-fixtures.ts src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/index.ts
git diff -- src/management/ipc/operation-worker-scheduler.ts src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-scheduler.test-fixtures.ts src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/index.ts
git diff --cached -- src/management/ipc/operation-worker-scheduler.ts src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-scheduler.test-fixtures.ts src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/index.ts
git add -- src/management/ipc/operation-worker-scheduler.ts src/management/ipc/operation-worker-scheduler.test.ts src/management/ipc/operation-worker-scheduler.test-fixtures.ts src/management/ipc/operation-worker-runner.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/index.ts
git commit -m "feat(ipc): schedule cancellable workers"
```

**RESTART:** active count、queue order、retryCount、commitObserved を記録し、同じ fake child lifecycle の最初の failing assertion から再開する。

### Task OW-CEP-005: Immutable HostContext provider

**Depends on:** OW-CEP-004。

**Consumes:** OW-RUST-003 の invocation context contract と ExtendScript host boundary。gateway の operation call は後続 OW-CEP-006〜008 が行う。

**Files:**
- Create: `src/management/ae/host-bridge.test.ts`
- Create: `src/management/ipc/operation-worker-context.ts`
- Create: `src/management/ipc/operation-worker-context.test.ts`
- Modify: `src/management/ae/host/contract.ts`
- Modify: `src/management/ae/host-bridge.ts`
- Modify: `src/management/ae/jsx/host-bundle.ext.ts`
- Modify: `src/management/ae/jsx/host-bundle.test.ts`
- Modify: `src/management/ipc/index.ts`

**Interfaces:**
- **Consumes:** OW-CEP-003の`ImmutableHostContext`型契約。
- `export type HostContextProvider = () => Promise<ImmutableHostContext>`。
- `createOperationWorkerContextProvider(win: Window): HostContextProvider` は ExtendScript の `getHostContext` を呼び、`appRoot`、`supportRoot`、`sessionId` を検証して `Object.freeze` する。
- `getHostContext` は `AfterEffectsHostApi` にだけ残し、Rust filesystem gateway や storage/online gateway には公開しない。

- [ ] **Step 1: immutable provider の RED test を書く**

```ts
import { expect, it, vi } from "vitest";
import { createOperationWorkerContextProvider } from "./operation-worker-context";

it("freezes the ExtendScript host context for each invocation", async () => {
  const host = { getHostContext: vi.fn().mockResolvedValue({ appRoot: "C:/AE", supportRoot: "C:/Support/session-1", sessionId: "session-1" }) };
  const context = await createOperationWorkerContextProvider(host as unknown as Window)();

  expect(Object.isFrozen(context)).toBe(true);
  expect(context.appRoot).toBe("C:/AE");
  expect(host.getHostContext).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-context.test.ts src/management/ae/jsx/host-bundle.test.ts`

Expected: FAIL because context provider がなく、ExtendScript の camelCase context を immutable invocation context に変換できない。

- [ ] **Step 3: provider と boundary mapping を実装する**

```ts
export const createOperationWorkerContextProvider = (win: Window): HostContextProvider => async () => {
  const value = await createAfterEffectsHostApi(win).getHostContext();
  if (!value.appRoot || !value.supportRoot || !value.sessionId) throw new Error("host_context_missing");
  return Object.freeze({ appRoot: value.appRoot, supportRoot: value.supportRoot, sessionId: value.sessionId, managedRoot: value.managedRoot });
};
```

`appRoot` は ExtendScript の `app.path`、support root と session id は同じ host context response を唯一の source とする。Node/Rust で root を再発見せず、AE version は context、process、protocol、storage key のいずれにも含めない。

- [ ] **Step 4: focused GREEN を実行する**

Run: `bun run vitest run src/management/ipc/operation-worker-context.test.ts src/management/ae/jsx/host-bundle.test.ts src/management/ae/host-bridge.test.ts`

Expected: PASS。空の root/session は拒否され、各呼び出しが frozen context を受け取り、ExtendScript 以外の root discovery がない。

- [ ] **Step 5: review と exact commit を行う**

Review: context provider が process/gateway を保持せず、explicit shared root 以外で managed root を共有せず、`getHostContext` が AE host boundary に限定されることを確認する。

```text
git diff --check -- src/management/ae/host-bridge.test.ts src/management/ipc/operation-worker-context.ts src/management/ipc/operation-worker-context.test.ts src/management/ae/host/contract.ts src/management/ae/host-bridge.ts src/management/ae/jsx/host-bundle.ext.ts src/management/ae/jsx/host-bundle.test.ts src/management/ipc/index.ts
git diff -- src/management/ae/host-bridge.test.ts src/management/ipc/operation-worker-context.ts src/management/ipc/operation-worker-context.test.ts src/management/ae/host/contract.ts src/management/ae/host-bridge.ts src/management/ae/jsx/host-bundle.ext.ts src/management/ae/jsx/host-bundle.test.ts src/management/ipc/index.ts
git diff --cached -- src/management/ae/host-bridge.test.ts src/management/ipc/operation-worker-context.ts src/management/ipc/operation-worker-context.test.ts src/management/ae/host/contract.ts src/management/ae/host-bridge.ts src/management/ae/jsx/host-bundle.ext.ts src/management/ae/jsx/host-bundle.test.ts src/management/ipc/index.ts
git add -- src/management/ae/host-bridge.test.ts src/management/ipc/operation-worker-context.ts src/management/ipc/operation-worker-context.test.ts src/management/ae/host/contract.ts src/management/ae/host-bridge.ts src/management/ae/jsx/host-bundle.ext.ts src/management/ae/jsx/host-bundle.test.ts src/management/ipc/index.ts
git commit -m "feat(ipc): capture immutable host context"
```

**RESTART:** provider の field mapping と frozen assertion を再読し、最初の context test failure から再開する。

### Task OW-CEP-006: Storage gateway per-operation invocation

**Depends on:** OW-CEP-005。

**Consumes:** OW-CEP-003 の `OperationMethod`/`WorkerRunOptions`、OW-CEP-004 の runner/scheduler、OW-CEP-005 の `HostContextProvider`。storage policy、Rust storage、retention、transaction、offline matrix は [`03-storage-distribution-release.md`](03-storage-distribution-release.md) が所有する。

**Files:**
- Create: `src/management/storage/runtime-gateway.test.ts`
- Modify: `src/management/storage/runtime-gateway.ts`
- Modify: `src/management/storage/runtime-gateway-port.ts`
- Modify: `src/management/storage/runtime-gateway-port.test.ts`
- Modify: `src/management/storage/persistence/io.ts`
- Modify: `src/management/storage/index.ts`

**Interfaces:**
- `export type OperationWorkerInvoker = <Request, Response>(method: OperationMethod<Request, Response>, payload: Request, context: ImmutableHostContext, options?: WorkerRunOptions) => Promise<Response>`。この task が後続 online/AE gateway 用の invoker boundary を生成する。
- `export interface StorageGateway { read<T>(key: RegisteredStorageKey): Promise<T | null>; write<T>(key: RegisteredStorageKey, value: T): Promise<void>; remove(key: RegisteredStorageKey): Promise<void> }`。
- `createStorageGateway(invoke: OperationWorkerInvoker, getContext: HostContextProvider): StorageGateway`。
- `StorageGateway.read<T>(key: RegisteredStorageKey): Promise<T | null>`、`write<T>(key: RegisteredStorageKey, value: T): Promise<void>`、`remove(key: RegisteredStorageKey): Promise<void>` は各 call で context を取得し、worker を一回 invoke する。
- `RuntimeTransport`、`RuntimeRequestDispatcher`、module-global connected gateway、TS filesystem fallback は storage gateway の input/output に存在しない。

- [ ] **Step 1: storage invoker の RED test を書く**

```ts
import { expect, it, vi } from "vitest";
import { createStorageGateway } from "./runtime-gateway";

it("passes a fresh immutable context to every storage operation", async () => {
  const invoke = vi.fn().mockResolvedValue({ value: { enabled: true } });
  const getContext = vi.fn().mockResolvedValue(Object.freeze({ appRoot: "C:/AE", supportRoot: "C:/Support", sessionId: "session-1" }));
  const gateway = createStorageGateway(invoke, getContext);

  await gateway.read("settings/app.json");
  expect(invoke).toHaveBeenCalledWith(expect.anything(), { key: "settings/app.json" }, expect.objectContaining({ appRoot: "C:/AE", sessionId: "session-1" }), expect.anything());
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/storage/runtime-gateway-port.test.ts src/management/storage/runtime-gateway.test.ts`

Expected: FAIL because storage gateway が old runtime dispatcher または connected persistence gateway を使用し、operation ごとの context/invoker を受け取らない。

- [ ] **Step 3: storage gateway と persistence callsite を worker invoker に切り替える**

```ts
export const createStorageGateway = (invoke: OperationWorkerInvoker, getContext: HostContextProvider): StorageGateway => ({
  read: async <T>(key: RegisteredStorageKey) => invoke(storageReadMethod<T>(), { key }, await getContext()),
  write: async <T>(key: RegisteredStorageKey, value: T) => { await invoke(storageWriteMethod<T>(), { key, value }, await getContext()); },
  remove: async (key: RegisteredStorageKey) => { await invoke(storageRemoveMethod(), { key }, await getContext()); },
});
```

storage policy の値や Rust transaction をこの task で変更せず、TS は worker response を既存 DTO に写像する。offline-independent operation は同じ worker 経路で動き、local filesystem fallback は追加しない。

- [ ] **Step 4: storage GREEN を実行する**

Run: `bun run vitest run src/management/storage/runtime-gateway-port.test.ts src/management/storage/runtime-gateway.test.ts src/management/storage/persistence/io.test.ts`

Expected: PASS。read/write/remove が毎回 context を渡し、gateway が child/pipe/dispatcher を保持せず、storage policy と Rust storage file に差分がない。

- [ ] **Step 5: review と exact commit を行う**

Review: 03 の storage-owned policy を再定義していないこと、`runtime-init.ts` をこの task で削除していないこと、storage I/O が invoker 境界だけを通ることを確認する。

```text
git diff --check -- src/management/storage/runtime-gateway.test.ts src/management/storage/runtime-gateway.ts src/management/storage/runtime-gateway-port.ts src/management/storage/runtime-gateway-port.test.ts src/management/storage/persistence/io.ts src/management/storage/index.ts
git diff -- src/management/storage/runtime-gateway.test.ts src/management/storage/runtime-gateway.ts src/management/storage/runtime-gateway-port.ts src/management/storage/runtime-gateway-port.test.ts src/management/storage/persistence/io.ts src/management/storage/index.ts
git diff --cached -- src/management/storage/runtime-gateway.test.ts src/management/storage/runtime-gateway.ts src/management/storage/runtime-gateway-port.ts src/management/storage/runtime-gateway-port.test.ts src/management/storage/persistence/io.ts src/management/storage/index.ts
git add -- src/management/storage/runtime-gateway.test.ts src/management/storage/runtime-gateway.ts src/management/storage/runtime-gateway-port.ts src/management/storage/runtime-gateway-port.test.ts src/management/storage/persistence/io.ts src/management/storage/index.ts
git commit -m "refactor(storage): invoke worker per operation"
```

**RESTART:** storage gateway の invoker signature と context assertion を再確認し、最初の storage test failure から再開する。

### Task OW-CEP-007: Online/catalog gateway per-operation invocation

**Depends on:** OW-CEP-006。

**Consumes:** OW-CEP-006 の `OperationWorkerInvoker`、OW-CEP-005 の `HostContextProvider`、03 の online/offline/licensing policy。外部 licensing provider はこの task で発明しない。

**Files:**
- Modify: `src/management/online/runtime-gateway.ts`
- Modify: `src/management/online/catalog/runtime-cloud-gateway.ts`
- Modify: `src/management/online/catalog/runtime-cloud-gateway.test.ts`
- Modify: `src/management/online/runtime-gateway.test.ts`

**Interfaces:**
- `createOnlineGateway(invoke: OperationWorkerInvoker, getContext: HostContextProvider): OnlineGateway`。
- `createRuntimeCloudGateway(invoke: OperationWorkerInvoker, getContext: HostContextProvider): RuntimeCloudGateway`。
- `OnlineGateway` と `RuntimeCloudGateway` は既存の search/download DTO を返し、transport または process を property として保持しない。
- online/catalog DTO は existing TypeScript contract を維持し、各 operation で `invoke(method, payload, context, options)` を一度呼ぶ。
- offline-independent operation は network がなくても worker invocation を継続し、licensing due check は invocation-owned policy として 03 に委ねる。

- [ ] **Step 1: online/catalog invoker の RED test を書く**

```ts
import { expect, it, vi } from "vitest";
import { createRuntimeCloudGateway } from "./runtime-cloud-gateway";

it("maps catalog requests through the operation worker invoker", async () => {
  const invoke = vi.fn().mockResolvedValue({ items: [] });
  const getContext = vi.fn().mockResolvedValue(Object.freeze({ appRoot: "C:/AE", supportRoot: "C:/Support", sessionId: "session-1" }));
  const gateway = createRuntimeCloudGateway(invoke, getContext);

  await gateway.search({ query: "preset" });
  expect(invoke).toHaveBeenCalledWith(expect.anything(), { query: "preset" }, expect.objectContaining({ sessionId: "session-1" }), expect.anything());
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/online/runtime-gateway.test.ts src/management/online/catalog/runtime-cloud-gateway.test.ts`

Expected: FAIL because online/catalog gateway が resident runtime transport を保持し、worker invoker と immutable context を受け取らない。

- [ ] **Step 3: online/catalog gateway を operation invoker に切り替える**

```ts
export const createRuntimeCloudGateway = (invoke: OperationWorkerInvoker, getContext: HostContextProvider): RuntimeCloudGateway => ({
  search: async (input: SearchInput) => mapSearchResponse(await invoke(catalogSearchMethod, input, await getContext())),
  download: async (input: DownloadInput) => mapDownloadResponse(await invoke(catalogDownloadMethod, input, await getContext())),
});
```

旧 dispatcher、missing-binary fixture fallback、TS network fallback を除去し、DTO mapping と offline behavior は保持する。vendor endpoint、license provider、cache retention の仕様を追加しない。

- [ ] **Step 4: online/catalog GREEN を実行する**

Run: `bun run vitest run src/management/online/runtime-gateway.test.ts src/management/online/catalog/runtime-cloud-gateway.test.ts`

Expected: PASS。search/download が fresh context を渡し、resident connection がなく、offline-independent call が worker 経路を使い、既存 DTO mapping が維持される。

- [ ] **Step 5: review と exact commit を行う**

Review: 03 の online/offline/licensing policy file を変更していないこと、外部 API を推測していないこと、online/catalog callsite が storage gateway や AE filesystem gateway に依存していないことを確認する。

```text
git diff --check -- src/management/online/runtime-gateway.ts src/management/online/catalog/runtime-cloud-gateway.ts src/management/online/catalog/runtime-cloud-gateway.test.ts src/management/online/runtime-gateway.test.ts
git diff -- src/management/online/runtime-gateway.ts src/management/online/catalog/runtime-cloud-gateway.ts src/management/online/catalog/runtime-cloud-gateway.test.ts src/management/online/runtime-gateway.test.ts
git diff --cached -- src/management/online/runtime-gateway.ts src/management/online/catalog/runtime-cloud-gateway.ts src/management/online/catalog/runtime-cloud-gateway.test.ts src/management/online/runtime-gateway.test.ts
git add -- src/management/online/runtime-gateway.ts src/management/online/catalog/runtime-cloud-gateway.ts src/management/online/catalog/runtime-cloud-gateway.test.ts src/management/online/runtime-gateway.test.ts
git commit -m "refactor(online): invoke worker per operation"
```

**RESTART:** online/catalog の method/payload/DTO mapping を再確認し、最初の online test failure から再開する。

### Task OW-CEP-008: AE filesystem gateway と callsites

**Depends on:** OW-CEP-007。

**Consumes:** OW-CEP-006 の `OperationWorkerInvoker`、OW-CEP-005 の `HostContextProvider`、AE DOM は `AfterEffectsHostApi` に残す。

**Files:**
- Modify: `src/management/ae/files/runtime-gateway.ts`
- Modify: `src/management/ae/files/runtime-gateway-impl.ts`
- Modify: `src/management/ae/files/runtime-gateway-impl.test.ts`
- Create: `src/management/workspace/services.test.ts`
- Create: `src/management/workspace/runtime.test.ts`
- Create: `src/management/dialog/modeless/boot.test.tsx`
- Modify: `src/management/workspace/services.ts`
- Modify: `src/management/workspace/runtime.ts`
- Modify: `src/management/panel/boot.tsx`
- Modify: `src/management/dialog/modeless/boot.tsx`

**Interfaces:**
- `createAeFilesystemGateway(invoke: OperationWorkerInvoker, getContext: HostContextProvider): AeFilesystemGateway`。
- `export interface AeFilesystemGateway { scanPlugins(input: PluginScanInput): Promise<PluginScanResult> }`。
- AE filesystem scan、plugin file operation、workspace product I/O は `invoke(method, payload, context, options)` を使う。
- AE DOM 操作は `AfterEffectsHostApi` を使い、filesystem/network/shell primitive を React component や ExtendScript callsite に渡さない。
- `getHostContext` は Rust filesystem gateway の method ではなく OW-CEP-005 の provider だけから取得する。

- [ ] **Step 1: AE filesystem と callsite の RED test を書く**

```ts
import { expect, it, vi } from "vitest";
import { createAeFilesystemGateway } from "./runtime-gateway-impl";

it("routes an AE filesystem scan through one worker invocation", async () => {
  const invoke = vi.fn().mockResolvedValue({ entries: [] });
  const getContext = vi.fn().mockResolvedValue(Object.freeze({ appRoot: "C:/AE", supportRoot: "C:/Support", sessionId: "session-1" }));
  const gateway = createAeFilesystemGateway(invoke, getContext);

  await gateway.scanPlugins({ root: "plugins" });
  expect(invoke).toHaveBeenCalledWith(expect.anything(), { root: "plugins" }, expect.objectContaining({ appRoot: "C:/AE" }), expect.anything());
});
```

- [ ] **Step 2: focused RED を実行する**

Run: `bun run vitest run src/management/ae/files/runtime-gateway-impl.test.ts src/management/workspace/services.test.ts src/management/workspace/runtime.test.ts`

Expected: FAIL because AE filesystem gateway と workspace/panel/dialog callsites が old runtime dispatcher または direct I/O を使用している。

- [ ] **Step 3: AE filesystem gateway と callsites を切り替える**

```ts
export const createAeFilesystemGateway = (invoke: OperationWorkerInvoker, getContext: HostContextProvider): AeFilesystemGateway => ({
  scanPlugins: async (input: PluginScanInput) => mapPluginScanResponse(await invoke(pluginScanMethod, input, await getContext())),
});
```

workspace service、workspace runtime、panel boot、modeless dialog boot に invoker/context provider を注入し、AE DOM の処理は host API に残す。Rust storage/online policy、ExtendScript generic file I/O、TS fallback はこの task で追加しない。

- [ ] **Step 4: AE filesystem と callsite GREEN を実行する**

Run: `bun run vitest run src/management/ae/files/runtime-gateway-impl.test.ts src/management/workspace/services.test.ts src/management/workspace/runtime.test.ts src/management/panel/boot.test.tsx src/management/dialog/modeless/boot.test.tsx`

Expected: PASS。AE filesystem operation が一回の worker invocation と immutable context を使い、AE DOM だけが host API に残り、workspace/panel/dialog が resident gateway を保持しない。

- [ ] **Step 5: review と exact commit を行う**

Review: filesystem/network/shell の product I/O が invoker 境界だけを通り、AE DOM と product filesystem の ownership が混ざらず、03 所有の Rust storage/online policy file に差分がないことを確認する。

```text
git diff --check -- src/management/ae/files/runtime-gateway.ts src/management/ae/files/runtime-gateway-impl.ts src/management/ae/files/runtime-gateway-impl.test.ts src/management/workspace/services.test.ts src/management/workspace/runtime.test.ts src/management/dialog/modeless/boot.test.tsx src/management/workspace/services.ts src/management/workspace/runtime.ts src/management/panel/boot.tsx src/management/dialog/modeless/boot.tsx
git diff -- src/management/ae/files/runtime-gateway.ts src/management/ae/files/runtime-gateway-impl.ts src/management/ae/files/runtime-gateway-impl.test.ts src/management/workspace/services.test.ts src/management/workspace/runtime.test.ts src/management/dialog/modeless/boot.test.tsx src/management/workspace/services.ts src/management/workspace/runtime.ts src/management/panel/boot.tsx src/management/dialog/modeless/boot.tsx
git diff --cached -- src/management/ae/files/runtime-gateway.ts src/management/ae/files/runtime-gateway-impl.ts src/management/ae/files/runtime-gateway-impl.test.ts src/management/workspace/services.test.ts src/management/workspace/runtime.test.ts src/management/dialog/modeless/boot.test.tsx src/management/workspace/services.ts src/management/workspace/runtime.ts src/management/panel/boot.tsx src/management/dialog/modeless/boot.tsx
git add -- src/management/ae/files/runtime-gateway.ts src/management/ae/files/runtime-gateway-impl.ts src/management/ae/files/runtime-gateway-impl.test.ts src/management/workspace/services.test.ts src/management/workspace/runtime.test.ts src/management/dialog/modeless/boot.test.tsx src/management/workspace/services.ts src/management/workspace/runtime.ts src/management/panel/boot.tsx src/management/dialog/modeless/boot.tsx
git commit -m "refactor(ae): invoke worker per operation"
```

**RESTART:** AE filesystem method と callsite injection を再確認し、最初の AE test failure から再開する。

### Task OW-CEP-009: TS resident transport/lifecycle/multiplex/runtime-init deletion

**Depends on:** OW-DIST-003 と OW-CEP-005、OW-CEP-006、OW-CEP-007、OW-CEP-008 の GREEN。OW-DIST-003 は [`03-storage-distribution-release.md`](03-storage-distribution-release.md) の dev real binary と cross-process install lease boundary である。

**Consumes:** OW-CEP-005〜008 の context provider と責任別 gateway、OW-DIST-003 の update boundary。artifact、installer、Rust runtime deletion は上流 plan または後続 plan の所有であり、この task は TS resident path だけを削除する。

**Files:**
- Delete after OW-CEP-008 GREEN: `src/management/ipc/transport.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/transport.test.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/lifecycle-runtime.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/lifecycle-runtime.test.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/lifecycle.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/frame.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/codec.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/multiplex.ts`
- Delete after OW-CEP-008 GREEN: `src/management/ipc/multiplex.test.ts`
- Delete after OW-CEP-008 GREEN: `src/management/storage/runtime-init.ts`
- Create: `src/management/ipc/resident-runtime-removal.test.ts`
- Modify: `src/management/ipc/index.ts`

**Interfaces:**
- `src/management/ipc/index.ts` は operation-worker frame、binary、runner、scheduler、context、responsibility invoker、logging だけを export する。
- product source に `RuntimeTransport`、`RuntimeLifecycle`、`SurfaceMultiplex`、`initRustStorageRuntime`、resident connection lifecycle、endpoint discovery、heartbeat、named pipe、UDS、JS/ExtendScript fallback の import/use を残さない。
- `operation-worker-runner.ts` だけが CEP Node の permanent な `child_process` boundary である。OW-CEP-004 の cancellation API に必要なら `cancellation.ts` は残す。
- OW-DIST-003 の paired artifact と cross-process install lease をこの task が再実装せず、update deadline failure で active worker を一括 kill しない上流 contract を維持する。

- [ ] **Step 1: resident symbol の RED guard test を追加する**

```ts
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("exports no resident runtime symbols after cutover", async () => {
  const indexSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  expect(indexSource).not.toMatch(/RuntimeTransport|RuntimeLifecycle|SurfaceMultiplex|initRustStorageRuntime/);
});
```

- [ ] **Step 2: deletion guard を RED で実行する**

Run: `bun run vitest run src/management/ipc/resident-runtime-removal.test.ts`

Expected: FAIL because `index.ts` と resident IPC files が旧 transport/lifecycle/multiplex/runtime-init symbols を公開または参照している。

- [ ] **Step 3: resident files と runtime-init を削除し、exports を切り替える**

```ts
export { encodeOperationWorkerFrame, OperationWorkerFrameDecoder } from "./operation-worker-frame";
export { resolveOperationWorkerBinary } from "./operation-worker-binary";
export { createOperationWorkerRunner } from "./operation-worker-runner";
export { OperationWorkerScheduler } from "./operation-worker-scheduler";
export { createOperationWorkerContextProvider } from "./operation-worker-context";
export type { OperationWorkerInvoker } from "./request";
```

callsite は OW-CEP-005〜008 の provider/gateway に向け、旧 connection lifecycle、module-global runtime init、resident process state を再導入しない。managed data、locator/reset semantics、transaction、search cache、history、snapshot、retention、`src/management/ae/cep/transport/` の surface messaging は削除しない。

- [ ] **Step 4: product-wide GREEN search、typecheck、canonical gate を実行する**

```text
rg -n "RuntimeTransport|RuntimeLifecycle|SurfaceMultiplex|initRustStorageRuntime|endpoint\.json|named pipe|Unix domain|heartbeat|single-instance|fallbackToLegacy|rust/apps/runtime" src scripts package.json
bun run vitest run src/management/ipc/resident-runtime-removal.test.ts src/management/ipc/operation-worker-frame.test.ts src/management/ipc/operation-worker-binary.test.ts src/management/ipc/operation-worker-runner.test.ts src/management/ipc/operation-worker-scheduler.test.ts
bun run typecheck
bun run ci
```

Expected: product path の検索結果は 0 件、resident removal と operation-worker focused tests は PASS、typecheck と `bun run ci` は actionable warning なしで PASS になる。historical superseded docs は product source scan の対象にしない。

- [ ] **Step 5: review と exact deletion commit を行う**

Review: `child_process` import が runner だけであること、Rust files をこの task が削除・変更していないこと、OW-DIST-003 の artifact/installer ownership を重複させていないこと、旧 transport 削除後も各 operation が fresh process を起動することを確認する。

```text
git diff --check -- src/management/ipc/index.ts src/management/ipc/transport.ts src/management/ipc/transport.test.ts src/management/ipc/lifecycle-runtime.ts src/management/ipc/lifecycle-runtime.test.ts src/management/ipc/lifecycle.ts src/management/ipc/frame.ts src/management/ipc/codec.ts src/management/ipc/multiplex.ts src/management/ipc/multiplex.test.ts src/management/storage/runtime-init.ts src/management/ipc/resident-runtime-removal.test.ts
git diff -- src/management/ipc/index.ts src/management/ipc/transport.ts src/management/ipc/transport.test.ts src/management/ipc/lifecycle-runtime.ts src/management/ipc/lifecycle-runtime.test.ts src/management/ipc/lifecycle.ts src/management/ipc/frame.ts src/management/ipc/codec.ts src/management/ipc/multiplex.ts src/management/ipc/multiplex.test.ts src/management/storage/runtime-init.ts src/management/ipc/resident-runtime-removal.test.ts
git diff --cached -- src/management/ipc/index.ts src/management/ipc/transport.ts src/management/ipc/transport.test.ts src/management/ipc/lifecycle-runtime.ts src/management/ipc/lifecycle-runtime.test.ts src/management/ipc/lifecycle.ts src/management/ipc/frame.ts src/management/ipc/codec.ts src/management/ipc/multiplex.ts src/management/ipc/multiplex.test.ts src/management/storage/runtime-init.ts src/management/ipc/resident-runtime-removal.test.ts
git add -- src/management/ipc/index.ts src/management/ipc/transport.ts src/management/ipc/transport.test.ts src/management/ipc/lifecycle-runtime.ts src/management/ipc/lifecycle-runtime.test.ts src/management/ipc/lifecycle.ts src/management/ipc/frame.ts src/management/ipc/codec.ts src/management/ipc/multiplex.ts src/management/ipc/multiplex.test.ts src/management/storage/runtime-init.ts src/management/ipc/resident-runtime-removal.test.ts
git commit -m "refactor(ipc): remove resident runtime transport"
```

**RESTART:** 削除後の `git status --short` と product-wide search を確認し、最初に失敗した export/import assertion から再開する。削除した resident file を compatibility のために戻さない。

---

## Self-review

- [ ] **Spec coverage:** OW-CEP-001 は OW-PRO-002 の generated TS contract を consume する 4-byte codec、OW-CEP-002 は `OperationWorkerPlatform` / `OperationWorkerArtifact` / `OperationWorkerManifest` を使う manifest-only resolver、OW-CEP-003 は Rust file を触らない one-shot CEP runner、OW-CEP-004 は cancel/forced termination/idempotent retry 一回/max-4 scheduler、OW-CEP-005 は immutable HostContext provider、OW-CEP-006 は storage gateway、OW-CEP-007 は online/catalog gateway、OW-CEP-008 は AE filesystem gateway と callsites、OW-CEP-009 は OW-DIST-003 依存の resident TS deletion を担当する。
- [ ] **Boundary coverage:** protocol Rust/schema は `01-rust-worker-protocol.md`、storage/online policy と artifact/installer は `03-storage-distribution-release.md` に置かれ、この plan は上流リンクと `Consumes` 以外で再定義していない。
- [ ] **Placeholder scan:** 未定義の将来作業、曖昧な実装指示、コード snippet の省略記号、未定義の `WorkerRunOptions`、`RunnerFactory`、`WorkerJob`、`OperationMethod` は残さない。各 task は exact Files、Interfaces、RED/Expected、TypeScript snippet、GREEN、review、exact `git add`/commit、RESTART を持つ。
- [ ] **Type consistency:** OW-CEP-002 の `OperationWorkerManifest` は DIST-001/002 の `Readonly<Record<OperationWorkerPlatform, OperationWorkerArtifact>>` を受け、OW-CEP-003 の `OperationMethod` / `WorkerRunOptions` / runner を OW-CEP-004 が使い、OW-CEP-006 の `OperationWorkerInvoker` と OW-CEP-005 の provider を OW-CEP-007〜008 が使い、OW-CEP-009 が全 gateway と OW-DIST-003 の update boundary を消費する。
- [ ] **Exact task count:** この plan の実装 task は `OW-CEP-001` から `OW-CEP-009` の9つだけであり、旧 OW-CEP-006 deletion task は存在せず削除内容は OW-CEP-009 に移している。
- [ ] **Commit subjects:** task 001〜009 はそれぞれ指定された `feat(ipc): add worker frame codec`、`feat(ipc): resolve packaged worker binary`、`feat(ipc): run one operation worker`、`feat(ipc): schedule cancellable workers`、`feat(ipc): capture immutable host context`、`refactor(storage): invoke worker per operation`、`refactor(online): invoke worker per operation`、`refactor(ae): invoke worker per operation`、`refactor(ipc): remove resident runtime transport` を使う。
- [ ] **Safety:** plan writer は source code/test の実変更、stage、commit、test command を実行しない。future executor は開始時に dirty snapshot と path ownership を確認し、supervisor だけが exact-path commit を行う。
