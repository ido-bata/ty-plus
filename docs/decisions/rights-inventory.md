# 権利インベントリ決定表（静的監査）

- Status: Draft（本人判断事項は未解決。解決まで公開ブロッカー）
- Date: 2026-11-11
- 正本: `rebuildup/ty-plus#219`（権利監査の履歴正本）/ 本repo #2
- 対象: 旧repo `main`（`a633e246156c`）と `release-0-10-0`（`05c921d1fb9a`）のtracked file

## 監査方法と範囲

両ブランチのtracked file（3,430 / 3,518件）に対し、秘密値パターン（GitHub / OpenAI / AWS / Slack token、JWT、鍵代入文）、実在エンドポイント、第三者著作権表示、vendored資産の出所表示を機械検査し、構成を実確認した。

未実施（本表の対象外）:

- Git履歴全件のシークレット監査（旧repoは公開しないため公開リスクは低いが、移植ファイルの取捨には影響しない）
- 過去のリリース成果物（ZXP / zip）と実機インストール物
- `.obsidian`・未pushのローカルファイル

## 分類表

状態の意味: **再利用可** = 権利表示を維持して移植可 / **権利者確認待ち** = 本人の契約確認が完了するまで移植しない / **移植しない** = 新repoへ持ち込まない。

### A. プロダクト実装（移植候補の本体）

| 資産 | 規模 | 推定権利者 | 状態 | 備考 |
| --- | --- | --- | --- | --- |
| `src/`（panel / modeless / ExtendScript host） | 1,043件 | 本人（Log!N業務中の作成） | **権利者確認待ち** | 著作権帰属はLog!N契約の確認が必要（#229関連）。契約上の帰属が確認できるまで移植しない |
| `rust/`（host-filesystem等のRust crate） | 143件 | 同上 | **権利者確認待ち** | 同上。`rust/crates/host-filesystem/assets/` のDejaVu fontは下記B |
| `scripts/` / `tools/`（build・検証・CLI） | 134件 | 同上 | **権利者確認待ち** | `scripts/package/sign-zxp.ts` はLog!N署名主体を含む（下記D） |
| `docs/architecture/` ほか現行docs | 550件の一部 | 同上 | **権利者確認待ち** | `docs/user-guide/installation/` は個人パス・旧Extension IDを含み、移植時に書き直す（旧#219確認済み） |
| build / tsconfig / biome等の設定 | - | 同上 | **権利者確認待ち** | 上記と同一の帰属判断に従う |

### B. サードパーティvendored資産（表示維持で再利用可）

| 資産 | 出所 | ライセンス | 状態 | 備考 |
| --- | --- | --- | --- | --- |
| `src/management/preset/editor/grammars/{JavaScript,TypeScript}.tmLanguage.json`、`themes/dark_plus.json` | microsoft/vscode `fdabaa87e9` | MIT（Copyright (c) Microsoft Corporation） | **再利用可** | 出所・pin・ライセンス全文が `VENDORED.md` に記録済み。表示を維持して移植する |
| `rust/crates/host-filesystem/assets/DejaVuSansMono.ttf` + `LICENSE` | DejaVu fonts | Bitstream Vera license（再配布可） | **再利用可** | LICENSE同梱を維持する |

### C. Hyper Brew関連

| 資産 | 状態 | 備考 |
| --- | --- | --- |
| root `LICENSE`（MIT / Copyright (c) Hyper Brew LLC） | **権利者確認待ち** | Bolt CEP boilerplate由来の表記が残存。ty-plusコードの権利者をこの表記が主張していない可能性が高く、書換は本人判断まで行わない。本repoはLICENSEを作成しない（ADR-0001） |
| `reference/bolt-cep/`（Bolt CEP boilerplate） | **新repoへの混入なし確認済み** | `main` / `release-0-10-0` のtracked fileに存在しない（`docs/architecture/repository/materials.md` は参照専用方針を文書化）。ローカルにのみ存在するuntracked資産 |
| `docs/no-use/`・`archive/` 内の旧LICENSE等 | **移植しない** | legacy archive |

### D. Log!N運営依存（R0で切断または非移植）

| 資産 | 状態 | 備考 |
| --- | --- | --- |
| `supabase/`（Edge Functions / migrations / project ref `shhxrcoimtooaaioqqll`） | **権利者確認待ち** | Log!N運営インフラ。#4（旧#220）のAPI採用判断まで移植しない。プロジェクトrefは秘密値ではないがinfra識別子 |
| `src/management/online/`（preset catalog / licensing gate） | **権利者確認待ち** | ライセンスゲート切断（#5、旧#221）の対象。接続先はplaceholder（`example.supabase.co`）で実値なし |
| Extension ID `org.loginc.ty-plus`（`cep.config.ts`、`src/management/**` のsurface ID等） | **置換要** | 変更時は既存インストールとの併存・移行挙動の検証が必要（旧#219、#6と整合） |
| `scripts/package/sign-zxp.ts` の署名主体（`Log-!N` / `org.loginc.ty-plus` / `changeme` 既定値） | **置換要** | 公開用署名主体・証明書は本人判断（実権利者の確認を含む） |
| `.env.example` 群の `NOTION_TOKEN` 系schema | **移植しない** | 実値はtracked fileに存在しないことを確認済み。schema自体はLog!N運営依存 |

### E. 非移植（新repoへ持ち込まない）

| 資産 | 規模 | 理由 |
| --- | --- | --- |
| `archive/` | 1,480件 | 履歴資料。salvage専用 |
| `docs/no-use/` | - | 参照禁止資料 |
| `.obsidian/`、`HAP-log.txt`、`CUsersrebuiDesktopty-plusdiff.txt` | - | 個人環境資産・作業残骸 |

## シークレットスキャン結果

- `main` / `release-0-10-0` 両方のtracked fileで、秘密値パターン・鍵代入文の検出なし（`docs/no-use`・`archive` を除く）。
- 実在するSupabase project refは `supabase/` 内のみ。panel sourceの接続先はplaceholder。
- `.env` 実値はtracked外（`.gitignore` 適用確認済み）。
- Git履歴全件の監査は未実施（上記のとおり範囲外）。

## 公開ブロッカー（本人判断が必要）

1. **著作権帰属**: `src/` `rust/` `scripts/` 等のty-plus実装の権利が、Log!N契約上どのように帰属するか。ここが確定するまでA分類の移植は開始しない。`rebuildup/ty-plus#229`（関係者連絡の要否判断）と一体で判断する。
2. **LICENSE表記**: Hyper Brew LLC表記の扱いと、公開時の著作権表示・ライセンス種別の決定。
3. **署名主体・証明書**: 公開用ZXP署名の実権利者と手順。
4. **Extension ID**: 変更の可否と、既存インストールからの移行方針（#6と整合）。
5. **infra資産**: `supabase/` を新repoに置くか、別管理にするか（#4で判断）。
