# リリース候補の検証記録（v0.10.3 / Stable）

- Status: **Windows・macOSともに release-trust で完成**（macOSは未公証、ADR-0003 Amendment 1）
- 対象: `release-0-10-3`（修正リリース。offline-core 停止系・update.install 安全性・UI 品質の収束）
- 正本: `.agents/skills/release-channels/SKILL.md`、`docs/operations/release-runbook.md`、ADR-0003/0004
- この記録は**公開の承認ではない**。GitHub Release作成・tag作成・`release-0-10-3 → main` mergeは本人の明示承認まで実行しない。

## 1. 版の確定

| 項目 | 値 |
| --- | --- |
| CEP数値版（`package.json.version`） | `0.10.3` |
| 配布版（`releaseVersion`） | `0.10.3` |
| GitHub tag（予定） | `v0.10.3` |
| channel / prerelease | `stable` / `false` |
| sourceCommit（RC freeze SHA） | `e3bee75dde7c1cb974c621f7c6a40d5e7f9fa4ad`（PR #181 merge commit。初回freeze `8d323002` は #180 のrelease-blocking欠陥検出により破棄し再freeze） |

v0.10.2 とは**別の成果物**である。`channel=stable`、tagが`v0.10.3`、ハッシュが異なる。

## 2. Windows配布候補（完成）

macOSホストで `cargo xwin`（MSVCツールチェーン、`cargo +1.89.0 xwin`、cargo-xwin 0.23.1）によりクロスコンパイル。WindowsはAuthenticode不要（ADR-0003）。

```sh
CROSS_COMPILE_CARGO="cargo +1.89.0 xwin" \
TY_PLUS_BUILD_PLATFORM=windows \
TY_PLUS_RELEASE_VERSION=0.10.3 TY_PLUS_RELEASE_CHANNEL=stable \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/.tmp/zxp/ZXPSignCmd" \
bun run release:candidate --channel=stable --release-version=0.10.3
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `e3bee75dde7c1cb974c621f7c6a40d5e7f9fa4ad` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.3-windows.zip` / sha256 `c197605b56adfb29ed3429217e2c98511deb4c53d7a3b8c62bffc5d6ebdebc12` / 11,159,210 bytes |
| ZXP | `ty-plus-v0.10.3-windows.zxp` / sha256 `d4da6810a698801774d0da357bdf57b1d1e67529083b284064e675fcc99b51bc` / 11,179,904 bytes |
| manifest | `ty-plus-v0.10.3-windows-release-manifest.json` / sha256 `4ef32be15c699456343b8cc6a3d273e9c369d23708c974941d0b5af5c58f0c92` |
| worker | `windows/operation-worker.exe`（PE32+ x86-64、sha256はpack内version dir名と一致・Authenticode未署名 = R0の正当な形）、Authenticode未署名 = R0の正当な形） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

実測で確認した内容:

- ZIPは `LICENSE` / `THIRD-PARTY-NOTICES.md` / `jsx/ty-plus-host.jsx` / `CSXS/manifest.xml`（`ExtensionBundleVersion="0.10.3"`）+ `windows/` workerのみを含む。macOS workerは含まない（`pruneUndeclaredWorkers` で宣言外のworker版を除去）
- `verify-operation-worker-package.ts` 全項目PASS（`trust-mode-manifest`: unsigned worker — R0 Windows shape）
- 監査（`verify-release-artifacts.ts`）全項目PASS: `0.10.3 (stable), sourceCommit=e3bee75d…, 2 artifact(s) hash-verified, secret scan clean`

## 3. macOS配布候補（完成 — Developer ID署名 / 未公証）

```sh
TY_PLUS_SIGN_IDENTITY="Developer ID Application: Yusuke Kimura (JK49RJ2CK2)" \
TY_PLUS_ZXP_CERT_PATH="$HOME/Library/Application Support/ty-plus-signing/ty-plus-release.p12" \
TY_PLUS_ZXP_CERT_PASSWORD="$(security find-generic-password -s 'ty-plus.zxp.signing' -w)" \
ZXP_SIGN_CMD="$PWD/.tmp/zxp/ZXPSignCmd" \
bun run release:candidate --channel=stable --release-version=0.10.3
```

| 項目 | 実測値 |
| --- | --- |
| sourceCommit | `e3bee75dde7c1cb974c621f7c6a40d5e7f9fa4ad` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.3-macos.zip` / sha256 `8cb1b401aef78ca26eae21e7579081c5f42af268d62937d7132b0132bd7e7975` / 14,331,702 bytes |
| ZXP | `ty-plus-v0.10.3-macos.zxp` / sha256 `3ab6d8158f5ea064c7392ccd7f2d2d68f650b13492008da774cabba550c0d87f` / 14,349,215 bytes |
| manifest | `ty-plus-v0.10.3-macos-release-manifest.json`（再構成: generatedAt は概算値。artifact の file/sha256/bytes は実測）/ sha256 `f8531bc23c69044fb0296d39e4260cc2d74dc71faadad1c391e11a07efc69596` |
| worker | `macos/operation-worker`（Mach-O universal x86_64+arm64、sha256 `59cc76146680f567d47d27c0c596671a2efbc83639e059bc09ac4dd8eb559b9e`（ZIP内実測）、`flags=0x10000(runtime)`、Developer ID署名） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

実測で確認した内容:

- `codesign --verify --strict` 成功。`Authority=Developer ID Application: Yusuke Kimura (JK49RJ2CK2)`、TeamIdentifier `JK49RJ2CK2`、hardened runtime 有効
- `spctl --assess` は未公証を返す想定（ADR-0003 Amendment 1 によりR0要件外。v0.10.2と同じ状態）
- ZIPは `ExtensionBundleVersion="0.10.3"`、当該platformのworkerのみを含む
- 監査（`verify-release-artifacts.ts`）全項目PASS、secret scan clean

> **tag target**: 両platformの成果物の `sourceCommit` は `e3bee75dde7c1cb974c621f7c6a40d5e7f9fa4ad`。GitHub Release作成時は `--target e3bee75dde7c1cb974c621f7c6a40d5e7f9fa4ad` を指定し、**tagと成果物の `sourceCommit` を一致させる**。本記録docの後続commitはdocsのみで、成果物のバイトに影響しない。
> 成果物の保管先: `dist/github-release/`（repo内・gitignore対象）と `~/work/ty-plus-rc-0.10.3/`（ローカルバックアップ）。

## 4. CI（RC freeze SHA `e3bee75d`）

### workflow_dispatch full gate — run `44000306489`（**全job success**。初回run `43991018411` は旧SHA `8d323002` で全job success だったが #180 により無効）

| job | 結果 |
| --- | --- |
| skills / static / unit / coverage | success |
| storybook (1)–(4) | success |
| storybook-capture-report | success |
| operation-worker-macos / operation-worker-windows | success（実行・success。skipではない） |
| release gate | success |

### push fast gate — PR #181 run `43999772039`（success）。merge後push runは別途記録

### Storybook capture report（run `44000306489` の storybook-capture-report job success。旧SHA `8d323002` run `43991018411` artifact では 494 story 全件 ok・console error は意図的 ErrorBoundary 1件のみ。#181 は story を変更していないため capture 対象は同一）

- 対象 story: **494件、全件 `ok`**（render-failed / capture-error / missing-metadata / missing-png / invalid-metadata すべて 0）
- console/page error: **1件のみ** — `shared-feedback-errorboundary--fallback`（意図的に throw する fallback 検証story。仕様上のエラーであり不具合ではない。PR #175 で他7件の console error は全て解消済み）
- DSF=2（Retina相当）spot check: dev server + Playwright `deviceScaleFactor:2` で代表9 story（easing / directory-browser / input / segmented-control / settings dialog / widget grid icons / preset library side panel）を描画確認。console/page error 0件、描画崩れなし。全件Retina captureは未実施（report-only方針、pixel diff未導入は #166 の残判断事項）

## 5. 本リリースで収束した修正

| Issue | 内容 | 統合PR |
| --- | --- | --- |
| #139 | cloud gateway未boot/オフライン時にローカル機能（preset D&D・グループ作成・パネル）が停止する問題 | #148/#154/#163/#164/#165（先行統合）+ #172/#173（回帰テスト） |
| #141 | DirectoryBrowser右クリックメニューの共通操作（Move to panel等）復旧 | 同上 + #173（event bridge契約テスト） |
| #145 | Easing/Align等ポインタ操作退行の監査・修復 | #165系 |
| #146 | Storybook capture基盤のmetadata pipeline整備 | #165 + #175（一部残件は#166へ） |
| #166 | console error修正・interaction-state story拡充 | #175（残件はopenのまま） |
| #167 | ticket PR高速gateとRC freeze包括検証のCI分離 | #168 |
| #169/#135 follow-up | update.install の lease自己競合・pending復旧・staging分離・型付きエラー・prerelease抑止 | #176 |
| #170 | offline-core残存経路（bundled public link・dead affordance・unhandled rejection）| #174 |
| #136 | project-init v0.9.0 reconcile・worktree lifecycle | #137 |
| #180 | panel bundle の worker trust-mode define 切れ（release panel が worker manifest を拒否・dev probe 混入）。v0.10.1/v0.10.2 出荷物も同経路で同欠陥の可能性 | #181 |

回帰テスト追加: `persist-folder-group.test.ts`（folder-scan presetのoffline永続化）、`hook-browser-events.test.ts`（menu→browser-* event契約）、`image-src-for-browser` / entry-icon のURL変換テスト、offline residual契約テスト、update.installのRust test 10件追加。

## 5b. RC 実機受入（AE 2026 26.5.3、release-trust 成果物、sandbox モード）

初回freeze `8d323002` の成果物を `app.ty-plus`（`dist/cep-dev` symlink、production build）として AE 2026 にロードし、`scripts/verify/e2e` を実行。**そこで #180（worker trust-mode define 切れ）を検出し修正・再freezeした。** 旧成果物での結果: smoke/settings/widgets/catalog/host/journey は PASS、debug UC-G03 は `binary_manifest_mismatch` で FAIL（#180 の検出契機）。

修正版 `e3bee75d` の release-trust build を同じく AE 2026 へロードして再実行した結果（すべて sandbox モード、実 managed root 無改変）:

- smoke 6/6 PASS（`/tmp/e2e-rc-smoke/run.json`）
- settings UC-E01 PASS（言語切替+reload永続化。`/tmp/e2e-rc-settings/run.json`）
- debug UC-G02 PASS（console open → marker replay → close → reopen を実測。初回は modeless surface 起動前で `not live` FAIL、surface 起動後の再実行で PASS。`/tmp/e2e-rc5/run.json`）
- debug UC-G03 SKIP — dev-only probe `__TY_PLUS_OPERATION_WORKER_VERIFY__` が release build で正しく不在（#180 修正の実機確認。`binary_manifest_mismatch` は解消。`/tmp/e2e-rc3`・`/tmp/e2e-rc5`）
- host UC-A04 PASS、catalog UC-C15 PASS
- workspace: UC-B02/B05/D10 PASS、UC-C12/C14 は `Create not clickable: missing-or-disabled` で BLOCKED（harness/host側の制約。機能正常性の証拠にはならないため §9 に残件として記録。`/tmp/e2e-rc-workspace/run.json`）
- widgets UC-D11 SKIP（sandbox に easing widget が未永続化。旧buildでは PASS 実績あり。`/tmp/e2e-rc-widgets/run.json`）
- #71 関連: UC-E01（settings dialog 経由の言語切替+reload永続化）PASS、panel reload で renderer crash / `Uncaught [object Event]` 再現せず
- Windows 実機・ZXP インストール経路の確認は未実施

## 6. 主要ジャーニーの受入証拠（#108 matrix 現状）

`docs/verification/e2e-acceptance/use-case-matrix.md` が正本。v0.10.2時点からのmac自動PASS項目（起動・復元・パネル開閉・host self-heal・preset配置(dialog経路)・widget追加・layout snapshot保存復元・`.jsx`/`.ffx` preset実行・preset asset検証・言語/外観・widget state永続化・quick-actions・debug console・破損データ耐性）は引き続き有効。**v0.10.3差分のうち offline-core 経路は workspace suite（UC-B02 widget配置・UC-D10 preset実行・UC-B05 layout保存復元）で sandbox 越しに実機確認済み**（Cloud Gateway 非依存で動作）。update.install の実機E2Eと、gateway 未起動を明示的に遮断した条件での D&D/グループ作成の個別確認は未実施。

未検証のまま残るもの（PASSにしていない）: UC-C12/C14（BLOCKEDのまま）、Windows側の大半のsemi-auto UC、多数のwidget/drag/undo/複合ジャーニー。matrixに `未実施` のまま記録。

## 7. 更新フィード・導入互換

- 更新検出は GitHub Releases API への読み取りのみ。**v0.10.3の実feed検証は公開後にしか実施できない**（公開後確認項目）
- update.install の安全性修正（#169）: swap lease分離・staging試行別dir・pending復旧・backup保持・型付きエラーwire写像・prerelease install抑止。**AE実機での update.install E2Eは未実施**
- managed root 配下のユーザーデータは拡張更新で上書きされない設計（変更なし）

## 8. 署名基盤（継続利用）

- ZXP: `~/Library/Application Support/ty-plus-signing/ty-plus-release.p12`（自己署名、継続利用。Trash recovery pathからcanonical pathへ復旧済み）。パスワードはキーチェーン `ty-plus.zxp.signing`。秘密値は記録していない
- macOS worker: 既存 Developer ID Application（`TY_PLUS_SIGN_IDENTITY` で指定、証明書の新規取得なし）
- macOS公証: **未実施**（`TY_PLUS_NOTARY_PROFILE` 未設定。ADR-0003 Amendment 1 によりR0要件外）

## 9. 残余リスク・未検証事項

1. **update.install の実機E2E未実施** — #169/#176 の修正対象そのもの。隔離環境または公開後の実feedで確認が必要。公開前に可能な範囲での検証を推奨
2. **release-trust成果物の実機導入スモーク未実施** — 今回は `dist/cep-dev` symlink 経由の production build で実機確認したが、署名済みZIP/ZXPを実AEへインストールする経路は未検証。v0.10.1/v0.10.2も同経路は未実施だった
3. **UC-C12/C14 BLOCKED** — footage preset実行と失敗通知の実機観測が未完了（v0.10.2から継続）
4. **Windows実機でのv0.10.3確認なし** — Windows成果物はクロスコンパイル+静的検証のみ
5. **公開後の更新feed実証** — 公開後に実施
6. **Smart App Control 有効環境ではWindows版が起動しない**（未署名worker、ADR-0003で許容済み・周知事項）
7. **#166 残件** — widget/workspace の interaction-state coverage は部分的。GridTile の PanelContext/renderDescriptor seam 未整備。pixel diff/reg-suit 未導入（report-only方針の判断記録は今後）
8. **Skill正本のドリフト（記録のみ）** — vendored `release-channels` Skill（skills-lock: rebuildup/project-init v0.9.0）が ADR-0003 Amendment 1（macOS公証R0要件外）と runbook（`--target` は manifest `sourceCommit`）に未追従。vendored copyはhash lockのため本repoでは修正不可。project-init側の修正が必要
9. **#71** — v0.10.3 build で UC-E01（settings dialog 経由の言語切替+reload永続化）PASS、panel reload で `Uncaught [object Event]` / renderer crash 再現せず。実機確認は実施済みだが、単独・複数ダイアログの網羅的確認は本人受入に残るためIssueはopenのまま

## 10. 公開までに必要な本人操作

1. **明示承認**: `release-0-10-3 → main` の release PR merge、tag `v0.10.3` 作成、GitHub Release `v0.10.3`（`prerelease=false`、`--target e3bee75dde7c1cb974c621f7c6a40d5e7f9fa4ad`）の公開を承認する
2. **RC受入（実機）**: agent側で smoke/settings/workspace/debug の主要経路は確認済み。残る本人確認は settings dialog の単独・複数起動、update UI の表示と失敗時の安全性、（可能なら）隔離環境での update.install
3. **公開後確認**: 実feedでの更新検出、必要ならrelease-trust成果物の実機スモーク、UC-C12/C14の再実行
4. **任意**: macOS公証の有効化（`xcrun notarytool store-credentials ty-plus-notary`）
