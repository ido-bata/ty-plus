# Rust operation worker の storage / distribution / release 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `managedRoot` の排他・永続化・offline/cache・licensing・Windows/macOS 配布を、1 operation = 1 real Rust worker の既存計画へ安全に接続し、旧 CLI と fallback を削除する。

**Architecture:** protocol、Rust worker、CEP runner の実装は [`01-rust-worker-protocol.md`](01-rust-worker-protocol.md) と [`02-cep-runner-cutover.md`](02-cep-runner-cutover.md) が所有する。本計画はそれらが提供する invocation、runner scheduler、manifest resolver を消費し、storage の managed tree と配布・installer の cross-process release boundary だけを実装する。

**Tech Stack:** Rust 1.85.0、TypeScript、CEP Node、Bun 1.3.10、Vitest、Cargo、Windows `x86_64-pc-windows-msvc`、macOS `aarch64-apple-darwin` / `x86_64-apple-darwin`。

**Spec:** [`../../architecture/runtime/operation-worker.md`](../../architecture/runtime/operation-worker.md)、[`../../decisions/2026-08-21-rust-operation-worker.md`](../../decisions/2026-08-21-rust-operation-worker.md)、[`../../../.superpowers/sdd/architecture/operation-worker-distribution-storage-plan-audit.md`](../../../.superpowers/sdd/architecture/operation-worker-distribution-storage-plan-audit.md)

## Global Constraints

- `rust/apps/operation-worker/` の protocol、worker、CEP runner の具体実装は本計画に重複させず、01/02 の公開 interface を `Consumes` で参照する。
- `managedRoot/control/operation.lock` は visible file entry と OS exclusive lock の組み合わせにし、Windows と macOS を同じ責務の近接実装として完成させる。
- transaction は destination と同じ directory に作り、OS 標準 temp は disposable cache / scratch bytes だけに限定する。
- recovery は transaction journal/state が所有する entry だけを処理し、directory 内の全 `.tmp` を削除しない。成功した exclusive commit 順を local LWW とする。
- managed-relative registered path、symlink、junction、reparse point、UNC、drive separator、既存 destination を fail-closed で検証する。
- search cache は明示削除まで保持し、history、snapshot、worker log、diagnostic bundle は storage-owned count/size policy を使い、時間 TTL を導入しない。
- offline-independent operation は offline でも利用可能にし、licensing の online verification は invocation 時の期限到来時だけ要求する。
- aescripts の official API / SDK / artifact / terms がない間、`OW-LIC-001` は `blocked` とする。推測 endpoint、reverse engineering、placeholder provider は追加しない。他 task は停止しない。
- release extension、Windows worker、macOS universal worker は同じ product version と protocol version の paired `release` manifest で検証する。artifact path は `worker/versions/<artifact-sha256>/<platform>/operation-worker(.exe)` とし、既存 digest を変更・上書き・自動削除しない。release の missing、mismatch、unsigned、hash 不一致は hard failure にする。development は current platform の real Cargo artifactだけを持つ `development-unsigned` manifestを使い、release build / installer / packageはこのtrust modeを拒否する。
- dev と release は同じ real binary を使い、ExtendScript、mock worker、旧 CLI への fallback を作らない。
- Rust worker は request acceptance 前から process exit まで installation-root shared lease を保持する。installer は同じ native lock の exclusive lease を bounded deadline で取得できた場合だけ pair を置換する。deadline 超過時は abort し、既存 extension / binary pair を置換しない。一括 kill、PID/TTL/temp coordinator は禁止する。
- package manager は Bun。完了 gate は `bun run ci`。skip、`.only`、ignore、抑制、終了 code 無視は禁止する。
- 既存 dirty change を上書き・reset・一括 stage しない。各 task の exact path だけを review 後に `git add --` する。

---

## 依存関係と marker

実行順は次のとおり。`OW-LIC-001` は `FND-007` が解消するまで独立 blocked lane とし、他の task を止めない。

```text
01/02 plan
  -> OW-STO-001
  -> OW-STO-002
  -> OW-STO-003
  -> OW-LIC-001 (FND-007 により blocked、他 task と並行)
  -> OW-DIST-001
     -> OW-DIST-003 development lane -> OW-HOST-001/002
     -> OW-DIST-002 release lane
  -> OW-CLEAN-001 (OW-DIST-002 と OW-DIST-003 の両方が必要)
```

各 task の開始・停止・commit は supervisor が次の形式で実値を記録する。以下は `OW-STO-001` 開始時の記録例である。

```text
START: task=OW-STO-001; base=recorded-base-commit; dirty_snapshot=recorded-dirty-snapshot; planned_files=rust/crates/storage/src/operation_lock.rs
RED: command=cargo test -p ty-plus-storage --test operation_lock; expected=lock API failure; actual=OperationLock is undefined
GREEN: command=cargo test -p ty-plus-storage --test operation_lock; result=pass; artifacts=operation-lock-evidence
REVIEW: reviewer=storage-reviewer; verdict=PASS; report=operation-lock-review
CHECKPOINT: commit=recorded-storage-lock-commit; scope=OW-STO-001-files; ci=not-run
RESTART: next=run cargo test -p ty-plus-storage --test operation_lock; last_success=RED-recorded; last_failure=OperationLock-is-undefined; generated=none; safe_switch=yes
```

task 開始時に `git status --short`、`git diff --name-only`、`git rev-parse HEAD` を取得し、planned file と既存 dirty file が重なる場合は停止する。停止時の `RESTART` は次の一操作を一つだけ指定する。

---

### Task OW-STO-001: `managedRoot/control/operation.lock` の両 OS 実装

**Depends on:** `OW-PRO-001` の `InvocationContext` と `OW-RUST-002` の operation lifecycle。CEP runner には依存せず、worker/runner の具体実装は行わない。

**Files:**
- Create: `rust/crates/storage/src/operation_lock.rs`
- Create: `rust/crates/storage/tests/operation_lock.rs`
- Modify: `rust/crates/storage/src/lib.rs`
- Modify: `rust/crates/storage/src/root.rs`
- Modify: `rust/crates/storage/src/path.rs`
- Modify: `rust/crates/host-filesystem/src/platform/windows.rs`
- Modify: `rust/crates/host-filesystem/src/platform/macos.rs`
- Modify: `rust/crates/host-filesystem/src/platform/mod.rs` to expose the narrow adjacent platform boundary
- Modify: `rust/crates/host-filesystem/src/paths.rs`
- Modify: `rust/crates/storage/Cargo.toml` and `rust/crates/host-filesystem/Cargo.toml` only for the shared OS file-lock dependency
- Modify (generated): `rust/Cargo.lock` only through Cargo dependency resolution

**Interfaces:**
- `OperationLock::acquire(managed_root: &ManagedRoot, deadline: Instant) -> Result<OperationLockGuard, LockError>`。
- `OperationLockGuard::path() -> &Path`、`OperationLockGuard::release(self) -> Result<(), LockError>`。
- `ManagedRoot::control_lock_path() -> PathBuf` は必ず `<managedRoot>/control/operation.lock` を返す。
- `RegisteredPath::new(path) -> Result<RegisteredPath, ManagedRelativePathError>` は relative componentを字句検証し、`as_path()` はrelative pathだけを返す。検査後のabsolute `PathBuf` を返すI/O APIとI/O専用wrapper errorは禁止し、実open/createはOW-STO-002のplatform capability/handle boundaryが所有する。

- [ ] **Step 1: lock の RED test を追加する**

```rust
#[test]
fn second_holder_times_out_and_drop_releases_the_os_lock() {
    let first = OperationLock::acquire(&root(), Instant::now() + Duration::from_secs(1)).unwrap();
    assert_eq!(OperationLock::acquire(&root(), Instant::now() + Duration::from_millis(20)), Err(LockError::Timeout));
    drop(first);
    assert!(OperationLock::acquire(&root(), Instant::now() + Duration::from_secs(1)).is_ok());
}
```

- [ ] **Step 2: RED を実行し、期待失敗を記録する**

Run: `cargo test -p ty-plus-storage --test operation_lock`

Expected: FAIL because `OperationLock`、visible control path、Windows/macOS OS handle が存在しない。

- [ ] **Step 3: 最小の Rust lock interface を実装する**

```rust
pub fn acquire(root: &ManagedRoot, deadline: Instant) -> Result<OperationLockGuard, LockError> {
    let path = root.control_lock_path();
    std::fs::create_dir_all(path.parent().expect("control parent"))?;
    platform::exclusive_open(&path, deadline)
}
```

Windows は `LockFileEx` 相当の handle、macOS は file descriptor の exclusive lock を使い、timeout を stable `LockError::Timeout` にする。crash 後は OS lock が解放され、file entry は残り得るが endpoint、heartbeat、process identity は保存しない。

- [ ] **Step 4: GREEN を実行する**

Run: `cargo test -p ty-plus-storage --test operation_lock`

Expected: PASS for same-root contention、bounded timeout、drop release、process crash release、残存 file entry の再取得、異なる managedRoot の独立性。

- [ ] **Step 5: 両 OS の実証を採取する**

Windows で `cargo test --target x86_64-pc-windows-msvc -p ty-plus-storage`、macOS で `cargo test --target aarch64-apple-darwin -p ty-plus-storage` と `cargo test --target x86_64-apple-darwin -p ty-plus-storage` を実行し、実 OS lock、timeout、crash release、control path を evidence に記録する。

- [ ] **Step 6: review と exact commit を行う**

`git diff --check -- rust/crates/storage/src/operation_lock.rs rust/crates/storage/src/root.rs rust/crates/storage/src/path.rs rust/crates/host-filesystem/src/platform/windows.rs rust/crates/host-filesystem/src/platform/macos.rs rust/crates/host-filesystem/src/paths.rs` を実行し、global runtime lock、endpoint、temp directory の導入がないことを review する。

```text
git add -- rust/crates/storage/src/operation_lock.rs rust/crates/storage/tests/operation_lock.rs rust/crates/storage/src/lib.rs rust/crates/storage/src/root.rs rust/crates/storage/src/path.rs rust/crates/host-filesystem/src/platform/windows.rs rust/crates/host-filesystem/src/platform/macos.rs rust/crates/host-filesystem/src/paths.rs
git commit -m "feat(storage): lock managed operations"
```

`REVIEW`、`CHECKPOINT`、`RESTART: next=run cargo test -p ty-plus-storage --test operation_lock; last_success=focused lock fixture; last_failure=lock timeout or release failure; generated=operation-lock-evidence; safe_switch=yes` を記録する。

### Task OW-STO-002: same-directory transaction、recovery、LWW、symlink/reparse 安全

**Depends on:** `OW-STO-001`。01/02 から受け取る `InvocationId` と operation lifecycle のみを消費する。

**Files:**
- Create: `rust/crates/storage/tests/transaction_recovery.rs`
- Modify: `rust/crates/storage/src/transaction.rs`
- Modify: `rust/crates/storage/src/operation_lock.rs`
- Modify: `rust/crates/storage/src/json_commit.rs`
- Modify: `rust/crates/storage/src/json_store.rs`
- Modify: `rust/crates/storage/src/persistence_io.rs`
- Modify: `rust/crates/storage/src/manifest.rs`
- Modify: `rust/crates/storage/src/root.rs`
- Modify: `rust/crates/storage/src/path.rs`
- Modify: `rust/crates/host-filesystem/src/platform/mod.rs`
- Modify: `rust/crates/host-filesystem/src/platform/windows.rs`
- Modify: `rust/crates/host-filesystem/src/platform/macos.rs`
- Modify: `rust/crates/host-filesystem/src/paths.rs` only for the narrow capability/handle transaction API
- Modify Cargo manifests and `rust/Cargo.lock` only if the existing capability dependencies require an exact transaction feature

**Interfaces:**
- `Transaction::prepare<'lock>(lock: &'lock OperationLockGuard, destination: RegisteredPath, invocation_id: InvocationId) -> Result<Transaction<'lock>, TransactionError>`。transaction lifetimeは同じmanaged rootのexclusive lockを必須にし、destinationはrelativeのままplatform capabilityへ渡す。
- `Transaction::flush(&mut self) -> Result<(), TransactionError>`、`Transaction::commit(self) -> Result<CommitReceipt, TransactionError>`。
- `Transaction::recover(lock: &OperationLockGuard, directory: RegisteredPath) -> Result<RecoveryReport, RecoveryError>` は同じexclusive lockとplatform capabilityからjournalが所有するinvocation entryだけを処理し、raw absolute pathを受け取らない。
- `CommitReceipt { invocation_id: InvocationId, commit_sequence: u64, revision: Revision }` はmanaged root内のdurable monotonic sequenceをexclusive lock下で更新し、successful commit順を表す。

- [ ] **Step 1: crash stage と path safety の RED test を追加する**

```rust
#[test]
fn recovery_does_not_delete_an_unrelated_tmp_file() {
    let root = fixture_managed_root();
    let lock = OperationLock::acquire(&root, fixture_deadline()).unwrap();
    let directory = RegisteredPath::new("settings").unwrap();
    let report = Transaction::recover(&lock, directory).unwrap();
    assert_eq!(report.recovered_invocations, vec![InvocationId::new("crashed")]);
    assert!(root.as_path().join("settings/user.tmp").exists());
}
```

同じ test suite に prepare、flush、rename、revision write、disk-full、existing destination、symlink、junction/reparse、UNC、Unicode、separator、short write、LWW の fixture を追加する。

- [ ] **Step 2: RED を実行し、期待失敗を記録する**

Run: `cargo test -p ty-plus-storage --test transaction_recovery`

Expected: FAIL because全 destination が同じ `.tmp` 名を使い、`flush()` が durable sync せず、recovery が無関係な `.tmp` を削除し、本体と revision が別 write になっている。

- [ ] **Step 3: 最小の durable transaction を実装する**

```rust
pub fn commit(mut self) -> Result<CommitReceipt, TransactionError> {
    self.file.sync_all()?;
    self.journal.mark_ready()?;
    self.parent.replace_write_through(&self.revision_temp, &self.revision_target)?;
    self.parent.replace_write_through(&self.body_temp, &self.destination)?;
    self.journal.remove()?;
    Ok(self.receipt)
}
```

temp、journal、revision は destination 隣接 directory に invocation identity を含めて作り、recoverable stage を記録する。registered relative path から開く全 component をplatform capabilityでno-follow openし、symlink/junction/reparse の traversal、absolute path、UNC escape、drive escape を拒否する。Windowsはwrite-through replace、macOSはrename後のdirectory syncをdurability boundaryとし、no-op branchを置かない。successful exclusive commit順のdurable sequenceをLWWとして保存する。

- [ ] **Step 4: GREEN を実行する**

Run: `cargo test -p ty-plus-storage --test transaction_recovery`

Expected: PASS for crash recovery、unrelated `.tmp` preservation、durable flush、same-directory replace、revision consistency、existing destination、symlink/reparse rejection、disk-full、LWW。

- [ ] **Step 5: 両 OS evidence を採取する**

Windows と macOS の実 filesystem で rename/replace、junction/reparse または symlink、Unicode/UNC、process crash、disk-full、再起動後 recovery を実行し、各 stage の transaction directory と final tree を保存する。

- [ ] **Step 6: review と exact commit を行う**

無条件 `.tmp` cleanup、OS temp を source of truth にする処理、path concatenation、existing destination の破壊がないことを review する。

```text
git add -- rust/crates/storage/tests/transaction_recovery.rs rust/crates/storage/src/transaction.rs rust/crates/storage/src/json_commit.rs rust/crates/storage/src/json_store.rs rust/crates/storage/src/persistence_io.rs rust/crates/storage/src/manifest.rs rust/crates/storage/src/root.rs rust/crates/storage/src/path.rs
git commit -m "feat(storage): recover operation transactions"
```

`REVIEW`、`CHECKPOINT`、`RESTART: next=run cargo test -p ty-plus-storage --test transaction_recovery; last_success=focused recovery fixture; last_failure=journal or path safety failure; generated=transaction-recovery-evidence; safe_switch=yes` を記録する。

### Task OW-STO-003: retention、persistent search cache、offline matrix、temp 限定

**Depends on:** `OW-STO-002`。

**Files:**
- Create: `rust/crates/storage/tests/retention_policy.rs`
- Create: `rust/crates/online/tests/offline_search_cache.rs`
- Modify: `rust/crates/storage/src/retention.rs`
- Modify: `rust/crates/storage/src/manifest.rs`
- Modify: `rust/crates/storage/src/operation_history.rs`
- Modify: `rust/crates/storage/src/snapshot.rs`
- Modify: `rust/crates/storage/src/persistent_cache.rs`
- Modify: `rust/crates/online/src/search_cache.rs`
- Modify: `rust/crates/online/src/offline.rs`

**Interfaces:**
- **Consumes:** `OW-STO-002` の `OperationLock`、`Transaction`、`RegisteredPath`。
- **Produces:** `RetentionPolicy`、`SearchCache`、`OfflineDecision`、`ManagedStatePolicy`。これらを `OW-RUST-003` と CEP gateway が consume し、TS `runtime-gateway*` は policy owner にならない。
- `RetentionPolicy { history_count: u32, snapshot_count: u32, worker_log_files: u32, worker_log_bytes: u64, diagnostic_bytes: u64 }`。time TTL field は持たない。
- `SearchCache::open(root: &ManagedRoot) -> Result<SearchCache, CacheError>`、`get(&self, key: &CacheKey)`、`put(&mut self, key: CacheKey, value: SearchResult)`、`clear(&mut self)`。自動 expiry は行わない。
- `OfflineDecision::LocalAllowed | CacheOnly | NetworkRequired | Blocked` は operation 単位で返す。
- `ManagedStatePolicy = { registered_items: Vec<RegisteredStorageKey>; disposable_temp_scopes: Vec<RelativePath> }` と `ManagedStatePolicy::registered_items() -> &[RegisteredStorageKey]` は reset inventory と disposable temp scope を返す。

- [ ] **Step 1: retention/cache/offline の RED test を追加する**

```rust
#[test]
fn keeps_search_cache_across_restart_until_explicit_clear() {
    let mut cache = SearchCache::open(&managed_root()).unwrap();
    cache.put(CacheKey::new("preset"), cached_result()).unwrap();
    drop(cache);
    let mut restarted = SearchCache::open(&managed_root()).unwrap();
    assert_eq!(restarted.get(&CacheKey::new("preset")).unwrap(), Some(cached_result()));
    restarted.clear().unwrap();
    assert_eq!(restarted.get(&CacheKey::new("preset")).unwrap(), None);
}
```

- [ ] **Step 2: RED を実行し、期待失敗を記録する**

Run: `cargo test -p ty-plus-storage --test retention_policy` と `cargo test -p ty-plus-online --test offline_search_cache`

Expected: FAIL because persistent cache に TTL/expiry が残り、Rust storage/online policy interface と reset inventory が未実装である。

- [ ] **Step 3: 最小の Rust policy を実装する**

```rust
pub fn should_expire(_entry: &CacheEntry, _policy: &RetentionPolicy) -> bool {
    false
}
```

全 registered key を `OW-STO-002` の lock/transaction へ通し、history/snapshot/log/diagnostic の count/byte cap を適用する。search cache は明示 clear のみで消し、OS temp は operation 完了時に不要な scratch のみにする。

- [ ] **Step 4: GREEN を実行する**

Run: `cargo test -p ty-plus-storage --test retention_policy` と `cargo test -p ty-plus-online --test offline_search_cache`

Expected: PASS for restart persistence、explicit delete、retention cap、offline local operation、cache-only search、network failure fallback、reset scope、temp cleanup。

- [ ] **Step 5: 両 OS evidence を採取する**

Windows と macOS で shared root、crash recovery、offline search、explicit clear、retention bundle size、reset scope、disposable temp の削除を実行し、managed tree の一覧と cache に expiry field がないことを記録する。

- [ ] **Step 6: review と exact commit を行う**

TS `runtime-gateway*` が retention、search cache、offline policy を所有せず、Rust storage/online が唯一の policy owner であること、時間-based delete、managed tree 外の persistent state がないことを review する。

```text
git add -- rust/crates/storage/tests/retention_policy.rs rust/crates/online/tests/offline_search_cache.rs rust/crates/storage/src/retention.rs rust/crates/storage/src/manifest.rs rust/crates/storage/src/operation_history.rs rust/crates/storage/src/snapshot.rs rust/crates/storage/src/persistent_cache.rs rust/crates/online/src/search_cache.rs rust/crates/online/src/offline.rs
git commit -m "feat(storage): preserve offline managed state"
```

`REVIEW`、`CHECKPOINT`、`RESTART: next=run cargo test -p ty-plus-storage --test retention_policy; last_success=focused Rust RED/GREEN; last_failure=policy test failure; generated=storage-online-policy-evidence; safe_switch=yes` を記録する。

### Task OW-LIC-001: aescripts licensing blocked lane

**Depends on:** `FND-007` の official author integration contract と `OW-STO-003`。この task の blocked は distribution、offline、storage の実装を停止させない。

**Files:**
- Modify while blocked: `docs/plans/rust-operation-worker-redesign/status.md`
- Read-only evidence: `docs/plans/rust-runtime-redesign/reviews/aescripts-licensing.md`

**Interfaces:**
- Consumes: aescripts が著者へ提供する official API / SDK artifact、terms、endpoint/auth、SKU、device binding、revalidation interval、offline grace、revocation、Windows/macOS credential-store policy。
- Produces while blocked: `status.md` の `licensing_lane: blocked_by_FND-007` と、成果物受領後に作る supplemental implementation plan の入力一覧。

- [ ] **Step 1: official artifacts の有無を監査する**

Run: `rg -n "author API|SDK|SKU|device binding|revalidation|offline grace|revocation|credential" docs/plans/rust-runtime-redesign/reviews/aescripts-licensing.md`

Expected: public情報だけでは実装可能なauthor contractが不足している証拠が列挙され、provider endpointやpayloadを確定できない。

- [ ] **Step 2: blocked state を固定する**

```yaml
licensing_lane: blocked_by_FND-007
next_command: obtain official aescripts author integration artifacts
safe_switch: true
```

provider code、credential adapter、wire payload、state transition testを推測で追加しない。offline-independent operationはOW-STO-003とOW-RUST-003で継続する。

- [ ] **Step 3: blocker-only review を行う**

reviewは、未提供値を既定値で埋めていないこと、licensing laneがdistribution/storage/offline laneを停止させないこと、secret pathを仮実装していないことを確認する。

- [ ] **Step 4: blocked markerだけをcommitする**

```text
git add -- docs/plans/rust-operation-worker-redesign/status.md
git commit -m "docs: record aescripts licensing blocker"
```

official artifacts受領後は、このtaskを直接拡張せず、確定したdata shape・provider・credential-store契約を含むsupplemental implementation planをreviewしてから実装する。

`REVIEW: task=OW-LIC-001; verdict=blocked-correctly; evidence=docs/plans/rust-runtime-redesign/reviews/aescripts-licensing.md`

`RESTART: next=obtain official aescripts author integration artifacts; last_success=blocker review; last_failure=missing official contract; generated=none; safe_switch=yes`

### Task OW-DIST-001: paired Windows/macOS build と unsigned staging

**Depends on:** `OW-STO-003`、`OW-LIVE-003` の real executable、`OW-CEP-002` の canonical platform/path contract。worker/CEP runner の実装は変更しない。

**Files:**
- Create: `scripts/build/build-operation-worker.ts`
- Create: `scripts/build/build-operation-worker.test.ts`
- Modify: `scripts/build/build-cli.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**
- **Consumes:** `OW-CEP-002` の `OperationWorkerPlatform` と canonical relative path contract。canonical release manifestはまだ生成しない。
- Canonical `ArtifactSignature`、`OperationWorkerArtifact`、`OperationWorkerManifest` は `OW-CEP-002` が所有し、本 task は再定義しない。
- `RustTarget = "x86_64-pc-windows-msvc" | "aarch64-apple-darwin" | "x86_64-apple-darwin"`。
- `UnsignedWorkerPair = { readonly productVersion: string; readonly extensionVersion: string; readonly protocolVersion: ProtocolVersion; readonly capabilities: readonly string[]; readonly workers: Readonly<Record<OperationWorkerPlatform, { readonly stagedPath: string }>> }`。final relative path は署名後 hash が確定するまで存在しない。
- **Produces:** `buildOperationWorkerArtifacts(targets: readonly RustTarget[]): Promise<UnsignedWorkerPair>`。`OW-DIST-002` はこのunsigned stagingだけをconsumeし、署名前hashやplaceholder署名をrelease manifestへ流用しない。
- Windows native runner は `x86_64-pc-windows-msvc` artifact、macOS native runner は `aarch64-apple-darwin` と `x86_64-apple-darwin` を `lipo -create` した universal artifact を生成する。CI handoff metadata は target、source commit、artifact SHA-256 を持ち、別OS fixtureをreal artifactとして扱わない。

- [ ] **Step 1: unsigned staging の RED test を追加する**

```ts
it("builds unsigned staging for both platform artifacts", async () => {
	const staging = await buildOperationWorkerArtifacts(["x86_64-pc-windows-msvc", "aarch64-apple-darwin", "x86_64-apple-darwin"]);
	expect(Object.keys(staging.workers).sort()).toEqual(["macos", "windows"]);
	expect(staging.workers.macos.stagedPath).toContain("operation-worker");
});
```

- [ ] **Step 2: RED を実行する**

Run: `bun run vitest run scripts/build/build-operation-worker.test.ts`

Expected: FAIL because `buildOperationWorkerArtifacts`、paired unsigned artifact、universal macOS artifact、staging output が存在しない。

- [ ] **Step 3: 最小の paired build と unsigned staging を実装する**

```ts
const targets = ["x86_64-pc-windows-msvc", "aarch64-apple-darwin", "x86_64-apple-darwin"] as const;
const staging = await buildOperationWorkerArtifacts(targets);
await Bun.write("dist/worker/staging.json", JSON.stringify(staging));
```

`buildOperationWorkerArtifacts` は Windows `x86_64-pc-windows-msvc`、macOS `aarch64-apple-darwin` / `x86_64-apple-darwin` を build し、macOS は `lipo` で universal artifact にする。staging は product/extension/protocol version、capability、staged path だけを deterministic に出力し、final relative path、hash、signature、certificate fingerprint を生成しない。片 OS 欠落を成功扱いしない。

- [ ] **Step 4: GREEN を実行する**

Run: `bun run vitest run scripts/build/build-operation-worker.test.ts && bun run build:operation-worker`

Expected: PASS for both OS entries、macOS universal、version mismatch、protocol mismatch、missing artifact hard failure、release manifest/hash/signatureの非生成。

- [ ] **Step 5: 両 OS native build と CI artifact handoff evidence を採取する**

Windows runner:

Run: `cd rust && cargo build -p ty-plus-operation-worker --release --target x86_64-pc-windows-msvc`

macOS runner:

Run: `cd rust && cargo build -p ty-plus-operation-worker --release --target aarch64-apple-darwin && cargo build -p ty-plus-operation-worker --release --target x86_64-apple-darwin`

Run on macOS: `lipo -create rust/target/aarch64-apple-darwin/release/ty-plus-operation-worker rust/target/x86_64-apple-darwin/release/ty-plus-operation-worker -output dist/worker/staging/macos/operation-worker`

`.github/workflows/ci.yml` uploads `operation-worker-unsigned-windows-<commit>` and `operation-worker-unsigned-macos-universal-<commit>` with machine-readable target/commit/SHA-256 metadata. OW-DIST-002 downloads only artifacts with the same commit and rejects a missing platform.

Windows と macOS の real unsigned build output、target、product version、protocol version を保存する。Linux cross compile だけを acceptance evidence にしない。

- [ ] **Step 6: review と exact commit を行う**

旧 `tools/ty-plus-cli` をworker artifactとして参照していないこと、staging pathが02のresolver contractと一致すること、release manifestを先行生成していないことをreviewする。

```text
git add -- scripts/build/build-operation-worker.ts scripts/build/build-operation-worker.test.ts scripts/build/build-cli.ts .github/workflows/ci.yml package.json
git commit -m "build: stage operation worker binaries"
```

`REVIEW`、`CHECKPOINT`、`RESTART: next=run bun run vitest run scripts/build/build-operation-worker.test.ts; last_success=focused build fixture; last_failure=missing paired staging artifact; generated=dist/worker/staging.json; safe_switch=yes` を記録する。

### Task OW-DIST-002: signing と package validation

**Depends on:** `OW-DIST-001`。`OW-CEP-002` の canonical `OperationWorkerManifest` typeへ、署名後artifactから初めてfinal manifestを生成する。

**Files:**
- Create: `scripts/package/verify-operation-worker-manifest.ts`
- Create: `scripts/package/verify-operation-worker-manifest.test.ts`
- Modify: `scripts/package/package-cep-archive.ts`
- Modify: `scripts/package/sign-cli.ts`
- Modify: `scripts/package/sign-zxp.ts`
- Modify: `package.json`

**Interfaces:**
- **Consumes:** `OW-DIST-001` の `UnsignedWorkerPair` と、`OW-CEP-002` の canonical `OperationWorkerManifest` / `OperationWorkerArtifact` type。tuple や別release manifest typeは作らない。
- `SignatureVerification = { verified: boolean; algorithm: ArtifactSignature["algorithm"]; value: string; certificateSha256: string }`、`SignatureVerifier = { verify(file: string, expectedAlgorithm: ArtifactSignature["algorithm"]): Promise<SignatureVerification> }`。
- `ArtifactSigner = { sign(file: string, platform: OperationWorkerPlatform): Promise<void> }`。
- `HashReader = { sha256(file: string): Promise<string> }`。
- `PackageInput = { staging: UnsignedWorkerPair; extensionRoot: string; archivePath: string; signer: ArtifactSigner; hashReader: HashReader; signatureVerifier: SignatureVerifier }`。
- `VerifiedArtifact = { file: string; sha256: string; signature: SignatureVerification }`、`VerifiedPackage = { archivePath: string; manifest: OperationWorkerManifest; artifacts: readonly VerifiedArtifact[] }`。
- `signVerifyAndHashWorker(file: string, platform: OperationWorkerPlatform, signer: ArtifactSigner, hashReader: HashReader, verifier: SignatureVerifier): Promise<VerifiedArtifact>` はsign完了後にsignature/certificateを抽出し、その後のbytesだけをhashする。
- `placeContentAddressedArtifact(artifact: VerifiedArtifact, platform: OperationWorkerPlatform, extensionRoot: string): Promise<string>` は署名後 digest から final relative path を作り、同 digest path が存在する場合は bytes 一致を検証して上書きしない。新 digest だけを append する。
- `finalizeOperationWorkerManifest(staging: UnsignedWorkerPair, artifacts: Readonly<Record<OperationWorkerPlatform, VerifiedArtifact>>): OperationWorkerManifest` が最終immutable manifestを一度だけ生成する。
- `validatePackagePair(manifest: OperationWorkerManifest, extensionRoot: string, hashReader: HashReader, verifier: SignatureVerifier): Promise<void>` は再計算hashだけでなく、verifierの `verified`、`algorithm`、`value`、`certificateSha256` をmanifest metadataとexact比較する。`signAndVerifyPair(input: PackageInput): Promise<VerifiedPackage>` はmissing credential、unsigned artifact、post-sign hash/signature/certificate mismatchをnonzero failureにする。
- Authenticode / codesign と certificate fingerprint の実検証はこのtaskだけが所有する。成功結果をmanifestの `ArtifactSignature` metadataへ固定し、CEP runtimeにOS command、native addon、第二のverifier processを追加しない。

- [ ] **Step 1: signing/package の RED test を追加する**

```ts
it("fails when a signed hash does not match the staged Windows binary", async () => {
	const signer: ArtifactSigner = { sign: async () => undefined };
	const hashReader: HashReader = { sha256: async () => "post-sign-hash" };
	const signatureVerifier: SignatureVerifier = { verify: async () => ({ verified: true, algorithm: "authenticode", value: "signed-value", certificateSha256: "c".repeat(64) }) };
	const verified = await signVerifyAndHashWorker("dist/worker/windows/operation-worker.exe", "windows", signer, hashReader, signatureVerifier);
	expect(verified).toMatchObject({ sha256: "post-sign-hash", signature: { algorithm: "authenticode", value: "signed-value" } });
});
```

- [ ] **Step 2: RED を実行する**

Run: `bun run vitest run scripts/package/verify-operation-worker-manifest.test.ts`

Expected: FAIL because package archive が片 OS 欠落を warning-skip し、signing script が credential 不在を成功扱いする。

- [ ] **Step 3: 最小の検証を実装する**

```ts
export async function signVerifyAndHashWorker(file: string, platform: OperationWorkerPlatform, signer: ArtifactSigner, hashReader: HashReader, verifier: SignatureVerifier) {
	await signer.sign(file, platform);
	const expectedAlgorithm = platform === "windows" ? "authenticode" : "codesign";
	const signature = await verifier.verify(file, expectedAlgorithm);
	if (!signature.verified || signature.algorithm !== expectedAlgorithm) throw new Error("signature-invalid");
	const sha256 = await hashReader.sha256(file);
	return { file, sha256, signature } as const;
}
```

両 artifact を署名して実署名 metadata を取得した後にだけ `finalizeOperationWorkerManifest`
を呼ぶ。署名済み bytes は先に content-addressed path へ append し、final manifest の
relative path はその digest path だけを指す。archive は extension、Windows worker、macOS universal worker、final manifest の四者を
同じ product/protocol version で再検証し、installed bytes の hash と verifier が返す
`algorithm` / `value` / `certificateSha256` を manifest と exact 比較する。欠落・不一致・
署名不正を即時失敗にし、warning、ExtendScript fallback、旧 CLI fallback は削除する。

- [ ] **Step 4: GREEN を実行する**

Run: `bun run vitest run scripts/package/verify-operation-worker-manifest.test.ts && bun run package:cep`

Expected: PASS for valid signed pair、missing pair、wrong hash、wrong signature、wrong version、wrong protocol、unsigned development fixture の明示的な非 release 扱い。

- [ ] **Step 5: 両 OS signing/package evidence を採取する**

Windows signing/verification と macOS signing/notarization/verification を実行し、manifest、signature、hash、archive contents、failure exit code を保存する。credential がない環境では deterministic unsigned fixture の validation のみを evidence とし、release success とは記録しない。

- [ ] **Step 6: review と exact commit を行う**

signing disabled、credential 不在、片 OS 欠落が success にならず、archive に旧 CLI や fallback 文言が入らないことを review する。

```text
git add -- scripts/package/verify-operation-worker-manifest.ts scripts/package/verify-operation-worker-manifest.test.ts scripts/package/package-cep-archive.ts scripts/package/sign-cli.ts scripts/package/sign-zxp.ts package.json
git commit -m "pkg: package operation worker pair"
```

`REVIEW`、`CHECKPOINT`、`RESTART: next=run bun run vitest run scripts/package/verify-operation-worker-manifest.test.ts; last_success=valid-pair fixture; last_failure=hash-or-signature mismatch; generated=verified-package.json; safe_switch=yes` を記録する。

### Task OW-DIST-003: dev real binary と cross-process install lease

**Depends on:** `OW-DIST-001`、`OW-LIVE-003`、`OW-CEP-002` の resolver contract。release installer evidence additionally consumes OW-DIST-002, but current-platform development verification does not wait for release signing credentials。runner scheduler の実装は変更しない。

**Files:**
- Create: `scripts/cep/operation-worker-update.ts`
- Create: `scripts/cep/operation-worker-update.test.ts`
- Create: `rust/apps/operation-worker/src/install_lease.rs`
- Modify: `rust/apps/operation-worker/src/main.rs`
- Modify: `rust/apps/operation-worker/src/platform/windows.rs`
- Modify: `rust/apps/operation-worker/src/platform/macos.rs`
- Modify: `rust/apps/operation-worker/src/platform/mod.rs`
- Modify: `scripts/build/build-cep-dev.ts`
- Modify: `scripts/cep/install-cep-dev.ts`
- Modify: `scripts/cep/install-cep-single.mjs`
- Modify: `scripts/cep/cep-watch.ts`
- Modify: `src/management/ipc/operation-worker-binary.ts`
- Modify: `src/management/ipc/operation-worker-binary.test.ts`
- Modify: `cep.config.ts`
- Modify: `package.json`

**Interfaces:**
- `ArtifactTrust = { readonly mode: "release"; readonly signature: ArtifactSignature } | { readonly mode: "development-unsigned"; readonly buildProfile: "development" }`。
- release `OperationWorkerManifest` は Windows/macOS pairを必須とし、development manifestはcurrent platform entryだけを持つ。`ResolveWorkerBinaryInput.expectedTrustMode` はbuild時のconstructionから渡し、manifest、argv、environmentから切り替えない。
- `cep.config.ts` は development bundle に literal `"development-unsigned"`、release bundle に literal `"release"` を compile-time define として埋める。production composition はこの literal だけを `expectedTrustMode` に渡し、manifest field や runtime environment で上書きしない。
- development buildは`development-unsigned`だけ、release buildは`release`だけを受理する。development manifestをrelease installer/packageへ渡すとhard failureにする。missing current-platform binary はdev startを失敗させる。
- **Consumes:** release laneではOW-DIST-002の署名済みmanifest、development laneではOW-DIST-001のcurrent-platform real Cargo artifactとinstaller-native `InstallLeaseProvider`。
- `InstallLeaseProvider = { acquireExclusive(installationRoot: string, deadlineMs: number): Promise<ExclusiveInstallLease> }`。release installer は同じ native lock 実装を組み込み、Bun script はrelease trust boundaryの代用品にしない。
- `ExclusiveInstallLease = { replacePair(pair: OperationWorkerManifest): Promise<void>; release(): Promise<void> }`。lease取得前のwriteとrelease後のwriteを許さない。
- `UpdateInput = { installationRoot: string; oldPair: OperationWorkerManifest; newPair: OperationWorkerManifest; deadlineMs: number; leases: InstallLeaseProvider; massKill: () => void }`。
- `updateExtension(input: UpdateInput): Promise<UpdateResult>`。
- `UpdateResult = { kind: "replaced" } | { kind: "deadline-exceeded"; replaced: false }`。timeout、lease error、partial replacement 時に old pair を変更しない。
- shared/exclusive lock path は置換対象 tree の外にある installer-owned version-neutral support root から導出する。OS temp、PID、TTL、AE version をkeyにしない。同じ installation root を使う全 AE version が同じ lock を使う。
- worker は `TY_PLUS_WORKER_ARTIFACT_SHA256` を bootstrap digest として受け、shared lease 取得後かつ request read / `accepted` 前に current executable を同一 handle で format/hash 検証し、embedded product/protocol identity も確認する。不一致は operation 未開始の hard failure とする。

- [ ] **Step 1: dev/update の RED test を追加する**

```ts
it("aborts when another AE version holds the shared install lease", async () => {
	const massKill = vi.fn();
	const leases: InstallLeaseProvider = { acquireExclusive: async () => { throw new InstallLeaseDeadlineError(); } };
	const result = await updateExtension({ ...fixture, deadlineMs: 20, leases, massKill });
	expect(result).toEqual({ kind: "deadline-exceeded", replaced: false });
	expect(massKill).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: RED を実行する**

Run: `bun run vitest run scripts/cep/operation-worker-update.test.ts`

Expected: FAIL because explicit development trust mode、current-platform real worker staging、worker shared lease、installer exclusive lease が存在しない。

- [ ] **Step 3: 最小の update orchestration を実装する**

```ts
export async function updateExtension(input: UpdateInput): Promise<UpdateResult> {
	let lease: ExclusiveInstallLease;
	try {
		lease = await input.leases.acquireExclusive(input.installationRoot, input.deadlineMs);
	} catch (error) {
		if (error instanceof InstallLeaseDeadlineError) return { kind: "deadline-exceeded", replaced: false };
		throw error;
	}
	try {
		await lease.replacePair(input.newPair);
		return { kind: "replaced" };
	} finally {
		await lease.release();
	}
}
```

dev と release は `manifest.json` の同じ real worker resolver を使う。Rust worker は起動直後、
request read / `accepted` より前に shared lease を取得し、final response / process exit まで保持する。
installer は exclusive lease 取得前に admission marker や installed tree を変更せず、lease取得後に
新しい content-addressed binary を append し、extension と manifest pointer を rollback 可能な
更新単位として切り替える。既存 digest の bytes は変更・上書き・自動削除せず、削除は
exclusive lease 下の明示 uninstall/reset だけに限定する。複数 AE version
のどれかが shared lease を保持していれば exclusive lease は deadline で失敗し、archive、
extension、binary pair を一切置換しない。process-group kill、mass kill、強制更新、stale PID
cleanup、常駐 coordinator は実装しない。

- [ ] **Step 4: GREEN を実行する**

Run: `bun run vitest run scripts/cep/operation-worker-update.test.ts src/management/ipc/operation-worker-binary.test.ts && bun run build:cep:dev && bun run install:cep:dev`

Expected: PASS for current-platform real binary dev start、release/development trust mismatch hard failure、missing binary hard failure、worker shared lease before accepted、self hash mismatch rejection、resolve→manifest-switch→spawn raceで旧content-addressed artifact維持、exclusive lease update、second AE instance contention、deadline abort、crash auto-release、old artifact preservation、next installer retry。

- [ ] **Step 5: 両 OS の dev/install evidence を採取する**

Windows と macOS で clean dev install、2つの AE/CEP launcher から real worker を同時起動し、
shared lease 中の deadline abort、worker crash 後のOS lock解放、再実行によるexclusive更新成功を
実施する。Windows hidden process、manifest pair、old pair preservation、mass kill 非実行を記録する。

- [ ] **Step 6: review と exact commit を行う**

dev script に mock/JS/ExtendScript fallback、installer に unbounded wait、mass kill、partial replacement がないこと、Windows/macOS双方が同じnative shared/exclusive lease lifecycleを実装し、片方をno-opにしていないことをreviewする。

```text
git add -- scripts/cep/operation-worker-update.ts scripts/cep/operation-worker-update.test.ts scripts/build/build-cep-dev.ts scripts/cep/install-cep-dev.ts scripts/cep/install-cep-single.mjs scripts/cep/cep-watch.ts src/management/ipc/operation-worker-binary.ts src/management/ipc/operation-worker-binary.test.ts cep.config.ts rust/apps/operation-worker/src/install_lease.rs rust/apps/operation-worker/src/main.rs rust/apps/operation-worker/src/platform/windows.rs rust/apps/operation-worker/src/platform/macos.rs rust/apps/operation-worker/src/platform/mod.rs package.json
git commit -m "pkg: coordinate operation worker updates"
```

`REVIEW`、`CHECKPOINT`、`RESTART: next=run bun run vitest run scripts/cep/operation-worker-update.test.ts; last_success=exclusive-lease fixture; last_failure=second-launcher-deadline fixture; generated=update-result.json; safe_switch=yes` を記録する。

### Task OW-CLEAN-001: old CLI、fallback、allowlist の削除と最終 quality gate

**Depends on:** `OW-STO-001`〜`OW-STO-003`、release lane `OW-DIST-002`、development/install lease lane `OW-DIST-003`、01/02 の cutover GREEN。`OW-LIC-001` は blocked のままでも非 licensing release checks を実施する。

**Files:**
- Delete: `tools/ty-plus-cli/Cargo.lock`
- Delete: `tools/ty-plus-cli/Cargo.toml`
- Delete: `tools/ty-plus-cli/README.md`
- Delete: `tools/ty-plus-cli/rust-toolchain.toml`
- Delete: `tools/ty-plus-cli/crates/cli/Cargo.toml`
- Delete: `tools/ty-plus-cli/crates/cli/src/main.rs`
- Delete: `tools/ty-plus-cli/crates/cli/src/output.rs`
- Delete: `tools/ty-plus-cli/crates/cli/src/commands/app_root.rs`
- Delete: `tools/ty-plus-cli/crates/cli/src/commands/mod.rs`
- Delete: `tools/ty-plus-cli/crates/cli/src/commands/plugin_scan_stub.rs`
- Delete: `tools/ty-plus-cli/crates/core/Cargo.toml`
- Delete: `tools/ty-plus-cli/crates/core/src/error.rs`
- Delete: `tools/ty-plus-cli/crates/core/src/hash.rs`
- Delete: `tools/ty-plus-cli/crates/core/src/json.rs`
- Delete: `tools/ty-plus-cli/crates/core/src/lib.rs`
- Delete: `tools/ty-plus-cli/crates/core/src/paths.rs`
- Delete: `tools/ty-plus-cli/crates/host/Cargo.toml`
- Delete: `tools/ty-plus-cli/crates/host/src/app_root.rs`
- Delete: `tools/ty-plus-cli/crates/host/src/lib.rs`
- Create: `scripts/check/check-operation-worker-cutover.ts`
- Create: `scripts/check/check-operation-worker-cutover.test.ts`
- Modify: `scripts/check/check-rust-runtime-boundaries.ts`
- Modify: `scripts/build/build-cli.ts`
- Modify: `scripts/lib/cli-paths.ts`
- Modify: `package.json`

**Interfaces:**
- `checkOperationWorkerCutover(files: readonly string[]): CutoverReport` は old CLI、fallback、resident runtime、legacy allowlist の product violations を返す。
- `CutoverReport = { violations: readonly { file: string; rule: string }[] }`。historical superseded document は product source の allowlist に入れない。
- final quality gate は `bun run ci` だけとし、Rust、boundary、artifact、manifest、package、typecheck、test、warning check を含む。

- [ ] **Step 1: old path guard の RED test を追加する**

```ts
it("reports old CLI and fallback paths before deletion", () => {
	const report = checkOperationWorkerCutover(["tools/ty-plus-cli/Cargo.toml", "scripts/build/build-cli.ts"]);
	expect(report.violations.map(item => item.rule)).toEqual(expect.arrayContaining(["old-cli", "legacy-fallback"]));
});
```

- [ ] **Step 2: RED を実行する**

Run: `bun run vitest run scripts/check/check-operation-worker-cutover.test.ts`

Expected: FAIL because old CLI files、build aliases、fallback、migration allowlist が存在する。

- [ ] **Step 3: 最小 guard と削除を実装する**

```ts
export function checkOperationWorkerCutover(files: readonly string[]): CutoverReport {
	return { violations: files.flatMap(file => rulesFor(file).map(rule => ({ file, rule }))) };
}
```

listed old CLI files、`build:cli` / `sign:cli` alias、ExtendScript fallback、旧 runtime/endpoint/heartbeat/runtime-lock allowlist を削除する。01/02 の worker/runner path と `OW-STO-*` storage path は削除対象にしない。

- [ ] **Step 4: GREEN と exact repository search を実行する**

Run: `bun run vitest run scripts/check/check-operation-worker-cutover.test.ts` と `rg -n "tools/ty-plus-cli|build:cli|sign:cli|fallback to ExtendScript|runtime.lock|endpoint|heartbeat|legacy-runtime|legacy-fallback" src rust scripts package.json`

Expected: product source の違反は 0 件。historical superseded documents は report-only であり、runtime allowlist の根拠にならない。

- [ ] **Step 5: canonical `bun run ci` と両 OS evidence を採取する**

Run: `bun run ci`

Expected: PASS with no actionable warning。Windows と macOS の real worker launch、lock、transaction/recovery、offline/cache、manifest、signed package、dev/install shared/exclusive lease evidence を併記し、`OW-LIC-001` は official contract 未提供なら `blocked` と記録する。

- [ ] **Step 6: review と exact final commit を行う**

old dirty file の unrelated hunk を stage していないこと、01/02 の実装を重複削除していないこと、allowlist が恒久例外化していないことを review する。

```text
git add -- tools/ty-plus-cli/Cargo.lock tools/ty-plus-cli/Cargo.toml tools/ty-plus-cli/README.md tools/ty-plus-cli/rust-toolchain.toml tools/ty-plus-cli/crates/cli/Cargo.toml tools/ty-plus-cli/crates/cli/src/main.rs tools/ty-plus-cli/crates/cli/src/output.rs tools/ty-plus-cli/crates/cli/src/commands/app_root.rs tools/ty-plus-cli/crates/cli/src/commands/mod.rs tools/ty-plus-cli/crates/cli/src/commands/plugin_scan_stub.rs tools/ty-plus-cli/crates/core/Cargo.toml tools/ty-plus-cli/crates/core/src/error.rs tools/ty-plus-cli/crates/core/src/hash.rs tools/ty-plus-cli/crates/core/src/json.rs tools/ty-plus-cli/crates/core/src/lib.rs tools/ty-plus-cli/crates/core/src/paths.rs tools/ty-plus-cli/crates/host/Cargo.toml tools/ty-plus-cli/crates/host/src/app_root.rs tools/ty-plus-cli/crates/host/src/lib.rs scripts/check/check-operation-worker-cutover.ts scripts/check/check-operation-worker-cutover.test.ts scripts/check/check-rust-runtime-boundaries.ts scripts/build/build-cli.ts scripts/lib/cli-paths.ts package.json
git commit -m "chore: complete operation worker cutover"
```

`REVIEW`、`CHECKPOINT: commit=recorded-cleanup-commit; scope=exact-cleanup-paths; ci=pass`、`RESTART: next=run bun run ci; last_success=both-OS-cutover-evidence; last_failure=legacy-path-or-ci-failure; generated=cutover-evidence-bundle; safe_switch=yes` を記録する。

## Self-review

- storage coverage: `OW-STO-001` が `managedRoot/control/operation.lock`、Windows/macOS lock、crash release、timeout を担当し、`OW-STO-002` が same-directory transaction、recovery、LWW、symlink/reparse、temp 制約を担当する。
- policy coverage: `OW-STO-003` が Rust `storage` / `online` の唯一 owner として retention、persistent search cache、offline matrix、explicit delete、disposable temp を担当し、その `Produces` を `OW-RUST-003` と CEP gateway が consume する。TS `runtime-gateway*` は Files として所有しない。
- blocker coverage: `OW-LIC-001` は official aescripts contract がない限り provider を実装せず、他 task を停止しない。
- distribution coverage: `OW-DIST-001` が paired unsigned staging、`OW-DIST-002` が signing後hash/final manifest/package validation、`OW-DIST-003` が dev real binary と cross-process shared/exclusive install lease/deadline abort/no mass kill を担当する。
- manifest coverage: `OW-DIST-001` と `OW-DIST-002` は `OW-CEP-002` の canonical `OperationWorkerManifest` map を consume し、tuple を定義しない。`OperationWorkerArtifact` は `ArtifactSignature` shape を含む。
- interface coverage: `PackageInput`、`VerifiedPackage`、`verifySignature`、`UpdateInput`、`replacePair` は owning task の Interfaces と snippet に定義し、旧 manifest type と旧 replacement helper は残していない。
- cleanup coverage: `OW-CLEAN-001` が old CLI、fallback、allowlist、両 OS evidence、`bun run ci` を担当する。
- boundary review: protocol、worker、CEP runner の具体実装 task は削除し、01/02 への link と `Consumes` のみを残した。
- format review: 8 task 名は指定 ID と一致し、全 task に exact Files、Interfaces、checkbox、RED/expected failure、minimal snippet、GREEN、両 OS evidence、review、exact `git add`/commit、RESTART がある。task 内 `RESTART` の値は具体化し、TypeScript の `...fixture` 以外の省略記号は残していない。Bun script は全て `bun run <script>` 形式である。
- safety review: この計画作成では指定 file 以外を編集せず、test、stage、commit は実行していない。実装時も既存 dirty state を snapshot し、planned file の exact hunk だけを扱う。
