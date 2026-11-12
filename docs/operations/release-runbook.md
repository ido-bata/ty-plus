# リリース手順（release runbook）

- Status: Accepted
- 正本: 本doc。関連: #39（本手順の整備Issue）/ `docs/architecture/distribution.md`（trust model）/ `docs/architecture/feeds.md`（更新フィード契約）/ #32（署名・公証）
- この手順は1リリース（1 releaseVersion）につき実行する。R0の公開更新元はGitHub Releases（ADR-0004）。失敗した工程から先へ進まず、成果物を再生成・再検証する。

## 前提

- 作業branchは `main` から切り、リリース対象の変更（version更新を含む）が全て取り込まれた状態にする。
- 実行環境: Bun（`mise install` 済み）、Rust toolchain（`rust-toolchain.toml` 準拠）。
- 公開操作（GitHub Releaseの作成・push等）は **本人の明示的承認ゲート** を経る。手順内の承認チェックポイントを通さずに公開しない。

## 1. version確定

1. `package.json` の `version` はCEPの数値版 `MAJOR.MINOR.PATCH`。同じ数値版でBeta/Insiderの連番更新を行う場合、数値版は変えず配布版を別管理する。
2. GitHub Releaseのタグ・実インストール版を決める（ADR-0004）:
   - Stable: `v0.11.0`（`TY_PLUS_RELEASE_CHANNEL=stable` / `TY_PLUS_RELEASE_VERSION=0.11.0`）
   - Beta: `v0.11.0-beta.1`（`beta` / `0.11.0-beta.1`）
   - Insider: `v0.11.0-insider.1`（`insider` / `0.11.0-insider.1`）
3. ビルド環境変数 `TY_PLUS_RELEASE_CHANNEL` / `TY_PLUS_RELEASE_VERSION` を設定する。いずれも数値コアは`package.json.version`と一致させる。`vite.config.ts`が配布版をパネルへ注入する。release manifestは不整合を拒否する。静的更新JSONは生成しない。

## 2. 内部検証ビルド（development-unsigned trust）

```sh
bun install --frozen-lockfile --ignore-scripts
bunx panda codegen --silent && bunx panda cssgen --silent
bun run build:cep:dev
bun run verify:online-gateway:package -- --trust-mode=development-unsigned --product-version=<version>
bun run scripts/package/package-cep-archive.ts zip
bun scripts/package/release-manifest.ts --trust-mode=development-unsigned --artifact=dist/app.ty-plus.zip
```

- 成果物: `dist/app.ty-plus.zip`（手動インストール形式）と `dist/release-manifest.json`。
- `release-manifest.json` の `sourceCommit` が、検証対象commitと一致することを確認する。
- 内部検証ビルドは実機検証（#10のシナリオ）の入力になる。この時点で実機検証が未完了の場合、公開手順には進まない。

## 3. release-trustビルド（署名）

- 実装は完了（#32、ADR-0003）: `bun run scripts/package/build-release.ts` が次の順で実行する。production panel → **Windows: 未署名worker（R0の正当な形）** / **macOS: worker署名 + 署名証拠読み戻し** + release trust manifest → verify gate（`--trust-mode=release`）→ **secret混入検査（パッケージ化の前）** → zip → ZXP署名（`ZXPSignCmd`、`-verify`で検証）→ release manifest（zipとZXPの両方のsha256を記録）。
- **Windows**: Authenticode証明書は不要（ADR-0003、2026-11-12本人判断）。**証明書なしで配布候補を生成・検証できる**。制約（SmartScreen警告、SAC block）は `docs/architecture/distribution.md`。
- **macOS**: Developer ID署名 + 公証が必須。署名identityは既存資産を利用（2026-11-12確認、2027-11-22まで有効）。**公証のnotarytool profileが未設定の場合、ビルドは拒否する**（fail-closed）— 設定手順は `docs/operations/signing-setup.md`。
- 署名契約の詳細（2つの署名の区別、notarizationの適用範囲、secretの取り扱い）は `docs/architecture/distribution.md`。
- CIは `.github/workflows/release.yml` の `release-trust-gate-refusal`（macOS拒否検証）と `release-trust-windows-candidate`（Windows配布候補の実証）で検証する。
- **development-unsignedのリハーサル緑はrelease-trustの完成証拠ではない。** 公開は本人の明示的承認ゲートを経る（11/30 Go/No-Go）。

## 4. GitHub Releases用アセット準備（公開しない）

開発中のInsider候補を素早く準備する場合は、同じ手順を1コマンドで実行できる。数値版`package.json.version`を事前に更新しておくこと（例: `0.10.1`）。

```sh
bun run release:candidate --channel=insider --release-version=0.10.1-insider.1
```

このコマンドは `build-release.ts` → `verify-release-artifacts.ts` → `prepare-github-release.ts` を順に実行する。途中で失敗したらそこで停止し、`dist/github-release/` は完成しない。channelとtagの不一致、数値コアの不一致、非対応hostは**ビルド開始前**に拒否される。tag・channel・asset名の定義は `scripts/package/release-version.ts` が唯一の正本であり、runbookへ文法を写さない。

Stable/Betaも同じコマンドで`--channel`と`--release-version`を指定する。WindowsではAuthenticode不要、macOSでは既存Developer ID署名と公証profileが必要。ZXPは継続利用できる署名用証明書（`TY_PLUS_ZXP_CERT_PATH` / `TY_PLUS_ZXP_CERT_PASSWORD`）を明示する。このコマンドは**ビルド・検証・ローカル準備のみ**で、GitHubへのuploadや公開は行わない。

`verify-release-artifacts.ts` は次を実測する: `trustMode=release`、`sourceCommit`と`HEAD`の一致、各artifactのsha256、pack内のLICENSE/THIRD-PARTY-NOTICES、`jsx/ty-plus-host.jsx`の存在、CEP `ExtensionBundleVersion`とmanifest `version`の一致、panel bundleに埋め込まれた`releaseVersion`/`channel`、secretパターンの不在。失敗時は成果物を再生成する（manifestだけ書き換えない）。

GitHub Actionsで同等のWindows候補を作る場合、`.github/workflows/release.yml` はAdobe公式ZXPSignCmdを固定commitで取得・blob検証する。使い捨て証明書によるCI候補を実公開してはならない。

`dist/github-release/` に以下が出力される（Windows/macOSは各ホストで準備する）。

- `ty-plus-<tag>-windows.zip` / `ty-plus-<tag>-windows.zxp`
- `ty-plus-<tag>-macos.zip` / `ty-plus-<tag>-macos.zxp`
- `ty-plus-<tag>-<platform>-release-manifest.json`

同じReleaseへアップロードする前に、両platformの`sourceCommit`・`releaseVersion`・`channel`・sha256が意図した値かを確認する。各platformのartifact名は一意とする。Windowsだけを検証・配布するInsiderは欠けているmacOSをリリースノートに明示すること。

## 5. GitHub Release（本人承認後のみ）

`ido-bata/ty-plus`に、tagと正確なsource commitを対応付けたGitHub Releaseを作成する。初めはDraftとして準備し、`prerelease`を以下の規則で指定する。

| channel | tag | GitHub prerelease | 利用者の更新対象 |
| --- | --- | --- | --- |
| Stable | `vX.Y.Z` | false | 全チャンネル |
| Beta | `vX.Y.Z-beta.N` | true | Beta/Insider |
| Insider | `vX.Y.Z-insider.N` | true | Insider |

GitHub APIの`make_latest`はStable以外で使用しない。Releaseにはアプリのインストール手順、サポート対象OS、変更内容、既知の制約を記載する。インストールは現時点では手動。アプリ内の「Release notes and download」は公開GitHub Releaseページを開く。

Insiderの発行時は、上記確認と明示承認のあとでGitHub CLIを使う。次の例は**実行した場合にGitHub Releaseを公開する**（このタスクでは実行していない）。`<merge-commit-SHA>`を最終的なrelease merge commitに置き換え、必要なOSの3ファイルだけ指定する。

```sh
gh release create v0.10.1-insider.1 \
  dist/github-release/ty-plus-v0.10.1-insider.1-windows.zip \
  dist/github-release/ty-plus-v0.10.1-insider.1-windows.zxp \
  dist/github-release/ty-plus-v0.10.1-insider.1-windows-release-manifest.json \
  --repo ido-bata/ty-plus \
  --target <merge-commit-SHA> \
  --title "ty-plus 0.10.1 Insider 1" \
  --notes "Insider preview; see installation guide and known limitations." \
  --prerelease
```

macOSも用意できた場合はmacOSの3ファイルを同じReleaseへ含める。リリース済みtagが別SHAを指す場合は上書きしない。既存releaseへ追加する場合も同一tag・sourceCommitの証拠を照合してから行う。

**公開操作（Draft作成、公開、タグ作成、repo public化、アップロード）は本人の別途明示承認が必要。** このrunbookを読むことは公開許可ではない。特にPrivate repoのReleasesは一般ユーザーから匿名取得できないため、アプリ内の更新確認は公開後に初めて有効になる。

## 6. 事後検証

1. GitHub API `/repos/ido-bata/ty-plus/releases/tags/<tag>`から、`draft=false`・正しい`prerelease`・tag・asset名・asset digestを確認する。
2. 公開assetを実際に再取得し、sha256と添付manifestが一致することを確認する。失敗したassetは公開不可。
3. SettingsのStable/Beta/Insider更新確認が正しいreleaseへ誘導することを確認する（同一数値コアのpreview連番を含む）。
4. #10のAE実機で新しいビルドが起動し、オフラインコア・保存済みデータ・更新UIが正常であることを確認する。

## 非目標

- 署名・公証の詳細手順（#32確定後に本docへ追記する）
- 自動更新（feed契約により、更新は手動配置で行う）

## 関連

- 依存関係・脆弱性の継続メンテナンス運用: `docs/operations/dependency-maintenance.md`（#46）
