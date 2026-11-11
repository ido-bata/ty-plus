# Media Surface

この文書は、CEP panel とは別に動く補助 HTTP surface を定義する。

## 正規 source

| 役割 | path |
| --- | --- |
| HTTP entry | [`src/media-surface/src/index.ts`](../../../src/media-surface/src/index.ts) |
| YouTube page render | [`src/media-surface/src/youtube-page.ts`](../../../src/media-surface/src/youtube-page.ts) |
| dev server 起動 | [`scripts/lib/media-surface-dev-server.ts`](../../../scripts/lib/media-surface-dev-server.ts) |
| AE deploy 時の統合起動 | [`scripts/dev-ae-deploy.ts`](../../../scripts/dev-ae-deploy.ts) |

## 現在の役割

- `/health` を返す
- `/media/youtube` を HTML として返す
- CEP shell 本体の外にある media 表示を補助する

## dev 導線

[`scripts/dev-ae-deploy.ts`](../../../scripts/dev-ae-deploy.ts) は media surface dev server を起動し、`TY_PLUS_MEDIA_BASE_URL` を設定してから build / install / AE launch を行う。

## 境界

- media surface は panel UI の代替ではない。
- external media 表示を CEP 本体から分離する補助プロセスである。
