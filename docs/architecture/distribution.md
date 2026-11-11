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
| `release` | `NODE_ENV=production` | release profile + **OSレベル署名（macOSのみ — ADR-0003）** | macOS: 必須 / Windows: 任意（存在すれば検証） | **配布ビルド**。公開の前提 |

**Platform非対称（ADR-0003、2026-11-12本人判断）**: Windows workerのAuthenticode署名はR0では不要 — 未署名のrelease workerはR0の正当な形であり、整合性はmanifestのsha256 pin（content-addressed path + `binary_manifest_mismatch`）が保証する。発行元の真正性は公式配布チャネル（GitHub Release over TLS）+ 並置されたsha256が提供する。Authenticodeは将来の任意拡張（署名blockの書き込み経路は実装済み）。macOSはOS要件によりDeveloper ID署名 + 公証が必須。**ZXP署名はworkerのOS署名とは独立した契約**（下記）。

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

## release-trustビルド（実装済み — Windowsは署名なしで実行可能、macOSは公証設定まで）

- **Windows**: AuthenticodeはR0では不要（ADR-0003、2026-11-12本人判断）。`bun run scripts/package/build-release.ts` が **証明書なしで実行可能** — 未署名worker + 署名済みZXP + manifestの配布候補を生成する。CIの `release-trust-windows-candidate` jobが全工程を実証する。
- **macOS**: Developer ID署名は既存identityで可能（2026-11-11確認、2027-11-22まで有効）。**公証のみ notarytool profileが未設定**（本人操作1コマンド — `docs/operations/signing-setup.md`）。設定がない場合、ビルドはfail-closedで拒否する（未充足をPASSにしない）。
- ZXP署名主体の最終値は未確定（#32）。CIの配布候補jobは使い捨ての自己署名証明書で機構のみを実証する（公開しない）。

### 2つの署名を混同しない

| 署名 | 対象 | 実装 | 検証 |
| --- | --- | --- | --- |
| worker binaryのOS署名 | `operation-worker` 実行体 | `scripts/package/sign-worker.ts`（macOSのみ: codesign + notarization。WindowsはR0では未署名 — ADR-0003） | `scripts/package/signature-evidence.ts` がbinaryから証拠を読み戻す |
| ZXPのAdobe署名 | ZXPパッケージ | `scripts/package/sign-zxp.ts`（ZXPSignCmd、release設定 `TY_PLUS_ZXP_CERT_*`） | `verifyZxp`（`ZXPSignCmd -verify`） |

### fail-closed配線

1. **worker manifestのrelease署名block writer**: `buildReleaseWorker`（`scripts/cep/operation-worker-update.ts`）が、macOSではstaged binaryをOS署名した後に証拠をbinaryから読み戻し、`trust: { mode: "release", signature }` を書く。証拠なしでrelease manifestを生成しない。**Windowsでは未署名のまま `trust: { mode: "release" }` を書く**（ADR-0003の正当な形 — 整合性はsha256 pinが担保）。
2. **secret混入検査はパッケージ化の前**: `scripts/package/secret-scan.ts` が `dist/cep-dev`（zipの中身の素）を走査してからzip / ZXPを生成する。事後監査は `scripts/verify/verify-release-artifacts.ts`（manifestのsha256再計算 + HEAD一致 + pack走査）。
3. **ZXP署名は自己署名にfallbackしない**: `resolveReleaseSignZxpConfig` は実在する明示的証明書（`TY_PLUS_ZXP_CERT_PATH` / `TY_PLUS_ZXP_CERT_PASSWORD`）のみを受け入れ、証明書を自動生成しない。開発用の自己署名自動生成（`signZxp` の既定動作）はrelease-trustでは無効化する。
4. **CI**: `.github/workflows/release.yml` の `release-trust-gate-refusal` jobが、macOSで署名設定なしのrelease-trustビルドが拒否されることを検証する（未充足をPASSにしない）。`release-trust-windows-candidate` jobが、WindowsでAuthenticodeなしの配布候補が生成・検証されることを実証する。

### macOSのnotarization契約（Apple公式の適用範囲に従う）

- `notarytool submit` の受理形式は **zip / pkg / dmg**。bare Mach-Oは提出できないため、worker binaryは提出用に一時zip化する（`buildSignPlan`）。zipは提出carrierであり、配布成果物は署名済みbinaryのまま。
- `stapler` がstapleできるのは bundle / dmg / pkg で、**bare実行体は対象外**。workerは拡張zip内で配布され、初回起動時にGatekeeperがオンラインで評価するため、notarization証拠は `spctl --assess --type execute` の合否（exit statusベース — 出力テキストのキーワード照合はしない）と `codesign --verify --strict` で判定する。
- 証明書fingerprintは **DER bytesのSHA-256**（PEMファイルbyte列のハッシュではない）。

### secretの取り扱い

- Windowsの証明書store参照（`TY_PLUS_SIGN_CERT_SHA1`）を優先する。PFX形式（`TY_PLUS_SIGN_PFX_PATH` + `TY_PLUS_SIGN_PFX_PASSWORD`）はsigntoolの仕様上パスワードがプロセス引数に現れる（`ps` で他プロセスから見える）。ログ・例外への出力は `redactSignArgs` でマスクする。
- ZXP署名のパスワードもZXPSignCmdのCLI仕様上引数に現れる。エラーメッセージに引数を展開しない。

### Windows配布の制約（公式仕様に基づく、署名なしR0配布のトレードオフ）

- **SmartScreen**: 未署名・評判の無いbinaryは「Windows protected your PC」警告を出す（評判蓄積型 — クリックスルー可能）。EV証明書でも2024年以降は即時回避にならない（Microsoft公式: [Code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)）。
- **Smart App Control（Win11）**: 署名なしbinaryを **完全にblockする**（新規Win11では評価モードで既定有効）。SAC有効環境では未署名配布は動かない — この事実を隠さず、#10の実機ゲートで観察項目として扱う。
- **セキュリティ機能の無効化を正常動作の前提にしない**: ユーザーにSAC/SmartScreenの無効化を案内しない。未署名配布の制約は文書化して受け入れる（ADR-0003）。

これらが確定するまで、release-trustの成果物を「配布可能」と扱わない。実行は本人の明示的承認ゲートを別途経る。証明書の取得・設定の具体的な本人操作は `docs/operations/signing-setup.md`。

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
