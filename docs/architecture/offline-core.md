# Offline core と責任境界（Issue #5）

- Status: Accepted
- Date: 2026-11-11
- 正本: 本repo #5 / 製品charter `docs/architecture/project.md`

## 契約

ローカルコア（起動・レイアウト復元・保存 / 復元・preset実行・Debug Console）は、ライセンス状態・アカウント・ネットワーク接続なしで動作する。

- ライセンスゲートは実装から除去済み（旧 `src/management/online/licensing/` と `rust/crates/licensing` は削除）。機能へのtier制限は存在しない。
- オンラインsurface（catalog / notification / cloud gateway）はコード上存在するが、R0ではバックエンドを持たないdormant状態である。gatewayの起動失敗・不達はローカルコアを妨げない（`cloud-gateway-boot` のdegraded経路と、旧#128/#187の分離修正に基づく）。
- 将来の有料機能・配布APIは `docs/architecture/project.md` のcharterに従い、R0の実装はその拡張を妨げない設計に留める。R0で設計・実装しきらない。

## 検証

- `PanelRoot.offline.test.ts` — panel起動経路にlicense providerが再導入されていないことのwiring契約。
- `persistence/boot-restore-fault-injection.test.ts` — 破損fixtureでも既存データを破壊しない復元の行動契約。
- `persistence/surface-write.fault-injection.test.ts` — 書込順と部分失敗の整合。
- unit suite全体はネットワークなしで実行され、成功する。

実機（After Effects起動・無通信・再起動）の確認は #10（実機ゲート）で実施する。
