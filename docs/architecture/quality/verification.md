# Verification

この文書は、販売前提で必要な build / test / review の品質ゲートを定義する。

## package scripts

正規 command は [`package.json`](../../../package.json) を正とする。

| command | 役割 |
| --- | --- |
| `bun run build` | JSX / CSS / CEP dev bundle を生成 |
| `bun run host` | build → install → AE launch |
| `bun run host:deploy` | build → install |
| `bun run test` | `tests/` の bun test |
| `bun run typecheck` | TypeScript 検証 |
| `bun run lint` | Biome + design token check |
| `bun run check:workspace-hooks` | Workspace class hook regression guard (separate, not in lint) |

See [workspace-class-hooks-check.md](./workspace-class-hooks-check.md) for integration status.
| `bun run ci` | build / lint / es3 / bundle size / tests の一括ゲート |

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
