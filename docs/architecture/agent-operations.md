# Agent Operations

この文書は、複数 AI エージェントを安全に並行実行し、会話や sandbox が失われても作業を再構成するための project-local 契約である。アプリケーションの実行時アーキテクチャではなく、開発運用の正典として扱う。

## Source of Truth

- `main`: released / integrated source state
- `release-<major>-<minor>-<patch>`: active release sprint の integration target
- `<issue-number>`: top-level ticket branch
- GitHub Issue / Project: durable work state、priority、依存、target version
- GitHub Pull Request: review と integration evidence
- `AGENTS.md`、`docs/architecture/`、`docs/decisions/`、`.claude/skills/`: repository-controlled policy
- Git commit SHA / content digest: worker input と result の immutable identity
- Supervisor: transient execution state と lifecycle。canonical project stateではない

Ticket と worker は `base_sha` または immutable snapshot identity を記録する。mutable branch 名を integration input として再解決しない。記録時点から ref が移動していた場合は integration を拒否し、再 snapshot する。

## Roles and Isolation

| Role | Responsibility | Workspace |
| --- | --- | --- |
| Sol / coordinator | acceptance criteria、分解、判断、統合、最終検証 | coordinator の現在環境。ただし共有 worker 実行場所にはしない |
| Luna / implementer | 独立実装、テスト、限定調査 | worker ごとの独立 mutable sandbox |
| Terra / reviewer | clean integration candidate の独立レビュー | implementer と別の clean snapshot |

worker 間で writable workspace、Git index、process、port、database、cache、queue、generated runtime state を共有しない。read-only toolchain / package cache の共有は許可する。worktree 単体は process や state の isolation を証明しない。

repository-local adapter `scripts/agent/supervisor.ts` は clean snapshot、checkpoint の secret 検査、immutable commit result の base / generation 検証を提供する。ただし process sandbox、network namespace、port mapping、credential injection、child lifecycle は提供しない。これらを実行できたと報告してはいけない。外部 Supervisor を接続する場合は、次の論理操作を adapter として公開する。

`spawn_agent`、`wait_agent`、`get_agent_status`、`get_agent_result`、`send_agent_message`、`cancel_agent`、`resume_or_replace_agent`、`integrate_agent_result`、`checkpoint_agent`、`recover_task`

## Transfer Contract

Parent から child へは immutable snapshot を渡す。child は parent の working tree を編集せず、次の result record と immutable commit / ref / digest を返す。

```text
agent_id
issue_id
base_snapshot
execution_generation
result_commit_or_ref
summary
validation_results
artifacts
known_issues
```

result は coordinator が inspect、検証、reject、revision request、integration を行う。stale generation、移動した ref、dirty snapshot、別 ticket の変更を含む result は自動統合しない。

ローカル protocol drill は `bun run agent:recovery-drill` で実行する。clean snapshot の作成は `bun run agent:snapshot`、result 検証は `bun run agent:verify-result -- <checkpoint-file> <result-file>` で行う。dirty working tree から snapshot を作る操作は拒否される。

## Release Sprint

1 sprint は 1 target semantic version とする。開始時に `main` から `release-x-y-z` を作る。Issue ごとに番号だけの ticket branch を作り、meaningful commit 後に target release branch への Draft PR を作る。release branch の全 ticket を検証した後、`release-x-y-z -> main` の release PR を作成する。

GitHub Project [`ty-plus Delivery`](https://github.com/users/rebuildup/projects/2) の `Workflow Status` は `Backlog -> Ready -> In Progress -> In Review -> Done` とし、WIP は利用可能な sandbox / review capacity を超えない。`Priority`、`Size`、`Target Version`、`Area / Component`、`Blocked / dependency` を ticket の durable fields とする。Issue と PR の本文は日本語、commit message と source code は英語とする。

## Verification Levels

- pure logic: unit
- API / service: unit + integration
- storage / schema / migration: integration + contract / migration + smoke
- runtime / environment / network / DI: smoke + relevant integration
- user journey / auth / navigation: integration / contract + E2E 相当。CEP surface は実 After Effects host
- build / package: build + package + smoke
- release: `bun run ci` + relevant host / worker / release checks

`bun run ci` は全体の deterministic quality gate である。途中までの成功、stale snapshot の CI 結果、skip / `.only` / suppression は full pass として再利用しない。

## Security and Side Effects

secret を snapshot、checkpoint、commit、log、result に入れない。Git 外の side effect は intent と remote result identifier を durable に記録し、recovery 時には実際の remote state を確認してから idempotency key 付きで再実行する。irreversible な変更、release/tag、publish、deploy、credential 変更は user escalation の対象とする。
