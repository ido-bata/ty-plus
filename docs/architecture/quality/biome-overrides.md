# Biome Override Catalog（per-file rule-off justification）

## 目的

`biome.json` の `overrides` 配列に列挙されている per-file relaxed zone を、**specific / minimal / justified**（§28 aligned）であることを保つため、各 file について **なぜ off しているか / 影響範囲 / 復元時の挙動** を明示する。

これは **broad ignore ではない** (17 distinct file、21 rule-off entry) ことを source of truth として残す文書。

## 現状の overheads summary

- **17 override blocks** — 17 distinct files.
- **21 rule-off entries** の合計。
- 最多 suppressed rule: `style/noNonNullAssertion` (7 files)、`suspicious/noArrayIndexKey` (4 files)、`a11y/useSemanticElements` (3 files)、`correctness/useExhaustiveDependencies` (3 files).

## 各 override

### `**/src/shared/component/fields/ListSelect.tsx`

- **Off rule**: `a11y/useSemanticElements`
- **理由**: `<select>` を含む複数選択 UI で semantic HTML 上問題のない構造を取りながら、biome が `useSemanticElements` を過剰検出する既知 pattern。当該 file では semantic markup を維持しているため suppression。
- **復元時の影響**: `useSemanticElements` を再度有効化すると lint error が新規発生する。HTML 構造を見直した上で再評価する。

### `**/src/management/preset/catalog-add/ArchiveDetailsSection.tsx`

- **Off rule**: `a11y/noLabelWithoutControl`
- **理由**: archive metadata 表示領域でラベルは説明文で、対応する input は `<details>` の外側にある。biome の自動関連付けが認識できない UI pattern。
- **復元時の影響**: 表示を再構築した上で関連ラベルを `htmlFor` で結べば復帰可能。

### `**/*.test.ts`, `**/*.test.tsx`

- **Off rule**: `style/noNonNullAssertion`
- **理由**: テストでは **意図的に `!`** を使う場面が多い（mock fixture、setup で必ず存在することが前提の値など）。`!` を許容しないと test code が読みにくくなる。
- **復元時の影響**: テスト全体で `!` 使用箇所を `?? throw` パターンに書き換える必要があり、value/benefit が薄い。

### `**/src/management/ipc/request.test.ts`

- **Off rule**: `correctness/noConstantCondition`
- **理由**: テストで意図的な `while (true)`/`for (;;)` による polling loop を含む。
- **復元時の影響**: polling テストを撤去または別パターンで書き直す必要。

### `**/src/management/i18n/preference/storage.ts`

- **Off rule**: `style/noNonNullAssertion`
- **理由**: localStorage の `getItem` 結果が `string | null` で、ここでは `null` を default 値として処理するため型 narrow の文脈で `!` が自然に発生する。
- **復元時の影響**: `?? default` パターンを全箇所に置換すれば復帰可能（要 judgement）。

### `**/src/management/workspace/selection.ts`, `**/src/management/workspace/events.ts`

- **Off rule**: `style/noNonNullAssertion`
- **理由**: workspace の selection state で **handle to guaranteed-present node** を持つ前提で `!` を使う。narrowing が他 effect 跨ぎで動作しないため。
- **復元時の影響**: selection algorithm の再設計が要る。

### `**/src/management/preset/group/Dialog.tsx`, `**/src/management/setting/dialog/sections/ComponentPreviewSection.tsx`

- **Off rule**: `suspicious/noArrayIndexKey`
- **理由**: dynamic item list の表示で、再 order しない前提（preset 一覧、preview item）のため index を key として安全。
- **復元時の影響**: uuid 等の stable id を key にする schema 変更が要る。

### `**/src/function/widget/align/widget.tsx`

- **Off rule**: `correctness/useExhaustiveDependencies`, `suspicious/noArrayIndexKey`
- **理由**: align widget の effect は align selection と preview 内部 state を結合して動作するが、依存配列を完全列挙すると infinite loop を招く。実態は widget runtime の境界で吸収される前提。
- **復元時の影響**: effect の責務分割と runtime restructure。

### `**/src/management/preset/tool-shell/FolderDirectoryPicker.tsx`

- **Off rule**: `correctness/useExhaustiveDependencies`
- **理由**: フォルダ選択 widget の内部 effect は drag & drop イベントと storage 更新を結合するため exhaustive 化が困難。
- **復元時の影響**: drag & drop handler を controller component に分離する必要。

### `**/src/function/widget/font-viewer/font-viewer.tsx`

- **Off rule**: `style/noNonNullAssertion`
- **理由**: font-viewer は Adobe CEP font enumeration API が `string | null` を返し、`!` で narrow する箇所が頻出する。
- **復元時の影響**: API 呼び出し結果を stored 時点で non-null に限定する layer を追加。

### `**/src/shared/component/feedback/LoadingSpinner.tsx`

- **Off rule**: `a11y/useSemanticElements`, `a11y/noRedundantRoles`
- **理由**: spinner は `role="status"` で意味を担保しつつ `<div>` を使う構造。biome が semantic element を要求する箇所で `role` が重複していると判定する既知 false positive。
- **復元時の影響**: ARIA pattern の再評価が要る。

### `**/src/management/preset/editor/CodeEditor.tsx`

- **Off rule**: `style/noNonNullAssertion`
- **理由**: monaco editor API が `editor | null` を返し、editor の lifecycle 内で必ず non-null となる context で `!` を使う。
- **復元時の影響**: editor wrapper component を導入し owner を移す。

### `**/src/management/preset/markdown/render.ts`

- **Off rule**: `style/noUselessElse`
- **理由**: markdown renderer の recursive parser は `else` 節が parser state を維持する意味があり biome が誤検出。
- **復元時の影響**: parser を flat state machine に書き換える必要。

### `**/src/management/preset/markdown/LiveEditor.tsx`

- **Off rule**: `a11y/useSemanticElements`, `correctness/useExhaustiveDependencies`, `suspicious/noArrayIndexKey`
- **理由**: live markdown editor は markdown preview + tab navigation + dynamic list の三つ巴で、biome の 3 rules が既知 false positive を出す UI pattern。
- **復元時の影響**: editor architecture の再設計。

## Re-evaluation condition

- Biome の rule が version up で挙動を変え、本文書に記載した false positive が解消された場合：対応する override を削除し、CI に戻す。
- 新しい file が追加され、その file で biome warning を黙殺したい場合は：本ファイルに理由を書く前に、まず真の原因（schema、effect、UI pattern）を修正することを試みる。それが不可能な場合のみ、ここに 1 段落と restored-condition を追加する。
- 本ファイルに記載がない override を `biome.json` に追加してはならない。
