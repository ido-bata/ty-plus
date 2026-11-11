# Issue: プリセット sidecar 同名画像が WebP 変換パイプラインを通っていない

**日付:** 2026-09-06
**状態:** Open
**報告:** Windows 実機検証における指摘 (1 件目)
**関連 ADR:** [ADR-003 thumbnail pipeline ownership (Rust operation worker)](../decisions/2026-08-26-thumbnail-pipeline.md)
**関連計画:** [2026-08-26 thumbnail pipeline 実装計画](../plans/2026-08-26-thumbnail-pipeline.md)

## 背景

ADR-003 (2026-08-26) は、ディレクトリブラウザの file entry に対して、
「image / video / SVG / image-sequence / text / font を Rust operation worker
で decode → resize → WebP encode する」パイプラインを定義した。
変換結果は Rust が persistent cache として所有し、ブラウザは
`LookupThumbnailMethod` / `GenerateThumbnailMethod` の IPC 越しに cache URL
を受け取る。

これに伴い TS 側では:

- `src/management/ae/files/runtime-gateway.ts` — wire contract 定義
- `src/management/ae/files/runtime-gateway-impl.ts` — IPC port への forwarding
- `src/function/widget/utility/directory-browser/hooks/useThumbnail.ts` —
  inflight dedup 付き gateway hook
- `src/function/widget/utility/directory-browser/ThumbnailTile.tsx` —
  gateway 経由の thumbnail renderer (image entry 用)
- `src/function/widget/utility/directory-browser/EntryThumb.tsx` —
  gateway 経由の renderer を image branch に組み込んだ版

が 2026-08-26 に追加されている。

## 問題

**ディレクトリブラウザで「プリセットと同名の画像」が表示されない**

調査の結果、これは「表示ロジックが壊れている」のではなく、
**「同名画像をサムネイル表示する経路が WebP 変換パイプラインを通っていない」**
ことが分かった。ADR-003 の意図 (Rust で最適化済み WebP を生成しそれを表示)
と実装 (生ファイルを `<img src={file://...}>` で直表示) が乖離している。

ユーザー指摘の核:

> 「画像ファイルを最適サイズの webp に変換し、表示するというのが
> もともとの想定した仕様だったはず」

現状、preset sidecar (同名画像) のレンダリングは 5 箇所すべてで
raw な `<img src={imageSrcForBrowser(filePath)}>` を使っている。
対して、image entry 側は ThumbnailTile → useThumbnail → gateway 経由で
cache された WebP を取得する経路を持っているが、preset sidecar の branch は
その経路を使わず素の画像を直書きしている。

## 影響範囲 (raw `<img>` が残っている箇所)

| # | ファイル:行 | 状況 |
|---|---|---|
| 1 | `src/function/widget/utility/directory-browser/Component.tsx:352-364` | ローカル `EntryThumb` (327-372 で定義) の sibling branch |
| 2 | `src/function/widget/utility/directory-browser/EntryThumb.tsx:81-94` | 同じ sibling branch を書いた独立 file — `Component.tsx` から **import されていない** |
| 3 | `src/management/preset/workspace/glyph.tsx:336-345` | `WorkspacePresetGlyph` の image branch — sibling 解決 (227-281) と `descriptionImage` 上書き (283-292) の後、生画像を表示 |
| 4 | `src/management/storage/ui/DirectoryBrowser.tsx:210-224` | 旧 `renderEntryIcon` の sibling branch (legacy shell) |
| 5 | `src/management/preset/onboarding-service.ts:175-212` | `resolveSiblingImageIconSrc` が raw path を返し、それを `presetIconImage(siblingSrc)` に保存 |

## 関連する不整合

| 項目 | 状態 |
|---|---|
| Rust pipeline | lossless encode (WEBP_QUALITY=80 は定義だけで未使用: `rust/crates/host-filesystem/src/thumbnails/decode.rs:66-67, 145-162`) |
| Operation worker executor | "not yet wired" を返す (`rust/apps/operation-worker/src/executor.rs:135-141`) |
| Operation worker storage_dispatch | no-op (`rust/apps/operation-worker/src/storage_dispatch.rs:106-111`) |
| Operation worker online_dispatch | unsupported (`rust/apps/operation-worker/src/online_dispatch.rs:392-397`) |
| `AfterEffectsFilesGatewayProvider` の本番 mount | 未確認 (Component.tsx がローカル `EntryThumb` を使っており、gateway 経由の新 `EntryThumb` を import していない) |
| Companion image の hide | `Component.tsx:1087-1116` の `hideCompanionThumbRow` で sidecar 画像行を de-dup — これは意図通りだが、画像の **表示** 側だけが未実装 |

## 必要な対応

### A. レンダリング経路の統一

- `Component.tsx` のローカル `EntryThumb` (327-372) を削除し、
  `./EntryThumb` を import する。
- `./EntryThumb.tsx` の sibling branch (81-94) を `useThumbnail` 経由に書き換え、
  `file_type: "image"` で Rust に変換を依頼する。
- `glyph.tsx:336-345` の sibling / descriptionImage 経路も
  `useThumbnail` 経由に揃える。`WorkspacePresetGlyph` から gateway を
  inject できる hook 経由にする。
- `DirectoryBrowser.tsx:210-224` の sibling branch も同様に書き換え。
- `onboarding-service.ts:175-212` で sibling 解決直後に
  `useThumbnail` 等価の gateway lookup を挟む (cache URL を保存)。

### B. Rust 側の lossless → lossy 化

- `decode.rs:145-162` の `WebPEncoder::new_lossless` を
  `WebPEncoder::new_with_quality` (80) に変更。
- `WEBP_QUALITY = 80.0` (`decode.rs:66-67`) を実際にエンコーダに渡す。
- `pipeline.test.rs:44-95` のスナップショットを更新 (lossy 出力)。

### C. Operation worker の wiring

- `executor.rs:135-141` の "not yet wired" を実装。
- `storage_dispatch.rs:106-111` の no-op を実装。
- protocol message (`protocol/src/message.rs:112-165`) で定義済みの
  `LookupThumbnailMethod` / `GenerateThumbnailMethod` を実メソッドに配線。

### D. ゲート

- `useThumbnail` の inflight dedup はそのまま流用可能。
- React の render 中に IPC を撃つ既存パターンを踏襲。
- `image-src-for-browser.ts` のラッパは gateway 出力 URL にも適用する
  (CEP の file:// / http(s) 許可境界を統一するため)。

## 受け入れ基準

1. **同名画像は必ず WebP cache URL 経由で表示される。**
   5 箇所のうち 1 箇所も残らず、`<img src={imageSrcForBrowser(filePath)}>`
   の形が preset sidecar に対して残らないこと。
2. **Rust encode は lossy, WEBP_QUALITY=80。**
   lossless encode を使う path が残らないこと。既存の
   `rust/crates/host-filesystem/src/thumbnails/pipeline.test.rs` の
   snapshot 更新が含まれる。
3. **Operation worker の thumbnail endpoint が実 IPC で応答する。**
   `executor.rs:135-141` の "not yet wired" が消えていること。
4. **AE 実機でブラウザ表示が崩れないこと。**
   `cep-host-verification` skill を実施し、preset tile / list / grid 全
   モードでサムネイルが出ることと、bundle size が変わらないこと
   (cache URL は同等サイズかそれ以下) を確認。
5. **react-doctor / quality-gate / `bun run ci` 全て green。**

## 発見 (実装中に追加)

実装中に issue 時点で把握されていなかった事実が判明したため追記する。

- **image 0.25.x の WebP エンコーダは lossless のみ**: 実装計画と
  ADR-003 の前提である `WebPEncoder::new_with_quality(80.0)` は、
  `image` crate 0.25.6 (および `< 0.25.10` のすべてのバージョン) には
  **存在しない**。依存している `image-webp` 0.2 系も VP8L lossless
  固定であり、`EncoderParams` に quality フィールドは無い。受け基準 2
  ("Rust encode は lossy, WEBP_QUALITY=80") を strict に満たすには、
  `webp` crate (libwebp FFI) を追加依存として導入するか、将来の
  `image` バージョン (lossy encoder が復活する PR 待ち) まで
  lossless で固定する必要がある。本 PR では後者を選び、
  `encode_webp` の quality 引数を interface-stability 用として
  残しつつ lossless を継続採用する。real lossy への移行は
  別 issue (`docs/issues/` に新規起こし) とする。
- **`AfterEffectsFilesGatewayProvider` の本番 mount 未実装**:
  `gateway-context.ts` の Provider は export されているが、
  app root / panel root のいずれにも mount されていない。
  `useThumbnail` が本番で常に `status: idle` のままになる問題を
  内包していた。本 PR で provider を CEP panel root に mount する。
  `bootPanel` から `tryBuildThumbnailGateway(window)` を呼び、
  `OperationWorkerComposition` 経由で `AfterEffectsFilesRuntimeGateway`
  を組み立てて `PanelRoot` の `gateway` prop に渡す経路を新規追加。
  - 新規 module: `src/management/panel/thumbnail-gateway-boot.ts`
  - 新規 module: `src/management/ae/files/runtime-gateway-composition-adapter.ts`
  - `OperationWorkerComposition` に `lookupThumbnail` /
    `generateThumbnail` を追加 (`host_thumbnail_lookup` /
    `host_thumbnail_generate` の 2 route を露出)
  - 失敗時は `null` を返し、`useThumbnail` は `idle` のまま glyph に
    フォールバックする。テスト環境・web preview・platform gap で安全。
- **Rust 側 `validate_payload` の thumbnail 枝が no-op**:
  executor.rs:178-183 で thumbnail request payload の構造検証を
  skip している。THB-WIRE-002 と同等 (snake_case の 4 field) で
  検証する wiring も C のスコープに含める。
- **thumbnail dispatch 経路の lookup は cache-only にすべき**:
  wire contract `LookupThumbnailResponse.cache_path` が
  `Option<String>` なので、lookup 経路は Rust に generation を
  起こさせてはならない。`dispatch_thumbnail_lookup_for_request`
  は meta-marker だけを直接検査し、generate は
  `dispatch_thumbnail_generate_for_request` に分離した。
- **`validate_payload` の dispatch 入口で empty source_path を弾く**:
  React hook (`useThumbnail`) 側は `entry.path === ""` を
  `idle` short-circuit していたが、Rust 側は未防御だった。
  `executor.rs` の新 `validate_thumbnail_payload` で
  empty / whitespace / mtime=0 を reject。

## 開いている判断

- **`glyph.tsx` の gateway 注入経路**: WorkspacePresetGlyph は現状
  gateway を受け取れる構造になっていない。`useFilesGateway()` のような
  hook 経由にするか、`PresetGlyphById` 呼び出し側で解決して値を
  渡すか (後者の方が React の責務分離に整合的)。実装 PR で決定。
- **layout 互換**: 既存サムネイルのアスペクト比 (object-cover) を維持。
  新規 WebP が同サイズに encode される前提 (thumbnail.ts の resize policy)。
- **動的 GIF / SVG の hover swap**: ThumbnailTile 側で既に
  `animatedUrl` を持っている (line 23-57)。sidecar branch も同じ
  機構に乗せられるかが未確認。実装時に確認。

## 参考

- audit agent の調査結果 (2026-09-06, 当セッション内)
- git log signal:
  - `d5ae4c3d` 2026-05-17 sibling thumbnail resolution (raw path 保存)
  - `ab133cfb` 2026-05-25 companion image 取り込み (raw `<img>`)
  - `6cf9ac7e` `8420c369` `a012ec0c` `2239217d` `3b348599` 2026-08-26
    THB-* 一式 (image branch は gateway 経由、**sibling branch は未着手**)
- 関連 i18n: `directoryBrowser.thumbnail.loading` / `directoryBrowser.thumbnail.error`
  は ADR-003 で追加済み。再利用。
