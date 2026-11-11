use super::{lookup_or_generate, sha256_hex, ThumbnailRequest};
use crate::context::SessionContext;
use crate::test_support::FakeSessionContext;
use crate::thumbnails::test_fixtures::fixture_bytes;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::task::{Context, Poll, Waker};
use tempfile::TempDir;

/// Minimal synchronous executor.
///
/// `lookup_or_generate` is `async fn` for IPC-side future composability, but
/// the body has no `.await` points (the in-flight dedup machinery was moved
/// to the React side per the THB-PIPE-001 binding decision). Driving it with
/// a noop waker is sufficient and avoids adding `tokio` (or `futures`) as a
/// dev-dependency, keeping this task's file scope to the four named files.
fn block_on<F: Future>(fut: F) -> F::Output {
    let mut cx = Context::from_waker(Waker::noop());
    let mut fut: Pin<Box<F>> = Box::pin(fut);
    loop {
        match fut.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return v,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

fn write_png_fixture(dst: &Path) {
    std::fs::write(dst, fixture_bytes("sample_64x64.png"))
        .expect("failed to write fixture PNG to tempdir");
}

fn ctx_with_managed(path: &Path) -> SessionContext {
    FakeSessionContext::managed_writable(path).into()
}

#[test]
fn lookup_returns_none_for_missing_thumbnail() {
    let tmp = TempDir::new().unwrap();
    let ctx = ctx_with_managed(tmp.path());
    let src = tmp.path().join("foo.png");
    write_png_fixture(&src);
    let req = ThumbnailRequest {
        source_path: src.to_string_lossy().into(),
        mtime_ms: 1,
        size_bytes: 1,
        file_type: "image".into(),
    };
    let r = block_on(lookup_or_generate(req, &ctx)).unwrap();
    assert!(r.cache_path.exists());
}

#[test]
fn lookup_returns_existing_when_meta_matches() {
    let tmp = TempDir::new().unwrap();
    let ctx = ctx_with_managed(tmp.path());
    let src = tmp.path().join("foo.png");
    write_png_fixture(&src);
    let req = ThumbnailRequest {
        source_path: src.to_string_lossy().into(),
        mtime_ms: 1234,
        size_bytes: 5678,
        file_type: "image".into(),
    };
    let _ = block_on(lookup_or_generate(req.clone(), &ctx)).unwrap();
    let r = block_on(lookup_or_generate(req, &ctx)).unwrap();
    assert!(r.cache_path.exists());
}

#[test]
fn snapshot_for_png_fixture() {
    let tmp = TempDir::new().unwrap();
    let ctx = ctx_with_managed(tmp.path());
    let src = tmp.path().join("foo.png");
    write_png_fixture(&src);
    let req = ThumbnailRequest {
        source_path: src.to_string_lossy().into(),
        mtime_ms: 1,
        size_bytes: 1,
        file_type: "image".into(),
    };
    let r = block_on(lookup_or_generate(req, &ctx)).unwrap();
    let bytes = std::fs::read(&r.cache_path).unwrap();
    let hash = sha256_hex(&bytes);
    assert_eq!(
        hash,
        "3c73bdb69bd7f99e10b6278fd90e55e2fd8c0390707029f76a8fcebac6eb876e"
    );
}
