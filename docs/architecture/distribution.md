# 配布ビルド契約（Issue #6）

- Status: Accepted（fail-closed配線は実装済み — release-trust実行は証明書確定まで保留、下記参照）
- Date: 2026-11-11
- 正本: `rebuildup/ty-plus#222`（旧正本）/ 本repo #6 / 製品charter `docs/architecture/project.md`
- 実行手順（build → verify → package → 公開）は `docs/operations/release-runbook.md`。本docは契約とtrust modelの定義。

## trust model

CEP panelとoperation-worker binaryの組は、worker manifest（`dist/cep-dev/worker/manifest.json`）の `trust.mode` で結合される。panel側の期待値はbuild時に確定し、実行時に一致検証される（`src/management/ipc/operation-worker-binary.ts`）。不一致はworker起動を拒否する（`binary_manifest_mismatch`）。

| trust mode | panel期待値の確定 | worker binary | manifest署名block | 用途 |
| --- | --- | --- | --- | --- |
| `development-unsigned` | `NODE_ENV != production`（または `TY_PLUS_CEP_BUILD_MODE=development`） | release profile（`stageOperationWorkerTargets` が `cargo build --release`） | なし（存在してはならない） | **内部検証ビルド**。実機検証（#10）と社内テスト用 |
| `release` | `NODE_ENV=production` | release profile + **OSレベル署名**（Windows: Authenticode / macOS: codesign + notarization） | 必須（algorithm / value / certificateSha256） | **配布ビルド**。公開の前提 |

## 内部検証ビルド（現時点で再現可能）

```sh
bun install --frozen-lockfile --ignore-scripts
bunx panda codegen --silent && bunx panda cssgen --silent
bun run build:cep:dev
bun run verify:online-gateway:package -- --trust-mode=development-unsigned --product-version=<package.jsonのversion>
bun run scripts/package/package-cep-archive.ts zip
bun scripts/package/release-manifest.ts --trust-mode=development-unsigned --artifact=dist/app.ty-plus.zip
```

- 成果物: `dist/app.ty-plus.zip`（手動インストール形式。内部は `app.ty-plus/`）。
- `dist/release-manifest.json`: version / extensionId / sourceCommit / trustMode / 各成果物のsha256（機械可読）。
- CI: GitHub Actionsの **internal build** workflow（`.github/workflows/release.yml`、workflow_dispatch）がWindows / macOSの両方で同じ工程を実行し、成果物+manifestをartifactとして残す。実行名は `ty-plus-internal-<version>-<platform>-<commit7>.zip`。

## release-trustビルド（実装済み — 証明書確定まで実行しない）

1〜4の要素は未確定（#2の公開ブロッカー）のため、release-trustビルドは **実行していない**。ただしfail-closedの配線は実装済み（#32）:

1. **worker manifestのrelease署名block writer**: `buildReleaseWorker`（`scripts/cep/operation-worker-update.ts`）が、staged binaryをOS署名した後に `scripts/package/signature-evidence.ts` で証拠をbinaryから読み戻し、`trust: { mode: "release", signature }` を書く。証拠なしでrelease manifestを生成しない（fail-closed）。
2. **OS署名の実装**: `scripts/package/sign-worker.ts`。Windows: `signtool sign /fd sha256 /td sha256 /tr <tsa>`。macOS: `codesign --options runtime --timestamp` + `notarytool submit --wait` + `stapler staple`。設定は `TY_PLUS_SIGN_PFX_PATH` / `TY_PLUS_SIGN_PFX_PASSWORD` / `TY_PLUS_SIGN_IDENTITY` / `TY_PLUS_NOTARY_PROFILE`。
3. **secret混入検査の自動組み込み**: `scripts/package/secret-scan.ts` がビルド内で `dist/cep-dev` を走査する。事後監査は `scripts/verify/verify-release-artifacts.ts`（manifestのsha256再計算 + HEAD一致 + pack走査）。
4. **CI**: `.github/workflows/release.yml` の `release-trust-gate-refusal` jobが、署名設定なしでrelease-trustビルドが拒否されることを検証する（未充足をPASSにしない）。

これらが確定するまで、release-trustの成果物を「配布可能」と扱わない。実行は本人の明示的承認ゲートを別途経る。

## 検証の対応関係

| 検証 | 実施場所 |
| --- | --- |
| bundle構造・manifest束縛・version一致 | `verify:online-gateway:package`（CI / ローカル） |
| worker binaryのsha256 vs manifest | 同上（release-trustでは必須probe、dev-trustではSKIP — manifestがsha256をpinしないため） |
| 実worker process起動 | `verify:operation-worker:process`（CI native jobs / ローカル） |
| After Effects内でのworker動作 | `verify:operation-worker:cep`（実機、#10） |
| 導入・起動・主要操作・保存/復元 | 実機検証シナリオ（#10、`docs/verification/`） |

## 非目標

既存のあらゆる配布形式への対応、完全自動署名/公証（必要性が確定してから分割する）。
