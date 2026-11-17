# System Quality 再構成計画（v0.11.0）

Status: Draft
Date: 2026-11-17
正本: Issue #189、`docs/architecture/project.md`、`docs/architecture/offline-core.md`、`docs/architecture/storage-policy.md`

## 目的

project-init v0.10.0 の `system-quality` Skill に基づき、ty-plus の変更後全体を再構成する。局所修正の積み増しではなく、製品要求から状態・責務・境界・UI操作モデルを組み直し、旧構造の撤去まで完了させることを目的とする。

本書は要求の保存、現状観測、アンチケースの適用、代替構成との比較、採用構成、作業分解、検証方針を記録する。実装の正本は各IssueとSpec/ADRに置き、本書はそれらを束ねる計画である。

## 1. 要求の保存

| ID | 成立条件 | 根拠 |
| --- | --- | --- |
| O1 | 誰でも無料で導入・利用できる public OSS である | `docs/architecture/project.md` |
| O2 | ライセンス状態・アカウント・ネットワーク接続なしでコア機能が動作する | `docs/architecture/offline-core.md` |
| O3 | 既存ユーザーデータの保存・復元を保護し、データ消失を公開ブロッカーとして扱う | `docs/architecture/storage-policy.md`、`docs/migration/porting-ledger.md`、`docs/verification/r0-device-gate.md` |
| O4 | 未提供のオンライン機能を提供済みと誤認させるUI・経路を残さない。オンラインsurfaceはdormant契約に従う | `docs/architecture/offline-core.md`、Issue #170 |
| O5 | preset / group / widget / workspace の既存操作経路を維持する | `docs/user-guide/` |
| O6 | `src/{shared,management,function}` の三層境界と widget manifest 経由の依存方向を維持する | `docs/architecture/index.md`、`docs/architecture/widget-boundary.md` |
| O7 | 品質を継続的に成立させる検査基盤を持つ。ticket PRは高速gate、包括検証はRC freezeへ集約する | `docs/architecture/quality/verification.md`、quality-gate §8.3 |
| O8 | Storybook captureの成功を視覚合格とみなさず、実描画・操作状態・レイアウト品質を検査する | 今回の要求 |
| O9 | 全機能の操作経路と品質上の責務を棚卸しし、Spec・ADR・Issueへ正本化する | 今回の要求 |

O1〜O7は既存正本の要求であり、本再構成で維持する。O8・O9は今回追加された要求である。既存構造・既存Issueの完了状態・実装上の都合は、上記のいずれの根拠にもならない。

## 2. 現状観測

### 2.1 対象範囲

- `src/management/`: ホスト統合・アプリシェル・永続化（panel / workspace / preset / storage / dialog / online / setting / widget / ipc / i18n / catalog / ae）
- `src/function/`: widget実装とpreset操作Dialog（widget / preset / onboarding）
- `src/shared/`: ドメイン非依存のcomponent・util・scenario
- `rust/`: runtime / operation-worker / crates（protocol, storage, host-filesystem, online）
- 検証基盤: `.github/workflows/ci.yml`、`scripts/check/`、`scripts/verify/storybook-*`、`docs/verification/`

### 2.2 既知の反例

#### A. グループプリセットのJSX非対応

フォルダスキャン経路は `.ffx` のみを収集し、`.jsx` / `.jsxbin` のscript presetをグループメンバーにできない。手動presetIds経路は全typeを許容するため経路間で非対称である。

- `src/management/preset/persist-folder-group.ts`: `importOnboardingPresets` へ `selectedFolders` の `presets` 枠だけを渡し `scripts` / `plugins` を空にする。エラーメッセージも `.ffx` 限定を明示する
- `src/management/preset/onboarding-import.ts`: `ONBOARDING_FOLDER_EXTENSIONS` 自体は scripts 対応済みで、走査能力はある。グループ作成側が presets 枠しか渡さないため能力が届かない
- `src/management/preset/group-catalog.ts`: `GroupEntry.presetIds` はtype非依存なので、スキーマはscriptメンバーを保持できる。書き込み経路だけが欠けている
- `src/management/preset/group/Dialog.tsx`: UIからscript presetをメンバーに追加する導線がない

#### B. アイコン自動検出の経路不一致

サイドカー画像（`Foo.png` ↔ `Foo.ffx`）によるアイコン自動検出が複数経路に分かれ、判定条件・永続化フィールド・描画pipelineが一致していない。

- `src/management/preset/sibling-thumbnail.ts` の `findSiblingImagePathForPresetFile` はpreset側の拡張子を見ない。一方 `src/function/widget/utility/directory-browser/Component.tsx` の `buildSidekickByParent` は `.ffx/.jsx/...` の拡張子フィルタを持ち、ペア判定が食い違う
- 取込時（`onboarding-service.ts`）は検出結果を `preset.icon` へ永続化する。ワークスペースglyph（`preset/workspace/glyph.tsx`）は同じ検出を `descriptionImage` へ注入する。永続化フィールドが経路ごとに異なる
- `src/management/preset/assets/icons.ts` の `resolvePresetIconVisual` は `descriptionImage > icon`、`resolveWorkspaceGlyphIconVisual` は `icon > descriptionImage` と優先度が逆である。コメントは「same priority」と主張するが実装が一致しない
- 旧 `DirectoryBrowser` には `SiblingThumbnail.tsx`（story以外から未参照のデッドコード）と `EntryIcon` の生パス描画（WebP pipeline bypass）が残り、thumbnail pipelineを通る現行経路と併存する
- `typeFallbackText` が `icon-data.ts` と `assets/icons.ts` に重複する

#### C. アイコンエディタとプリセットリストの表示崩壊

- `src/management/preset/components/IconEditor.tsx`: previewグリッドが右カラム内容依存でtileサイズが変動し得る。emoji pickerのpopoverがdialogの `overflow-hidden` でクリップまたは後続要素へ重なり得る（`docs/analysis/issue-91.md`）
- `src/management/preset/edit/Dialog.tsx` はcontentに `overflow-hidden` を指定しており、popoverのはみ出しを構造的に禁じている
- `IconEditor.stories.tsx` のdecoratorは `w-[28rem]` 固定で、幅依存の崩れを再現しない。レイアウトをpinする自動テストがない
- `src/management/preset/catalog-browser/layout.ts` はPanda-only bundleでCSSを生成しないraw Tailwind問題（#127/#143）の名残を持つ。プリセットリスト側の同種崩壊経路として監査対象
- `src/management/preset/group/` の `GroupMembersSection.tsx` 等はstory以外から未参照で、`group/Dialog.tsx` が同等JSXをインライン重複実装している

#### D. 未提供オンライン機能の残存

`docs/architecture/offline-core.md` はオンラインsurfaceをdormantと定めるが、未提供機能のコード・経路・文言が広範に残る。

- `src/management/online/catalog/`: `PresetLibrary`（約1300行の市場UI）を含むcatalog一式、`createFixtureCloudGateway` を製品コードへ同梱、`isFixture` badge契約
- `src/management/dialog/routes.tsx`: `PresetLibrary` をdialog routeとして依然mount（menuからは外済み）
- `src/management/workspace/services.ts`: fixture gatewayとcloud sync serviceを常時生成
- `src/management/online/public-link/`、`runtime-gateway.ts` の `online.*` wire method、`runtime-gateway-health.ts`
- `rust/crates/online/` と `rust/apps/*/src/online_dispatch.rs`、`product_online_config.rs`
- 9言語分の `galleryPresetLibrarySection` i18n keyなど、未提供機能向け文言の残存
- 一方で `update/feed.ts`（GitHub Releases更新確認、ADR-0004）と `notification/feed.ts`（静的JSON feed）は意図的に提供される面であり、撤去対象ではない

#### E. 検証基盤の品質判定

- Storybook captureは全storyのPNG + sidecar metadataを生成し、非ok bucketを失敗にするが、pixel差分・レイアウト契約・操作状態の検査はない。capture成功は描画品質の合格を意味しない
- `storybook-capture-report` jobは意図的にrelease gateのneedsに含めず、pixel-diff導入後にgating化を再判断する旨がci.ymlに明記されている
- `docs/verification/e2e-acceptance/use-case-matrix.md` は体系的E2E（Issue #108）の正本だが、多数のuse caseが `未実施` のままである

### 2.3 文書・正本の陳腐化

- `docs/architecture/index.md` が存在しない `architecture/AGENTS.md`、`repository/materials.md`、`ui-reconstruction/README.md` を参照する
- `docs/architecture/observation/` の一部mapは `src/cep-shell/`、`src/js/`、`supabase/functions/` 等の旧構造を参照しており、移行前snapshotの可能性がある
- READMEはv0.10.1基準の記述で、v0.10.3のrelease記録とずれがある
- `docs/architecture/ui-reconstruction/` は英語で書かれ、他のarchitecture文書（日本語）と体裁が混在する

## 3. アンチケースの適用

`system-quality` のアンチケースを対象へ適用した結果を示す。適用しない項目は理由を添える。

| ID | 適用 | 対象と根拠 |
| --- | --- | --- |
| R1 | 適用 | 要求O5の操作経路維持を、比較対象すべてへ共通適用する。group presetのscript対応も「presetをtype非依存で扱う」既存契約（`GroupEntry.presetIds`）を根拠とする |
| R2 | 適用 | 「内部APIが既存」を維持理由にしない。`persist-folder-group.ts` のpresets枠限定、`SiblingThumbnail.tsx` の残存、`PresetLibrary` のdialog route残存はいずれも内部構造の都合であり、外部互換性の根拠ではない |
| S1 | 適用 | Bのsibling画像は表示時に導出可能な値であり、取込時に `preset.icon` へ永続化する経路は導出値の保存にあたる。永続化が必要なのはユーザーがeditorで設定したカスタムiconだけである |
| S2 | 適用 | 「フォルダからpreset候補を収集する」「preset→表示iconを解決する」「同一業務規則」の複数所有がB・Aの直接原因。所有者を定めて利用側を移行する |
| S3 | 適用 | 未提供オンライン機能のfixture fallback・`unsupported online method` reject・silentなmenu非表示は、失敗意味を境界で保持していない。撤去後は「機能が存在しない」ことを構造で示す |
| S4 | 適用 | IconEditorのpopoverはdialogの `overflow-hidden` と競合する状態を構成可能にしている。有効な状態を型・DOM構造で表現する |
| S5 | 適用 | `management → function/widget` のmanifest境界は維持する（O6）。ただし `function/widget/* → management/preset/workspace/glyph` の逆方向依存は確立済み前例であり、icon解決の再配置時に依存方向を再確認する |
| S6 | 適用 | icon解決・folder収集・online dormant面の新旧併存は、本計画の完了条件に旧経路撤去を含める |
| V1 | 適用 | 既存テストの期待値を実装に合わせて弱めない。#170のoffline-core pin testは契約として維持し、撤去後も「未提供機能が到達不能」であることを検査する形へ移行する |
| V2 | 適用 | 新設するscript・Skill・設定を検査対象から落とさない。品質検査の追加時は対象範囲を明示する |
| V3 | 適用 | timeout・crash・未実行を拒否成功として数えない。challenge.mtsのプロセス異常を違反検出と混同しない |
| V4 | 適用 | `system-quality` のcontract.mdは抽象契約であり、実コードへの証明移転は意味論対応の確立を別途要求する |
| V5 | 適用 | 本計画は「違反不在」で完了としない。採用構成が現行修正案に対して要求上優位であることの証拠を各Issueで示す |
| P1 | 適用 | §2.3のstale参照を修正し、Skill正本（project-init）と配布先（`.agents/skills/`）の一致は `check:skills` で維持する |
| P2 | 適用 | 検査ルールの変更は実装変更と同じPRで行わず、契約変更として独立に評価する |

## 4. 代替構成の比較

### 4.1 比較の対象

反例A〜Dそれぞれについて、(a) 現行構造への局所修正案と、(b) 要求から状態・責務・境界を再構成する案を比較する。

### 4.2 案の比較

#### A. グループプリセットのscript対応

- **現行修正案**: `persist-folder-group.ts` の `selectedFolders.scripts` へ走査結果を渡し、group Dialogへscript選択UIを追加する。folder走査規則は `onboarding-import.ts` と `persist-folder-group.ts` に残る二重実装を維持する
- **再構成案**: 「フォルダ→preset候補」の収集を単一の所有者へ集約し、onboarding・group永続化・将来の消費者が同じ契約を使う。group永続化は収集結果をtype非依存で消費する。Dialogは収集済み候補からtypeを問わず選択できる
- **比較**: 現行修正案は二重実装（S2）と経路間非対称を残し、次の消費者追加時に同じ不整合を再生する。再構成案は収集規則の変更点が一箇所になり、script対応はその契約の自然な帰結となる。移行コストは `persist-folder-group.ts` と `onboarding-import.ts` の内部整理に限定され、`GroupEntry` スキーマとユーザーデータ形式は変わらない。**再構成案を採用する**

#### B. アイコン自動検出

- **現行修正案**: `glyph.tsx` の `descriptionImage` 注入を `icon` 優先度へ合わせ、`resolvePresetIconVisual` / `resolveWorkspaceGlyphIconVisual` の優先度を統一し、`EntryIcon` の生パス描画をthumbnail pipelineへ置き換える
- **再構成案**: preset→表示iconの解決を単一ownerへ集約し、「永続化icon（ユーザー設定）」と「導出icon（sibling画像・type fallback）」を別層として定義する。sibling検出は表示時導出へ統一し、取込時の `preset.icon` 書き込みを廃止する。ペア判定（拡張子フィルタの有無）を単一の定義へ揃え、旧 `SiblingThumbnail.tsx`・重複 `typeFallbackText`・生パス描画経路を撤去する
- **比較**: 現行修正案は5経路の不一致を個別に潰すだけで、優先度規則・ペア判定・描画pipelineの所有者が分散したまま残る。再構成案は「どのiconが表示されるか」の規則を一箇所で読める状態にし、S1（導出値の保存）とS6（新旧併存）を同時に解消する。永続化iconを持つユーザーデータとの互換は「永続化icon > 導出icon」の優先度で保存でき、データ移行は不要である。**再構成案を採用する**

#### C. アイコンエディタとプリセットリストの表示崩壊

- **現行修正案**: `IconEditor.tsx` のgrid classとpopover位置を個別に修正し、`ListDialog` / `catalog-browser` のlayoutを目視確認する
- **再構成案**: IconEditorとpreset listのレイアウト契約（grid構造・overflow方針・popoverのportal化または配置保証）を明示し、それをpinするstoryとlayout assertionを追加する。popoverはdialogの `overflow-hidden` と競合しない配置（portalまたはdialog外配置）へ移す。`group/` の未使用section重複を撤去し `Dialog.tsx` を単一実装へ揃える
- **比較**: 現行修正案は崩れの再発を検査で防げない。再構成案は「描画・操作状態・レイアウト品質」を検査対象へ含めるO8を満たし、同種崩壊（#127/#143経路）の再発を構造的に拒否できる。**再構成案を採用する**

#### D. 未提供オンライン機能の残存

- **現行修正案**: menu非表示・route残存のまま、`offline-core-residual.test.ts` で到達不能をpinし続ける
- **再構成案**: `offline-core.md` のdormant契約を「提供面（update feed・notification feed）」と「未提供面（catalog・sync・public-link・search-cache・download）」へ分離し、未提供面をコードから撤去する。`PresetLibrary` dialog route・fixture gateway・cloud sync service・`isFixture` badge・未提供向けi18n keyを削除し、Rust側の `online` crate と `online.*` wire methodを撤去またはcontractから除去する。`offline-core-residual.test.ts` は「未提供機能が存在しない」ことを検査する契約テストへ置き換える
- **比較**: 現行修正案はdormantコードを恒久的な技術的負債として残し、O4の「未提供機能を提供済みと誤認させない」を到達不能性の維持だけで満たそうとする。再構成案は未提供機能の存在自体をなくし、誤認の余地を構造的に除く。提供面（update・notification）は契約上必要であり残す。撤去はbreaking changeを含むため、`offline-core.md` とfeeds契約の更新を同じ変更で行い、ユーザーデータ（local preset/group/workspace）には影響しない。**再構成案を採用する。ただし撤去範囲の確定はSpec/ADRで行い、wire contractの外部利用者がいないことを確認してから実施する**

#### E. 検証基盤

- **現行修正案**: 既存のcapture pipelineを維持し、storyを追加する
- **再構成案**: 「capture成功≠視覚合格」を前提に、(1) 操作状態をassertするplay function/interactions、(2) レイアウト契約のassertion（寸法・overflow・重なりの不変条件）、(3) 必要に応じたpixel差分の導入評価、を段階的に追加する。既存#166のinteraction-state拡充と統合し、release gateへのgating化は品質が証明されてから再判断する
- **比較**: 現行修正案は描画品質を検査しない。再構成案はO8を満たす。pixel差分はCEFのrendering安定性とコストを考慮し、まず構造・操作状態の検査層を優先する。**再構成案を採用する**

## 5. 採用構成

### 5.1 preset収集・icon解決の単一owner

- 「フォルダ→preset候補」の収集規則を `src/management/preset/` 配下の単一モジュールへ集約する。type判定（`.ffx`/`.jsx`/`.jsxbin`/`.js`/`.aex`等）は既存の `inferPresetTypeFromFilePath` を正本として共有する
- 「preset→表示icon」の解決を単一モジュールへ集約する。優先度は「永続化icon（ユーザー設定）> sibling画像（導出）> type fallback」とし、全消費者が同じ結果を使う
- `descriptionImage` へのsibling注入、`preset.icon` への取込時書き込み、5経路の個別判定を廃止する
- 旧 `SiblingThumbnail.tsx`、重複 `typeFallbackText`、`EntryIcon` の生パス描画、`buildSidekickByParent` の独自実装を撤去する

### 5.2 グループプリセットのtype非依存化

- group永続化は単一収集ownerの結果をtype非依存で消費する
- `GroupDialog` はscript presetを含む全typeの候補からメンバーを選択できるUIを持つ
- 手動presetIds経路とfolder経路の非対称を解消する

### 5.3 online未提供面の撤去

- 提供面: `update/feed.ts`（GitHub Releases）、`notification/feed.ts`（静的JSON）は維持する
- 未提供面: `online/catalog/`、`online/public-link/`、`online/runtime-gateway.ts` の未提供method、`online/search-cache`、`online/download`、Rust `online` crate、`online.*` wire method、`PresetLibrary` route、fixture gateway、cloud sync service、`isFixture` badge、未提供向けi18n keyを撤去する
- `offline-core.md` を「提供面/未提供面」の契約へ更新し、`offline-core-residual.test.ts` を「未提供機能が存在しない」契約テストへ置き換える
- 撤去は外部wire contractを含むため、利用者不在の確認と段階的移行をSpec/ADRで定める

### 5.4 UI品質の検査層

- IconEditorとpreset listのレイアウト契約をstoryでpinする。popoverはdialog `overflow-hidden` と競合しない配置へ移す
- 操作状態（hover/focus/selected/drag）をassertするplay functionを追加し、#166の残件と統合する
- pixel差分の導入は別途評価し、まず構造・操作状態の検査を優先する

### 5.5 文書正本の整合

- `docs/architecture/index.md` のstale参照を修正する
- `docs/architecture/observation/` の旧構造参照を現行へ更新するか、snapshotであることを明示する
- READMEのversion記述を現行へ揃える
- `ui-reconstruction/` の言語・体裁を他architecture文書と揃えるか、独立した旧計画として位置づけを明確にする

## 6. 作業分解

実装は独立したIssueへ分解し、依存関係に従って並行実行する。各Issueはtarget release `release-0-11-0` をbaseとし、ticket-class PRとしてlandingする。

| Issue | 内容 | 依存 | 優先度 |
| --- | --- | --- | --- |
| #190 | preset folder収集の単一owner化 + group presetのscript対応 | なし | 高 |
| #191 | preset icon解決の単一owner化 + sibling経路統合 + 旧経路撤去 | #190（stacked推奨） | 高 |
| #192 | IconEditor/preset listのlayout契約 + story固定 + 未使用section重複撤去 | なし | 中 |
| #193 | online未提供面の撤去（Spec/ADR → TS撤去 → Rust/wire撤去） | なし（ただし大規模） | 高 |
| #194 | UI品質検査層（操作状態assertion + layout assertion）の導入 | #166の残件と統合 | 中 |
| #195 | docs正本のstale参照修正 + Issue完了判定の再評価記録 | なし | 低 |

#190と#191は同じ `preset/` 領域を触るためstacked PRを推奨する。#192は独立。#193は最も大きく、Spec/ADRで撤去範囲を確定してから実装する。#194は既存#166の延長として扱う。#195は小さいがP1アンチケースに該当する。

## 7. 検証方針

- 各Issueのticket PRは `bun run ci:pr` 相当の高速gateを実行する
- RC freeze後に `workflow_dispatch` で全partitionを実行する
- `system-quality` の `scripts/challenge.mts` を使い、既知の違反を隔離コピーへ注入して実検査の拒否/受理を確認する。プロセス異常を違反検出として数えない
- `policy-evaluation` でSkill変更の拒否能力と改善能力を別々に評価する
- Storybookはcapture成功を視覚合格とみなさず、play function・layout assertion・必要に応じたpixel差分で実描画・操作状態・レイアウト品質を検査する
- 実機AE確認は各Issueの完了条件にせず、RC freeze後の包括検証へ集約する

## 8. 未確立条件とuser判断が必要な点

- **online撤去のwire contract影響**: `online.*` wire methodとRust `online` crateの撤去は、panelとworker間のprotocol変更を含む。外部利用者がいないことを確認し、protocol versioningの扱いをSpec/ADRで確定する必要がある
- **icon解決の優先度**: 「永続化icon > sibling画像 > type fallback」は既存挙動の大半を保存するが、`resolvePresetIconVisual` と `resolveWorkspaceGlyphIconVisual` のどちらを正本とするかは実装時に検証する
- **pixel差分の導入**: CEFのrendering安定性・コスト・保守性を評価してから導入を決める。現時点では構造・操作状態の検査を優先する
- **既存ユーザーデータ**: icon解決・group永続化・online撤去はいずれもlocalデータ形式を変更しない想定だが、preset/group/workspaceの保存データとの互換を各Issueで検証する

## 9. 完了の判定

- 要求O1〜O9の成立証拠が対応している
- 反例A〜Eの修正箇所と再導入拒否範囲が明確である
- 採用構成への移行と旧構造の撤去が完了している
- 未処理の反例・実証された劣位・必須の未検証条件が残っていない
- 違反不在・候補内最良・全体最適を区別して報告する
