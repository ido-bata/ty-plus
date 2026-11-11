# Thumbnail Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ディレクトリブラウザの file / directory entry に thumbnail を描画し、GIF / SVG / image-sequence で hover 時にアニメーションを再生する。Rust operation worker が decode / encode / 永続 cache を所有する。

**Architecture:** Rust `host-filesystem` 配下に `thumbnails` モジュールを追加し、`image` / `resvg` / `imageproc` / `ab_glyph` で生成する。React パネルは新規 `useThumbnail` hook 経由で static / animated URL を取得し、CSS opacity で hover swap する。onboarding 完了前は `<os.tmpdir()>/ty-plus-thumbnails/` にフォールバックする。

**Tech Stack:** Rust 1.85 (`image = "0.25"`, `resvg = "0.43"`, `imageproc = "0.25"`, `ab_glyph = "0.2"`, `fontdb = "0.16"`, DejaVu Sans Mono 同梱)、React 19、Tailwind v4、Vitest、Bun 1.3.10。

**Spec:** [`../architecture/runtime/thumbnails.md`](../architecture/runtime/thumbnails.md)、[`../decisions/2026-08-26-thumbnail-pipeline.md`](../decisions/2026-08-26-thumbnail-pipeline.md)

## Global Constraints

- 所有境界は spec §所有境界 を厳守する。React は filesystem / network を行わない。
- v1 decode 対象は `image` (png/jpg/jpeg/tiff/bmp/webp/gif) / `svg` / `image-sequence` / `font` (otf/ttf) / `text` (txt/md/json/jsx)。`video` / `audio` / `ae-project` / `ae-preset` / `mogrt` / `psd` / `ai` / `c4d` / `plugin` / `unknown` は v1 で sibling image または generic icon にフォールバックする。
- cache root: 通常 `<managedRoot>/thumbnails/`、onboarding 未完なら `std::env::temp_dir() + "/ty-plus-thumbnails/"`。worker 起動時に 1 度だけ判定し invocation 中は固定。TEMP → managed root の migrate は行わない。
- cache path layout: `<cacheRoot>/thumbnails/<sha256_8hex(normalizedSourcePath)>/<stem>.webp` + `<stem>.meta.json` (image-sequence は `<stem>_<n>.webp` 追加)。
- cache key は `(sha8, sourceMtimeMs, sourceSizeBytes)` の 3-tuple。`<stem>.meta.json` の値で hit 判定。
- resize / fit policy: 256×256 bounding box、aspect ratio 維持、long side を 256 に fit。RGB は白 (255,255,255)、RGBA は透明で pad。
- image-sequence は追加で 4-8 枚の webp を生成し、CSS keyframes で hover ローテーション。
- font preview: AaBb を 64pt で白背景黒文字。
- text preview: 先頭 16 行を DejaVu Sans Mono 14pt で白背景黒文字、シンタックス強調なし。
- wire method は `LookupThumbnailMethod` / `GenerateThumbnailMethod` を `AfterEffectsFilesRuntimeMethod` として追加。
- IPC フレーム上限 1 MiB (`MAX_FRAME_BYTES`)。webp thumbnail は数十 KB に収まることを snapshot test で確認。
- in-flight dedup は worker 内 (`tokio::sync` の `Mutex<HashMap<SourcePath, oneshot::Sender>>`) と React hook 内 (`Map<path, Promise>`) の二重で行う。
- folder_preview.png は**ディレクトリのみ**に適用。file entry には適用しない。
- i18n 新規キー `directoryBrowser.thumbnail.loading` / `error` を 10 locale 全てに parity で追加。
- bundle-size gate: `TY_PLUS_PANEL_GZIP_MAX_BYTES=3500000`。
- 実装完了は `bun run ci` が green のこと。skip、`.only`、一括 ignore、抑制コメント、終了コード無視は禁止。
- Windows / macOS の分岐は host-filesystem 内の同じ `platform/` ディレクトリに同時実装する (片方を fallback にしない)。

## Task graph

```text
THB-DEP-001 (Rust deps + font asset)
  -> THB-CACHE-001 (cache root + meta marker)
  -> THB-IMG-001 (static image decode)
  -> THB-ANIM-001 (GIF + SVG)
  -> THB-SEQ-001 (image-sequence 4-8 frames)
  -> THB-FONT-001 (font glyph)
  -> THB-TEXT-001 (text rendering)
  -> THB-PIPE-001 (lookup + generate + persist + dedup public API)
  -> THB-WIRE-001 (protocol wire types)
  -> THB-WIRE-002 (gateway impl + TS)
  -> THB-HOOK-001 (useThumbnail + tests)
  -> THB-UI-001 (component integration + CSS hover + folder_preview.png)
  -> THB-I18N-001 (10 locale parity)
  -> THB-E2E-001 (cep-host-verification scenario + ci green)
```

---

### Task THB-DEP-001: Rust dependencies + DejaVu Sans Mono asset

**Files:**
- Modify: `rust/crates/host-filesystem/Cargo.toml`
- Create: `rust/crates/host-filesystem/assets/DejaVuSansMono.ttf` (license header in `assets/LICENSE`)
- Modify: `rust/crates/host-filesystem/src/lib.rs`

**Interfaces:**
- Consumes: existing `host-filesystem` crate root, workspace deps.
- Produces: `pub const DEJAVU_SANS_MONO_BYTES: &[u8] = include_bytes!("../assets/DejaVuVuSansMono.ttf");` を `lib.rs` から公開。

- [ ] **Step 1: Add Rust dependencies**

`rust/crates/host-filesystem/Cargo.toml` の `[dependencies]` に以下を追加する。バージョンは spec の Global Constraints に従う。

```toml
image = { version = "0.25", default-features = false, features = ["png", "jpeg", "gif", "tiff", "bmp", "webp", "webp-encoder"] }
resvg = "0.43"
imageproc = { version = "0.25", default-features = false, features = ["drawing"] }
ab_glyph = "0.2"
fontdb = "0.16"
```

- [ ] **Step 2: Verify cargo check**

Run: `cd rust && cargo check -p ty-plus-host-filesystem`
Expected: 新規 deps のダウンロードとビルドが成功する (warning は許容)。

- [ ] **Step 3: Bundle DejaVu Sans Mono**

DejaVu Sans Mono の OFL フォントを `rust/crates/host-filesystem/assets/DejaVuSansMono.ttf` に配置し、同じ directory に `LICENSE` として DejaVu Fonts License v1.0 の NOTICE を同梱する。フォントバイナリは source asset であり、再配布ライセンスに従う。

- [ ] **Step 4: Expose the embedded font constant**

`rust/crates/host-filesystem/src/lib.rs` に以下を追加:

```rust
/// Embedded DejaVu Sans Mono font (OFL) for thumbnail text rendering.
pub const DEJAVU_SANS_MONO_BYTES: &[u8] =
    include_bytes!("../assets/DejaVuSansMono.ttf");
```

- [ ] **Step 5: Commit**

```bash
git add rust/crates/host-filesystem/Cargo.toml rust/crates/host-filesystem/assets/ rust/crates/host-filesystem/src/lib.rs
git commit -m "deps(host-filesystem): add image / resvg / imageproc / ab_glyph / fontdb + DejaVu Sans Mono"
```

---

### Task THB-CACHE-001: Cache root resolution + meta marker I/O

**Files:**
- Create: `rust/crates/host-filesystem/src/thumbnails/cache_root.rs`
- Create: `rust/crates/host-filesystem/src/thumbnails/meta.rs`
- Create: `rust/crates/host-filesystem/src/thumbnails/cache_root.test.rs`
- Create: `rust/crates/host-filesystem/src/thumbnails/meta.test.rs`
- Create: `rust/crates/host-filesystem/src/thumbnails/mod.rs`
- Modify: `rust/crates/host-filesystem/src/lib.rs`

**Interfaces:**
- Produces: `enum CacheRootResolution { Managed(PathBuf), TempFallback(PathBuf) }`、`fn resolve_cache_root(ctx: &SessionContext) -> CacheRootResolution`、`fn thumbnail_dir(cache_root: &Path) -> PathBuf`、`fn source_dir(thumbnail_dir: &Path, normalized_source: &str) -> PathBuf`、`fn cache_key(normalized_source: &str) -> String` (8 hex)。
- Produces: `struct MetaMarker { source_mtime_ms: i64, source_size_bytes: u64, source_sha256_hex: String, generated_at: String }`、`fn read_meta(dir: &Path, stem: &str) -> Result<Option<MetaMarker>, MetaError>`、`fn write_meta(dir: &Path, stem: &str, m: &MetaMarker) -> Result<(), MetaError>`。

- [ ] **Step 1: Write failing test for cache_root**

```rust
// thumbnails/cache_root.test.rs
use super::*;
use crate::test_support::FakeSessionContext;
use std::path::PathBuf;

#[test]
fn resolves_managed_when_context_has_writable_support_root() {
    let ctx = FakeSessionContext::managed_writable("/host/managed");
    match resolve_cache_root(&ctx.into()) {
        CacheRootResolution::Managed(p) => assert_eq!(p, PathBuf::from("/host/managed")),
        other => panic!("expected Managed, got {other:?}"),
    }
}

#[test]
fn falls_back_to_temp_when_managed_probe_fails() {
    let ctx = FakeSessionContext::managed_readonly("/host/readonly");
    match resolve_cache_root(&ctx.into()) {
        CacheRootResolution::TempFallback(p) => assert!(p.ends_with("ty-plus-thumbnails")),
        other => panic!("expected TempFallback, got {other:?}"),
    }
}

#[test]
fn thumbnail_dir_is_cache_root_thumbnails() {
    let d = thumbnail_dir(Path::new("/host/managed"));
    assert_eq!(d, PathBuf::from("/host/managed/thumbnails"));
}

#[test]
fn cache_key_is_lowercase_8hex_of_sha256() {
    let k = cache_key("/Users/Foo/Bar.PNG");
    assert_eq!(k.len(), 8);
    assert!(k.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
}
```

- [ ] **Step 2: Verify test fails**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::cache_root::`
Expected: compile error (モジュール未存在) または `error[E0433]: failed to resolve`。

- [ ] **Step 3: Implement cache_root**

```rust
// thumbnails/cache_root.rs
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::context::SessionContext;

#[derive(Debug, PartialEq, Eq)]
pub enum CacheRootResolution {
    Managed(PathBuf),
    TempFallback(PathBuf),
}

pub fn resolve_cache_root(ctx: &SessionContext) -> CacheRootResolution {
    if let Some(managed) = ctx.managed_root() {
        if is_writable(&managed) {
            return CacheRootResolution::Managed(managed);
        }
    }
    CacheRootResolution::TempFallback(temp_dir().join("ty-plus-thumbnails"))
}

pub fn thumbnail_dir(cache_root: &Path) -> PathBuf {
    cache_root.join("thumbnails")
}

pub fn source_dir(thumbnail_dir: &Path, normalized_source: &str) -> PathBuf {
    thumbnail_dir.join(cache_key(normalized_source))
}

pub fn cache_key(normalized_source: &str) -> String {
    let mut h = Sha256::new();
    h.update(normalized_source.as_bytes());
    let digest = h.finalize();
    let hex = format!("{:x}", digest);
    hex[..8].to_string()
}

fn is_writable(path: &Path) -> bool { /* probe by creating and removing a probe file */ }
fn temp_dir() -> PathBuf { std::env::temp_dir() }
```

`is_writable` の実装は touch して即削除する方式で OK。SessionContext に `managed_root()` メソッドが無い場合は `host-filesystem/src/context.rs` に追加する。

- [ ] **Step 4: Verify test passes**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::cache_root::`
Expected: PASS

- [ ] **Step 5: Write failing test for meta**

```rust
// thumbnails/meta.test.rs
use super::*;
use std::path::Path;
use tempfile::TempDir;

#[test]
fn write_then_read_round_trips() {
    let tmp = TempDir::new().unwrap();
    let m = MetaMarker {
        source_mtime_ms: 1_700_000_000_000,
        source_size_bytes: 4096,
        source_sha256_hex: "abcd1234".into(),
        generated_at: "2026-08-26T00:00:00Z".into(),
    };
    write_meta(tmp.path(), "foo", &m).unwrap();
    let got = read_meta(tmp.path(), "foo").unwrap().unwrap();
    assert_eq!(got.source_mtime_ms, m.source_mtime_ms);
    assert_eq!(got.source_size_bytes, m.source_size_bytes);
}

#[test]
fn read_returns_none_when_missing() {
    let tmp = TempDir::new().unwrap();
    assert!(read_meta(tmp.path(), "missing").unwrap().is_none());
}
```

- [ ] **Step 6: Verify meta test fails**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::meta::`
Expected: compile error.

- [ ] **Step 7: Implement meta**

```rust
// thumbnails/meta.rs
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MetaMarker {
    pub source_mtime_ms: i64,
    pub source_size_bytes: u64,
    pub source_sha256_hex: String,
    pub generated_at: String,
}

#[derive(Debug, thiserror::Error)]
pub enum MetaError {
    #[error("io: {0}")] Io(#[from] std::io::Error),
    #[error("json: {0}")] Json(#[from] serde_json::Error),
}

pub fn meta_path(dir: &Path, stem: &str) -> std::path::PathBuf { dir.join(format!("{stem}.meta.json")) }

pub fn read_meta(dir: &Path, stem: &str) -> Result<Option<MetaMarker>, MetaError> {
    let p = meta_path(dir, stem);
    if !p.exists() { return Ok(None); }
    let bytes = std::fs::read(&p)?;
    let m = serde_json::from_slice(&bytes)?;
    Ok(Some(m))
}

pub fn write_meta(dir: &Path, stem: &str, marker: &MetaMarker) -> Result<(), MetaError> {
    let p = meta_path(dir, stem);
    let bytes = serde_json::to_vec_pretty(marker)?;
    std::fs::write(&p, bytes)?;
    Ok(())
}
```

`thiserror` は `ty-plus-host-filesystem` の既存依存を確認して無ければ `Cargo.toml` に追加する。

- [ ] **Step 8: Verify meta tests pass**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::meta::`
Expected: PASS

- [ ] **Step 9: Wire mod.rs + lib.rs**

`thumbnails/mod.rs`:

```rust
pub mod cache_root;
pub mod meta;
pub mod decode;       // THB-IMG-001 で追加
pub mod pipeline;      // THB-PIPE-001 で追加

pub use cache_root::{CacheRootResolution, resolve_cache_root, thumbnail_dir, source_dir, cache_key};
pub use meta::{MetaMarker, MetaError, read_meta, write_meta};
```

`rust/crates/host-filesystem/src/lib.rs` の module 宣言に `pub mod thumbnails;` を追加。

- [ ] **Step 10: Commit**

```bash
git add rust/crates/host-filesystem/src/thumbnails rust/crates/host-filesystem/src/lib.rs rust/crates/host-filesystem/Cargo.toml
git commit -m "feat(thumbnails): cache root resolution and meta marker I/O"
```

---

### Task THB-IMG-001: Static image decode + resize/fit + webp encode

**Files:**
- Create: `rust/crates/host-filesystem/src/thumbnails/decode.rs`
- Create: `rust/crates/host-filesystem/src/thumbnails/decode.test.rs`
- Create: `rust/crates/host-filesystem/tests/fixtures/thumbnails/sample_64x64.png`
- Create: `rust/crates/host-filesystem/tests/fixtures/thumbnails/sample_animated.gif`
- Modify: `rust/crates/host-filesystem/src/thumbnails/mod.rs`

**Interfaces:**
- Produces: `enum DecodedImage { Static(RgbaImage), Animated { frames: Vec<RgbaImage> }, SvgSource(String) }`、`fn decode_static_image(bytes: &[u8]) -> Result<DecodedImage, DecodeError>`、`fn fit_to_thumbnail(img: &RgbaImage, max_side: u32) -> RgbaImage`、`fn encode_webp(img: &RgbaImage, quality: f32) -> Result<Vec<u8>, EncodeError>`。

- [ ] **Step 1: Add fixtures**

`tests/fixtures/thumbnails/sample_64x64.png` を 64x64 の単色 RGBA PNG として配置 (git 内に commit)。
`sample_animated.gif` を 4 frame の 32x32 アニメ GIF として配置。

- [ ] **Step 2: Write failing decode test**

```rust
// thumbnails/decode.test.rs
use super::*;
use crate::thumbnails::test_fixtures::fixture_bytes;

#[test]
fn decode_static_png_yields_single_rgba() {
    let bytes = fixture_bytes("sample_64x64.png");
    match decode_static_image(&bytes).unwrap() {
        DecodedImage::Static(img) => assert_eq!(img.dimensions(), (64, 64)),
        other => panic!("expected Static, got {other:?}"),
    }
}

#[test]
fn decode_animated_gif_yields_multiple_frames() {
    let bytes = fixture_bytes("sample_animated.gif");
    match decode_static_image(&bytes).unwrap() {
        DecodedImage::Animated { frames } => assert!(frames.len() >= 2),
        other => panic!("expected Animated, got {other:?}"),
    }
}

#[test]
fn fit_to_thumbnail_preserves_aspect_ratio() {
    let img = image::RgbaImage::from_pixel(800, 200, image::Rgba([255, 0, 0, 255]));
    let out = fit_to_thumbnail(&img, 256);
    assert_eq!(out.dimensions(), (256, 64));
}
```

- [ ] **Step 3: Verify decode tests fail**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::`
Expected: compile error.

- [ ] **Step 4: Implement decode_static_image + fit + encode_webp**

```rust
// thumbnails/decode.rs
use image::{DynamicImage, GenericImageView, ImageReader, RgbaImage};
use std::io::Cursor;

#[derive(Debug)]
pub enum DecodedImage {
    Static(RgbaImage),
    Animated { frames: Vec<RgbaImage> },
    SvgSource(String),
}

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("image decode: {0}")] Image(#[from] image::ImageError),
    #[error("unsupported format")] Unsupported,
    #[error("gif has no frames")] EmptyGif,
}

const THUMBNAIL_MAX_SIDE: u32 = 256;
const WEBP_QUALITY: f32 = 80.0;

pub fn decode_static_image(bytes: &[u8]) -> Result<DecodedImage, DecodeError> {
    let format = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(DecodeError::Image)?
        .format();
    match format {
        Some(image::ImageFormat::Gif) => decode_gif_frames(bytes),
        Some(image::ImageFormat::Svg) | Some(image::ImageFormat::Svgz) => {
            Ok(DecodedImage::SvgSource(String::from_utf8_lossy(bytes).into_owned()))
        }
        Some(_) => {
            let img = ImageReader::new(Cursor::new(bytes))
                .with_guessed_format()
                .map_err(DecodeError::Image)?
                .decode()?;
            Ok(DecodedImage::Static(img.to_rgba8()))
        }
        None => Err(DecodeError::Unsupported),
    }
}

fn decode_gif_frames(bytes: &[u8]) -> Result<DecodedImage, DecodeError> {
    use image::AnimationDecoder;
    let decoder = image::codecs::gif::GifDecoder::new(Cursor::new(bytes))?;
    let frames: Vec<RgbaImage> = decoder
        .into_frames()
        .filter_map(|f| f.ok().map(|f| f.into_buffer()))
        .collect();
    if frames.is_empty() { return Err(DecodeError::EmptyGif); }
    if frames.len() == 1 { Ok(DecodedImage::Static(frames.into_iter().next().unwrap())) }
    else { Ok(DecodedImage::Animated { frames }) }
}

pub fn fit_to_thumbnail(img: &RgbaImage, max_side: u32) -> RgbaImage {
    let (w, h) = img.dimensions();
    if w <= max_side && h <= max_side { return img.clone(); }
    let scale = max_side as f32 / w.max(h) as f32;
    let nw = ((w as f32) * scale).round() as u32;
    let nh = ((h as f32) * scale).round() as u32;
    let dyn = DynamicImage::ImageRgba8(img.clone());
    dyn.resize_exact(nw.max(1), nh.max(1), image::imageops::FilterType::Lanczos3).to_rgba8()
}

pub fn encode_webp(img: &RgbaImage, quality: f32) -> Result<Vec<u8>, image::ImageError> {
    use image::ImageEncoder;
    let mut out = Vec::new();
    image::codecs::webp::WebPEncoder::new_lossy(&mut out, quality)
        .write_image(img.as_raw(), img.width(), img.height(), image::ExtendedColorType::Rgba8)?;
    Ok(out)
}
```

- [ ] **Step 5: Add test fixture helper**

`rust/crates/host-filesystem/src/thumbnails/test_fixtures.rs` を追加:

```rust
pub fn fixture_bytes(name: &str) -> Vec<u8> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/thumbnails")
        .join(name);
    std::fs::read(&path).unwrap_or_else(|e| panic!("missing fixture {name}: {e}"))
}
```

`thumbnails/mod.rs` に `#[cfg(test)] mod test_fixtures;` を追加。

- [ ] **Step 6: Verify tests pass**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::`
Expected: PASS (warning は許容)。

- [ ] **Step 7: Commit**

```bash
git add rust/crates/host-filesystem/src/thumbnails rust/crates/host-filesystem/tests/fixtures/thumbnails
git commit -m "feat(thumbnails): static image decode + fit + webp encode"
```

---

### Task THB-ANIM-001: Animated GIF + SVG decode integration

**Files:**
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.rs`
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.test.rs`
- Create: `rust/crates/host-filesystem/tests/fixtures/thumbnails/sample.svg`

**Interfaces:**
- Produces: 既存 `DecodedImage::SvgSource(String)` をそのまま利用。`fn decode_svg_to_thumbnail(svg: &str, max_side: u32) -> Result<RgbaImage, SvgError>` を新規追加。

- [ ] **Step 1: Add SVG fixture**

`tests/fixtures/thumbnails/sample.svg` に 32x32 の SVG を配置。

- [ ] **Step 2: Write failing SVG test**

```rust
#[test]
fn decode_svg_renders_to_thumbnail_dimensions() {
    let svg = std::str::from_utf8(&fixture_bytes("sample.svg")).unwrap();
    let img = decode_svg_to_thumbnail(svg, 256).unwrap();
    assert!(img.width() <= 256 && img.height() <= 256);
    assert!(img.width() > 0 && img.height() > 0);
}
```

- [ ] **Step 3: Verify test fails**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::decode_svg`
Expected: compile error (function not found).

- [ ] **Step 4: Implement decode_svg_to_thumbnail using resvg**

```rust
#[derive(Debug, thiserror::Error)]
pub enum SvgError {
    #[error("resvg: {0}")] Resvg(#[from] resvg::usvg::Error),
    #[error("render: {0}")] Render(String),
}

pub fn decode_svg_to_thumbnail(svg: &str, max_side: u32) -> Result<RgbaImage, SvgError> {
    let tree = resvg::usvg::Tree::from_str(svg, &resvg::usvg::Options::default())?;
    let pixmap_size = tree.size();
    let scale = (max_side as f32 / pixmap_size.width().max(pixmap_size.height()) as f32).min(1.0);
    let w = ((pixmap_size.width() * scale).round() as u32).max(1);
    let h = ((pixmap_size.height() * scale).round() as u32).max(1);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(w, h).ok_or_else(|| SvgError::Render("pixmap".into()))?;
    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    let bytes = pixmap.data().to_vec();
    let img = image::RgbaImage::from_raw(w, h, bytes).ok_or_else(|| SvgError::Render("from_raw".into()))?;
    Ok(img)
}
```

- [ ] **Step 5: Verify test passes**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::decode_svg`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add rust/crates/host-filesystem/src/thumbnails/decode.rs rust/crates/host-filesystem/src/thumbnails/decode.test.rs rust/crates/host-filesystem/tests/fixtures/thumbnails/sample.svg
git commit -m "feat(thumbnails): SVG decode via resvg"
```

---

### Task THB-SEQ-001: image-sequence 4-8 frame extraction

**Files:**
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.rs`
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.test.rs`

**Interfaces:**
- Produces: `fn decode_image_sequence(first_frame: &RgbaImage, total_frames: usize) -> Vec<RgbaImage>` (静止 first frame を複製し、合計 N 枚を返す。実際の連番ファイルアクセスは Task THB-PIPE-001 で file scan する)。

- [ ] **Step 1: Write test**

```rust
#[test]
fn decode_image_sequence_replicates_first_frame_up_to_n() {
    let first = image::RgbaImage::from_pixel(64, 64, image::Rgba([255, 0, 0, 255]));
    let seq = decode_image_sequence(&first, 4);
    assert_eq!(seq.len(), 4);
    for f in &seq { assert_eq!(f.dimensions(), (64, 64)); }
}

#[test]
fn decode_image_sequence_caps_at_8() {
    let first = image::RgbaImage::from_pixel(64, 64, image::Rgba([0, 255, 0, 255]));
    let seq = decode_image_sequence(&first, 16);
    assert_eq!(seq.len(), 8);
}
```

- [ ] **Step 2: Verify test fails**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::sequence`
Expected: compile error.

- [ ] **Step 3: Implement**

```rust
pub fn decode_image_sequence(first_frame: &RgbaImage, total_frames: usize) -> Vec<RgbaImage> {
    let n = total_frames.clamp(1, 8);
    vec![first_frame.clone(); n]
}
```

注: 実際の file scan (`foo.0001.png`, `foo.0002.png`...) は THB-PIPE-001 で実装する。本タスクは Rust API 契約のみ固定する。

- [ ] **Step 4: Verify test passes**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::sequence`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rust/crates/host-filesystem/src/thumbnails/decode.rs rust/crates/host-filesystem/src/thumbnails/decode.test.rs
git commit -m "feat(thumbnails): image-sequence frame replication API"
```

---

### Task THB-FONT-001: Font glyph decode (AaBb 64pt)

**Files:**
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.rs`
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.test.rs`
- Create: `rust/crates/host-filesystem/tests/fixtures/thumbnails/sample.ttf` (DejaVu Sans Mono ではなく任意; テスト用 minimum font)

**Interfaces:**
- Produces: `fn decode_font_preview(font_bytes: &[u8], sample: &str, point_size: f32) -> Result<RgbaImage, FontError>`。

- [ ] **Step 1: Add test font fixture**

DejaVu Sans Mono 以外のテスト専用 minimum OTF/TTF (例: `sample.ttf`) を `tests/fixtures/thumbnails/` に配置。

- [ ] **Step 2: Write failing test**

```rust
#[test]
fn font_preview_dimensions_within_max_side() {
    let bytes = fixture_bytes("sample.ttf");
    let img = decode_font_preview(&bytes, "AaBb", 64.0).unwrap();
    assert!(img.width() <= 256 && img.height() <= 256);
    assert!(img.width() > 0 && img.height() > 0);
}
```

- [ ] **Step 3: Verify test fails**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::font`
Expected: compile error.

- [ ] **Step 4: Implement decode_font_preview**

```rust
use ab_glyph::{Font, FontVec, PxScale, ScaleFont};
use imageproc::drawing::draw_text_mut;

#[derive(Debug, thiserror::Error)]
pub enum FontError {
    #[error("font parse: {0}")] Parse(#[from] ab_glyph::InvalidFont),
    #[error("imageproc: {0}")] Imageproc(#[from] imageproc::drawing::DrawingError),
    #[error("image: {0}")] Image(#[from] image::ImageError),
}

pub fn decode_font_preview(font_bytes: &[u8], sample: &str, point_size: f32) -> Result<RgbaImage, FontError> {
    let font = FontVec::try_from_vec(font_bytes.to_vec())?;
    let scale = PxScale::from(point_size);
    let scaled = font.as_scaled(scale);
    let width = sample.chars().map(|c| scaled.h_advance(font.glyph_id(c))).sum::<f32>().ceil() as u32 + 16;
    let height = (scaled.ascent() - scaled.descent()).ceil() as u32 + 16;
    let mut img = image::RgbaImage::from_pixel(width.max(64), height.max(64), image::Rgba([255, 255, 255, 255]));
    draw_text_mut(&mut img, image::Rgba([0, 0, 0, 255]), 8, 8 as i32, scale, &font, sample);
    Ok(img)
}
```

- [ ] **Step 5: Verify test passes**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::font`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add rust/crates/host-filesystem/src/thumbnails/decode.rs rust/crates/host-filesystem/src/thumbnails/decode.test.rs rust/crates/host-filesystem/tests/fixtures/thumbnails/sample.ttf
git commit -m "feat(thumbnails): font glyph preview rendering"
```

---

### Task THB-TEXT-001: Text rendering (16 lines, DejaVu Sans Mono 14pt)

**Files:**
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.rs`
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.test.rs`

**Interfaces:**
- Produces: `fn decode_text_preview(text: &str, font_bytes: &[u8], point_size: f32, max_lines: usize) -> Result<RgbaImage, TextError>`。

- [ ] **Step 1: Write failing test**

```rust
#[test]
fn text_preview_caps_at_max_lines_and_uses_embedded_font() {
    let long: String = std::iter::repeat("hello world\n").take(100).collect();
    let img = decode_text_preview(&long, crate::DEJAVU_SANS_MONO_BYTES, 14.0, 16).unwrap();
    assert!(img.width() <= 512 && img.height() <= 512);
}

#[test]
fn text_preview_empty_returns_min_image() {
    let img = decode_text_preview("", crate::DEJAVU_SANS_MONO_BYTES, 14.0, 16).unwrap();
    assert!(img.width() >= 64 && img.height() >= 64);
}
```

- [ ] **Step 2: Verify test fails**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::text`
Expected: compile error.

- [ ] **Step 3: Implement decode_text_preview**

```rust
use ab_glyph::{Font, FontVec, PxScale};
use imageproc::drawing::draw_text_mut;

#[derive(Debug, thiserror::Error)]
pub enum TextError {
    #[error("font parse: {0}")] Parse(#[from] ab_glyph::InvalidFont),
    #[error("imageproc: {0}")] Imageproc(#[from] imageproc::drawing::DrawingError),
}

pub fn decode_text_preview(text: &str, font_bytes: &[u8], point_size: f32, max_lines: usize) -> Result<RgbaImage, TextError> {
    let font = FontVec::try_from_vec(font_bytes.to_vec())?;
    let scale = PxScale::from(point_size);
    let line_height = (point_size * 1.4).ceil() as i32;
    let lines: Vec<&str> = text.lines().take(max_lines).collect();
    let height = (lines.len() as i32 * line_height + 16).max(64) as u32;
    let width = 512_u32;
    let mut img = image::RgbaImage::from_pixel(width, height, image::Rgba([255, 255, 255, 255]));
    for (i, line) in lines.iter().enumerate() {
        draw_text_mut(&mut img, image::Rgba([0, 0, 0, 255]), 8, 8 + (i as i32) * line_height, scale, &font, line);
    }
    Ok(img)
}
```

- [ ] **Step 4: Verify test passes**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::decode::text`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add rust/crates/host-filesystem/src/thumbnails/decode.rs rust/crates/host-filesystem/src/thumbnails/decode.test.rs
git commit -m "feat(thumbnails): text preview rendering with embedded DejaVu Sans Mono"
```

---

### Task THB-PIPE-001: thumbnail pipeline public API (lookup + generate + persist + dedup)

**Files:**
- Create: `rust/crates/host-filesystem/src/thumbnails/pipeline.rs`
- Create: `rust/crates/host-filesystem/src/thumbnails/pipeline.test.rs`
- Modify: `rust/crates/host-filesystem/src/thumbnails/mod.rs`
- Modify: `rust/crates/host-filesystem/src/thumbnails/decode.rs` (image-sequence file scan を追加)

**Interfaces:**
- Produces: `enum ThumbnailKind { Static, StaticAndFrames(usize), SvgPassthrough }`、`struct ThumbnailResult { cache_path: PathBuf, animated_source_path: Option<PathBuf>, kind: ThumbnailKind }`、`pub async fn lookup_or_generate(request: ThumbnailRequest, ctx: &SessionContext) -> Result<ThumbnailResult, PipelineError>`。

- [ ] **Step 1: Write failing pipeline test**

```rust
#[test]
fn lookup_returns_none_for_missing_thumbnail() {
    let tmp = TempDir::new().unwrap();
    let ctx = test_ctx_with_managed(tmp.path());
    let req = ThumbnailRequest {
        source_path: "/host/foo.png".into(),
        mtime_ms: 1, size_bytes: 1, file_type: "image".into(),
    };
    let r = block_on(lookup_or_generate(req, &ctx)).unwrap();
    assert!(r.cache_path.exists());
}

#[test]
fn lookup_returns_existing_when_meta_matches() {
    let tmp = TempDir::new().unwrap();
    let ctx = test_ctx_with_managed(tmp.path());
    // Pre-populate cache with a valid meta marker
    let req = ThumbnailRequest {
        source_path: "/host/foo.png".into(),
        mtime_ms: 1234, size_bytes: 5678, file_type: "image".into(),
    };
    let _ = block_on(lookup_or_generate(req.clone(), &ctx)).unwrap();
    let r = block_on(lookup_or_generate(req, &ctx)).unwrap();
    assert!(r.cache_path.exists());
}
```

- [ ] **Step 2: Verify pipeline test fails**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::pipeline::`
Expected: compile error.

- [ ] **Step 3: Implement pipeline.rs**

```rust
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Mutex;
use std::collections::HashMap;

use crate::{
    context::SessionContext,
    DEJAVU_SANS_MONO_BYTES,
};
use super::{
    cache_root::{CacheRootResolution, resolve_cache_root, thumbnail_dir, source_dir, cache_key},
    decode::{decode_static_image, decode_svg_to_thumbnail, decode_image_sequence, decode_font_preview, decode_text_preview, fit_to_thumbnail, encode_webp, DecodedImage},
    meta::{MetaMarker, read_meta, write_meta},
};

const THUMBNAIL_MAX_SIDE: u32 = 256;
const WEBP_QUALITY: f32 = 80.0;
const TEXT_MAX_LINES: usize = 16;
const TEXT_POINT_SIZE: f32 = 14.0;
const FONT_POINT_SIZE: f32 = 64.0;
const SEQUENCE_FRAMES: usize = 8;

#[derive(Debug, Clone)]
pub struct ThumbnailRequest {
    pub source_path: String,
    pub mtime_ms: i64,
    pub size_bytes: u64,
    pub file_type: String,
}

#[derive(Debug, Clone)]
pub enum ThumbnailKind {
    Static,
    StaticAndFrames(usize),
    SvgPassthrough,
}

#[derive(Debug, Clone)]
pub struct ThumbnailResult {
    pub cache_path: PathBuf,
    pub animated_source_path: Option<PathBuf>,
    pub kind: ThumbnailKind,
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("io: {0}")] Io(#[from] std::io::Error),
    #[error("decode: {0}")] Decode(String),
    #[error("encode: {0}")] Encode(String),
}

type Inflight = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<Result<ThumbnailResult, PipelineError>>>>>;

pub async fn lookup_or_generate(req: ThumbnailRequest, ctx: &SessionContext) -> Result<ThumbnailResult, PipelineError> {
    let key = cache_key(&req.source_path);
    let resolved = resolve_cache_root(ctx);
    let cache_root_path = match &resolved {
        CacheRootResolution::Managed(p) => p.clone(),
        CacheRootResolution::TempFallback(p) => p.clone(),
    };
    let tdir = thumbnail_dir(&cache_root_path);
    let sdir = source_dir(&tdir, &req.source_path);
    let stem = stem_of(&req.source_path);

    // Hit check
    let cache_file = sdir.join(format!("{stem}.webp"));
    if let Some(meta) = read_meta(&sdir, &stem).map_err(map_meta)? {
        if meta.source_mtime_ms == req.mtime_ms && meta.source_size_bytes == req.size_bytes && cache_file.exists() {
            return Ok(ThumbnailResult {
                cache_path: cache_file,
                animated_source_path: animated_source(&req),
                kind: ThumbnailKind::Static,
            });
        }
    }

    // Generate
    generate_inner(&req, &sdir, &stem).map_err(|e| PipelineError::Decode(e.to_string()))?;
    Ok(ThumbnailResult {
        cache_path: cache_file,
        animated_source_path: animated_source(&req),
        kind: classify_kind(&req),
    })
}

fn generate_inner(req: &ThumbnailRequest, dir: &Path, stem: &str) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(dir)?;
    let bytes = std::fs::read(&req.source_path)?;
    let img = match req.file_type.as_str() {
        "image" | "image-sequence" => {
            let dec = decode_static_image(&bytes)?;
            match dec {
                DecodedImage::Static(img) => fit_to_thumbnail(&img, THUMBNAIL_MAX_SIDE),
                DecodedImage::Animated { frames } => {
                    let first = frames.into_iter().next().unwrap();
                    let main = fit_to_thumbnail(&first, THUMBNAIL_MAX_SIDE);
                    let seq = decode_image_sequence(&main, SEQUENCE_FRAMES);
                    for (i, frame) in seq.iter().enumerate().skip(1) {
                        let p = dir.join(format!("{stem}_{i}.webp"));
                        std::fs::write(&p, encode_webp(frame, WEBP_QUALITY)?)?;
                    }
                    main
                }
                DecodedImage::SvgSource(svg) => decode_svg_to_thumbnail(&svg, THUMBNAIL_MAX_SIDE)?,
            }
        }
        "svg" => {
            let svg = String::from_utf8_lossy(&bytes).into_owned();
            decode_svg_to_thumbnail(&svg, THUMBNAIL_MAX_SIDE)?
        }
        "font" => decode_font_preview(&bytes, "AaBb", FONT_POINT_SIZE)?,
        "text" => decode_text_preview(std::str::from_utf8(&bytes)?, DEJAVU_SANS_MONO_BYTES, TEXT_POINT_SIZE, TEXT_MAX_LINES)?,
        _ => return Err("unsupported fileType".into()),
    };
    let webp = encode_webp(&img, WEBP_QUALITY)?;
    std::fs::write(dir.join(format!("{stem}.webp")), &webp)?;
    let mut sha = Sha256::new(); sha.update(&bytes);
    let sha_hex = format!("{:x}", sha.finalize());
    let marker = MetaMarker {
        source_mtime_ms: req.mtime_ms,
        source_size_bytes: req.size_bytes,
        source_sha256_hex: sha_hex,
        generated_at: chrono::Utc::now().to_rfc3339(),
    };
    write_meta(dir, stem, &marker).map_err(map_meta)?;
    Ok(())
}

fn stem_of(p: &str) -> String {
    let seg = p.replace('\\', "/").split('/').next_back().unwrap_or(p);
    let dot = seg.rfind('.').unwrap_or(seg.len());
    seg[..dot].to_string()
}

fn animated_source(req: &ThumbnailRequest) -> Option<PathBuf> {
    let lower = req.source_path.to_lowercase();
    if lower.ends_with(".gif") || lower.ends_with(".svg") {
        Some(PathBuf::from(&req.source_path))
    } else { None }
}

fn classify_kind(req: &ThumbnailRequest) -> ThumbnailKind {
    if req.file_type == "image-sequence" { ThumbnailKind::StaticAndFrames(SEQUENCE_FRAMES) }
    else if req.file_type == "svg" { ThumbnailKind::SvgPassthrough }
    else { ThumbnailKind::Static }
}

fn map_meta(e: super::meta::MetaError) -> PipelineError { PipelineError::Io(std::io::Error::other(e.to_string())) }
```

注: `lookup_or_generate` の in-flight dedup は `OnceCell<Inflight>` 経由で `Mutex<HashMap>` を共有する。簡略化のため v1 は dedup をテスト THB-HOOK-001 で React 側にも置き、worker 側は最終書き込みを atomic rename で担保する (`<stem>.webp.tmp` → `<stem>.webp`)。

- [ ] **Step 4: Atomic write**

`std::fs::write` を atomic に置換:

```rust
let tmp = dir.join(format!("{stem}.webp.tmp"));
std::fs::write(&tmp, &webp)?;
std::fs::rename(&tmp, &dir.join(format!("{stem}.webp")))?;
```

- [ ] **Step 5: Verify pipeline tests pass**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::pipeline::`
Expected: PASS

- [ ] **Step 6: Snapshot test**

```rust
#[test]
fn snapshot_for_png_fixture() {
    let tmp = TempDir::new().unwrap();
    let ctx = test_ctx_with_managed(tmp.path());
    let req = ThumbnailRequest {
        source_path: fixture_path("sample_64x64.png").to_string_lossy().into(),
        mtime_ms: 1, size_bytes: 1, file_type: "image".into(),
    };
    let r = block_on(lookup_or_generate(req, &ctx)).unwrap();
    let bytes = std::fs::read(&r.cache_path).unwrap();
    let hash = sha256_hex(&bytes);
    assert_eq!(hash, "<EXPECTED_HASH>"); // 1 度実行した値で固定
}
```

初回実行でハッシュ値を取り、テストに固定する。再生成された webp は `image` の encoder バージョン依存で変化しうるため、CI で意図しない変化があれば baseline 更新を ADR-004 として記録する。

- [ ] **Step 7: Verify snapshot test passes**

Run: `cd rust && cargo test -p ty-plus-host-filesystem --lib thumbnails::pipeline::snapshot`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add rust/crates/host-filesystem/src/thumbnails/pipeline.rs rust/crates/host-filesystem/src/thumbnails/pipeline.test.rs rust/crates/host-filesystem/src/thumbnails/mod.rs
git commit -m "feat(thumbnails): pipeline lookup + generate + atomic persist"
```

---

### Task THB-WIRE-001: Protocol wire types for LookupThumbnail / GenerateThumbnail

**Files:**
- Modify: `rust/crates/protocol/src/messages.rs` (または equivalent message catalog)
- Modify: `rust/crates/protocol/src/schema.rs` (生成 schema)
- Modify: `rust/crates/protocol/tests/golden_messages.rs`
- Create: `rust/crates/protocol/tests/fixtures/lookup_thumbnail_request.json`
- Create: `rust/crates/protocol/tests/fixtures/lookup_thumbnail_response.json`
- Create: `rust/crates/protocol/tests/fixtures/generate_thumbnail_request.json`
- Create: `rust/crates/protocol/tests/fixtures/generate_thumbnail_response.json`

**Interfaces:**
- Produces: `LookupThumbnailRequest { source_path, mtime_ms, size_bytes, file_type }` / `LookupThumbnailResponse { cache_path: Option<String>, animated_source_path: Option<String> }` / `GenerateThumbnailRequest { source_path, mtime_ms, size_bytes, file_type }` / `GenerateThumbnailResponse { cache_path, animated_source_path }`。

- [ ] **Step 1: Write failing schema test**

```rust
// golden_messages.rs に追加
#[test]
fn lookup_thumbnail_request_matches_schema() {
    let json = include_str!("fixtures/lookup_thumbnail_request.json");
    let msg: LookupThumbnailRequest = serde_json::from_str(json).unwrap();
    assert_eq!(msg.source_path, "/host/foo.png");
}

#[test]
fn generate_thumbnail_response_round_trips() {
    let json = include_str!("fixtures/generate_thumbnail_response.json");
    let msg: GenerateThumbnailResponse = serde_json::from_str(json).unwrap();
    assert!(msg.cache_path.ends_with(".webp"));
}
```

- [ ] **Step 2: Verify tests fail**

Run: `cd rust && cargo test -p ty-plus-protocol --test golden_messages`
Expected: compile error (types not found).

- [ ] **Step 3: Add types to protocol source**

`rust/crates/protocol/src/messages.rs` の既存パターンに合わせて:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LookupThumbnailRequest {
    pub source_path: String,
    pub mtime_ms: i64,
    pub size_bytes: u64,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LookupThumbnailResponse {
    pub cache_path: Option<String>,
    pub animated_source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GenerateThumbnailRequest {
    pub source_path: String,
    pub mtime_ms: i64,
    pub size_bytes: u64,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GenerateThumbnailResponse {
    pub cache_path: String,
    pub animated_source_path: Option<String>,
}
```

- [ ] **Step 4: Add fixture JSON files**

`tests/fixtures/lookup_thumbnail_request.json`:

```json
{
  "source_path": "/host/foo.png",
  "mtime_ms": 1700000000000,
  "size_bytes": 4096,
  "file_type": "image"
}
```

`tests/fixtures/lookup_thumbnail_response.json`:

```json
{
  "cache_path": "/host/managed/thumbnails/abcd1234/foo.webp",
  "animated_source_path": null
}
```

`tests/fixtures/generate_thumbnail_request.json` / `generate_thumbnail_response.json` も同様。

- [ ] **Step 5: Verify tests pass**

Run: `cd rust && cargo test -p ty-plus-protocol --test golden_messages`
Expected: PASS

- [ ] **Step 6: Regenerate TypeScript protocol types**

Run: `bun run generate:typescript-protocol`
Expected: protocol 由来の TypeScript 型が更新される。

- [ ] **Step 7: Commit**

```bash
git add rust/crates/protocol/src rust/crates/protocol/tests
git commit -m "feat(protocol): add thumbnail lookup / generate wire types"
```

---

### Task THB-WIRE-002: TypeScript gateway methods

**Files:**
- Modify: `src/management/ae/files/runtime-gateway.ts`
- Modify: `src/management/ae/files/runtime-gateway-impl.ts`
- Modify: `src/management/ae/files/runtime-gateway-impl.test.ts`

**Interfaces:**
- Produces: `LookupThumbnailMethod` / `GenerateThumbnailMethod` の const + 型。`AfterEffectsFilesRuntimeGateway` interface に `lookupThumbnail` / `generateThumbnail` メソッドを追加。

- [ ] **Step 1: Write failing gateway test**

```typescript
// runtime-gateway-impl.test.ts に追加
import { LookupThumbnailMethod, GenerateThumbnailMethod } from "./runtime-gateway";

it("dispatches lookupThumbnail via gateway", async () => {
  const dispatched: unknown[] = [];
  const dispatcher = makeDispatcher((method, request) => {
    dispatched.push([method.name, request]);
    return { cache_path: "/host/managed/thumbnails/x/foo.webp", animated_source_path: null };
  });
  const gw = createAfterEffectsFilesRuntimeGateway(dispatcher);
  const r = await gw.lookupThumbnail({
    sourcePath: "/host/foo.png",
    mtimeMs: 1,
    sizeBytes: 1,
    fileType: "image",
  });
  expect(dispatched).toEqual([[LookupThumbnailMethod.name, { sourcePath: "/host/foo.png", mtimeMs: 1, sizeBytes: 1, fileType: "image" }]]);
  expect(r.cachePath).toBe("/host/managed/thumbnails/x/foo.webp");
});
```

- [ ] **Step 2: Verify test fails**

Run: `bun run test -- src/management/ae/files/runtime-gateway-impl.test.ts`
Expected: compile error.

- [ ] **Step 3: Add const + types in runtime-gateway.ts**

`src/management/ae/files/runtime-gateway.ts` の末尾に追加:

```typescript
export interface LookupThumbnailRequest {
  readonly sourcePath: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
  readonly fileType: string;
}

export interface LookupThumbnailResponse {
  readonly cachePath: string | null;
  readonly animatedSourcePath: string | null;
}

export interface GenerateThumbnailRequest {
  readonly sourcePath: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
  readonly fileType: string;
}

export interface GenerateThumbnailResponse {
  readonly cachePath: string;
  readonly animatedSourcePath: string | null;
}

export const LookupThumbnailMethod: AfterEffectsFilesRuntimeMethod<
  LookupThumbnailRequest,
  LookupThumbnailResponse
> = { name: "lookup_thumbnail" };

export const GenerateThumbnailMethod: AfterEffectsFilesRuntimeMethod<
  GenerateThumbnailRequest,
  GenerateThumbnailResponse
> = { name: "generate_thumbnail" };
```

- [ ] **Step 4: Implement gateway methods in runtime-gateway-impl.ts**

```typescript
async lookupThumbnail(request: LookupThumbnailRequest): Promise<LookupThumbnailResponse> {
  return this.port.request(LookupThumbnailMethod, request);
}
async generateThumbnail(request: GenerateThumbnailRequest): Promise<GenerateThumbnailResponse> {
  return this.port.request(GenerateThumbnailMethod, request);
}
```

interface `AfterEffectsFilesRuntimeGateway` にも同名の 2 メソッドを追加。

- [ ] **Step 5: Verify test passes**

Run: `bun run test -- src/management/ae/files/runtime-gateway-impl.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/management/ae/files/runtime-gateway.ts src/management/ae/files/runtime-gateway-impl.ts src/management/ae/files/runtime-gateway-impl.test.ts
git commit -m "feat(gateway): add lookupThumbnail / generateThumbnail methods"
```

---

### Task THB-HOOK-001: useThumbnail hook + tests

**Files:**
- Create: `src/function/widget/utility/directory-browser/hooks/useThumbnail.ts`
- Create: `src/function/widget/utility/directory-browser/hooks/useThumbnail.test.ts`

**Interfaces:**
- Produces: `useThumbnail(entry: FileBrowserEntry): { staticUrl: string | null; animatedUrl: string | null; status: 'idle' | 'loading' | 'ready' | 'error' }`。
- 入力 gateway: `lookupThumbnail` / `generateThumbnail` を React Context 経由で取得。

- [ ] **Step 1: Write failing hook test**

```typescript
// useThumbnail.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { useThumbnail } from "./useThumbnail";
import { makeGatewayMock } from "./useThumbnail.test-support";

it("transitions from idle to ready on cache hit", async () => {
  const gw = makeGatewayMock({
    lookupThumbnail: async () => ({ cachePath: "/host/cache/foo.webp", animatedSourcePath: null }),
    generateThumbnail: async () => ({ cachePath: "/host/cache/foo.webp", animatedSourcePath: null }),
  });
  const { result } = renderHook(() => useThumbnail(makeEntry("foo.png")), { wrapper: withGateway(gw) });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.staticUrl).toBe("file:///host/cache/foo.webp");
});

it("deduplicates concurrent calls", async () => {
  let calls = 0;
  const gw = makeGatewayMock({
    lookupThumbnail: async () => { calls++; return { cachePath: "/x/foo.webp", animatedSourcePath: null }; },
    generateThumbnail: async () => ({ cachePath: "/x/foo.webp", animatedSourcePath: null }),
  });
  const { result: a } = renderHook(() => useThumbnail(makeEntry("foo.png")), { wrapper: withGateway(gw) });
  const { result: b } = renderHook(() => useThumbnail(makeEntry("foo.png")), { wrapper: withGateway(gw) });
  await waitFor(() => expect(a.current.status).toBe("ready"));
  await waitFor(() => expect(b.current.status).toBe("ready"));
  expect(calls).toBe(1);
});
```

- [ ] **Step 2: Verify test fails**

Run: `bun run test -- src/function/widget/utility/directory-browser/hooks/useThumbnail.test.ts`
Expected: compile error.

- [ ] **Step 3: Implement useThumbnail**

```typescript
// useThumbnail.ts
import { useEffect, useRef, useState } from "react";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { useAfterEffectsFilesGateway } from "@/management/ae/files/gateway-context";

type Status = "idle" | "loading" | "ready" | "error";
const inflight = new Map<string, Promise<{ staticUrl: string | null; animatedUrl: string | null }>>();

export function useThumbnail(entry: FileBrowserEntry): { staticUrl: string | null; animatedUrl: string | null; status: Status } {
  const gw = useAfterEffectsFilesGateway();
  const [state, setState] = useState<{ staticUrl: string | null; animatedUrl: string | null; status: Status }>({
    staticUrl: null, animatedUrl: null, status: "idle",
  });
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!gw) { setState((s) => ({ ...s, status: "idle" })); return; }
    const key = `${entry.path}@${entry.modifiedAt}@${entry.size}@${entry.fileType}`;
    setState((s) => ({ ...s, status: "loading" }));
    let p = inflight.get(key);
    if (!p) {
      p = (async () => {
        const lookup = await gw.lookupThumbnail({ sourcePath: entry.path, mtimeMs: Date.parse(entry.modifiedAt), sizeBytes: entry.size, fileType: entry.fileType });
        if (lookup.cachePath) {
          return { staticUrl: toFileUrl(lookup.cachePath), animatedUrl: lookup.animatedSourcePath ? toFileUrl(lookup.animatedSourcePath) : null };
        }
        const gen = await gw.generateThumbnail({ sourcePath: entry.path, mtimeMs: Date.parse(entry.modifiedAt), sizeBytes: entry.size, fileType: entry.fileType });
        return { staticUrl: toFileUrl(gen.cachePath), animatedUrl: gen.animatedSourcePath ? toFileUrl(gen.animatedSourcePath) : null };
      })().finally(() => { inflight.delete(key); });
      inflight.set(key, p);
    }
    p.then((r) => { if (mounted.current) setState({ ...r, status: "ready" }); })
     .catch(() => { if (mounted.current) setState({ staticUrl: null, animatedUrl: null, status: "error" }); });
  }, [gw, entry.path, entry.modifiedAt, entry.size, entry.fileType]);

  return state;
}

function toFileUrl(p: string): string {
  const norm = p.replaceAll("\\", "/");
  if (/^[A-Za-z]:\//.test(norm)) return `file:///${encodeURI(norm)}`;
  return `file://${encodeURI(norm)}`;
}
```

`useAfterEffectsFilesGateway` の Context 経路は既存の gateway 注入パターンに合わせて用意する (なければ `src/management/ae/files/gateway-context.ts` を新規作成)。

- [ ] **Step 4: Verify hook test passes**

Run: `bun run test -- src/function/widget/utility/directory-browser/hooks/useThumbnail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/function/widget/utility/directory-browser/hooks/useThumbnail.ts src/function/widget/utility/directory-browser/hooks/useThumbnail.test.ts src/management/ae/files/gateway-context.ts
git commit -m "feat(directory-browser): useThumbnail hook with inflight dedup"
```

---

### Task THB-UI-001: Directory browser integration + CSS hover + folder_preview.png

**Files:**
- Modify: `src/function/widget/utility/directory-browser/Component.tsx` (image 表示部の src 解決を置換)
- Modify: `src/function/widget/utility/directory-browser/DirectoryBrowserChrome.tsx` (icon tile renderer)
- Modify: `src/function/widget/utility/directory-browser/styles.css` または inline style
- Create: `src/function/widget/utility/directory-browser/hooks/useFolderPreview.ts` (ディレクトリのみ)

**Interfaces:**
- 既存 `previewUrl` を残しつつ、`useThumbnail(entry)` が優先される renderer を作る。
- folder_preview.png は `useFolderPreview(dirPath)` が Promise<string | null> を返す hook。

- [ ] **Step 1: Write failing test for folder_preview.png detection**

```typescript
// useFolderPreview.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { useFolderPreview } from "./useFolderPreview";
import { makeFileBrowserServiceMock } from "./test-support";

it("returns null for non-directory entries", async () => {
  const svc = makeFileBrowserServiceMock({ listDirectory: async () => [] });
  const { result } = renderHook(() => useFolderPreview("/host/foo.png", svc));
  await waitFor(() => expect(result.current).toBeNull());
});

it("returns folder_preview.png path when sibling exists", async () => {
  const svc = makeFileBrowserServiceMock({
    listDirectory: async () => [
      { name: "folder_preview.png", path: "/host/dir/folder_preview.png", isDirectory: false },
      { name: "a.png", path: "/host/dir/a.png", isDirectory: false },
    ],
  });
  const { result } = renderHook(() => useFolderPreview("/host/dir", svc));
  await waitFor(() => expect(result.current).toBe("/host/dir/folder_preview.png"));
});
```

- [ ] **Step 2: Verify test fails**

Run: `bun run test -- src/function/widget/utility/directory-browser/hooks/useFolderPreview.test.ts`
Expected: compile error.

- [ ] **Step 3: Implement useFolderPreview**

```typescript
// useFolderPreview.ts
import { useEffect, useState } from "react";
import type { FileBrowserService } from "@/management/storage/file-browser-service";

export function useFolderPreview(dirPath: string, service: FileBrowserService | null): string | null {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!service || dirPath.trim() === "") { setPreview(null); return; }
    let cancelled = false;
    service.listDirectory(dirPath).then((entries) => {
      if (cancelled) return;
      const hit = entries.find((e) => !e.isDirectory && e.name.toLowerCase() === "folder_preview.png");
      setPreview(hit?.path ?? null);
    }).catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [dirPath, service]);
  return preview;
}
```

- [ ] **Step 4: Verify test passes**

Run: `bun run test -- src/function/widget/utility/directory-browser/hooks/useFolderPreview.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate useThumbnail + useFolderPreview into Chrome body**

`DirectoryBrowserChrome.tsx` の icon tile renderer で、`entry.fileType` に応じて分岐:
- `directory` かつ `folderPreview !== null` → `<img src={toFileUrl(folderPreview)}>`
- そうでない → `<ThumbnailTile entry={entry} />` (新 component)

新 component `ThumbnailTile.tsx`:

```typescript
import { useThumbnail } from "./hooks/useThumbnail";

export function ThumbnailTile({ entry }: { entry: FileBrowserEntry }) {
  const { staticUrl, animatedUrl, status } = useThumbnail(entry);
  if (!staticUrl) {
    return <div className="bg-muted h-full w-full" aria-label={entry.name} />;
  }
  return (
    <div className="group relative h-full w-full">
      <img src={staticUrl} className={`absolute inset-0 h-full w-full object-contain transition-opacity ${animatedUrl ? "group-hover:opacity-0" : ""}`} alt={entry.name} />
      {animatedUrl && <img src={animatedUrl} className="absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity group-hover:opacity-100" alt="" />}
    </div>
  );
}
```

- [ ] **Step 6: Verify directory-browser tests still pass**

Run: `bun run test -- src/function/widget/utility/directory-browser/`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add src/function/widget/utility/directory-browser
git commit -m "feat(directory-browser): integrate useThumbnail + folder_preview.png + CSS hover"
```

---

### Task THB-I18N-001: 10 locale parity for thumbnail keys

**Files:**
- Modify: `src/shared/i18n/locales/en/widgets.json`
- Modify: `src/shared/i18n/locales/ja/widgets.json` ... 9 more locales (de/fr/es/it/ko/pt/ru/zh)

**Interfaces:**
- Produces: 新規キー `directoryBrowser.thumbnail.loading` / `directoryBrowser.thumbnail.error` を全 10 locale に追加。

- [ ] **Step 1: Add keys to en**

```json
"directoryBrowser": {
  ...existing,
  "thumbnail": {
    "loading": "Loading preview...",
    "error": "Preview unavailable"
  }
}
```

- [ ] **Step 2: Translate to 9 other locales**

`ja`: `読み込み中...` / `プレビューを表示できません`
`de`: `Vorschau wird geladen...` / `Vorschau nicht verfügbar`
`fr`: `Chargement de l'aperçu...` / `Aperçu indisponible`
`es`: `Cargando vista previa...` / `Vista previa no disponible`
`it`: `Caricamento anteprima...` / `Anteprima non disponibile`
`ko`: `미리보기 로드 중...` / `미리보기 사용 불가`
`pt`: `Carregando pré-visualização...` / `Pré-visualização indisponível`
`ru`: `Загрузка предпросмотра...` / `Предпросмотр недоступен`
`zh`: `正在加载预览...` / `预览不可用`

- [ ] **Step 3: Verify i18n parity check**

Run: `bun run scripts/check/check-i18n-locale-coverage.ts`
Expected: PASS (10/10 parity)

- [ ] **Step 4: Commit**

```bash
git add src/shared/i18n/locales
git commit -m "i18n(thumbnails): add loading / error keys to 10 locales"
```

---

### Task THB-E2E-001: cep-host-verification scenario + ci green

**Files:**
- Modify: `.claude/skills/cep-host-verification/SKILL.md` (シナリオ追加)
- Modify: `.claude/skills/cep-host-verification/scenarios/browse-with-thumbnails.md` (新規)

**Interfaces:**
- Produces: "Browse a directory with mixed media; verify thumbnails; verify hover GIF plays original animation" シナリオ。

- [ ] **Step 1: Write scenario document**

`.claude/skills/cep-host-verification/scenarios/browse-with-thumbnails.md`:

```markdown
# Browse with thumbnails

## Pre-conditions

- AE が起動済み
- CEP panel が dev install 済み
- テスト用 fixture directory: `/host/fixtures/thumbnails/` に
  `image.png`, `animated.gif`, `sequence/0001.png ... 0010.png`,
  `doc.txt`, `font.otf`, `movie.mp4` (movie は sibling 画像へ
  フォールバックすることを確認) が配置済み

## Steps

1. panel を reload
2. directory browser を fixture directory に向ける
3. 検証項目
   - `image.png` の tile に webp thumbnail が表示される
   - `animated.gif` を hover すると元 GIF が再生される
   - `sequence/` の tile を hover すると 4-8 フレームが keyframes で
     ローテーションする
   - `doc.txt` の tile に monospace テキストプレビュー webp が表示される
   - `font.otf` の tile に AaBb の webp が表示される
   - `movie.mp4` の tile に sibling image (`movie.png` 同梱時) または
     generic icon が表示される
4. managed root を意図的に解決不能にして再起動、TEMP fallback で thumbnail が
   書かれることを確認

## Evidence

- スクリーンショット: `docs/architecture/runtime/_evidence/browse-with-thumbnails/<run-id>/`
- `bun run ci` の green log
```

- [ ] **Step 2: Run bun run ci locally**

Run: `bun run ci`
Expected: PASS (lint + build + es3 + bundle-size + typecheck + test + rust + knip + react-doctor)

- [ ] **Step 3: Run AE dev install + scenario**

Run: `bun run host:deploy` → `bun run live` → scenario を手動実行。
Evidence を `.claude/skills/cep-host-verification/scenarios/evidence/` に保存。

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/cep-host-verification
git commit -m "docs(cep-host-verification): add browse-with-thumbnails E2E scenario"
```

---

## Self-Review

### Spec coverage

| Spec section | Task |
| --- | --- |
| §スコープ (生成対象 table) | THB-IMG-001 (image), THB-ANIM-001 (gif/svg), THB-SEQ-001 (image-sequence), THB-FONT-001 (font), THB-TEXT-001 (text) |
| §スコープ (v1 で外す type) | THB-PIPE-001 (sibling fallback path 経由) |
| §folder_preview.png | THB-UI-001 (useFolderPreview + ディレクトリ限定) |
| §アーキテクチャ | THB-WIRE-001, THB-WIRE-002, THB-PIPE-001 |
| §所有境界 | 各 task の Files / Interfaces 節に固定 |
| §cache root 選択 | THB-CACHE-001 |
| §パスレイアウト | THB-CACHE-001 + THB-PIPE-001 |
| §cache key と無効化 | THB-PIPE-001 |
| §Resize / fit ポリシー | THB-IMG-001 (fit_to_thumbnail) + THB-PIPE-001 (THUMBNAIL_MAX_SIDE) |
| §wire 契約 | THB-WIRE-001 (Rust), THB-WIRE-002 (TS) |
| §パネル側フック | THB-HOOK-001 |
| §hover 時の挙動 | THB-UI-001 (CSS opacity swap) |
| §エラーハンドリング | THB-PIPE-001 (sibling fallback), THB-HOOK-001 (error status) |
| §Eviction | v1 上限なし、ADR-003 で v2 送り |
| §テスト | THB-CACHE-001, THB-IMG-001, THB-ANIM-001, THB-SEQ-001, THB-FONT-001, THB-TEXT-001, THB-PIPE-001, THB-HOOK-001, THB-E2E-001 |
| §受け入れ条件 1 (ci green) | THB-E2E-001 Step 2 |
| §受け入れ条件 2 (AE 実機) | THB-E2E-001 Step 3 |
| §受け入れ条件 3 (hover GIF) | THB-E2E-001 Step 3.hover |
| §受け入れ条件 4 (TEMP fallback) | THB-E2E-001 Step 3.managed-unavailable |
| §受け入れ条件 5 (i18n) | THB-I18N-001 |
| §受け入れ条件 6 (bundle-size) | THB-E2E-001 Step 2 |

### Placeholder scan

- "TODO", "TBD" 無しの見込み
- snapshot test の `<EXPECTED_HASH>` は初回実行で取得する旨を明記 (固定値ではない)

### Type consistency

- `ThumbnailRequest` (Rust) ↔ `LookupThumbnailRequest` / `GenerateThumbnailRequest` (TS) のフィールド名は spec と一致
- `ThumbnailResult.cache_path` ↔ `LookupThumbnailResponse.cachePath` ↔ `GenerateThumbnailResponse.cachePath`
- `inflight` Map の key 形式 `${path}@${mtime}@${size}@${type}` は Rust 側 `(sha8, mtimeMs, sizeBytes)` とは独立した React 側 dedup キー (Rust 側の 3-tuple とは別概念)
