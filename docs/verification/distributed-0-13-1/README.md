# v0.13.1 配布物の実利用経路検証 (Issue #666)

公開済み GitHub Release `v0.13.1` の配布物を、開発用 dev bundle ではなく
実際のインストール経路で配置し、After Effects 実機上で起動・
アップデート検出を確認した記録。対象 Issue: #666。

## 手順

- macOS: 公開 `ty-plus-v0.13.1-macos.zip` を
  `~/Library/Application Support/Adobe/CEP/extensions/app.ty-plus` に展開配置。
  旧版からの更新検出確認のため、別途 `ty-plus-v0.13.0-macos.zip` を
  manifest Version のみ 0.13.1 → 0.13.0 に書き換えた検証用コピーを同経路に配置して確認。
- Windows: `device-windows` (Windows 11 + AE2027) の
  `%APPDATA%\Adobe\CEP\extensions\app.ty-plus` に公開
  `ty-plus-v0.13.1-windows.zip` を配置。既存インストールは v0.10.3。
- いずれも Window > Extensions からパネルを起動し、Settings > Updates を
  CDP (`Page.captureScreenshot`) で撮影。

## 証跡

| ファイル | 環境 | 内容 |
| --- | --- | --- |
| `macos-update-available-0.13.0.png` | macOS / AE2027 | Installed 0.13.0 → 「新しいバージョンがあります: 0.13.1」 |
| `macos-up-to-date-0.13.1.png` | macOS / AE2027 | Installed 0.13.1 → 「最新です」 |
| `windows-update-available-0.10.3.png` | Windows / AE2027 | Installed 0.10.3 → 「New version available: 0.13.1」 |
| `windows-up-to-date-0.13.1.png` | Windows / AE2027 | Installed 0.13.1 → 「Up to date」 |

## 結果

- 両 OS とも配布 zip の展開・CEP への配置・AE からの起動を確認。
- アプリ内更新検出は双方向で正常: 旧版 (0.13.0 / 0.10.3) から 0.13.1 を
  「利用可能」と判定し、0.13.1 自身は「最新」と判定した。
- 製品不具合は検出されなかった。

## 残件

- Windows 側で旧 `ty-plus` 0.10.3 ディレクトリ (system 領域
  `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`) の置き換えは
  管理者権限が必要で未実施。0.13.1 は user 領域に別フォルダ名で配置して検証した。
- feed 判定ロジック自体は `src/management/online/update/feed.ts` と
  GitHub Releases API に対する contract test で担保済み。
