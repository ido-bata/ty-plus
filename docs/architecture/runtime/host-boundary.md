# Host Boundary

This document defines the product boundary between React / CEP, ExtendScript,
the Rust operation worker, and After Effects. Source ownership is authoritative in
[`../repository/source-ownership.md`](../repository/source-ownership.md); wire
shapes remain authoritative in `rust/crates/protocol/src/`.

## Canonical Source Paths

| Responsibility | Path |
| --- | --- |
| AE DOM operations and `Folder.appPackage.fsName` discovery | `src/management/ae/jsx/host-bundle.ext.ts` and `src/management/ae/` |
| TypeScript transport, lifecycle, and generated wire contract | `src/management/ipc/` |
| AE-related OS filesystem request boundary | `src/management/ae/files/runtime-gateway.ts` |
| Managed storage request boundary | `src/management/storage/runtime-gateway.ts` |
| Product network request boundary | `src/management/online/runtime-gateway.ts` |
| Versioned IPC contract and boundary validation | `rust/crates/protocol/` |
| AE-scoped filesystem operations and elevation | `rust/crates/host-filesystem/` |
| Persistent storage, cache, and operation history | `rust/crates/storage/` |
| Product HTTP, catalog, sync, and download | `rust/crates/online/` |
| aescripts license policy and state | `rust/crates/licensing/` |
| One-invocation worker lifecycle and composition | `rust/apps/operation-worker/` |

## Execution Boundary

React coordinates use cases through responsibility-specific gateways. It does
not perform product filesystem or network work and does not receive arbitrary
filesystem primitives from the runtime.

The Rust operation worker owns OS filesystem access, protected writes, product
network access, persistent caches, and operation history for one invocation. It
does not call the After Effects DOM. ExtendScript owns only AE operations and
host context discovery. Rust and ExtendScript therefore do not call each other
directly.

The common IPC layer owns framing, handshake, connection lifecycle, generated
wire types, and boundary validation. Domain methods remain declared and consumed
through the gateway nearest to the responsibility that owns them.

## Host Context and Multiple AE Versions

- `appRoot` is obtained from After Effects as ExtendScript-side
  `Folder.appPackage.fsName`; it is
  never hardcoded or rediscovered by Rust.
- The connected AE session supplies its app and support roots to the operation worker.
- No protocol, binary, or storage layout is keyed to an AE version.
- Simultaneously running AE versions are supported. Unless a user explicitly
  selects one shared settings location, each session's support root is the
  source for its managed root.
- Explicitly shared storage is a user selection, not an inferred merge between
  AE installations. Managed-root selection is defined in
  `rust/crates/storage/src/root.rs`.

## Filesystem, Elevation, and Temporary Data

Protected writes belong to the storage / host-filesystem responsibility boundary.
React components and ExtendScript must not assemble PowerShell, AppleScript, or
UAC commands. The target architecture routes them through the Rust
host-filesystem gateway.

Preset authoring still has one explicit migration boundary: until the corresponding
host-filesystem operation is available, CEP uses
`src/management/storage/write/elevation-service.ts` as the single privileged-write
adapter. This is not a second path policy. It may only perform the already-authorized
write after a normal write failed with a permission error, and it must verify the
written bytes before reporting success. ExtendScript prepares AE-dependent preset
content and validates the target root; it is not the final authority for protected
file I/O.

User-resettable data, persistent search caches, settings, and bounded operation
history live under the visible managed application folder documented in
[`../storage/index.md`](../storage/index.md). They are not staged in an
application-specific temporary tree. Only data whose lifetime is genuinely
limited to one operation may use the operating system's standard temporary-file
location, and it must not become a source of truth.

When an operation differs by operating system, Windows and macOS implementations
are kept adjacent under the owning responsibility. The final Rust implementation
requires both platform implementations, tests, and error mappings in the same
change; neither platform is a fallback or deferred implementation.

## ExtendScript Allowed File Roots

`assertAllowedFilePath` in `src/management/ae/jsx/host-bundle.ext.ts`
permits host file operations under exactly three roots, all resolved
self-contained inside ExtendScript:

- `Folder.userData` (AE user data),
- the extension directory (`new File($.fileName).parent`),
- the AE Support Files directory derived from `Folder.appPackage`
  (macOS: app package parent; Windows: nearest ancestor matching
  `/support files/i`, otherwise `<base>/Support Files`).

The guard never imports CEP / Node persistence resolvers
(`resolveReadManagedRoot` / `resolveWriteManagedRoot` live in the CEP
runtime and cannot execute in the ExtendScript host).

Preset authoring uses the same root authority model for read, execute, and
write. `classifyAllowedRoot` is the single classifier: `assertAllowedFilePath`
uses it for read / execute, and `authorizeSaveDir` uses it for write, so the
three consumers can never disagree. The accepted set is closed to those three
roots — there is no "user-selected" escape hatch, because
`runScriptFile` / `applyPresetFile` would refuse such a target and the save
would only produce a record that can never execute.
Root containment is segment-boundary based, so `.../Support Files Evil/...`
never matches the `.../Support Files` root, and Windows backslash / casing
differences are normalized before comparison. Path authorization and
privilege escalation are separate decisions: `rootClass` never implies a
privileged write.

For text-based authored assets (Layer / Comp / Code / Easing), ExtendScript
resolves and authorizes the canonical target and returns the AE-dependent
content; it performs no file or directory write. CEP writes through
`src/management/storage/write/authoring-write.ts`, which attempts a normal
write first. Only a permission-denied result may request the privileged
adapter; success requires an existence and content read-back check before
preset metadata is committed. A denied or unavailable elevation path is a
typed authoring failure and must not leave a catalog / workspace record.

Animation preset (`.ffx`) creation remains an AE native-dialog operation. The
same save-root authorization applies before opening that dialog, while the actual
file selection and write are owned by After Effects.

## Host bundle ownership

CEP extension 内の **`$.global.__TY_PLUS_HOST__` が host bundle の所有者**であり、
JS module state ではない。`createCepHostExecutor()` を何回呼んでも、同一 window 内の
load flight の所有は `WeakMap<Window, HostBundleLoadCoordinator>` が持つ。

**「1 CEP window = 1 AE host session」は所有単位の表現であり、engine の分断を意味しない。**
本 extension は `cep.config.ts` で 5 panel + 17 modeless（拡張 ID として独立宣言）を
持ち、最大 22 の `Window` / JS context が同じ AE host process に存在しうる。各 context は
自分自身の `host-executor.ts` instance、すなわち自分の WeakMap entry を持つため、
**`WeakMap` の single-flight は surface をまたいで働かない。**

### compatibility marker — 2 axes

互換性は **schema revision** と **bundle implementation revision** の 2 軸で判定する。
どちらか一方だけでは不十分である。

| axis | 含むもの |
| --- | --- |
| **schema revision** | host API の method set / argument shape / result shape / call contract |
| **bundle implementation revision** | `host-bundle.ext.ts` の runtime behavior そのもの（host method の実装、host-side helper） |

| side | schema revision | bundle implementation revision |
| --- | --- | --- |
| caller | `HOST_BUNDLE_SCHEMA_VERSION`（`src/management/ae/host/contract.ts`） | `HOST_BUNDLE_VERSION`（同ファイル） |
| resident | `$.global.__TY_PLUS_HOST__.__schemaVersion` | `$.global.__TY_PLUS_HOST__.__bundleVersion` |
| ES3 bundle | `host-bundle.ext.ts` の `HOST_BUNDLE_SCHEMA_VERSION` | 同 `HOST_BUNDLE_VERSION` |

compatible の条件（**JS-side probe と host-side conditional load の両方で同じ式を使う**）:

```text
resident exists
AND resident.__schemaVersion === HOST_BUNDLE_SCHEMA_VERSION
AND resident.__bundleVersion  === HOST_BUNDLE_VERSION
```

schema だけでは実装互換性を表せない。signature を変えない host-side bugfix / implementation
update では schema が据え置かれるため、**AE process を再起動しない extension 更新で、
古い resident 実装を永久に reuse してしまう**。これが 2 軸に分けた理由である。

`host-bundle.ext.ts` は standalone ES3 bundle で contract module を import できない
ため、両側の 4 つの宣言は `host-executor.test.ts` が pin する。probe は method
wrapper を通らない data property を読む。

**package version 文字列には依存しない。** packaging / UI の bump で host reload させない。
ただし「schema だけで全 implementation compatibility を表す」ことはない。

### revision bump policy

| 変更 | bundle revision | schema revision |
| --- | --- | --- |
| implementation-only（host method の implementation fix / replacement、host-side helper の挙動変更、`host-bundle.ext.ts` の runtime behavior 変更） | **bump** | 据え置き可 |
| contract（exported method の追加・削除、argument shape、return shape、call contract） | **bump** | **bump** |

**current revision:** `workspace-preset-scriptui-panel-v3`。

履歴を確認した結果こうなった。値は `f6e0f8e6` で `workspace-preset-scriptui-panel-v2`
として一度だけ導入され、以後一度も変わっていない（`v1` は履歴上に存在しない — `v2` は
ScriptUI panel 由来の label で、revision 流の 2 代目ではない）。当時この値は `ping` の
payload としてだけ使われ、互換性判定には使われていなかった。#158 で compatibility
token になった時点で、その同じ literal は「marker を追加する前」と「追加した後」の
**異なる 2 つの実装に付いている**。revision contract として嘘になるため、実装が変わる
今回を新 revision（`v3`）とした。将来この counter を遡って `v1` を探しても見つからない
のは上記の通りで、異常ではない。

**extension update without AE restart** がこの contract の主な利用場面である。AE を
再起動しないと resident は古いまま残る。schema が一致していても bundle revision が
一致しなければ probe は incompatible を返し、conditional load block が 1 回だけ
`$.evalFile` を実行して current を resident に置き換える。

### single-flight semantics

```text
idle ── probe ──→ resident が compatible（schema + bundle revision）──→ ready（$.evalFile 0回）
  │                          │
  │                          └ incompatible / absent
  ▼                          ▼
 probing ──────────→ loading（$.evalFile 1回 / flight）──→ post-load 検証 ──→ ready
```

- 同一 window の concurrent first caller は **同一 in-flight Promise** を await する。
  probe と `$.evalFile` は各1回。
- `ready` は fast path で、2回目以降は host を触らない。
- post-load では load script が同時に 2 軸の marker を返し、caller の expectation と
  一致するかを確認してから `ready` にする。
- 成功した load は **それが生んだ compatibility fingerprint（`schema|bundleVersion`）** を
  記録する。同一 fingerprint を返す stale な on-disk bundle は再 load せず fail fast にする
  （同じ reload を operation ごとに繰り返さない）。fingerprint が bundle revision を含む
  ため、「schema は同じだが実装が古い」が「current」として潰されない。

### cross-surface の cold start race

probe と `$.evalFile` は別々の `evalScript` round-trip であり、その間に別 surface の
`evalScript` が割り込む。2 surface が両方 `absent` を観測して load に進むと、
`host-bundle.ext.ts` は `$.global.__TY_PLUS_HOST__` を無条件で上書きするため double-load
が成立しうる（`evalScript` block 自体は AE main thread 上で割り込み不能という前提は
そのまま使える）。

これを close するのが load script の **conditional load** である。

```text
probe（別 round-trip、2 軸で判定）
  -> load script 1 block 内で:
       resident が 2 軸とも expected と一致 -> $.evalFile せず reuse を返す
       そうでない                            -> $.evalFile 1回 + post-load verify（2 軸）
```

condition と `$.evalFile` を同じ block に置くことで、複数 Window が別 JS coordinator を
持っていても **host global を arbiter にする exactly-once に近い contract** になる。
JS 側の global boolean、polling、cross-window coordinator は作らない。
`host-bundle-load-success` の `loadedFromFile: false` が「別 surface が load していた」
ことを示す。

**block 内の condition は JS probe の `isCompatible` と一致させなければならない。**
片方だけ version-aware にすると、probe で incompatible と判定して block に来た surface が
「compatible」と再判定して skip しない（またはその逆）ようになり、race の意味が消える。
`expectedSchema` と `expectedBundleVersion` は block 内の plain `var` として埋め込み、
test double もそれを読む。

この経路は `host-executor.test.ts` で 2 本固定している（同じ `$.global` を共有する
2 つの window、load script は実体を `node:vm` で実行する）:

- `two surfaces racing a cold load share one $.evalFile` — 両方 `absent`
- `two surfaces racing a stale implementation revision share one $.evalFile` —
  resident は存在するが古い bundle revision

### stale on-disk implementation の限界

`resident が古く、disk も古い`（インストールが壊れている）場合、load を繰り返しても
治らない。このとき:

- **同一 coordinator では bounded**: 1 回 load して fingerprint を記録し、以降の
  operation は `incompatible-not-reloaded` で fail fast。無限 reload はしない。
- **cross-surface では surface 数だけ起きうる**: 各 coordinator が独立に 1 回だけ
  load する。host block は「resident が expected と一致するか」しか判定できず、
  「前回と何も変わっていない」までは判定できない（その記憶は JS global を要求すること
  になるため作らない）。cold start 時に最大 N 回、以降は 0 回に張り付く。

無制御な reload ではなく 1 coordinator あたり 1 回で頭打ちになることを保証するのが
現状の contract であり、これ以上の cross-surface dedupe には JS 側の永続状態が必要で
あるため作らない。`host-executor.test.ts` の
`a stale on-disk implementation does not reload on every operation` が前半を固定する。

### failure / retry semantics

- load 失敗（`$.evalFile` throw）は **permanent failure にしない**。coordinator は
  `idle` に戻り、次の operation が1回だけ retry する。
- 失敗したその1回の attempt は concurrent caller 全員で共有される。個別 retry を
  させないことが reload storm の再発を防ぐ。
- probe 自体が評価不能（empty / non-JSON / `ok: false`）な場合は load に進まない。
  評価不能な probe を「absent」とみなして load することが reload storm の起点になるため。
- `extension root` が解決できない場合も `idle` に戻して、設定修正後に retry 可能にする。

### logging

`action=host-bundle-probe` / `-reuse` / `-load-start` / `-load-success` / `-load-failed` /
`-reload-incompatible` を、`executorId` / `expectedSchema` / `expectedBundleVersion` /
`observedSchema` / `observedBundleVersion` / `elapsedMs` / `reason` / `loadedFromFile`
付きで emit する。両軸の expected / observed が揃うので、reload の理由が
「contract が変わった」なのか「実装だけ変わった」なのかを log から説明できる。
revision 値は secret ではない。**extension path と ExtendScript の生 error
message は log に残さない**（path は retained log に不要、生 message は redaction 不能）。
生 message は thrown Error が caller へ持ち、そこから dialog / failure trace に届く。

## Operation Worker and Distribution

Each requested product operation launches one Rust operation worker from
`rust/apps/operation-worker/` and exits after its final response. The permanent CEP Node
boundary is `src/management/ipc/operation-worker-runner.ts`; it resolves the
binary, spawns it, validates frames, forwards progress/results, and escalates
cancel. A per-invocation worker is the product boundary; no daemon, endpoint
discovery, named pipe, UDS, heartbeat, or single-instance process is required.
Development mode also launches the real Rust binary rather than substituting a
TypeScript implementation.

After the request frame is accepted, Rust owns a concurrent stdin control reader
and exposes cancellation to the executor through a shared token. Normal completion
does not wait for stdin EOF. Progress and final frames are flushed when their state
transition occurs, so CEP can reject retry after an observed commit boundary. CEP
sends at most one cancel frame, force-terminates only after the grace deadline, and
waits for the actual child close on both Windows and macOS.

Protocol/build/capability validation occurs before the worker is accepted. The
visible managed tree owns `control/operation.lock`; the OS lock releases on a
worker crash and a remaining file entry is handled by the next invocation or a
managed-folder reset. No endpoint, process identity, or heartbeat is persisted.
Transaction files remain adjacent to their destination, and OS temp is limited
to disposable operation cache/scratch bytes.

The installer carries the extension and both platform binaries and updates them
as one product version. Platform signing, notarization, packaging, and launch
details belong near their build or runtime owners; they do not change this
responsibility boundary.

Completion evidence includes all of the following: workspace tests for both target
implementations, a current-platform real Cargo artifact resolved through an explicit
`development-unsigned` manifest, a real child-process request/progress/final/close run
on the current OS, and an After Effects CEP invocation using that artifact. The
development trust variant cannot be consumed by a release build or installer. Release
completion separately requires a native Windows artifact and native macOS universal
artifact, platform signing, post-sign hashes, and the paired `release` manifest.

## Fixed Decisions

- AE DOM state and `Folder.appPackage.fsName` discovery remain in ExtendScript.
- Product filesystem, elevation, network, cache, and persistence move through
  responsibility-specific Rust gateways.
- Offline-capable operations do not depend on network availability. Periodic
  online verification is isolated to aescripts licensing policy.
- Search cache persists until explicitly cleared. Operation history has a
  settings-controlled count limit.
- Sync conflicts use last-write-wins until the owning data contract specifies a
  narrower rule.
- `src/` and `rust/` are the active product source roots; old CLI WIP is not a
  product requirement.
