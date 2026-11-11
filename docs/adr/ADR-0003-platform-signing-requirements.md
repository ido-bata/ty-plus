# ADR-0003: Platform別のrelease-trust署名要件

- Status: Accepted
- Date: 2026-11-12
- 正本: 本doc / `docs/architecture/distribution.md`（trust model）/ #32（判断）
- 関連: ADR-0002（Agent Skillの選定）

## Context

- trust model契約（`docs/architecture/distribution.md`）はrelease trustを「production panel + OS署名されたworker + manifestの署名block」と定義し、Windows/macOSを同一要件としていた。
- WindowsのAuthenticode要件は、証明書の購入・取得（#32の本人判断）をR0公開のブロッカーにしていた — 公開までのクリティカルパス。
- **本人判断（2026-11-11）**: Windows workerのAuthenticode署名はR0では不要。証明書の購入・取得を公開ブロッカーから除外する。macOSのDeveloper ID署名・公証は現行の公開条件を維持。ZXP署名は両OSで維持し、workerのOS署名とは独立した契約として扱う。
- Windowsの公式制約: 未署名binaryはSmartScreenの評判警告（"Windows protected your PC" — クリックスルー可能）を受ける。**Smart App Control（Win11）は署名なしbinaryを完全にblockする**（新規Win11では評価モードで既定有効）。
- macOSの公式制約: 未署名・未公証binaryはGatekeeperがblockする（OS要件であり方針の選択ではない）。
- macOSの既存資産（2026-11-12確認）: Developer ID Application identityが **keychainに存在し有効（2027-11-22まで）**、署名能力を実証済み。notarytool profileのみ未設定（本人操作1コマンド）。
- SHA-256による整合性と発行元の真正性は別の保証である。公式配布元とZXP署名の信頼境界を明確にする。

## Decision

release-trustの署名要件をplatform非対称にする:

| platform | worker binary | manifest署名block | 整合性の保証 |
| --- | --- | --- | --- |
| macOS | codesign（Developer ID Application）+ notarization | **必須** | OS署名 + sha256 |
| Windows | **未署名を許容（R0）** | **任意（存在すれば検証）** | sha256のcontent-addressing + manifest束縛 |

- **整合性と真正性の分離**: manifestのsha256 pin（content-addressed path + `binary_manifest_mismatch`）は、binaryがmanifestが保証するものと一致することを保証する。Windowsでの発行元の真正性は、公式配布チャネル（GitHub Release over TLS）+ 並置されたsha256が提供する。AuthenticodeはOS検証済みの発行元identityを追加するが、それは **将来の任意拡張** でありR0要件ではない。
- **信頼境界**: ZXP署名（Adobe ZXPSignCmd）はworkerのOS署名とは別の契約 — 署名対象はworker binaryではなくZXPパッケージ（panel）。worker manifestの署名blockが記録するのはOS署名のみ。両者を混同しない（#32の判断資料と整合）。
- **development-unsignedは配布の代替ではない**: R0のWindows成果物は `trust: { mode: "release" }` + production panel（`NODE_ENV=production`）— macOSと同一のtrust modeで、署名blockのみplatform別に任意。
- **CI**: Windowsのrelease-trust jobがAuthenticodeなしで全工程を実証する（build → verify gate → package → ZXP署名・検証 → worker起動 → manifest監査）。macOSの拒否jobは維持する（macOSは引き続き拒否する）。
- **セキュリティ機能の無効化を前提にしない**: SmartScreen/SACの制約は受け入れる取引として文書化する（#10の実機ゲートに反映）。SAC有効環境では未署名Windows配布が動かない事実を隠さない。

## Consequences

- R0の公開ブロッカーが減る: macOS notarytool profile（本人操作1コマンド `xcrun notarytool store-credentials ty-plus-notary`）とZXP署名主体（本人判断）のみ。Windows証明書の購入・取得は除外。
- Windowsでのruntime security posture = sha256 pinning（整合性）。OS検証済み発行元は無い（文書化された制約）。
- 実装側の型契約: release trustの署名blockをoptionalにし、要件はplatform別のvalidationが強制する（型レベルの保証をvalidationへ移す — ADR本文に記録）。
- 将来Authenticodeを採用する場合: 署名blockの書き込み経路（`buildReleaseWorker` のsign hook + `signature-evidence.ts`）は既に実装済みで、証明書の設定のみで有効化できる（R0の実行経路・CI・リリース判定を妨げない）。
- **release manifestのplatform契約**: 配布zipが運ぶmanifestは、その配布が同梱するplatformのentryのみを持つ（per-platform buildの実出力）。runtimeのrelease pathは「存在するentryの検証」に変え、両platformの同梱を要求しない（`assertPairedArtifacts` → `assertReleaseArtifacts`）。この変更がないと、verify gateがPASSしてもruntimeが起動を拒否する（gate/runtimeの乖離 — 実機で初回起動が必ず失敗する欠陥を事前に発見）。
