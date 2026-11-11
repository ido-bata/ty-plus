# Implementation Readiness

This document records the answer to "can we actually implement with the current
repo state?"

## Conclusion

The repo is in an implementable state. AE host adapter, ExtendScript
implementation, storage, cloud client, Supabase edge, licensing, and tests are
present.

There are discrepancies that could cause mis-implementation if unaddressed.
These are not design gaps — they are收拾不足 (insufficient tidying) of the
current code.

Additionally, the current physical layout is not the source ownership authority.
The authoritative structure after the source ownership correction is
`src/shared/`, `src/management/`, `src/function/` per
[`../repository/source-ownership.md`](../repository/source-ownership.md).

## Implementation Base Already Present

| Area | Authority |
| --- | --- |
| AE host execution | `src/management/ae/`, `src/function/widget/core/*/script.ext.ts` |
| Storage / persistence | `src/management/storage/` |
| Cloud / online | `src/management/online/` |
| Workspace runtime | `src/management/workspace/` |
| Widgets | `src/function/widget/` |
| Presets | `src/function/preset/` |

This table reflects the current physical layout under `src/{function,management,shared}`.

## Differences to Resolve Before Implementation

### 1. AE only scope vs PPRO remnants

Current confirmed scope is AE only. PPRO references should be removed from
active source (commit `a9202586`).

### 2. Workspace state duplication

- Workspace live state: `src/management/workspace/state.ts` and `src/management/workspace/hook.ts`
- Snapshot/projection helper: `src/management/workspace/` (projection service)

Use the first as the authority. The second is used by tests but is not the
primary panel UI authority.

### 3. Legacy paths in repo

`src/`, `archive/`, `reference/bolt-cep/`, `docs/no-use/`, `docs/plans/` are not
current architecture authorities.

### 4. Cloud has remote and fixture modes

- Remote lane: `src/management/online/` and `supabase/functions/` (Supabase edge functions directory, not legacy `functions/` path)
- Falls back to fixture when runtime is unset

To ship cloud as product value, Supabase deployment and env configuration are
required.

## Known gaps

- ExtendScript `assertAllowedFilePath` permits AE Support Files as a third
  allowed root alongside `Folder.userData` and the extension directory
  (Issue #76). The root is resolved self-contained inside ExtendScript from
  `Folder.appPackage`; CEP-side `resolveReadManagedRoot` /
  `resolveWriteManagedRoot` cannot execute in the ExtendScript host.
  Boundary definition: [`../runtime/host-boundary.md`](../runtime/host-boundary.md).

### Quality gate が linux で構造的に green にならない（2026-09-29 確認）

`bun run ci` は release gate であるが、linux ホスト上で **設計上** 止まる。WSL 開発機でも
GitHub Actions の `ubuntu-latest` でも同じ2点で止まり、どちらも code regression ではない。

- **`verify:online-gateway:package` は linux で必ず exit 2。**
  [`scripts/verify/verify-online-gateway-package.ts`](../../../scripts/verify/verify-online-gateway-package.ts)
  は `process.platform === "linux"` を検知すると platform 判定 probe を `ok: false` で積んで
  返す（CEP operation-worker は Windows / macOS 専用ビルドのため）。この script は `ci`
  script の第3項で、`574560e2`（Issue #128, 2026-09-21）で接続された。以降 ubuntu 上の
  `ci` job は green になっておらず、最後の green は 2026-09-12。platform 固有の assertion を
  linux gate に置いたままでは、release gate を満たす経路が存在しない。
いずれも解決には設計判断を要する（platform assertion の配置）ため、機械的な修正では通らない。

- **Storybook project は Chromium の system library を要する。**
  `libnspr4` / `libnss3` / `libasound2t64` が無いホストでは project の launch が失敗する。
  sudo 無しでは `apt-get download` した `.deb` を `dpkg-deb -x` で `~/chrome-libs/` に展開し、
  `test:storybook` が設定する `LD_LIBRARY_PATH=~/chrome-libs/usr/lib/x86_64-linux-gnu` で
  解決できる（`docs/architecture/ui-reconstruction/storybook.md` 参照）。

なお `bun run test` が unit test を1件も収集しないという欠陥（`test.projects` が Storybook
project のみで、root の `test.include` が独立 project にならない）は 2026-09-29 に
`vitest.config.ts` へ `unit` project を明示登記して解消済み。`bun run test` は unit 255 files
と storybook 123 files を両方走らせる。

### 未解消の gate 回帰（2026-09-29 時点、release-0-10-0）

- **`bun run check:rust-runtime-boundaries`** — `src/shared/scenario/loader.ts:52` の
  `node:fs` が unallowlisted（Issue #147）。guard は exact path + migration-map の removal task
  を要求し directory wildcard を禁止
  （[`docs/plans/rust-operation-worker-redesign/02-cep-runner-cutover.md`](../../plans/rust-operation-worker-redesign/02-cep-runner-cutover.md)）
  ため、許可を足すには code 側の解決が要る。ただし同モジュールは `*.test.ts` からのみ参照され、
  production には依存されない。
- **`bun run check:react-doctor`** — score 86 / 30 warnings が baseline 90 / 21
  （[`tools/check/.react-doctor-baseline.json`](../../../tools/check/.react-doctor-baseline.json),
  captured 2026-09-21）を下回る。warning の大半は `no-giant-component`。
- **storybook project の unhandled error** — story は 123/123 files・474/474 tests とも pass
  するが、browser 側で `Cannot read properties of undefined (reading 'Semantic')`
  （`volar-service-typescript` が `ts.LanguageServiceMode` を解決できない worker 環境）と
  `CEP evalScript timeout`（負荷依存で flaky）が unhandled error として拾われ、
  `vitest --project storybook` の exit code を 1 にする。**pristine HEAD でも再現する**ため
  本リポジトリの既存問題であり、regression ではない。

## Decisions

- Build authority is `src/function/`, `src/management/`, `src/shared/`.
- AE only is authoritative; PPRO is to-be-removed legacy.
- Workspace live state is `src/management/workspace/` (state, hook).
- root `src/`, `archive/`, `reference/bolt-cep/`, `docs/no-use/`, `docs/plans/` are
  not current architecture authorities.
