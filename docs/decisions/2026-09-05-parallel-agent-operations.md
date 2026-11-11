# Parallel Agent Operations

**Date:** 2026-09-05  
**Status:** Accepted  
**Related:** [`2026-08-09-agent-toolchain.md`](2026-08-09-agent-toolchain.md)

## Context

ty-plus は単一の shared working tree で複数 agent を実行すると、Git index、CEP build artifact、process、port、local state が衝突する。native session resume だけでは context loss や provider loss からの復旧を保証できない。既存の project-local agent toolchain と `bun run ci` を維持しつつ、worker isolation、immutable transfer、release sprint、checkpoint、generation fencing の契約が必要である。

## Decision

1. `main` を released state、`release-x-y-z` を sprint integration target、Issue 番号だけの branch を ticket state とする。
2. worker input は `base_sha` または content-addressed immutable snapshot、worker output は immutable commit / ref / digest とする。mutable ref の再解決による統合を禁止する。
3. implementer と reviewer は clean snapshot を介して分離する。worker は shared mutable runtime を持たない。
4. execution lifecycle は外部 Supervisor の責務とする。repository は protocol、result schema、checkpoint schema、fencing policy を定義するが、Docker socket や credential を worker に渡す runtime は実装しない。
5. recovery checkpoint は private reasoning を含めず、Issue、PR、branch、snapshot、generation、validation、children、side effects、blocker の外部化可能 state だけを保存する。
6. project-local operational contract は [`docs/architecture/agent-operations.md`](../architecture/agent-operations.md) と `.claude/skills/` に置く。

## Checkpoint Schema

```text
schema_version
issue_id
target_release
ticket_branch
pr_number
base_sha
checkpoint_sha_or_snapshot
execution_generation
status
completed_steps
next_steps
pending_validation
active_children
integrated_child_results
external_side_effects
blockers
decision_refs
artifact_refs
updated_at
```

Supervisor は task ごとに lease または generation を管理する。recovery では generation を進め、古い generation の result integration と external write を拒否する。heartbeat 消失だけで副作用を再実行しない。

## Rejected Alternatives

- shared working tree: process、port、generated state、Git index の isolation を提供しないため不採用
- worktree 単体: repository checkout 以外の runtime state を分離しないため不採用
- native session ID のみ: session / provider loss で復旧不能なため不採用
- project-specific global plugin / hidden DB: fresh clone で再現できず canonical state にならないため不採用
- 直接 Docker / provider command を worker に渡す方式: privilege と credential の境界が広がるため不採用

## Consequences

repository-local adapter は clean snapshot、checkpoint secret 検査、generation fencing の protocol drill を提供するが、process / network / port / credential isolation は提供しない。外部 Supervisor adapter が未接続の環境では、完全な並行 worker isolation を主張せず、直列の repository-local operation と immutable Git evidence のみを使用する。一方、外部 Supervisor が接続されれば、同じ protocol で worker、reviewer、recovery を実装できる。
