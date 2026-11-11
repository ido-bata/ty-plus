# Verification and evidence

## Tier

| Tier | 実行時点 | Required verification |
| --- | --- | --- |
| T0 | task 編集中 | 変更 file に限定した unit test / compile |
| T1 | task 完了 | formatter、該当 crate test、該当 Vitest、typecheck subset |
| T2 | phase gate | Rust workspace、全 typecheck、全 test、architecture checks |
| T3 | package / release | build、artifact inspection、両 OS 実機 matrix、installer |

task card に別指定がなければ、task 完了は T1、phase gate は T2 を必要とする。

## Existing commands

```text
bun run typecheck
bun run test
bun run check:boundaries
bun run check:storage-forbidden
bun run check:storage-split
bun run check:cep-artifacts
bun run build
bun run ci
```

Rust workspace 作成後に次を package scripts へ追加し、直接 command と script の双方を使えるようにする。

```text
cargo fmt --manifest-path rust/Cargo.toml --all -- --check
cargo clippy --manifest-path rust/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml --workspace
bun run check:rust-contracts
bun run check:rust-boundaries
bun run test:runtime:integration
```

## Evidence format

`status.md` には「pass」だけでなく次を残す。

```text
Command: cargo test --manifest-path rust/Cargo.toml -p ty-plus-protocol
Exit: 0
Summary: 18 passed, 0 failed
Platform: Windows 11 x64
Artifact: target/debug/... or N/A
Commit/diff: <hash or working tree>
```

失敗を既知として残す場合は、最初の failure code、再現 command、task と無関係である根拠、追跡 ID を記録する。

## Contract matrix

| Case | Unit | Integration | E2E |
| --- | --- | --- | --- |
| protocol major mismatch | required | required | required |
| unknown method / malformed frame | required | required | — |
| cancellation before commit | required | required | required |
| runtime crash during request | required | required | required |
| binary missing / wrong version | — | required | required |
| two panels + one dialog | — | required | required |
| two AE versions, separate roots | — | required | required |
| two AE versions, explicit shared root | — | required | required |

## Filesystem matrix

各 storage / host-filesystem phase gate は Windows と macOS の両方で次を確認する。

- ASCII / Japanese / emoji path
- path length boundary
- existing / missing / read-only destination
- symlink、Windows junction / reparse point
- same-root concurrent write
- disk full または injected short write
- runtime crash before commit / after commit
- residual transaction file recovery
- reset 後に application folder 外へ永続物が残らない
- OS temp cache を削除しても product state が変わらない

## Platform completion rule

- Windows と macOS の実装 file は同じ task / commit に含める。
- CI compile だけで platform 完了としない。phase gate は実機 integration evidence を要求する。
- platform 固有 error は共通 error code に mapping し、UI 分岐を増やさない。
- 片方の `todo!`、stub、unsupported fallback があれば task は `done` にできない。

## Offline / licensing matrix

| State | Local feature | Search cache | Online catalog | License behavior |
| --- | --- | --- | --- | --- |
| never authenticated | usable unless product license policy gates it | retained | unavailable | activation required |
| authenticated, online | usable | update possible | usable | periodic verification |
| authenticated, offline within grace | usable | retained and searchable | unavailable | cached entitlement |
| offline after grace | local data is not deleted | retained | unavailable | policy-defined restriction |
| auth service outage | local data is not deleted | retained | explicit service error | retryable error |

具体的な grace と restriction は `FND-007` で固定する。

## Release matrix

| OS | Architecture | Runtime | Installer | Signature | AE simultaneous versions |
| --- | --- | --- | --- | --- | --- |
| Windows | x64 | required | required | required | required |
| macOS | Apple Silicon | required | required | required + notarization | required |
| macOS | Intel if supported release target | explicit decision | explicit decision | required + notarization | required |

## Phase gate record

phase gate task は `status.md` に次を添付する。

- completed task ID list
- commands と要約
- Windows evidence
- macOS evidence
- migration-map の更新差分
- legacy search の残件
- official docs へ移した決定
- 次 phase の最初の `ready` task
