# Rust operation worker 実装状態

このファイルは実装再開の唯一の入口である。完了証拠がない task を `complete` にしない。

```yaml
design_gate: approved
current_task: OW-LIVE-001
current_state: pending
last_green: OW-CEP-003 commit fe2e1717; independent review PASS; 16 runner tests, 79 focused IPC tests, 1593 full TypeScript tests, React Doctor, and Rust workspace gates PASS
last_failure: none after independent design re-review PASS; OW-LIVE-001 RED has not started
next_command: cd rust && cargo test -p ty-plus-protocol
safe_switch: true
licensing_lane: blocked_by_FND-007
```

## 状態遷移

- `pending`: RED 未着手。
- `red`: 期待した失敗を記録済み。
- `green`: focused test が成功し、review 前。
- `reviewed`: 独立reviewが PASS し、canonical gate 前。
- `complete`: supervisor が `bun run ci` の成功と exact-path commit hash を記録済み。
- `blocked`: 外部成果物または権限がなく、その task だけ進められない。設計review待ちは `design_gate` で表し、task自体は `pending` のままにする。
- `superseded`: 新しい設計に置換され、再開禁止。

## 更新テンプレート

```text
START: task=<OW-ID>; base=<commit>; dirty_snapshot=<path>; planned_files=<paths>
RED: command=<command>; expected=<failure>; actual=<summary>
GREEN: command=<command>; result=<pass>; artifacts=<paths>
REVIEW: reviewer=<agent>; verdict=<PASS>; report=<path>
CHECKPOINT: commit=<hash>; scope=<exact paths>; ci=<pass/fail>
RESTART: next=<one command>; last_success=<command>; last_failure=<summary>; generated=<paths>; safe_switch=<yes/no>
```

## 現在の外部 blocker

- `OW-LIC-001`: aescripts author API / SDK、SKU、device binding、revalidation interval、offline grace、revocation、credential-store policy が未提供。placeholder provider を実装しない。
- macOS release signing/notarization と Windows signing は実credentialを必要とする。credential不在でも deterministic unsigned fixture / hash / manifest test は進め、release署名だけをblockedにする。

## 最新 checkpoint

`04-live-worker-host-verification.md` はユーザー承認と independent design re-review を通過した。
Critical / Important は0、Spec Ready / Plan Ready はともに Yes。TS-only OW-CEP-004 を廃止し、
generated canonical operation policy、live Rust control stream、実 executable composition を
先行させる。後続は cancellable max-4 scheduler、real worker pair package、production CEP
composition、Windows real process、After Effects CEP verification の順で進める。実機証拠は
`.tmp/operation-worker-verification/` に保存し、mock / synthetic fixture で代替しない。

`OW-CEP-004` の二系統の事前監査は TS-only 実装を Ready No と判定した。現 runner は request 直後に
stdin を閉じるため後発 cancel frame を送れず、stdin を開いたままにすると Rust `run_once` が
`LifecycleInput::drain()` で EOF を待って final を送れない。また Rust progress は executor 完了後まで
buffer されるため、commit 中 crash を未commitと誤認して retry する危険がある。実装前に、Rust が
concurrent control reader と cancellation token を所有し、progress を即時 flush し、stdin EOF を
normal final の前提にしない lifecycle 契約へ設計を改訂する必要がある。

`OW-CEP-003` は commit `fe2e1717`。各 invocation で resolver input を新規生成し、content-addressed
worker artifact の path と SHA-256 を spawn 境界まで固定した one-shot runner を実装した。request frame
を送信後に stdin を閉じ、accepted/progress/final と child close を厳密に相関し、stderr と診断情報を
byte cap 内で保持する。manifest switch race を実 resolver と PE32+/universal Mach-O fixture で検証した。
16 runner tests と 79 focused IPC tests は GREEN、独立 review は Critical/Important/Minor 0、Ready Yes。
canonical `bun run ci` は 1593 TypeScript tests、React Doctor、Rust fmt/clippy/workspace/tests/doc-tests
まで GREEN で、既存の rust-runtime boundary debt 5件だけで停止したため状態は `reviewed` とする。

`OW-CEP-002` は commit `fe678a44`。content-addressed paired manifest resolver、同一 handle の
PE32+/Mach-O structural validation と SHA-256、path containment、stable error、close failure を
48 focused tests で検証した。独立 review は Critical/Important/Minor 0、Ready Yes。canonical
`bun run ci` は 1577 TypeScript tests、React doctor、Rust fmt/clippy/workspace/tests/doc-tests まで
GREEN で、既存の rust-runtime boundary debt 5件だけで停止したため状態は `reviewed` とする。

`OW-HOST-001` Fix Round 6 は、Rust-generated `wireName` を production composition の唯一の
authority とし、実 spawn path/digest を resolver tuple と照合する verifier、失敗時の stale evidence
除去、成功時の同一ディレクトリ atomic rename、finished progress と non-empty result の検証を追加した。
`bun run verify:operation-worker:process` は Windows の実配布 worker で accepted → progress(0,1,2/finished)
→ response → stdout EOF → close(0) を GREEN。focused 82 tests、main/test typecheck、Biome、Rust protocol
fmt/test が GREEN。証跡は `.tmp/operation-worker-verification/windows-process.json`。stage/commit は未実施。
Ubuntu では synthetic PE/Mach-O manifest による resolver/preflight test と unsupported-platform
fail-closed verifier test を実行し、Windows/macOS CI では CEP dev build 後の実 process verifier と
証跡 upload を行う。

Fix Round 7 では synthetic macOS/Mach-O fixture に `chmod 0o755` を適用し、clean Ubuntu/macOS
resolver test でも executable bit 要件を固定した。focused 82 tests、typecheck、Biome は GREEN。

`OW-HOST-002` / `OW-HOST-003` は commits `4462c9f3`、`0aaafdd1`、`c264a597`。CEP panel は
`window.cep_node.require` から構成した runtime capability だけで filesystem、hash、process spawn、
Buffer、request identity を扱い、直接の `node:*` import、ambient `Buffer`、常駐 runtime を持たない。
`appRoot` は実 AE の ExtendScript で確認できる `Folder.appPackage.fsName` を唯一の取得元とし、
CEP / Rust 側の探索、固定 path、AE version 依存を持たない。

Windows host scan は exFAT で `fs_at::open_dir_at` が `ERROR_INVALID_FUNCTION` になる実機障害を受け、
同一 no-follow handle の reparse / type 検証、DELETE sharing を許可しない root からの component walk、
`Arc` ancestor chain、同一 file handle read に置き換えた。macOS の handle-relative 実装は隣接して維持し、
両 OS に depth 64、directory entry 4096 の上限を持たせた。

Windows 実機の After Effects 2026 panel1 から `D:` exFAT 上の `Support Files/Plug-ins` を走査し、
Rust worker が 504 rows、0 warnings、最終 `finished`、accepted、success response、stdout EOF、exit 0 を返した。
証跡は `.tmp/operation-worker-verification/cep-process.json` と `ae-process-success.png`。artifact digest は
`dd3b3451d7be9d0e86d781b2471cdfb9122b47422b62920cf3653cf76421146d` で、manifest、dist、installed worker
と一致した。独立 review は Critical / Important / Minor 0、Spec Yes / Ready Yes。canonical `bun run ci`
は今回と無関係な未コミット `src/management/dialog/dialogs/context-menu.test.ts` の Biome format 1件で
lint 冒頭に停止したため、当該ファイルを変更せず外部 blocker として残す。
