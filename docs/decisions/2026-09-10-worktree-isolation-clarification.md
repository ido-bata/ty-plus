# Worktree Isolation Clarification

**Date:** 2026-09-10
**Status:** Accepted
**Supersedes / revises:** [`2026-09-06-release-and-multi-env-workflow.md`](2026-09-06-release-and-multi-env-workflow.md) §"Development topology" / AGENTS.md §"ブランチ / worktree 方針" の worktree 禁止文言のみ。それ以外の release sprint / ticket branch / subagent workflow は変更しない。
**Superseded / revised by:** none yet.

## Context

`AGENTS.md` は「git worktree は禁止」「同一 clone 上に複数 working tree を立てない」としていた。一方で複数 AI エージェント並行駆動向け初期化ポリシー §1 は「Git worktree 自体は禁止ではない。既に isolated な sandbox 内部の Git 実装詳細として使用できるが、worktree だけで port / process / database 等が分離されたとは扱わない」と定義する。

`AGENTS.md` L59（worktree 単体を isolation の証明にしない）および `docs/architecture/agent-operations.md`（worktree 単体は process や state の isolation を証明しない）は初期化ポリシーと一致しており、禁止文言だけが矛盾していた。既存 clone 上に `.claude/worktrees/` 配下の worktree が多数残存している事実とも整合しない。

## Decision

- `git worktree` 自体は禁止しない。isolated sandbox 内部の Git 実装詳細として使用できる。
- worktree の有無をもって isolation とみなさない。isolation は checkout / writable workspace、process boundary、network namespace または port mapping、database / cache / queue / application local state、test artifacts、mutable build output の分離で判断する。
- WSL と Windows native は別の clone で運用する（AE 実機検証用）。同一 clone 上の複数 working tree をもって isolation とみなさない。
- worker は shared mutable working tree、process、port、database、queue、generated state を共有しない。外部 Supervisor による isolation が提供されない場合は並行編集を実行せず直列化する。
- parent -> child は immutable snapshot、child -> parent は immutable commit / ref / digest とする。mutable ref の再解決、stale generation、dirty result の自動統合は禁止する。

## Consequences

- `AGENTS.md` §"ブランチ / worktree 方針" の禁止文言を上記の定義に置き換える。
- 既存の `.claude/worktrees/` 配下は歴史的残存として扱い、新規 worktree を isolation 根拠にしない。
- release sprint、ticket branch 命名（Issue 番号のみ）、Draft PR 即時作成、stacked PR の運用は変更しない。

## Cross-references

- `AGENTS.md` §"ブランチ / worktree 方針" および §"並行エージェント運用" が本 ADR を反映する。
- [`2026-09-06-release-and-multi-env-workflow.md`](2026-09-06-release-and-multi-env-workflow.md) の該当節は本 ADR により改訂される。原文は残し、本 ADR への参照を追記する。
- [`2026-09-05-parallel-agent-operations.md`](2026-09-05-parallel-agent-operations.md) §Rejected Alternatives（worktree 単体不採用）は変更しない。本 ADR と整合する。
- `docs/architecture/agent-operations.md` の worktree 記述は変更しない。本 ADR と整合する。
