# Loop Widget

**状態:** Active

## 目的

Loop ウィジェットは「ループ設定の数値入力 UI」ではなく、**周期アニメーションを
視覚的に造形・編集するウィジェット**である。波形そのものを主操作対象とし、
グラフ表示は実際の AE 適用結果と一致する。

参照: [Alight Motion の Cyclic Easing](https://www.alightmotion.com/) に相当する
操作体系（Easing / Bias / Frequency / Damping）。

## 責務の境界

| 領域 | 所有者 |
| --- | --- |
| 描画・ハンドル操作・座標変換 | `function/widget/curve-editor`（Easing と共有） |
| 周期モデル（period / amplitude / damping / bias / mode） | `function/widget/curve-editor/cyclic-wave.ts` |
| 周期波の AE 適用（複製） | `management/ae/jsx/host-bundle.ext.ts` の `applyLoopEasing` |

Easing と Loop は **同じ curve editor を共有するが、生成モデルが異なる**。
Easing は「区間を 1 回、区間内の値を補間する」、Loop は「1 サイクルの形状を
周期的に繰り返す」。両者を同じ Mode 列に並べない。

## 周期モデル

1 サイクルの形状を **テンプレート**（正規化 x∈[0,1], y∈[0,1] の多点 curve）として
保持し、パラメータで複製する。

| パラメータ | 意味 | 範囲 |
| --- | --- | --- |
| `cycles` | 区間あたりのサイクル数 | 2..16 |
| `amplitude` | 基準線からの振幅倍率 | 0..2 |
| `damping` | サイクルごとの振幅減衰（1 = 減衰なし） | 0..1 |
| `bias` | attack leg が 1 サイクルに占める割合（0.5 = 対称） | 0..1 |
| `mode` | `pingpong`（既定）/ `cycle` | - |

### 複製規則（正本）

テンプレートは **1 サイクルの attack leg**（区間始点から終点へ至る 1 本の脚）であり、
各サイクルは attack leg と（pingpong の場合）鏡像の return leg から成る。

```
chord(φ)      = テンプレート両端を結ぶ直線
dev(φ)        = (template(φ) - chord(φ)) * amplitude * damping^i
attack leg    = x: start + φ * span ,  y: chord(φ) + dev(φ)
return leg    = x: start + φ * span ,  y: chord(φ) - dev(φ)   (テンプレートを逆順に走査)
```

- `mode = "pingpong"`（既定）: 交互に attack / return を並べ、周期境界で v1 へ戻る。
- `mode = "cycle"`: attack leg のみで 1 サイクルを構成し、同一形状の一方通行を繰り返す。
- `bias`: attack leg が 1 サイクルに占める割合（0.5 = 対称）。Alight Motion の
  Bias（attack と decay の配分）に相当する。
- `damping`: サイクルごとの dev の減衰。Alight Motion の Damping（終値への収束）に相当する。
- 最終サイクルの attack leg は x=1 まで切り詰められ、区間の終値（v2）で終わる。

### ハンドルのスケール（重要）

脚の長さで時間軸をスケールするとき、ハンドル **x と y の両方**を同じ係数で
スケールする。x だけをスケールすると傾き比 `y / x` が変わり**形状が歪む**。
（既存ホスト実装は x だけをスケールしており，这是が修正対象。）

## グラフと AE の一致

- グラフが描画する波形は `cyclic-wave.ts` の純関数が生成する複製済み点列である。
- AE 側はホストの `applyLoopEasing` が **同じ規則**で複製する。
- したがって「グラフ抽象 ↔ AE 実値」の一致は、複製規則を 1 箇所（正本）に
  固定し、React 側とホスト側が同じ式を使うことで担保する。

## AE 連携

| 操作 | 経路 |
| --- | --- |
| 適用 | `applyLoopEasing`（payload: `points` テンプレート + `loopCount` + 周期パラメータ） |
| 選択状態の取得 | `getEasingSelectionCount` / `captureKeyframeValues`（値のみ） |
| 適用済み設定の再取得 | 未実装（次段）。現状はウィジェット内の編集状態を保持する |
| 解除 | 未実装（次段）。適用後に生成キーフレームを戻す操作は既存 API に無い |

- 適用は `app.beginUndoGroup("Ty Plus: Apply Easing")` 単位（既存 applyEasing と同一）。
- 対象プロパティは `numKeys >= 2` の選択プロパティ。**エクスプレッション有効プロパティは
  現状のホストに保護がない**（`prop.expression` を読まない）。破壊を避けるには
  ホスト側のガードが必要で、次段の作業として明示する。

## UI 構成

```text
Loop Widget
├─ 上段: モード（cycle / pingpong / offset）とサイクル数
├─ 波形キャンバス（全サイクルを同時描画。周期境界・開始終了位置・再生位置）
├─ 下段: 適用 / コピー / 反転 / プリセット
```

- 幅が足りない場合は上段のパラメータ行を畳む（progressive disclosure）。
- 数値入力は精密調整の補助。波形.Rect ハンドルのドラッグが主操作。

## 状態と永続化

- ウィジェット状態は `widgets/state/loop.json`（インスタンス単位）。
- 保存対象: テンプレート点列、cycles、amplitude、damping、bias、mode、背景パターン。
- 旧 `easing` 状態の `mode: "loop"` は移行時に読み飛ばす（curve へ戻す）。

## 互換性と移行

- 旧 loop モード（`Mode = "loop"`）は削除済み。既存の loop 適用は
  「同一形状の単純複製」であり、本仕様の `cycle` モードの `amplitude=1`,
  `damping=1`, `bias=0` に相当する。

## 未実施（次段）

- 適用済みループの再取得・再編集・解除（ホスト API の追加が前提）
- エクスプレッション有効プロパティの保護（ホスト側ガード）
- モーションプレビュー（適用結果の再生確認）
- 実機 AE での検証（RC 検証段階）

## 関連

- `docs/architecture/widget-boundary.md` — Loop Widget 境界
- `docs/decisions/2026-11-21-loop-cyclic-wave-model.md` — 周期モデル決定
