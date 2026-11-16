# AGENTS.md — ty-plus

After Effects拡張 ty-plus の公開済み無料OSSリポジトリ（初回Stable: v0.10.1）。旧 `rebuildup/ty-plus` からはGit履歴を引き継がず、権利監査を通過した資産だけを新規commitとして移植する。初回公開は完了しており、リポジトリはPublic。今後のリリースや外部連絡は引き続き本人の承認に従う。

この文書はdispatcherである。判断の詳細は正本とSkillへ従い、ここに再定義しない。

## 正本

| 領域 | 正本 |
| --- | --- |
| 移行の暫定正本（新repo正本への移行完了まで） | `rebuildup/ty-plus#230` |
| R0計画・リリース条件・期日 | `rebuildup/ty-plus#218` |
| 権利監査 | `rebuildup/ty-plus#219` および本repoの対応Issue |
| 移植元選定・移植台帳 | `rebuildup/ty-plus#228` と `docs/migration/porting-ledger.md` |
| 最上位contract / Operating Model | `rebuildup/project-init` の `constitution/CONSTITUTION.md` / `organization/profiles/release-driven-solo.md` |
| 初期化手順 | `rebuildup/project-init` の `PROMPT.ja.md` |

Issue本文の詳細を伝言・再定義せず、正本Issueを直接参照する。旧repoのIssueは移行が確認されるまで履歴正本であり、旧repo自体は変更しない。

## 境界（違反禁止）

- 旧repoのGit履歴・PRをmerge / cherry-pick / mirrorで持ち込まない。
- 権利未確認のコード・素材・ブランド・Extension ID・署名証明書・秘密値を移植しない。
- `LICENSE` はMITで確定済み。第三者資産には `THIRD-PARTY-NOTICES.md` の個別条件を維持する。
- 本repoはPublic。秘密値・個人情報・Log!N契約の詳細をIssue / docs / commitに書かない。機微な内容は旧repoのIssueへ置き、本repoからは番号参照する。
- public化・release公開・関係者への連絡は本人の明示的承認が必要。
- 旧repoは読み取り専用として扱う。

## bootstrap / validation

- `mise install` — bun 1.3.10（`mise.toml`）
- `mise run check:skills` — vendored skillsと `skills-lock.json` の整合検査

## 作業開始

1 Issue番号だけのbranch → 最初のmeaningful commit → push → すぐPR（activeならDraft）。詳細とlanding権限は `github-delivery` Skillに従う。`main` への統合はrelease PRのみ、merge methodはmerge commitのみ。

## Skill routing

| 能力 | Skill | 使う場面 |
| --- | --- | --- |
| prose-artifact | writing-discipline | README / ADR / Issue / PR / commit等、残る文章を書く時 |
| prose-japanese | natural-japanese | 日本語の文章を書く時（writing-disciplineの上に重ねる） |
| delivery | github-delivery | Issue / branch / PR / release運用 |
| recovery | agent-recovery | 中断からの再開、checkpoint、外部side effect |
| orchestration | parallel-orchestration | subagent / 複数workerへの分解・委譲 |
| quality-gate | quality-gate | verification level、gate、CI設計 |
| design-before-build | design-refinement | 非自明なfeature / architecture / product designの実装前整理 |
| engineering-decisions | engineering-decisions | 実装判断の優先順位、userへ返す判断の境界、tool選定 |
| debugging | diagnosing-bugs | 再現できる失敗の原因特定 |
| correctness | correctness-assurance | 保存/復元・offline core等の不変条件の保証設計 |
| code-naming | code-naming | 命名・リネーム・命名レビュー |
| security-advisory | security-maintenance | 外部dependencyの脆弱性情報 |
| security-audit | security-audit | シークレット混入・未知の欠陥の能動探索（権利監査の技術検査部分） |
| secrets | secrets-management | secret valueの保管・注入・権限 |
| estimation | agent-delivery-estimation | release計画の見積もり |
| onboarding | onboarding | 会話履歴なしで始められるdocs整備 |
| interaction-style | interaction-discipline | userとのやりとり、blockerの見せ方 |
| release | release-channels | Stable/Beta/Insider候補のビルド・署名・監査・公開・復旧 |
| workspace-lifecycle | worktree-workflow | worktreeの作成・掃除 |
| skill-selection | skill-selection | Skill導入・更新の判断。手動起動: `.agents/skills/skill-selection/SKILL.md` |

## House rule

- 言語: source code（identifier / comment / log含む）とcommit messageは英語、internal documentation・Issue・PR・reviewは日本語。localization resourceは例外。
- commit message: `<work-prefix>: <ごく短いtitle>`
- package managerはBun。
- text searchは `rg` / `rg --files`。
- 新しいscriptは `.py` で追加しない。TypeScript projectではscriptもTypeScript。
- 新しいcontainer definitionは `Containerfile`。
- project固有のruleをglobal設定・home directory・agentの私的memoryに置かない。repositoryに残す。

## 復旧

会話履歴ではなくIssue / PR / branch / committed docsから再開する。詳細は `agent-recovery` Skill。
