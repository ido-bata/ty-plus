# ADR-003: Thumbnail pipeline ownership (Rust operation worker)

**日付:** 2026-08-26  
**状態:** Accepted  
**関連:** [2026-08-21 Rust operation worker boundary](2026-08-21-rust-operation-worker.md)

## 背景

ディレクトリブラウザの file entry には現状 image 系の raw `file://` 表示しか
無く、video / SVG / image-sequence / text / font などには preview が無い。AE
extension における AeViewer 的な hover-to-play 体験のためには、file type を
横断する thumbnail 生成パイプラインが必要である。

`host-boundary.md` は persistent caches を Rust operation worker の所有と
定めており、thumbnail cache もそれに従う。残る設計選択は「decode / encode を
どこで行うか」だった。

## 検討した案

### 案 A: ブラウザで変換 + Rust に cache を書かせる

ブラウザの Canvas + `<video>` + `canvas.toBlob('image/webp')` で変換し、生成
bytes を Rust に送って永続化する。video decode も native で行える。

- ✅ host-boundary.md に整合 (Rust が cache 所有)
- ✅ ffmpeg 不要 (ブラウザの native codec)
- ⚠️ psd / ai / c4d / mogrt / aep は decode 不可 → フォールバック必要

### 案 B: Rust で全部変換 (image crate + resvg + ab_glyph + imageproc) — 採用

Rust に `image = "0.25"`、`resvg = "0.43"`、`ab_glyph = "0.2"`、`imageproc = "0.25"`、
`fontdb = "0.16"` を追加し、Rust operation worker 内で decode + resize + webp
encode を行う。テキストは `imageproc::draw_text_mut` で monospace レンダリング。

- ✅ Rust が conversion まで所有 (host-boundary.md と完全に整合)
- ✅ 生成パイプラインが完全に Rust 側で再現可能
- ✅ snapshot test が決定論的に書ける
- ❌ video / audio / ae-project / psd / ai / c4d / mogrt / plugin は v1 で外す
- ❌ バイナリサイズ増加 (image + resvg + imageproc + ab_glyph)

### 案 C: CEP Node だけで閉じる (jimp)

CEP Node の `fs` + pure-JS の `jimp` で thumbnail を生成する。Rust 不関与。

- ✅ 単純、最速で着手
- ❌ `host-boundary.md` の「Rust owns persistent caches」に違反
- ❌ jimp は遅い、video 非対応

## 決定

**案 B を採用する。** ただし video / audio / ae-project / mogrt / psd / ai /
c4d / plugin は v1 の decode 対象外とし、sibling image / generic icon に
フォールバックする。

### 採用理由

1. host-boundary.md の境界線と完全整合する (conversion も cache も Rust 所有)。
   Rust 側のスナップショットテストで出力の決定論性が保証できる。
2. 案 A は video decode をブラウザに依存する設計になり、生成パスが Rust と
   ブラウザに分散する。案 B は変換責務を Rust に統一できる。
3. 案 C は境界違反の上に pure-JS の性能と codec 制約で video 系を完全に諦める
   ことになる。

### video を v2 送りにする理由

Rust で video decode するには ffmpeg bindings (rust-ffmpeg / ffmpeg-next) が
事実上の選択肢だが、ユーザーが ffmpeg 埋め込みを拒否しており、AV1 / HEVC など
特許 codec を含む dependency の引き込みも避けたい。`image` crate の動画非対応
は明確な境界として残し、video は v2 で再設計する。

### resvg 採用理由

`image` crate の svg feature は `usvg` を薄く wrap しているが、feature flag の
メンテが不安定で外部 SVG のレンダリングに壊れが多い。`resvg` を直接採用する
ことで svg decode の決定論性を確保する。

### テキスト描画の方針

`imageproc::draw_text_mut` + 同梱の DejaVu Sans Mono バイナリを
`rust/crates/host-filesystem/assets/` に置く。システムフォントに依存しないことで
OS 差分を排除し、テストの再現性を取る。シンタックス強調は v1 では行わない。

## 影響範囲

- 新規 crate: なし (既存 `host-filesystem` に `thumbnails` モジュールを追加)
- 新規 dep: `image` / `resvg` / `imageproc` / `ab_glyph` / `fontdb`
- 新規 wire method: `LookupThumbnailMethod` / `GenerateThumbnailMethod`
- 新規 hook: `useThumbnail`
- 新規 spec: `docs/architecture/runtime/thumbnails.md`
- 新規 fixture: `rust/crates/host-filesystem/tests/fixtures/thumbnails/`
- 新規 i18n キー: `directoryBrowser.thumbnail.loading` / `error` (10 locale)

## 廃止条件

- Rust 側で thumbnail 生成をやめて他言語へ移したい場合 (例: image crate の
  video decode が GA した場合): 新 ADR を起こし、本 ADR と相互参照する。
- managed root の cache LRU スイーパが追加された場合は thumbnails も参加させる
  (v2)。
