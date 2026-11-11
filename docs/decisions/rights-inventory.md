# 権利インベントリ決定表

- Status: LICENSE確定（2026-11-11本人決定）。第三者コンポーネントの個別監査は継続（下記「2026-11-11 監査結果」）
- Date: 2026-11-11
- 正本: 本repo #2 / 旧 `rebuildup/ty-plus#219`（監査履歴の参照）
- 対象: 旧repo `main`（`a633e246156c`）と `release-0-10-0`（`05c921d1fb9a`）のtracked file

## 2026-11-11 監査結果（第三者由来の残存確認）

- **LICENSE確定**: 独自部分は `LICENSE`（MIT, Copyright (c) 2026 361do_sleep）。第三者資産の帰属は `THIRD-PARTY-NOTICES.md` に集約。配布packに両ファイルを同梱する（`package-cep-archive.ts`、`verify-release-artifacts.ts` が検査）。
- **Bolt CEP boilerplate（MIT / Hyper Brew LLC）の残存**: 旧repoの初期commit（`1f869942`、2025-11-21、Bolt CEP scaffold）と本repoのtracked fileの共通は **構成ファイル8件のみ**（`vite.config.ts` / `vite.es.config.ts` / `cep.config.ts` / `tsconfig.json` / `biome.json` / `package.json` / `.gitignore` / `README.md`）。scaffold由来のデモ資産（`src/js/assets/bolt-cep*` 等）・コンポーネント・スクリプトは本repoに存在しない。上記構成ファイルはboilerplateの現行HEAD（hyperbrew/bolt-cep）と実diffで大きく乖離しているが、雛形の子孫であるためMITの通知義務を `THIRD-PARTY-NOTICES.md` §1で履行する。
- **`com.typlus`識別子**: `src/cep.config.ts` の `com.typlus.stub` はvitest用stubのみ（実manifestのExtension IDは `app.ty-plus` 確定済み、#32）。`com.typlus.surfaceMessage` はpanel↔hostのwire契約のイベント名であり、Log!N由来でもExtension IDでもないため変更しない（変更はwire protocolの破壊的変更になる）。
- **`reference/Adobe-CEP/CEP-Resources/`**: tracked fileに存在しない（ビルド時ツール）。配布zip / ZXPには同梱しない（`package-cep-archive.ts` のpack対象外）。

## 権利関係の確定（2026-11-11 本人確認）

**Log!N側はty-plusのプロダクト実装について権利を保有しない。** Log!Nの名称はExtension ID等の識別子として借用されていたにすぎず、Log!Nの許諾取得は移植の前提条件ではない。

- この確定はプロジェクトオーナー本人による事実確認であり、第三者の契約書・著作権資料を本repoで検証した結果ではない。
- Log!N由来の識別子・署名者・証明書・配布先・運営インフラは、権利の問題ではなく **置換／不採用の対象** として扱う。名称の借用とコードの権利を混同しない。
- 第三者の著作権表示（Hyper Brew LLC、Microsoft、Bitstream/Tavmjong Bah等）は、Git履歴を切断しても消えない。個別のライセンス条件の確認と表示の維持は継続する。

## 監査方法と範囲

両ブランチのtracked file（3,430 / 3,518件）に対し、秘密値パターン（GitHub / OpenAI / AWS / Slack token、JWT、鍵代入文）、実在エンドポイント、第三者著作権表示、vendored資産の出所表示を機械検査し、構成を実確認した。

未実施（本表の対象外）:

- Git履歴全件のシークレット監査（旧repoは公開しないため公開リスクは低いが、移植ファイルの取捨には影響しない）
- 過去のリリース成果物（ZXP / zip）と実機インストール物
- `.obsidian`・未pushのローカルファイル

## 分類表

状態の意味: **再利用可** = 権利表示を維持して移植可 / **条件付き** = 個別確認または置換の完了を移植の前提とする / **移植しない** = 新repoへ持ち込まない。

### A. プロダクト実装（移植候補の本体）

| 資産 | 規模 | 権利 | 状態 | 備考 |
| --- | --- | --- | --- | --- |
| `src/`（panel / modeless / ExtendScript host） | 1,043件 | 本人（本人確認済み） | **再利用可** | Log!N由来の識別子・署名設定は置換対象（D）。`docs/user-guide/installation/` は個人パス・旧Extension IDを含むため移植時に書き直す（#9） |
| `rust/`（host-filesystem等のRust crate） | 143件 | 同上 | **再利用可** | `licensing` crateは#5の切断対象。font assetは下記B |
| `scripts/` / `tools/`（build・検証・CLI） | 134件 | 同上 | **条件付き** | `scripts/package/sign-zxp.ts` の署名主体（`ty-plus`）は置換要 |
| `docs/architecture/` ほか現行docs | 550件の一部 | 同上 | **再利用可** | Log!N運営固有の記述は移植時に除外・書き直す |
| build / tsconfig / biome等の設定 | - | 同上 | **再利用可** | - |

### B. サードパーティvendored資産（表示維持で再利用可）

| 資産 | 出所 | ライセンス | 状態 | 備考 |
| --- | --- | --- | --- | --- |
| `src/management/preset/editor/grammars/{JavaScript,TypeScript}.tmLanguage.json`、`themes/dark_plus.json` | microsoft/vscode `fdabaa87e9` | MIT（Copyright (c) Microsoft Corporation） | **再利用可** | 出所・pin・ライセンス全文が `VENDORED.md` に記録済み。表示を維持して移植する。個別確認済み |
| `rust/crates/host-filesystem/assets/DejaVuSansMono.ttf` + `LICENSE` | DejaVu fonts | Bitstream Vera license（再配布可） | **再利用可** | LICENSE同梱を維持する。個別確認済み |

### C. Hyper Brew関連

| 資産 | 状態 | 備考 |
| --- | --- | --- |
| root `LICENSE`（MIT / Copyright (c) Hyper Brew LLC） | **条件付き** | Bolt CEP boilerplate由来の表記。本repoの実装はこの表記の権利対象ではない（本人確認済み）。新repoのライセンス表記・帰属表示は別途決定する（公開ブロッカー）。表記の削除・書換はその決定まで行わない |
| `reference/bolt-cep/`（Bolt CEP boilerplate） | **新repoへの混入なし確認済み** | `main` / `release-0-10-0` のtracked fileに存在しない。ローカルにのみ存在するuntracked資産 |
| `docs/no-use/`・`archive/` 内の旧LICENSE等 | **移植しない** | legacy archive |

### D. Log!N由来の識別子・運営依存（置換／不採用）

権利の問題ではなく、公開プロダクトからLog!N運営を分離するための置換対象（#5と連携）。

| 資産 | 状態 | 備考 |
| --- | --- | --- |
| Extension ID `app.ty-plus`（`cep.config.ts`、`src/management/**` のsurface ID等） | **解決済み（2026-11-11本人確定、#32）** | `app.ty-plus` を正式採用。実manifest・検証・ドキュメントはこの値で統一済み。既存インストールとの互換性検証は#10の実機ゲートで実施する |
| `scripts/package/sign-zxp.ts` の署名主体（`ty-plus` / `changeme` 既定値） | **条件付き** | 公開用署名主体・証明書は本人判断（実権利者の確認を含む） |
| `supabase/`（Edge Functions / migrations / project ref） | **移植しない（除外済み、#17）** | Log!N運営インフラ。#4のcharter上、R0はオフラインcore。将来の配布API方針は#4で決定 |
| `src/management/online/` のcloud機能（preset catalog等） | **条件付き** | コード権利は本人（移植可）。ただし接続先がLog!N運営infraのため、R0ではバックエンドごと移植せず、オフラインcoreからの切り離しを#5で実施する |
| `src/management/online/licensing/` + `rust/crates/licensing/` | **除去済み（#5 → PR #24）** | ライセンスゲートと機能tierを削除。全機能が無条件・オフラインで利用可能。契約は `docs/architecture/offline-core.md` |
| `.env.example` のLog!N運営schema（`NOTION_TOKEN` / `SYNC_TOKEN`） | **除去済み（#5 → PR #24）** | 実値は最初からtracked fileに存在しない（#2スキャン済み）。secret schemaはZXP署名とdormantなfeed用に縮小 |

### E. 非移植（新repoへ持ち込まない）

| 資産 | 規模 | 理由 |
| --- | --- | --- |
| `archive/` | 1,480件 | 履歴資料。salvage専用 |
| `docs/no-use/` | - | 参照禁止資料 |
| `.obsidian/`、`HAP-log.txt`、`CUsersrebuiDesktopty-plusdiff.txt` | - | 個人環境資産・作業残骸 |
| 旧repoの `.claude/skills/` | - | 本repoはADR-0002で独立にSkills構成を確定済み |

## シークレットスキャン結果

- `main` / `release-0-10-0` 両方のtracked fileで、秘密値パターン・鍵代入文の検出なし（`docs/no-use`・`archive` を除く）。
- 実在するSupabase project refは `supabase/` 内のみ。panel sourceの接続先はplaceholder。
- `.env` 実値はtracked外（`.gitignore` 適用確認済み）。
- Git履歴全件の監査は未実施（上記のとおり範囲外）。

## 公開ブロッカー（本人判断が必要）

1. ~~**ライセンス表記**~~ **解決済み（2026-11-11本人決定）**: MIT + THIRD-PARTY-NOTICES、著作権表示名義 `361do_sleep`。実装は `LICENSE` / `THIRD-PARTY-NOTICES.md` / READMEに反映済み。
2. **署名主体・証明書**: 公開用ZXP署名の実権利者と手順（#32に選択肢を提示済み、未決定）。
3. ~~**Extension ID**~~ **解決済み（2026-11-11本人決定）**: `app.ty-plus` に確定（#32）。実装・検証・ドキュメントは既にこの値で統一済み。既存インストールとの互換性検証は#10の実機ゲートで実施する。

`supabase/`・cloud catalog の扱いは公開ブロッカーではなく、#4のcharterに従う設計判断である。
