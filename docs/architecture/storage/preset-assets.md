# Preset Assets

この文書は、preset のメタデータと asset ファイルの保存先、および
それらを扱う実装を定義する。

## 正規の定義元

preset の保存実装はすべて `src/management/preset/` と
`src/management/storage/` 配下にある。preset type ごとの操作は `src/function/preset/` 配下にある。
AE DOM に依存する authoring content の生成と save-root 検証は
`src/management/ae/jsx/host-bundle.ext.ts` が担い、OS file write / elevation は
`src/management/storage/write/` が担う。

## 保存対象

preset では「AE が直接実行する authored asset」と「workspace archive / import-export
で持ち運ぶ managed asset」を区別する。

- preset catalog とレコードは `presets/presets.json` に置く。
- preset の icon は preset / group レコード内のデータとして保存する。
- **authored executable asset** は、既定では現在の AE session の Support Files 配下へ保存する。
- **managed / archive asset** は workspace assets tree 配下に置く
  （[workspace-tree.md](workspace-tree.md) を参照）。
- metadata に保存する `filePath` は、authoring write と read-back verification が成功した
  実在 path のみを指す。

## Authoring asset の既定パス

running After Effects から解決した Support Files root を authority とし、
version 名や install path をハードコードしない。

| Asset の種類 | 既定の authoring path |
| --- | --- |
| Easing script preset | `<AE Support Files>/Scripts/ty-plus/easing/` |
| Code script preset | `<AE Support Files>/Scripts/ty-plus/code-presets/` |
| Layer preset script | `<AE Support Files>/Scripts/ty-plus/layer-presets/` |
| Comp preset script | `<AE Support Files>/Scripts/ty-plus/comp-presets/` |
| Animation preset | `<AE Support Files>/Presets/ty-plus/presets/` |

authoring target は read / execute と同一の3 root（AE Support Files / AE user data /
extension root）のいずれかでなければならない。authoring UI でユーザーが別フォルダを
選んだ場合でも、この外側にある path は保存できない。execute は
`assertAllowedFilePath` で同じ root model を適用するため、外側への保存は
「書けたのに実行できない preset」を作るだけである。

path authorization と privilege escalation は別の判定であり、root class や
「userData 配下かどうか」を elevation の条件にしない。

text-based asset の commit 順序は次で固定する。

```text
target/root authorization
→ AE-dependent content preparation
→ normal file write
→ permission denied の場合のみ privileged write
→ existence + content read-back verification
→ preset metadata/catalog persist
→ workspace placement
```

write / elevation / verification のいずれかが失敗した場合、metadata や workspace record を
作成しない。UAC の拒否・利用不可は成功として扱わず、authoring failure として上位へ返す。

`.ffx` は After Effects の native Save Animation Preset dialog が実ファイル書き込みを所有する。
ty-plus は dialog を開く前の save-root authorization と、保存後に検出した実ファイルの
verification / metadata commit を所有する。

## Managed / archive asset の分類

workspace 内で持ち運ぶ asset は managed tree 配下の `assets/workspace/` を正規とする。

| Asset の種類 | managed / archive 保存先 |
| --- | --- |
| Animation preset | `assets/workspace/presets/` |
| Script preset | `assets/workspace/scripts/` |
| Footage / import asset | `assets/workspace/footage/` |
| 補助メタデータ | `assets/workspace/meta/` |

authoring path と managed / archive path は同一責務ではない。AE から直接実行する asset を
作るために managed tree を AE Scripts / Presets directory の代替として扱わず、逆に archive
payload の構成を Support Files の絶対 path に依存させない。

## アーカイブと Export/Import

- workspace アーカイブ内の asset ファイルは `assets/workspace/...` 配下に保存する。
- データレコードはアーカイブ内で `data/...` 配下に分離して保持する。
- `footage/` は大きいファイルの重複を避けるため workspace アーカイブから除外する。
- 旧アーカイブの `workspace/...` prefix は、import 時に `assets/workspace/...` として扱う。

## Preset のメタデータ

preset のメタデータ型は `src/management/preset/contract.ts` で定義する。
manifest の serialization / deserialization は `src/management/storage/` を通して扱う。
`Date` は生の JSON として保存しない。serialization は
`src/management/storage/` の read/write 実装に従う。

## 区別すべき点

- preset contract は `src/management/preset/contract.ts` にある。
- preset の実行と作成 UI は `src/function/preset/` にある。
- authoring の protected write / elevation は `src/management/storage/write/` に集約する。
- クラウドのダウンロード / アップロードは `src/management/online/` を通して扱う。
