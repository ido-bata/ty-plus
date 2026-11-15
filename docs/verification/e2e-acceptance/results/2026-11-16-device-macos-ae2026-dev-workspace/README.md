# workspace suite 実機実行記録 (macOS / AE 2026 / dev extension)

- 実施日: 2026-11-16 (JST)
- 対象: `scripts/verify/e2e/cases/workspace.ts` (UC-B02, UC-B05, UC-D10, UC-C12, UC-C14)
- 環境: macOS arm64, After Effects 2026, `app.ty-plus.dev` → `dist/cep-dev`
- managed root: `/Applications/Adobe After Effects 2026/ty-plus`

## 結果サマリ

本スイートは同日に複数回実行した。単一実行での PASS/FAIL に加え、
実行ごとの判定を以下に集約する。最終 run (`run.json`) はホスト高負荷
(Load Avg 28+, PhysMem unused 338MB, AE CPU 99%) の影響で全体的に
劣化しており、環境要因の BLOCKED/FAIL を含む。

| UC | 判定 | 備考 |
| --- | --- | --- |
| UC-B02 | PASS (複数回) | Add Widget dialog → info widget が widgets.json・workspace-1.json・DOM tile まで確認。高負荷時は tile hydration が 60s を超え FAIL になることがある (環境要因)。 |
| UC-B05 | 要再実行 | save → mutate → restore → delete の各操作は個別実行で全て成功を確認 (snapshot id 採番・gridCells 復元・tile 除去・snapshots.json からの削除)。ただし単一 run での全 check PASS は未取得。セル数比較が live panel の再永続化レースで汚染される問題を修正済み (`withManagedRootSnapshot` 後に panel reload を追加)。 |
| UC-D10 | PASS (複数回) | quick-actions palette から script preset を 2 連続実行し、AE 側 marker ファイルの再生成を確認。 |
| UC-C12 | PASS (全 run) | footage preset (.png) を dialog 経由で作成し、catalog Run で AE project に footage item が追加されることを確認。 |
| UC-C14 | PASS (2 回) / 不安定 | 削除済み asset の preset 実行で blocking modal 無し・panel 応答維持・AE 側 artifact 無しを確認。非 modal エラー通知 (toast) の観測が実行により成否あり。 |

## 製品修正 (本 run に含まれる)

- quick-actions palette の `run-preset` delegated click listener が
  portal mount 前に attach されていた不具合を修正 (#125)。
- modeless dialog surface に `NotificationContainer` を mount し、
  host 実行失敗 toast が dialog 上でも見えるようにした (#126)。
- workspace tile/run-preset の missing-asset ゲートで warning toast を
  追加 (従来は statusMessage のみ)。

## ハーネス修正

- managed root 自動検出を live AE の `app.version` に追従させ、
  probe 失敗時の retry を追加 (AE 2027 誤検出の再発防止)。
- CDP `Runtime.evaluate` 既定 timeout を 20s → 45s に引き上げ
  (高負荷時の一時的 stall 対応)。
- `withManagedRootSnapshot` の restore 後に panel-1 を reload し、
  in-memory layout の再永続化による汚染を防止。
- snapshots dropdown / Add Widget dialog / save-snapshot の
  hydration タイミングに対する retry・poll を追加。

## 環境メモ

- 実行中のホストは load avg 16–31、PhysMem unused ~300MB、swap 多発。
  Unity Editor / rustc / codex 等の並行プロセスが主因と見られる。
- データボリューム空き容量 7.9GiB / 460GiB (99% 使用)。
  再生成可能な大物: `~/work/cargo-target-shared` (10G),
  `~/.cache` (4.1G), `~/Library/Caches/ms-playwright` (1.1G) など。
  証跡・既存データの削除は未実施 (要承認)。

## 残件

- UC-B05 のクリーンな単一 run PASS 取得 (負荷沈静後に再実行)。
- UC-C14 toast 観測の安定化 (host roundtrip 遅延時の poll 窓は拡大済み)。
- Windows / AE 2027 での同スイート実行。
