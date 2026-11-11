# Rust operation worker task ledger

| ID | Deliverable | Depends on | Plan | State | Planned commit |
| --- | --- | --- | --- | --- | --- |
| OW-BASE-001 | dirty baselineとownership freeze | design approval | `README.md` | reviewed | `docs: plan one-shot operation worker migration` |
| OW-PRO-001 | accepted/invocation/final/crash protocol contract | OW-BASE-001 | `01-rust-worker-protocol.md` | reviewed | `feat(protocol): define one-shot worker lifecycle` |
| OW-PRO-002 | schemaとTypeScript generated contract | OW-PRO-001 | `01-rust-worker-protocol.md` | reviewed | `chore(protocol): generate worker lifecycle contracts` |
| OW-RUST-001 | `apps/operation-worker`とlength-prefixed codec | OW-PRO-002 | `01-rust-worker-protocol.md` | reviewed | `feat(worker): add one-shot process entrypoint` |
| OW-RUST-002 | accepted/progress/final/cancel state machine | OW-RUST-001 | `01-rust-worker-protocol.md` | reviewed | `feat(worker): enforce invocation lifecycle` |
| OW-STO-001 | managed root OS operation lock | OW-RUST-002 | `03-storage-distribution-release.md` | reviewed | `feat(storage): lock managed operations` |
| OW-STO-002 | same-directory transaction/recovery/LWW | OW-STO-001 | `03-storage-distribution-release.md` | reviewed | `feat(storage): recover operation transactions` |
| OW-RUST-003 | per-invocation storage/host/online composition | OW-STO-003 | `01-rust-worker-protocol.md` | reviewed | `feat(worker): compose operations per invocation` |
| OW-CEP-001 | generated TS frame codec | OW-PRO-002 | `02-cep-runner-cutover.md` | reviewed | `feat(ipc): add worker frame codec` |
| OW-CEP-002 | manifest-only binary resolver | OW-CEP-001 | `02-cep-runner-cutover.md` | reviewed | `feat(ipc): resolve packaged worker binary` |
| OW-CEP-003 | one-shot spawn/validate/result runner | OW-RUST-003, OW-CEP-002 | `02-cep-runner-cutover.md` | reviewed | `feat(ipc): run one operation worker` |
| OW-LIVE-001 | canonical operation policy and payload authority | OW-PRO-002 | `04-live-worker-host-verification.md` | pending | `feat(protocol): generate canonical operation policy` |
| OW-LIVE-002 | live control stream and immediate progress | OW-LIVE-001 | `04-live-worker-host-verification.md` | pending | `feat(worker): stream lifecycle control` |
| OW-LIVE-003 | production executable composition | OW-LIVE-002, OW-RUST-003 | `04-live-worker-host-verification.md` | pending | `feat(worker): execute production operations` |
| OW-CEP-004 | cancel、forced cancel、retry、max-4 scheduler | OW-LIVE-003, OW-CEP-003 | `04-live-worker-host-verification.md` | pending | `feat(ipc): schedule cancellable workers` |
| OW-HOST-001 | production CEP composition and real process smoke | OW-CEP-004, OW-DIST-003, OW-CEP-005 | `04-live-worker-host-verification.md` | pending | `feat(ipc): compose packaged operation worker` |
| OW-HOST-002 | After Effects CEP worker verification | OW-HOST-001 | `04-live-worker-host-verification.md` | pending | `test(host): verify operation worker in after effects` |
| OW-CEP-005 | immutable HostContext provider | OW-CEP-004 | `02-cep-runner-cutover.md` | pending | `feat(ipc): capture immutable host context` |
| OW-CEP-006 | storage gateway cutover | OW-CEP-005 | `02-cep-runner-cutover.md` | pending | `refactor(storage): invoke worker per operation` |
| OW-CEP-007 | online/catalog gateway cutover | OW-CEP-006 | `02-cep-runner-cutover.md` | pending | `refactor(online): invoke worker per operation` |
| OW-CEP-008 | AE filesystem gateway/callsite cutover | OW-CEP-007 | `02-cep-runner-cutover.md` | pending | `refactor(ae): invoke worker per operation` |
| OW-CEP-009 | TS resident transport/lifecycle/multiplex削除 | OW-DIST-003, OW-CEP-008 | `02-cep-runner-cutover.md` | pending | `refactor(ipc): remove resident runtime transport` |
| OW-STO-003 | retention、persistent cache、offline matrix | OW-STO-002 | `03-storage-distribution-release.md` | reviewed | `feat(storage): preserve offline managed state` |
| OW-LIC-001 | aescripts official contract取得とblocker証拠 | FND-007, OW-STO-003 | `03-storage-distribution-release.md` | blocked | `docs: record aescripts licensing blocker` |
| OW-DIST-001 | paired Win/Mac unsigned staging | OW-STO-003, OW-LIVE-003, OW-CEP-002 | `03-storage-distribution-release.md` | pending | `build: stage operation worker binaries` |
| OW-DIST-002 | signing後hash/final manifest/package validation | OW-DIST-001 | `03-storage-distribution-release.md` | pending | `pkg: package operation worker pair` |
| OW-DIST-003 | dev real binaryとcross-process install lease | OW-DIST-001, OW-LIVE-003, OW-CEP-002 | `03-storage-distribution-release.md` | pending | `pkg: coordinate operation worker updates` |
| OW-RUST-004 | `apps/runtime`とendpoint/control-root削除 | OW-CEP-009 | `01-rust-worker-protocol.md` | pending | `refactor(worker): remove resident runtime app` |
| OW-CLEAN-001 | CLI/fallback/allowlist削除、両OS証拠、最終CI | OW-RUST-004, OW-DIST-002, OW-DIST-003 | `03-storage-distribution-release.md` | pending | `chore: complete operation worker cutover` |

旧 `IPC-001`〜`IPC-014`、named pipe / UDS endpoint計画、single-instance runtime計画は `superseded` であり、このledgerへ再登録しない。

`OW-BASE-001` は `.tmp/operation-worker/` にbranch/dirty snapshotを保存し、planned dirty path 32件がすべて [`ownership.md`](ownership.md) に存在することを確認済み。canonical `bun run ci` が通るまで計画文書commitと `complete` 遷移は保留し、実装taskのexact-path commitへ混ぜない。

`OW-PRO-001` は commit `ad09857f`、focused Rust tests GREEN、独立review PASS。canonical CIの失敗は `OW-PRO-002` が所有するgenerated wire schema/TypeScript driftだけであり、`complete` 遷移はその後のcanonical GREENまで保留する。

`OW-PRO-002` は `ae_version` をprotocolから除去するfix commit `375130e8` と generated contract commit `dc90dc3c`。generator/contract/Rust golden/typecheck GREEN、独立fix re-review PASS。canonical CIは削除予定の旧 `rust/apps/runtime` consumerで停止するため、`complete` 遷移は最終cutover後まで保留する。

`OW-RUST-001` は commit `d000cd9d`、codec tests 6件とWindows/macOS target check GREEN、独立review PASS。canonical CIの旧runtime compile failureは継続するため、`complete` 遷移は最終cutover後まで保留する。

`OW-RUST-002` は commit `6f0646ce`、lifecycle tests 12件とworker crate GREEN、独立fix re-reviewでI-1/I-2/M-1解消。canonical CIの旧runtime compile failureは継続するため、`complete` 遷移は最終cutover後まで保留する。

`OW-STO-001` は commit `b7d0cecb`、operation-lock tests 13件、Windows nativeと両macOS target check GREEN、独立fix re-reviewでCritical/Important/Minor 0。macOS実機runtime evidenceとcanonical CIが未完了のため `complete` ではなく `reviewed` とする。

`OW-STO-002` は commit `6454e162`、exact-index `cargo test --workspace` と `cargo fmt --check` GREEN、Windows transaction/recovery 26件、両platform capability test、独立reviewおよびstaging auditでCritical/Important/Minor 0。macOS実機runtime evidenceとcanonical `bun run ci` が未完了のため `complete` ではなく `reviewed` とする。

`OW-CEP-001` は generated validator fix commit `282899a4` と codec commit `4aa4ae88`。generated contract 19件とframe codec 15件、generator freshness、main/test TypeScript typecheckがGREEN、独立fix re-reviewでCritical/Important 0。canonical `bun run ci` は全frontend/Rust test後、既存のrust-runtime-boundary違反だけで停止したため、`complete` ではなく `reviewed` とする。

`OW-CEP-002` は commit `fe678a44`。content-addressed path、両OS manifest、PE32+ x86_64 section/entry、macOS universal x86_64+arm64 load command、同一handle hash、containment/link、short read/close failureを48件でGREEN。独立最終reviewはCritical/Important/Minor 0、Ready Yes。canonical `bun run ci` は1577 TypeScript tests、React doctor、Rust fmt/clippy/workspace/tests/doc-tests後、既存boundary debt 5件だけで停止したため `reviewed` とする。
