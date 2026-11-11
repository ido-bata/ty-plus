# Architecture Debt Separation Phase 1

## このフェーズで解消した項目

- `shared` は `management` に依存しなくなった。
- `shared` は `function` に依存しなくなった。
- i18n リソースは `management/i18n` が所有する。
- i18n runtime は `management/i18n` が所有する。
- style token の定義は `management/style` が所有する。
- 古い TypeScript のエイリアスを削除または修正した。

## 先送りした債務

- `management -> function` の直接 import は baseline 化されたまま残る。
- widget registry manifest への移行は Phase 2 とする。
- preset dialog/list manifest への移行は Phase 2 とする。
- onboarding のオーケストレーション整理は storage 責務分割計画で扱う。

## ガードレール

実行するコマンド:

```bash
bun run check:boundaries
bun run typecheck:main
```
