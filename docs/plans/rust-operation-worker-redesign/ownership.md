# Operation worker dirty ownership freeze

この表は `OW-BASE-001` の成果物であり、現在のdirty worktreeとoperation-worker taskの重複を固定する。`preserve` hunkをfull-file stageへ混ぜない。同じpathを後続taskが扱う場合も、表のowner順を飛ばさない。

| Path | Current state | Owner order | Disposition | Stageable hunk | Stop condition |
| --- | --- | --- | --- | --- | --- |
| `package.json` | modified | OW-PRO-002 → OW-DIST-001 → OW-DIST-002 → OW-DIST-003 → OW-CLEAN-001 | preserve existing quality-script hunks; adopt only each task's named script keys | `git add -p -- package.json` でtask keyだけ | unrelated dependency/script hunkが同じpatchに混在 |
| `rust/crates/protocol/src/lib.rs` | modified | OW-PRO-001 | preserve existing `storage.rs` cleanup; adopt lifecycle export as separate hunk | lifecycle module/export hunk only | deleted DTO cleanupと分離不能 |
| `rust/crates/protocol/src/storage.rs` | deleted | pre-existing protocol cleanup | preserve deletion; OW-PRO taskは触らない | none in OW-PRO commits | file復活または新wire型の配置先に再利用 |
| `rust/apps/runtime/src/online_dispatch.rs` | modified | OW-RUST-003 → OW-RUST-004 | read existing WIP, port accepted domain logic to worker, delete old source only at OW-RUST-004 | new worker file first; old file deletion at gate | OW-CEP-009 / OW-DIST-003未完了で削除 |
| `rust/apps/runtime/src/platform/endpoint.rs` | modified | OW-RUST-004 | preserve until deletion gate, then delete | deletion only | endpoint logicをworkerへ移植しようとする |
| `rust/apps/runtime/src/session.rs` | modified | OW-RUST-004 | preserve until deletion gate, then delete | deletion only | session registryをone-shot workerへ移植しようとする |
| `rust/crates/host-filesystem/src/scan/adversarial.rs` | modified | pre-existing host-filesystem lane → OW-RUST-003 | preserve existing adversarial tests; add worker adapter tests in new worker test file | no stage in OW-RUST-003 unless supervisor assigns exact new hunk | existing testsの意味変更が必要になる |
| `rust/crates/storage/src/lib.rs` | modified | pre-existing retention lane → OW-STO-001/002/003 | adopt existing retention exports; stage new module exports by patch | new `operation_lock` / transaction export hunk only | current retention hunkと分離不能 |
| `rust/crates/storage/src/migration.rs` | modified | pre-existing storage lane | preserve; new OW tasksは触らない | none | operation-worker taskがmigration behavior変更を要求 |
| `rust/crates/storage/src/operation_history.rs` | modified | pre-existing retention lane → OW-STO-003 | adopt reviewed retention behavior; stage only additional policy tests if required | selected test/policy hunk | max-count semanticsが未review |
| `rust/crates/storage/src/persistence_io.rs` | modified | pre-existing storage lane → OW-STO-002/003 | preserve current persistence change; stage transaction integration by patch | transaction/recovery callsite hunk | unrelated JSON behaviorと分離不能 |
| `rust/crates/storage/src/retention.rs` | added | pre-existing retention lane → OW-STO-003 | adopt as existing implementation input; do not recreate | reviewed file after focused tests | retention values conflict with canonical storage policy |
| `rust/crates/storage/src/snapshot.rs` | modified | pre-existing retention lane → OW-STO-003 | preserve existing snapshot limit; stage only task-owned test hunk | selected hunk | snapshot data shape変更が必要になる |
| `src/management/ipc/cancellation.ts` | modified | OW-CEP-004 | adopt compatible cancel semantics, replace resident assumptions | reviewed full file | commit-stage behavior regresses |
| `src/management/ipc/cancellation.test.ts` | modified | OW-CEP-004 | adopt compatible assertions, replace resident process fixture | reviewed full file | commit-stage behavior regresses |
| `src/management/ipc/index.ts` | modified | OW-CEP-001…009 sequential | preserve current exports; stage one task export removal/addition at a time | `git add -p -- src/management/ipc/index.ts` | multipletask exportsが同じhunkに混在 |
| `src/management/ipc/lifecycle-runtime.ts` | modified | OW-CEP-009 | preserve until all gateway cutovers and DIST-003; then delete | deletion only | live importが残る |
| `src/management/ipc/multiplex.ts` | modified | OW-CEP-009 | preserve until all gateway cutovers and DIST-003; then delete | deletion only | live importが残る |
| `src/management/ipc/transport.ts` | modified | OW-CEP-009 | use only as behavior reference; do not port resident lifecycle; delete at gate | deletion only | `child_process` ownerがrunner以外に残る |
| `src/management/ipc/logging.test.ts` | modified | pre-existing logging lane | exclude from OW commits | none | runner redaction requires production logging change; assign separate security task |
| `src/management/storage/runtime-gateway-port.ts` | modified | OW-CEP-006 | adopt current domain port, replace only transport dependency | reviewed full file or selected hunk | storage data shape変更へ拡張 |
| `src/management/storage/runtime-gateway-port.test.ts` | modified | OW-CEP-006 | adopt current port test, replace retained transport fixture only | reviewed full file | storage data shape変更へ拡張 |
| `src/management/storage/index.ts` | modified | OW-CEP-006 → OW-CEP-009 | stage gateway export hunk in CEP-006; resident export removal in CEP-009 | `git add -p`で各owner hunkだけ | same patchに追加と削除が混在 |
| `src/management/storage/persistence/io.ts` | modified | OW-CEP-006 | preserve public persistence interface, replace invocation adapter only | selected adapter hunk | storage format変更へ拡張 |
| `src/management/storage/runtime-init.ts` | modified | OW-CEP-009 | preserve until OW-CEP-005〜008 GREEN and OW-DIST-003, then delete resident initializer | deletion only | live importが残る |
| `src/management/online/catalog/runtime-cloud-gateway.ts` | modified | OW-CEP-007 | adopt current catalog contract, replace invocation path only | reviewed full file | catalog domain shape変更へ拡張 |
| `src/management/online/catalog/runtime-cloud-gateway.test.ts` | modified | OW-CEP-007 | adopt current contract assertions, replace transport fixture only | reviewed full file | catalog data shape変更へ拡張 |
| `src/management/online/runtime-gateway.test.ts` | modified | OW-CEP-007 | adopt current operation assertions, replace transport fixture only | reviewed full file | online domain policy変更へ拡張 |
| `src/management/ae/files/runtime-gateway-impl.ts` | modified | OW-CEP-008 | adopt current AE filesystem contract, replace invocation path only | reviewed full file | AE DOM responsibilityをRustへ移す |
| `src/management/ae/files/runtime-gateway-impl.test.ts` | modified | OW-CEP-008 | adopt current gateway assertions, replace transport fixture only | reviewed full file | AE DOM responsibilityをRustへ移す |
| `src/management/ae/host-bridge.ts` | modified | OW-CEP-005 | preserve existing host method allowlist, add immutable context acquisition only | selected context hunk | filesystem/network処理をExtendScriptへ戻す |
| `src/management/ae/jsx/host-bundle.ext.ts` | modified | OW-CEP-005 | preserve AE DOM methods, add context projection only | selected context hunk | filesystem/network処理をExtendScriptへ戻す |
| `src/management/ae/jsx/host-bundle.test.ts` | modified | OW-CEP-005 | adopt current bundle assertions, add context projection assertion | selected context hunk | unrelated host method assertionが混在 |
| `src/management/ipc/lifecycle-runtime.test.ts` | modified | OW-CEP-009 | preserve until deletion gate, then delete with implementation | deletion only | live importが残る |
| `src/management/ipc/multiplex.test.ts` | modified | OW-CEP-009 | preserve until deletion gate, then delete with implementation | deletion only | live importが残る |
| `src/management/ipc/transport.test.ts` | modified | OW-CEP-009 | preserve until deletion gate, then delete with implementation | deletion only | live importが残る |
| `src/management/workspace/runtime.ts` | modified | OW-CEP-006 | replace storage invocation callsite only | selected gateway hunk | workspace domain behavior変更へ拡張 |
| `src/management/workspace/services.ts` | modified | OW-CEP-006 | replace storage invocation callsite only | selected gateway hunk | workspace domain behavior変更へ拡張 |

## 更新規則

- task開始時に `git status --short -- <planned paths>` を再実行し、表にないdirty pathが出たら停止する。
- `adopt` は既存hunkを自動的にtask commitへ含める意味ではない。taskのRED/GREENと独立reviewがそのhunkも証明した場合だけstageする。
- `replace` / `delete` は依存gate完了後だけ実施する。
- supervisorはcommit前に `git diff --cached --name-only` と `git diff --cached -- <paths>` を確認する。
