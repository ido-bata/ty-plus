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


## UI 設計（横長の周期波形エディタ）

Loop は Easing の正方形グラフを流用しない。横軸＝時間、縦軸＝値の専用
エディタを `function/widget/core/loop/WaveEditor.tsx` に持つ。

```text
┌────────────────────────────────────────────────┐
│ サイクル 3                     64%        ▶    │  ← 薄い情報行
├────────────────────────────────────────────────┤
│   ╱╲__╱╲__╱╲   ← 周期境界・減衰包絡線・       │
│  ╱    ╲╱    ╲     再生ヘッド                    │
│  ◆ ◆ ◆  ← 編集対象の代表周期（テンプレート）   │
├────────────────────────────────────────────────┤
│                    適用                          │
└────────────────────────────────────────────────┘
```

- 4つの操作はグラフ上の直接操作として統合する（独立した設定フォームを置かない）
  - **Easing**: 代表周期のテンプレートのベジェハンドル
  - **Frequency**: 基線上の周期境界ハンドル（左右ドラッグでサイクル数）
  - **Bias**: attack の終端ハンドル（左右ドラッグで attack/return の配分）
  - **Damping**: 減衰包絡線上のハンドル（上下ドラッグで収束量）
- 各ハンドルには名称ラベルを常時描画し、hover/選択で強調する
- 周期が増えても潰れないよう、1サイクルあたりの最小幅を保った上で可視時間窓（パン/ズーム）を提供する
- 再生ヘッドは適用と同じ波の計算で動く（装飾プレビューを作らない）


## 参照: Alight Motion の Cyclic Easing UI（公式動画 / サポート記事）

| ハンドル | 公式の挙動 | ty-plus での対応 |
| --- | --- | --- |
| Easing | 各サイクルの曲線形状を smooth ↔ linear（三角/鋸歯）に変える | 代表周期のベジェハンドル（連続的に形状を編集） |
| Bias | 周期内のピーク位置（attack と decay の時間配分）を動かす。端まで寄せると一方向反復 | attack 終端ハンドル（左右ドラッグ） |
| Frequency | 同じ時間幅に詰まるサイクル数 | 基線上の周期境界ハンドル（左右ドラッグ） |
| Damping | 振動が終値へ収束する（ベースラインが最終値へ向かう） | 減衰包絡線上のハンドル（上下ドラッグ） |

- 軸の規約は「横軸=元の時間、縦軸=適用後の値」。ty-plus の wave editor は横長だが
  同じ規約遵循する
- AM には**個別サイクルの選択 UI が無い**（常に先頭の1サイクルが編集対象）。
  ty-plus も代表周期=先頭サイクルを編集対象とする
- AM に**別設定フォームは無い**（4パラメータはグラフのハンドルのみ）。数値入力は
  ty-plus では精密調整の補助としてのみ用意する
- AM のグラフは 1:1 の正方形。横長の AE では 1 サイクルを横軸の 1 区画として
  明示的にスケールする必要がある（ty-plus は 1 サイクルの下限幅と可視時間窓で担保）


## UI 設計の決定（第4単位: モーションエディタへの転換）

parameter editor（グラフ＋4ハンドル）から motion editor（動きそのもの）へ転換する。

```text
┌──────────────────────────────────────────┐
│ サイクル 3        0%            ▶        │  ← コマンド行
├──────────────────────────────────────────┤
│   ●← 動きの軌跡（同じ波の計算）          │  ← モーションプレビュー
├──────────────────────────────────────────┤
│  ∿∿∿∿∿∿∿  周期境界・4ハンドル           │  ← ループタイムライン
├──────────────────────────────────────────┤
│                  適用                     │
└──────────────────────────────────────────┘
```

- プレビューとタイムラインは同じ `cyclic-wave.ts` の値を参照する（装飾プレビューを作らない）
- Easing は「単一区間の補間」を正方形グラフで扱うのに対し、Loop は「繰り返しの
  構造」を横長のタイムラインと動きのプレビューで扱う。並べたときに用途の
  違いが視覚的に現れる
- 选中候補: (a) グラフ中心（PR #310 の構成）(b) プレビュー中心（採用）(c) タイム
  ライン中心。実画像の比較で (b) を採用

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



## 適用済みループの編集ライフサイクル（第5単位）

- タイムライン上の直接スクラブを追加（背景ドラッグ＝スクラブ、ホイール＝ズーム、
  Shift+ホイール＝パン）。スクラブすると再生は停止し、プレビューとヘッダーの
  現在値が同期する
- 適用済みループの再取得・再編集・解除は**未実装**。次の実装単位とする
- エクスプレッション有効プロパティの保護をホスト側に追加した
  （`prop.expression` / `expressionEnabled` を検査し、式駆動のプロパティを
  書き換え対象から除外する）
- `host-bundle.test.ts` は**この作業ツリーでは実行できない**（全テストが skip され
  実行が停止する）。原因はこの変更ではなく、作業ツリーに残る未コミットの
  align time 移植（この変更を戻して再現する）にある。ホスト側の検証は
  RC 検証段階で行う


## 適用済みループの編集ライフサイクル（設計 / 未実装）

受入条件: 「作る → 適用する → 再び開く → 調整する → 解除する」が元データを
破壊せず一貫して成立すること。

### ホストAPI

| コマンド | 役割 |
| --- | --- |
| `applyLoopEasing` | 適用。**適用前**のキーフレーム（時刻・値・ease）をスナップショットして sidecar に記録してから波形を書く |
| `captureLoopState` | 選択中プロパティの sidecar 記録を読み、適用済みパラメータと復元用スナップショットを返す。記録が無い／手動変更ありは明示する |
| `unapplyLoopEasing` | sidecar のスナップショットで元のキーフレームへ復元し、記録を削除する（Undo 1 段） |

### sidecar（適用済みデータの正本）

- パス: `<managed root>/widgets/state/loop-applied.json`（ウィジェット状態と同じ
  管理ルート。パスは React 側が解決して payload に含める）
- 1 レコード = 1 プロパティ = `{ propertyId, appliedAt, loopParams, template,
  originalKeyframes, writtenKeyframeTimes }`

### 競合検出

- 適用時に書き込んだキーフレームの時刻列を sidecar に記録する
- capture / unapply 時に現在のキーフレーム列と照合し、異なる場合は
  「手動変更あり」として**破壊的な操作（解除）を拒否**し、UI に明示する

### 冪等性

- 適用済みプロパティへの再適用は「復元 → 再適用」を行い、同じプロパティへ
  重複適用しない
- 更新時は sidecar の `originalKeyframes` を**初回適用のまま保持**する（上書きしない）

### UI 状態（モーションエディタに統合）

| 状態 | 表示 |
| --- | --- |
| 未適用 | 通常の編集（タイムライン＋プレビュー） |
| 適用済み | 「適用済み」のバッジ。タイムラインは復元した波形を表示し、そのまま編集できる |
| 編集済み（未適用差分あり） | 「更新」ボタンを主操作に、「元に戻す」「解除」を副操作に |
| 競合（手動変更あり） | 警告表示。解除・更新を無効化し、理由を示す |

数値フォームや説明文は増やさない。


### ホストコマンドの契約（実装単位の共通仕様）

payload / 戻り値は panel 側（React）とホスト側が同じ語彙を使う。

- `applyLoopEasing` payload: 既存のもの + `sidecarPath: string`（panel 側が解決した
  管理ルート配下の sidecar パス）
- `applyLoopEasing` 戻り値: `{ changed, applied: AppliedLoopRecord[], errors }`
- `captureLoopState` payload: `{ sidecarPath: string }`
  戻り値: `{ records: AppliedLoopRecord[] }`（選択中プロパティに一致するもの）
- `unapplyLoopEasing` payload: `{ sidecarPath: string }`
  戻り値: `{ restored: number, conflicts: string[], errors: string[] }`

```ts
type AppliedLoopRecord = {
	/** matchName ベースの識別子（例: "Layer 1.Position"） */
	propertyId: string;
	/** 適用した時間範囲（秒） */
	range: { start: number; end: number };
	/** 適用時の周期パラメータ */
	loopParams: {
		cycles: number;
		amplitude: number;
		damping: number;
		bias: number;
		mode: string;
	};
	/** 適用前に存在したキーフレーム（復元用） */
	originalKeyframes: {
		time: number;
		value: number[];
		inEase: { speed: number; influence: number }[];
		outEase: { speed: number; influence: number }[];
		interpolationType: number;
	}[];
	/** 適用で書き込んだキーフレーム（競合検出の照合用） */
	writtenKeyframes: { time: number; value: number[] }[];
	/** 適用時刻（ms） */
	appliedAt: number;
};
```

### 未実施（この単位）

- 上記のホストAPI・sidecar・UI 状態の実装（次の実装単位）

## 次の実装単位（受入条件）

正本の受入条件に従い、以下はそれぞれ独立した実装単位（PR）とする。

### 単位A: 適用済みループの再取得・再編集・解除

- ホストに「選択区間のループ状態を読み戻す」コマンドを追加し、波形パラメータを復元できる
- 再取得した波形がグラフに現れ、編集して再適用できる
- 解除操作は適用で追加したキーフレームを元の状態へ戻す（Undo 1 段）

### 単位B: エクスプレッション有効プロパティの保護

- ホストが `prop.expression` / `expressionEnabled` を検査し、エクスプレッション由来の
  値を持つプロパティを無書き換えで保護する
- 保護された対象はエラーではなく警告として通知する
- 既存のイージング適用（Loop 以外）を壊さない

### 単位C: モーションプレビュー

- グラフの波をそのまま再生する（正規化された motion プレビュー）
- 適用結果と同じ計算を使う（装飾プレビューを作らない）
- 周期境界と再生位置が一致して見える

## 関連

- `docs/architecture/widget-boundary.md` — Loop Widget 境界
- `docs/decisions/2026-11-21-loop-cyclic-wave-model.md` — 周期モデル決定
