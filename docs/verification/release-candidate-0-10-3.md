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
| sourceCommit（RC freeze SHA） | `8d32300245b8bddac58b180bcb691ded6e9da050`（PR #177 merge commit） |

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
| sourceCommit | `8d32300245b8bddac58b180bcb691ded6e9da050` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.3-windows.zip` / sha256 `fe075464b6453eb6b4202d9ac3891d2b96e5155c9dbf86f5b65b048de5ec919b` / 11,159,401 bytes |
| ZXP | `ty-plus-v0.10.3-windows.zxp` / sha256 `f88c0525a20b82d1c394ad69ef99f1101e33554e35cf0373f65ca8bd2ecbbfe5` / 11,180,088 bytes |
| manifest | `ty-plus-v0.10.3-windows-release-manifest.json` / sha256 `1eaf3130ddc7a0ac2d427860d7df1791b5a9c91f68297dde13bbf35f61dfc6ac` |
| worker | `windows/operation-worker.exe`（PE32+ x86-64、8,088,576 bytes、sha256 `a00c467781b4827f1597ad455bb216f2c6381f73a13e94618fffc9e924c851b2`、Authenticode未署名 = R0の正当な形） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

実測で確認した内容:

- ZIPは `LICENSE` / `THIRD-PARTY-NOTICES.md` / `jsx/ty-plus-host.jsx` / `CSXS/manifest.xml`（`ExtensionBundleVersion="0.10.3"`）+ `windows/` workerのみを含む。macOS workerは含まない（`pruneUndeclaredWorkers` で宣言外のworker版を除去）
- `verify-online-gateway-package.ts` 全項目PASS（`trust-mode-manifest`: unsigned worker — R0 Windows shape）
- 監査（`verify-release-artifacts.ts`）全項目PASS: `0.10.3 (stable), sourceCommit=8d323002…, 2 artifact(s) hash-verified, secret scan clean`

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
| sourceCommit | `8d32300245b8bddac58b180bcb691ded6e9da050` |
| trustMode | `release` |
| ZIP | `ty-plus-v0.10.3-macos.zip` / sha256 `b1937949d255da886c9aabe8713a25ff864f1eb8e90f1fbeb90b32cd6551013d` / 14,331,885 bytes |
| ZXP | `ty-plus-v0.10.3-macos.zxp` / sha256 `599318b3722106c3ff1b807ef91a825000d19702e43a2dfa6a7900e8c39f1b96` / 14,349,399 bytes |
| manifest | `ty-plus-v0.10.3-macos-release-manifest.json` / sha256 `e1dbed0b008730aeae5bd3aeb804d55b282c2cd060497a98f9b24839b56b1b63` |
| worker | `macos/operation-worker`（Mach-O universal x86_64+arm64、13,407,040 bytes、sha256 `beb53c3f5a9fd2950b13c4c4cf06950250085bfa050b9390e6ed4a3ea7e6a2b2`、`flags=0x10000(runtime)`、Developer ID署名） |
| ZXP署名 | `ZXPSignCmd -verify` → `Signature verified successfully` |

実測で確認した内容:

- `codesign --verify --strict` 成功。`Authority=Developer ID Application: Yusuke Kimura (JK49RJ2CK2)`、TeamIdentifier `JK49RJ2CK2`、hardened runtime 有効
- `spctl --assess` は未公証を返す想定（ADR-0003 Amendment 1 によりR0要件外。v0.10.2と同じ状態）
- ZIPは `ExtensionBundleVersion="0.10.3"`、当該platformのworkerのみを含む
- 監査（`verify-release-artifacts.ts`）全項目PASS、secret scan clean

> **tag target**: 両platformの成果物の `sourceCommit` は `8d32300245b8bddac58b180bcb691ded6e9da050`。GitHub Release作成時は `--target 8d32300245b8bddac58b180bcb691ded6e9da050` を指定し、**tagと成果物の `sourceCommit` を一致させる**。本記録docの後続commitはdocsのみで、成果物のバイトに影響しない。
> 成果物の保管先: `dist/github-release/`（repo内・gitignore対象）と `~/work/ty-plus-rc-0.10.3/`（ローカルバックアップ）。

## 4. CI（RC freeze SHA `8d323002`）

### workflow_dispatch full gate — run `43991018411`（**全job success**、skipなし）

| job | 結果 |
| --- | --- |
| skills / static / unit / coverage | success |
| storybook (1)–(4) | success |
| storybook-capture-report | success |
| operation-worker-macos / operation-worker-windows | success（実行・success。skipではない） |
| release gate | success |

### push fast gate — run `43991002475`（`8d323002`、success）

### Storybook capture report（run `43991018411` の artifact）

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

回帰テスト追加: `persist-folder-group.test.ts`（folder-scan presetのoffline永続化）、`hook-browser-events.test.ts`（menu→browser-* event契約）、`image-src-for-browser` / entry-icon のURL変換テスト、offline residual契約テスト、update.installのRust test 10件追加。

## 6. 主要ジャーニーの受入証拠（#108 matrix 現状）

`docs/verification/e2e-acceptance/use-case-matrix.md` が正本。v0.10.2時点からのmac自動PASS項目（起動・復元・パネル開閉・host self-heal・preset配置(dialog経路)・widget追加・layout snapshot保存復元・`.jsx`/`.ffx` preset実行・preset asset検証・言語/外観・widget state永続化・quick-actions・debug console・破損データ耐性）は引き続き有効。**v0.10.3差分（offline-core・update.install・UI）のAE実機再検証は未実施** — RC受入で実施予定。

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

1. **AE実機での v0.10.3 差分検証が未実施** — offline-core（gateway未起動でのpreset D&D/グループ/panel）、update.install 実機E2E、#71 settings起動確認は RC 受入の本人作業
2. **release-trust成果物の実機導入スモーク未実施** — v0.10.1/v0.10.2同様、署名済みZIP/ZXPの実AE導入確認は残る
3. **UC-C12/C14 BLOCKED** — footage preset実行と失敗通知の実機観測が未完了（v0.10.2から継続）
4. **Windows実機でのv0.10.3確認なし** — Windows成果物はクロスコンパイル+静的検証のみ
5. **公開後の更新feed実証** — 公開後に実施
6. **Smart App Control 有効環境ではWindows版が起動しない**（未署名worker、ADR-0003で許容済み・周知事項）
7. **#166 残件** — widget/workspace の interaction-state coverage は部分的。GridTile の PanelContext/renderDescriptor seam 未整備。pixel diff/reg-suit 未導入（report-only方針の判断記録は今後）
8. **#71** — settings起動時 `Uncaught [object Event]` は unload-guard 修正後に再現せずとの記録があるが、v0.10.3での実機確認は未実施のためIssueはopenのまま

## 10. 公開までに必要な本人操作

1. **明示承認**: `release-0-10-3 → main` の release PR merge、tag `v0.10.3` 作成、GitHub Release `v0.10.3`（`prerelease=false`、`--target 8d32300245b8bddac58b180bcb691ded6e9da050`）の公開を承認する
2. **RC受入（実機）**: AE上で v0.10.3 candidate の起動・offline-core動作・settings・update UI を確認（#71 再確認を含む）
3. **公開後確認**: 実feedでの更新検出、必要ならrelease-trust成果物の実機スモーク、UC-C12/C14の再実行
4. **任意**: macOS公証の有効化（`xcrun notarytool store-credentials ty-plus-notary`）
