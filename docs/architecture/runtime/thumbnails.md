# Thumbnails

ディレクトリブラウザの file / directory entry に対する thumbnail 生成パイプライン、
永続キャッシュ、hover 時のアニメーション挙動を定義する。Rust operation worker が
thumbnail の decode / encode / 永続化を所有し、React パネルは表示と hover 状態に
だけ関与する。

## 読む順番

1. [`../runtime/host-boundary.md`](../runtime/host-boundary.md) — 所有境界の正典
2. [`../storage/workspace-tree.md`](../storage/workspace-tree.md) — managed tree の正典
3. [`../data/contracts.md`](../data/contracts.md) — IPC wire contract の正典
4. [`../../../decisions/2026-08-26-thumbnail-pipeline.md`](../../../decisions/2026-08-26-thumbnail-pipeline.md) — アーキテクチャ選択の ADR

## スコープ (v1)

### 生成対象

| fileType | 入力 | 生成物 |
| --- | --- | --- |
| `image` (png/jpg/jpeg/tiff/bmp/webp) | source bytes | 256×256 webp (q=80) |
| `image` (gif) | source bytes | 256×256 webp (1 フレーム目のみ) |
| `svg` | source XML | 256×256 webp (`resvg` で decode) |
| `image-sequence` | 先頭の PNG | 256×256 webp + 4-8 枚の追加 webp (CSS keyframes 用) |
| `font` (otf/ttf) | source bytes | 256×256 webp (AaBb を 64pt で白背景黒文字) |
| `text` (txt/md/json/jsx) | source bytes | 256×256 webp (先頭 16 行を DejaVu Sans Mono 14pt 白背景黒文字、シンタックス強調なし) |

### v1 で外す fileType

`video` / `audio` / `ae-project` / `ae-preset` / `mogrt` / `psd` / `ai` / `c4d` /
`plugin` / `unknown`。これらは sibling image 経路
(`src/management/preset/sibling-thumbnail.ts` の `findSiblingImagePathForPresetFile`)
または generic icon にフォールバックする。video は v2 で扱う。

### folder_preview.png (AeViewer 互換)

**ディレクトリのみ**に適用。ディレクトリの兄弟として `folder_preview.png` が
存在する場合、生成 thumbnail より優先してそれを表示する。`sibling-thumbnail.ts`
と同じ探索順で適用。file entry には適用しない。

## アーキテクチャ

```text
React panel
  └─ ThumbnailTile (entry)
       ├─ useIntersectionVisible()  (rootMargin: 200px)
       └─ useThumbnail(entry, isVisible) hook
            ├─ urlCache hit → 同期で ready
            └─ miss 時: batchThumbnails → webp を cache に書く → 再試行

AfterEffectsFilesRuntimeGateway
  └─ BatchThumbnailMethod  (lookup+generate を 1 round-trip に統合)

Rust operation worker
  └─ host-filesystem/thumbnails
       ├─ cache root 解決 (managed / TEMP フォールバック)
       ├─ lookup(sourcePath, mtime, size)
       ├─ generate(sourcePath, fileType)
       └─ persist(cachePath, bytes)
```

### 所有境界

- React: presentation、hover 状態、preload トリガ。filesystem / network は行わない。
- Rust operation worker: cache ディレクトリ解決、cache hit / miss 判定、画像
  decode + resize + webp encode、cache 書き込み、in-flight dedup、cache eviction。
- ExtendScript: 触らない。

### cache root の選択

- 通常: `<managedRoot>/thumbnails/` (`rust/crates/storage/src/root.rs` で解決)
- onboarding 未完 (managed root 解決失敗、または probe の writable check 失敗):
  `std::env::temp_dir() + "/ty-plus-thumbnails/"` (`os.tmpdir()` 相当)
- 切替判定は worker 起動時に 1 度だけ実行し、invocation 中は固定する
- TEMP → managed root の migrate は行わない (LRU で自然消滅させる)

### パスレイアウト

```text
<cacheRoot>/
└─ thumbnails/
   └─ <sha256_8hex(normalizedSourcePath)>/
      ├─ <stem>.webp            (static thumbnail, 必須)
      ├─ <stem>.meta.json       (mtime / size / sha256 / generatedAt)
      └─ <stem>_<n>.webp        (image-sequence の追加フレーム、n=1..7)
```

- `<sha256_8hex>`: 衝突耐性のため source path を sha256 した先頭 8 hex
- 大文字小文字は filesystem 正規化 (`sibling-thumbnail.ts` の `normalizeSiblingDirPath` 流儀)
- 同名 stem の衝突時は `<sha8>_<stem>.webp` にフォールバック
- `<stem>.meta.json` の構造: `{ "sourceMtimeMs": number, "sourceSizeBytes": number, "sourceSha256Hex": string, "generatedAt": string }`

### cache key と無効化

- 3-tuple `(sha8, mtimeMs, sizeBytes)` で hit / miss を判定
- ディレクトリと `<stem>.webp` の存在、付随する `<stem>.meta.json` 内の
  `sourceMtimeMs` / `sourceSizeBytes` と一致すれば hit
- 追加フレーム (`<stem>_<n>.webp`) は存在すれば使い、無ければ main `<stem>.webp` のみでフォールバック
- 不一致 / 不在なら generate / overwrite

### Resize / fit ポリシー

- 256×256 は bounding box。aspect ratio を維持して long side を 256 に fit、
  余白は RGB 画像では白 (255,255,255)、RGBA 画像では透明。
- 入力が既に 256 以下なら resize せず再 encode のみ。

## wire 契約

`AfterEffectsFilesRuntimeMethod` として追加:

```text
LookupThumbnailRequest {
  sourcePath: string,
  mtimeMs: number,
  sizeBytes: number,
  fileType: string
}
LookupThumbnailResponse {
  cachePath: string | null,
  animatedSourcePath: string | null  // GIF / SVG / image-sequence のオリジナル
}

GenerateThumbnailRequest {
  sourcePath: string,
  mtimeMs: number,
  sizeBytes: number,
  fileType: string
}
GenerateThumbnailResponse {
  cachePath: string,
  animatedSourcePath: string | null
}
```

定義元: `src/management/ae/files/runtime-gateway.ts` (const + 型)、
`src/management/ae/files/runtime-gateway-impl.ts` (impl)。
protocol source は `rust/crates/protocol/src/`。

## パネル側フック

`src/function/widget/utility/directory-browser/hooks/useThumbnail.ts` を新規追加:

```ts
type UseThumbnailResult = {
  staticUrl: string | null;
  animatedUrl: string | null;
  status: "idle" | "loading" | "ready" | "error";
};

// 100-entry fixture での初期 IPC 数を削減するため、第 2 引数で
// visibility による gating を受け取る (THB-PERF-003 lazy)。
function useThumbnail(
  entry: FileBrowserEntry,
  enabled?: boolean,  // 既定 true
): UseThumbnailResult;
```

- 入力: `FileBrowserEntry`
- entry の `previewUrl` (image type の raw file://) は v1 でも維持しつつ、
  `useThumbnail` が優先される
- `folder_preview.png` が見つかればそれを返す
- in-flight dedup: 同一 entry への重複呼び出しを hook 内の `Map<path, Promise>` で抑制
- **永続キャッシュ (`urlCache`)**: `path@mtime@size@fileType` をキーに、
  IPC 解決後の `staticUrl` / `animatedUrl` を module-scope の `Map` に
  蓄える。re-mount / scroll-in / `enabled` の toggle すべてで同期に hit
  する。失敗結果は cache しない (次の mount で必ず retry)
- **sibling batch**: 同一 tick で mount された N hook を `gw.batchThumbnails` 1
  call にまとめ、各 subscriber は `requests[i]` の結果を index 対応で受け取る
- **lazy enable (THB-PERF-003)**: 第 2 引数 `enabled = false` の間は
  IPC を発火せず `idle` のまま留まる。`true` に戻した瞬間に `urlCache`
  を同期 lookup し、hit なら即 `ready` (IPC ゼロ)、miss なら batch に
  enqueue して `loading → ready` に遷移する。`staticUrl` /
  `animatedUrl` は toggle を跨いで state に保持されるので、tile が
  scroll-out して再 in-view になっても `<img>` は再 mount されず、
  IPC も再発行されない
- 未使用だった `useFileBrowserEntries` / `useDirectoryBrowserCatalog` は
  削除済み。この経路は `useThumbnail` 一本に絞る

### IO-gated lazy mount (THB-PERF-003 lazy)

`ThumbnailTile` のラッパ `<div>` には `useIntersectionVisible()` の
callback ref を貼る。wrapper は常に mount され、IntersectionObserver
は **同一 DOM ノード** に張り付くので observer が detached element
だけ見続ける CEP の race は起きない。`<img>` は `useThumbnail` が
`staticUrl` を返した瞬間に wrapper の中で render され、以後
unmount されない。よって:

1. 初回 mount で off-screen → `isIntersecting=false` → `enabled=false` →
   IPC ゼロ、placeholder 表示
2. scroll で viewport 内に入る → `isIntersecting=true` → `enabled=true` →
   `urlCache` miss なら batch IPC 1 call、hit ならゼロ
3. scroll out → `enabled=false` → `staticUrl` は state に保持 →
   `<img>` はそのまま mount されたまま、IPC ゼロ
4. 再度 scroll in → `enabled=true` → `urlCache` hit → IPC ゼロ、`<img>` は
   同じ `src` を維持

`rootMargin` は 200px。`IntersectionObserver` がない環境 (SSR / hostile
embed) では `visible=true` に倒して eager 経路にフォールバックする。

## hover 時の挙動 (aeviewer 流)

| fileType | 通常時 | hover 時 |
| --- | --- | --- |
| `image` 静的 (png/jpg/webp) | static.webp | 同じ |
| `image` アニメ (gif) | static.webp | 元 GIF (`animatedSourcePath` を `<img>` に swap) |
| `svg` | static.webp | 元 SVG (`animatedSourcePath` を `<img>` に swap) |
| `image-sequence` | static.webp | 先頭 4-8 枚を CSS keyframes でローテーション |
| `font` | static.webp | 同じ |
| `text` | static.webp | 同じ |

`staticUrl` / `animatedUrl` の 2 つの `<img>` を CSS opacity で重ねて hover で swap
する。状態は CSS のみ。JavaScript 状態は増やさない。

## エラーハンドリング

| エラー | 振る舞い |
| --- | --- |
| source 読み込み失敗 | sibling image → generic icon |
| decode 失敗 | generic icon、永続失敗マーカーは書かない (= 再試行可能) |
| webp encode 失敗 | generic icon、同上 |
| cache write 失敗 (権限 / disk full) | generic icon、stable error を gateway が返す |
| worker crash / IPC エラー | generic icon を即時表示 |

`cache-store` の `writeNotifications` / `writeRemotePresets` と同じ write path を
経由せず、thumbnail 用に host-filesystem 側で独立した write path を持つ。

## Eviction

v1 では上限なし。`<managedRoot>/thumbnails/` は他 cache とは別ディレクトリのため、
既存 cache-store の LRU スイーパが将来追加された際にも分離して扱える。`Clear
thumbnails cache` UI は v2 で追加する。

## テスト

### Rust (`rust/crates/host-filesystem/src/thumbnails/`)

- 各 fileType に対する fixture decode + encode snapshot test
- cache hit / miss の状態遷移
- TEMP fallback: managed root を意図的に解決不能にするモック
- error path: 不在 / 権限 / 破損 / 空ファイル
- in-flight dedup: 同 source への並行リクエスト

### パネル (`src/function/widget/utility/directory-browser/`)

- `useThumbnail.test.ts`: idle → loading → ready / error の状態遷移
- `useThumbnail.test.ts`: 重複呼び出しが in-flight dedup されること
- `useThumbnail.test.ts`: sibling batch / cache hit / fail-no-cache / batch-throw / snake_case wire
- `useThumbnail.test.ts`: `enabled=false` で IPC ゼロ、`false→true` で 1 call、
  `true→false→true` で cache hit (URL 保持、IPC 再発火なし)
- `useIntersectionVisible.test.tsx`: 初期 `false`、intersection で `true`、
  scroll-out で `false`、element swap で observer 再アタッチ、
  `IntersectionObserver` 不在で `true` フォールバック
- 既存 `useContextMenu.test.tsx` / `context-menu-scoped.test.tsx` の regression 確認

### E2E

`cep-host-verification` skill に以下の 2 シナリオを追加する:

- "Browse a directory with mixed media; verify thumbnails; verify hover GIF
  plays original animation" (`browse-with-thumbnails.md`)
- "Directory browser scrolls 100-entry fixture; verify only on-screen
  tiles issue batch IPC; verify scroll-out/in does not remount <img>"
  (`directory-browser-scroll-lazy-load.md`, THB-PERF-003 lazy)

## 受け入れ条件

1. `bun run ci` が green (lint + build + es3 + bundle-size + typecheck + test + rust + knip + react-doctor)
2. AE 実機で directory browser が thumbnail を描画する (cep-host-verification)
3. GIF / SVG / image-sequence で hover 時に元ファイルが再生 / swap される
4. managed root 解決不能時 (onboarding 想定) に TEMP に書かれる
5. i18n coverage 緑 (新キー: `directoryBrowser.thumbnail.loading` / `error` を 10 locale 全てに parity)
6. bundle-size gate 緑 (`TY_PLUS_PANEL_GZIP_MAX_BYTES=3500000`)
7. **(THB-PERF-003 lazy)** 100-entry fixture で on-screen になるまで batch IPC が発火せず、
   scroll-out / scroll-in で `<img>` が再 mount されないこと。
   `useThumbnail` / `useIntersectionVisible` の panel test と
   `directory-browser-scroll-lazy-load.md` scenario で担保する
