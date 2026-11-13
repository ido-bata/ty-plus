# 実機スクリーンショット撮影記録

`v0.10.1-*.png` は、公開済み Stable Release `v0.10.1` の ZXP を実機の After Effects で起動した実画面を撮影したものです（Issue #62）。開発ビルド・モック・図版ではありません。

- 撮影日: 2026-11-13
- OS: macOS 27.2.1 (26B131)
- ホスト: Adobe After Effects 2026 (26.5.3x9)
- 拡張機能: ty-plus v0.10.1 (Stable)
  - 成果物: `ty-plus-v0.10.1-macos.zxp`
  - SHA-256: `0335319b6528665aa0bb7a7159c5138a1b63c8c3269ba5dfeca0041e9c72a463`（GitHub Release 公開 manifest と一致、`ZXPSignCmd -verify` = Signature verified successfully）
  - インストール経路: `~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus`（ZXP 展開物）。システム全体パス `/Library/Application Support/Adobe/CEP/extensions/ty-plus` にも同一バイト列が配置され、CDP 経由でパネルが v0.10.1 から読み込まれることを確認。
- 撮影手順: `screencapture -x -o -l <window-id>`（After Effects の実ウィンドウのみ。他アプリの画面は含まない）
- `v0.10.1-hero.png` は同一セッションで撮影した After Effects メインウィンドウと ty-plus パネルの2枚を並べて合成したもの。合成前の単体画像は `v0.10.1-after-effects.png` / `v0.10.1-panel.png` を参照。
- 個人情報チェック: プロジェクト名は「名称未設定プロジェクト」で未保存のまま。ファイルパス・アカウント名・個人のプリセット名は含まれません（プリセット一覧に表示されるのは After Effects 同梱の標準プリセット名）。ウィジェット構成は実マシンの実設定（11 ウィジェット、プリセット未登録状態）。
- 字下げ・表示言語: 撮影機の UI 言語は日本語（アプリ設定 `language: ja`）。製品の言語設定ではなくユーザー環境の設定値です。
- 制限事項: Windows 実機での撮影・検証は未実施（#10）。Windows のネイティブ Worker は未署名、macOS は Developer ID 署名だが notarization 未設定のため、OS のセキュリティポリシーにより動作しない環境があり得ます。
