# Verification

この文書は、販売前提で必要な build / test / review の品質ゲートを定義する。

## package scripts

正規 command は [`package.json`](../../../package.json) を正とする。

| command | 役割 |
| --- | --- |
| `bun run build` | JSX / CSS / CEP dev bundle を生成 |
| `bun run host` | build → install → AE launch |
| `bun run host:deploy` | build → install |
| `bun run test` | Vitest（`unit` + `storybook` の両 project） |
| `bun run typecheck` | TypeScript 検証 |
| `bun run lint` | Biome + design token check |
| `bun run check:workspace-hooks` | Workspace class hook regression guard (separate, not in lint) |

See [workspace-class-hooks-check.md](./workspace-class-hooks-check.md) for integration status.
| `bun run ci` | build / lint / es3 / bundle size / tests の一括ゲート |

## native host での実行順序

`bun run ci` は fresh checkout から **追加の手順なし**で通ることを前提とする。
運用手順を暗黙にしない。

- `ci:static` は `build` の直後に `build:cep:worker` を走らせる。
  `dist/cep-dev/worker/manifest.json` と content-addressed binary を書けるのは
  `buildDevelopmentWorker()` だけで、従来は `build:cep:dev` の中身にしか存在しなかった
  （Issue #191）。ゲートが要求する成果物をゲート自身が作る。
- Windows / macOS では artifact を build する。その他の host では
  **理由付きで skip** を記録する — `verify:online-gateway:package` の
  host-artifact probe が同じ条件で SKIP を記録し、
  `check:rust-workspace` も host-independent crate のみを走らせるため。
  silent な skip は既有の欠陥クラス（#175 / #179）と同じなので禁止。

## host ごとの所有範囲

| host | 所有する検証 |
| --- | --- |
| Linux (GitHub Actions) | host-independent Rust crate、Storybook browser project、Node 側 gate |
| macOS native | 上記に加えて `ty-plus-host-filesystem` / `ty-plus-operation-worker` の実 host compile と test、CEP dev install |
| Windows native | 同上（Windows 固有）+ **AE 実機での release 実行確認** |

ある host での green を、別の host の green として扱わない。
platform 固有の検査は、それが走らない host では「未検証」であって「合格」ではない。

Issue-specific manual / E2E verification procedures live under
[`docs/verification/`](../../../verification/):

- [`preset-asset-consistency.md`](../../../verification/preset-asset-consistency.md)
  — Issue #130: post-write verification, rollback, startup scan,
  Windows AE 2026 E2E.

## test suite の主な範囲

| 領域 | 代表 test |
| --- | --- |
| build / manifest / runtime wiring | [`tests/bootstrap-shell.test.ts`](../../../tests/bootstrap-shell.test.ts), [`tests/cep-dev-bundle.test.ts`](../../../tests/cep-dev-bundle.test.ts), [`tests/platform-graph.test.ts`](../../../tests/platform-graph.test.ts), [`tests/host-detection.test.ts`](../../../tests/host-detection.test.ts) |
| storage / support root / workspace files | [`tests/support-root-service.test.ts`](../../../tests/support-root-service.test.ts), [`tests/workspace-file-service.test.ts`](../../../tests/workspace-file-service.test.ts), [`tests/workspace-settings-root-resolution.test.ts`](../../../tests/workspace-settings-root-resolution.test.ts), [`tests/workspace-storage.test.ts`](../../../tests/workspace-storage.test.ts) |
| cloud / Supabase | [`tests/supabase-gateway.test.ts`](../../../tests/supabase-gateway.test.ts), [`tests/typlus-edge-market.test.ts`](../../../tests/typlus-edge-market.test.ts), [`tests/typlus-notifications-db.test.ts`](../../../tests/typlus-notifications-db.test.ts) |
| licensing | [`tests/licensing-features.test.ts`](../../../tests/licensing-features.test.ts), [`tests/licensing-package.test.ts`](../../../tests/licensing-package.test.ts), [`tests/licensing-ui.test.tsx`](../../../tests/licensing-ui.test.tsx) |
| workspace UI / state | [`tests/workspace-panel-state.test.ts`](../../../tests/workspace-panel-state.test.ts), [`tests/workspace-panel-settings.test.ts`](../../../tests/workspace-panel-settings.test.ts), [`tests/workspace-render-groups.test.ts`](../../../tests/workspace-render-groups.test.ts), [`tests/workspace-widget-selection-events.test.ts`](../../../tests/workspace-widget-selection-events.test.ts) |

## release gate

販売前提で最低限満たすべき gate は次である。

1. `bun run ci` が通ること
2. AE only と docs の固定スコープに反する active code が放置されていないこと
3. data shape を変えた場合、対応する定義元・使用元の path が `docs/architecture/data/` に追記されていること
4. cloud を商品価値として使う場合、Supabase remote path が fixture ではなく deployment 前提で確認されていること
5. Claude / Codex の最終レビューに耐える説明責務と test coverage があること

## docs と verification の関係

- docs は test の代替ではない。
- ただし docs が誤っていると review と implementation が壊れるため、docs は品質ゲートの一部である。
- 具体的には、正規 path と非正規資料の境界が崩れた時点で、architecture 品質は破綻したとみなす。
