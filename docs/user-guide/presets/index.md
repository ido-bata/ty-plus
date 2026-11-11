# プリセット管理

<<<<<<< Updated upstream
## プリセットの種類
=======
プリセットは、After Effects の作業を再利用するための実行単位です。ファイル、スクリプト、フッテージ、イージング、テキストスタイルなどをワークスペースに登録して、タイルから実行します。

![preset dialog](../assets/screenshots/preset-dialog.svg)

## 作成できるプリセット

| 種類 | 代表用途 | AE で確認すること |
| --- | --- | --- |
| ファイルプリセット | `.ffx` などのファイル登録 | 選択レイヤーへ正しく適用される |
| フォルダ / グループ | タイル整理、プリセット分類 | グループ化、展開、移動、保存ができる |
| コードプリセット | JSX / JSXBIN / スクリプト実行 | 実行結果、エラー、権限、ログが正しく出る |
| フッテージプリセット | 素材の読み込み、置換、参照 | AE プロジェクトへ意図した形式で追加される |
| アニメーションプリセット | キーフレームやエフェクトの保存適用 | 保存先検出、`.ffx` 生成、再適用ができる |
| レイヤー / コンプ | レイヤー、コンポ、プリコンポーズ等の操作 | 選択状態ごとの挙動が破綻しない |
| インポートプリセット | 特定パスや素材セットの取り込み | 不足ファイル、重複、連番、フォルダ構造を扱える |
| イージングプリセット | cubic-bezier カーブの保存 | カーブ表示、選択からコピー、適用結果が一致する |
| テキストスタイル | フォント、サイズ、トラッキング、塗り | 選択テキストレイヤーへ正しく反映される |
>>>>>>> Stashed changes

ty-plus では、次のプリセットを作成・管理します。

<<<<<<< Updated upstream
| 種類 | 用途 |
| --- | --- |
| Local Preset | ファイルやローカル素材を呼び出す |
| Group Preset | 複数プリセットをまとめる |
| Animation Preset | After Effects のアニメーションプリセットを扱う |
| Layer Comp Preset | レイヤーやコンポジション操作をまとめる |
| Code Preset | スクリプトやコードベースの処理を登録する |
| Footage Preset | 画像や動画などの素材読み込みを登録する |
| Import Preset | ファイル取り込み用のプリセットを登録する |
| Text Style Preset | テキストスタイルを登録する。検証時点では deprecated 表示 |
| Easing Preset | イージングカーブをプリセットとして保存する |

## ControlPanel から追加する
=======
1. メニューウィジェットの `プリセットを作成` を押します。
2. 作成するプリセット種別を選びます。
3. 名前、アイコン、説明、ファイルパス、種別固有の項目を入力します。
4. 保存します。
5. ワークスペースまたはプリセット一覧に追加されたことを確認します。
6. 実行し、After Effects 側の結果を確認します。

## イージングから作成する

1. ワークスペースにイージングウィジェットを追加します。
2. カーブを編集するか、AE の選択キーフレームからコピーします。
3. `Create Preset` を押します。
4. `Create Preset` ダイアログで名前、アイコン、説明を設定します。
5. 保存後、イージングのカーブアイコンがプリセットタイルに表示されることを確認します。
6. 別のキーフレームへ適用し、速度グラフと見た目の動きが一致することを確認します。

## 編集する

1. プリセットタイルを右クリックします。
2. `Edit Preset` を開きます。
3. 名前、説明、アイコン、ファイルパス、種類を変更します。
4. 保存します。
5. タイル表示、一覧表示、実行結果に変更が反映されることを確認します。

削除する場合は、編集ダイアログから削除し、確認ダイアログで承認します。削除後は、ワークスペース、グループ、検索結果、プリセット一覧から消えることを確認します。
>>>>>>> Stashed changes

1. ty-plus パネルを開きます。
2. ControlPanel の追加ボタンを押します。
3. 作成したいプリセット種類を選びます。
4. 名前、アイコン、説明、対象ファイルやコードを設定します。
5. 保存します。

## 右クリックから追加する

<<<<<<< Updated upstream
ワークスペース上で右クリックして、プリセット追加メニューを開きます。作成したい種類を選び、ダイアログで内容を入力して保存します。
=======
- イージング作成ダイアログの起動
- 既存 `presetId` を指定した編集ダイアログの起動
>>>>>>> Stashed changes

## 追加ダイアログを確認する

<<<<<<< Updated upstream
ControlPanel から各プリセットの追加ダイアログを開けます。検証では、表示後に `Cancel` / `キャンセル` で閉じた場合、`presets.json`、`groups.json`、`widgets.json`、`workspace-1.json` は変更されませんでした。

![Local Preset 追加](screenshots/presets-06-local-preset-dialog-visible.png)

![Group Preset 追加](screenshots/presets-07-group-preset-dialog-visible.png)

![Animation Preset 追加](screenshots/presets-08-animation-preset-dialog-visible.png)

![Layer/Comp Preset 追加](screenshots/presets-09-layer-comp-preset-dialog-visible.png)

![Code Preset 追加](screenshots/presets-10-code-preset-dialog-visible.png)

注意点として、Local Preset、Layer/Comp Preset、Code Preset の一部パス入力欄は、画面上で先頭の `/` が詰まって見えることがあります。DOM 上の値または placeholder では `/Applications/...` として保持されていました。

## 編集・複製・削除

プリセットを右クリックすると、編集、複製、削除、グループ化などの操作を選べます。削除する前に、グループやワークスペースで使っていないか確認してください。

## グループ化

複数のプリセットをまとめたい場合は Group Preset を使います。作業別、案件別、素材別にまとめると探しやすくなります。

## オンボーディングで取り込んだプリセット

初期設定の Presets ステップでフォルダを選ぶと、選択したフォルダがグループとして登録されます。検証では `/Applications/Adobe After Effects 2026/Presets/Adobe Express` を選択し、完了後に次の結果になりました。

| 項目 | 結果 |
| --- | --- |
| グループ名 | Adobe Express |
| 登録件数 | 27 |
| 種類 | `.ffx` Animation Preset |
| 保存先 | `/Applications/Adobe After Effects 2026/ty-plus/presets/presets.json` |

![プリセット追加の説明ステップ](screenshots/onboarding-09-adding-presets.png)

ワークスペースには `FFX 27` のグループタイルとして配置されます。

![グループを開いた状態](screenshots/presets-01-group-opened.png)

## AE レイヤーへ適用する

`.ffx` プリセットは、アクティブなコンポジションと対象レイヤーがある状態でタイルをダブルクリックして適用します。検証ではテキストレイヤーに Adobe Express の `.ffx` を適用し、Effect Controls に `Duration`、`Intensity`、`(Transform)` が追加されました。

![適用先レイヤーを作成](screenshots/presets-03-ae-target-created.png)

![FFX 適用後](screenshots/presets-04-ffx-applied.png)

イージングウィジェットの Apply は `.ffx` タイルとは別機能です。アクティブコンポジションや選択キーフレームがない状態では、次のようなエラーが出ます。

![適用条件不足のエラー](screenshots/presets-02-apply-without-target-error.png)

保存済み AEP でキーフレームを選択している場合は、Easing の `適用` が成功します。検証では Position キーフレーム 2 点に適用し、補間タイプと influence が変化しました。

![保存済み AEP で Easing を適用](screenshots/presets-11-easing-applied-to-saved-aep.png)

## Layer/Comp Preset の注意

保存済み AEP と選択レイヤーがある状態でも、検証時点では Layer Preset 作成に失敗しました。After Effects の通知で保存先フォルダを作成できない旨が表示されましたが、`presets.json` とワークスペースには実行不能な `LAYER` タイルが追加されました。

Composition 側も同じく失敗し、実体のない `COMP` 相当のタイルが残りました。この状態になった場合は、作成されたタイルを削除し、保存先に実ファイルがあるか確認してください。

![Comp Preset 作成失敗](screenshots/presets-16-comp-preset-create-result.png)

## Code Preset の注意

Code Preset も、検証時点では保存先フォルダを作成できず失敗しました。Layer Preset と違い、`presets.json` への壊れた登録は残りませんでした。

![Code Preset 作成失敗](screenshots/presets-14-code-preset-create-result.png)

## Animation Preset の注意

Animation Preset も、検証時点では `/Applications/Adobe After Effects 2026/Presets/ty-plus/presets` を作成できず失敗しました。`presets.json` への壊れた登録は残りませんでした。

![Animation Preset 作成失敗](screenshots/presets-15-animation-preset-create-result.png)

## Footage / Import / Text Style / Easing の注意

右クリック相当の起動では、Footage、Import、Text Style、Easing の各ダイアログを表示できました。

![Footage Preset ダイアログ](screenshots/presets-17-footage-dialog-visible.png)

Import Preset は作成に成功し、`type: "footage"` のプリセットとして登録され、ワークスペースにもタイルが追加されました。

![Import Preset 作成](screenshots/presets-21-import-create-result.png)

一方で、Footage Preset は `作成` 後に `保存中...` のまま停止し、登録されませんでした。Text Style Preset は deprecated 表示があり、`作成` 後にダイアログは閉じますが、登録は残りませんでした。Easing Preset は保存先フォルダが作成されず、登録も残りませんでした。

![Easing Preset 作成失敗](screenshots/presets-26-easing-create-result.png)

## スクリーンショット

プリセット管理の画像は、この章の `screenshots/` に保存します。
=======
1. ty-plus パネルを開いた状態で After Effects の `File > Scripts > Run Script File...` を実行します。
2. `reference/ref-es/open-preset-dialog-bridge.jsx` を選択します。
3. プロンプトで `1` または `2` を選びます。
4. ダイアログが開き、保存またはキャンセルの結果が ty-plus 側へ戻ることを確認します。

## プリセット運用の注意

- ファイルパスは、サポートルートからの相対運用と絶対パス運用の両方を検証します。
- 日本語、空白、記号、長いパス、ネットワークドライブを販売前に必ず確認します。
- `.ffx`、`.jsx`、`.jsxbin`、画像、動画、フォントなど、種別ごとの代表ファイルを実 AE で実行確認します。
- 失敗時に AE が固まらず、ty-plus に失敗理由が出ることを確認します。
>>>>>>> Stashed changes
