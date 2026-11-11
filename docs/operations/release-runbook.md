# リリース手順（release runbook）

- Status: Accepted
- 正本: 本doc。関連: #39（本手順の整備Issue）/ `docs/architecture/distribution.md`（trust model）/ `docs/architecture/feeds.md`（更新フィード契約）/ #32（署名・公証）
- この手順は1リリース（1 version）につき1回、先頭から順に実行する。手順の途中で前提が崩れた場合は先頭からやり直す。

## 前提

- 作業branchは `main` から切り、リリース対象の変更（version更新を含む）が全て取り込まれた状態にする。
- 実行環境: Bun（`mise install` 済み）、Rust toolchain（`rust-toolchain.toml` 準拠）。
- 公開操作（GitHub Releaseの作成・push等）は **本人の明示的承認ゲート** を経る。手順内の承認チェックポイントを通さずに公開しない。

## 1. version確定

1. `package.json` の `version` を更新する。形式は `MAJOR.MINOR.PATCH`。
2. このversionが検証probeの基準になる（手順2の `--product-version` に同じ値を渡す）。

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

- 未実装（#32）。証明書の準備と署名手順が確定した時点で、この節を手順として確定させる。
- 確定までの間、`development-unsigned` の成果物を **配布に使わない**（`docs/architecture/distribution.md` のtrust model契約）。

## 4. 公開

1. GitHub Releaseを作成し、成果物（zip / `release-manifest.json`）を添付する。
2. 更新フィード（`docs/architecture/feeds.md`）を更新する:
   - `schema` / `version` / `publishedAt` / `assets[].url` / `assets[].sha256` を、実際に公開した成果物と一致させる。
   - `assets[].sha256` は、公開したzipの実測値（`shasum -a 256` または同等）を使う。手元のmanifest値と一致しない場合は成果物の再生成からやり直す。
3. 公開後、`docs/user-guide/installation/index.md` の手順が実物と一致しているかを再確認する。

## 5. 事後検証

1. 公開した成果物を **配布先から再取得** し、sha256が`release-manifest.json`の記録と一致することを確認する。
2. 更新フィードのURLへアクセスし、`version` と `assets` が公開内容と一致することを確認する。
3. 実機（#10の検証環境）で更新確認（Settings → 更新）が新しいversionを検出することを確認する。

## 非目標

- 署名・公証の詳細手順（#32確定後に本docへ追記する）
- 自動更新（feed契約により、更新は手動配置で行う）
