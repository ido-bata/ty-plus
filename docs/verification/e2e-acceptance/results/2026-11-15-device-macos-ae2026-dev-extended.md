# 2026-11-15 device-macos AE2026 dev 受入 suite 実行記録（拡張 suite）

## 実行条件

- Host: ローカル Mac（macOS arm64 / After Effects 2026）
- Build: dev bundle（Extension Id `app.ty-plus.dev.*`、`~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus.dev` → `dist/cep-dev` symlink）
- Managed root: `/Applications/Adobe After Effects 2026/ty-plus`
- Suites: `smoke` / `host` / `debug` / `catalog` / `widgets` / `settings` / `resilience`（Issue #108 で追加した自動ケース群、PR #115）
- 実行日時: 2026-11-15T10:34Z–11:01Z（UTC）
- 証跡: 本ディレクトリ配下の `<suite>/run.json`（runner の全チェック結果）

## 結果

| Suite | UC | ケース | 結果 |
| --- | --- | --- | --- |
| smoke | UC-A03 | live surfaces boot with CEP bridge and extension origin | PASS |
| smoke | UC-H01 | ExtendScript host responds and host bundle contract is callable | PASS |
| smoke | UC-A02 | persisted settings/layout/theme files exist and parse | PASS |
| smoke | UC-B04 | grid settings persisted value reaches panel CSS variables | PASS |
| smoke | UC-E02 | ui accent color persisted in app.json reaches theme.css tokens | PASS |
| smoke | UC-G01 | debug console surface aggregates logs and evaluates JS | PASS |
| host | UC-A04 | resident host contract answers getHostContext with app context | PASS |
| debug | UC-G02 | debug console reopen replays previously logged messages | PASS |
| debug | UC-G03 | operation worker verify: spawn → accept → result → exit | PASS |
| catalog | UC-C15 | preset with missing asset: record survives boot, host verify reports missing | PASS |
| widgets | UC-D11 | easing widget state file restores mode/loopCount after reload | PASS |
| settings | UC-E01 | ui.language in app.json drives panel locale across reload | PASS |
| resilience | UC-I01 | corrupt workspaces/workspace-1.json: banner shown, bytes preserved | PASS |
| resilience | UC-I02 | corrupt widgets/widgets.json: boots, bytes preserved（UC-D12 alias） | PASS |
| resilience | UC-I04 | corrupt styles/theme.css: defaults fallback, file preserved or repaired | PASS |
| resilience | UC-I05 | corrupt settings/app.json: defaults fallback, bytes preserved | PASS |
| resilience | UC-C16 | corrupt presets/presets.json: boots, records preserved | PASS |

合計: **PASS=17 / FAIL=0 / BLOCKED=0 / SKIP=0**（17 cases）

## 初回実行で検出したテスト側の不具合（修正済み・製品不具合ではない）

- UC-D11: eval 式に TypeScript の `as` cast が混入し SyntaxError → 修正
- UC-E01: locale 一覧は ListSelect 閉状態で未描画のため marker 誤検出、かつ pooled modeless が旧 locale で boot していた → dialog reload + sidebar `aria-label` 検証に変更
- UC-G02: `ctx.cdp()` が extensionId で接続を cache しており、console close→reopen で stale socket に eval していた → target.id キーに修正（`ctx.ts`）
- modeless surface の close 直後 ~6s は open retry が生きており surface が復活し得る → cleanup は retry window 経過後に再 close（`shared.ts` `closeSurfaceSettled`）

## 環境メモ

- 破損系ケースは managed root 全体を snapshot → 変更 → finally で復元。snapshot は OS temp 配下（`os.tmpdir()/ty-plus-e2e-snapshots`）に置き、証跡・リポジトリにユーザーデータを残さない（`cases/shared.ts`）。
- 実行後の managed root は復元済みであることを各ケースの finally で保証。復元に失敗した場合はケースが FAIL/BLOCKED になる。
- この記録は「ファイル永続化・boot 耐性・host bridge・debug console・operation worker・locale」の範囲。preset/`.ffx` 実行など AE 側の最終効果を伴う UC は引き続き未実施。
