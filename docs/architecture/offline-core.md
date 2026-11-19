# Offline core と責任境界（Issue #5）

- Status: Accepted
- Date: 2026-11-11
- 正本: 本repo #5 / 製品charter `docs/architecture/project.md`

## 契約

ローカルコア（起動・レイアウト復元・保存 / 復元・preset実行・Debug Console）は、ライセンス状態・アカウント・ネットワーク接続なしで動作する。

- ライセンスゲートは実装から除去済み（旧 `src/management/online/licensing/` と `rust/crates/licensing` は削除）。機能へのtier制限は存在しない。
- 提供するオンラインsurfaceは更新feedと通知の静的feedのみ（`docs/architecture/feeds.md`）。それ以外のオンライン機能（catalog / public link / cloud gateway / Preset Library）は #193 で構造ごと撤去した。dormant service層・`online.*` wire method・Rust `online` crate・cloud-gateway boot経路は残っていない。到達不能化ではなく削除であり、再導入する場合はbackend契約と合わせてsurfaceを新規に設計する。
- fixture payloadを実データとして提示しない: 通知センターのremote sourceは公式静的feedのみであり、fixture gateway・fixture badge・`isFixture`契約は存在しない。backendを持たないcloud-sync確認を発火するSettings「network」セクション自体も #193 で撤去した（build-time envのread-only表示も含め、section id・hash導線ともに存在しない）。
- Preset Library（オンラインcatalog）のUI surfaceは #193 で撤去した。status bar・context menu・tool dialog kind・dialog route・CEP manifest entry・i18n keyのいずれにも存在しない。到達不能化ではなく構造的削除であり、`online-surface-contract.test.ts` が非存在を契約として検査する。
- 将来の有料機能・配布APIは `docs/architecture/project.md` のcharterに従い、R0の実装はその拡張を妨げない設計に留める。R0で設計・実装しきらない。

## 検証

- `PanelRoot.offline.test.ts` — panel起動経路にlicense providerが再導入されていないことのwiring契約。
- `persistence/boot-restore-fault-injection.test.ts` — 破損fixtureでも既存データを破壊しない復元の行動契約。
- `persistence/surface-write.fault-injection.test.ts` — 書込順と部分失敗の整合。
- unit suite全体はネットワークなしで実行され、成功する。

実機（After Effects起動・無通信・再起動）の確認は #10（実機ゲート）で実施する。
