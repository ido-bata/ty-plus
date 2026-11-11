use super::{cache_key, resolve_cache_root, source_dir, thumbnail_dir, CacheRootResolution};
use crate::test_support::FakeSessionContext;
use std::path::{Path, PathBuf};

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
fn source_dir_uses_cache_key_as_subdirectory() {
    let cache_root = Path::new("/host/managed");
    let td = thumbnail_dir(cache_root);
    let normalized = "/Users/Foo/Bar.PNG";
    let sd = source_dir(&td, normalized);
    let expected_key = cache_key(normalized);
    assert_eq!(sd, td.join(&expected_key));
    assert_eq!(expected_key.len(), 8);
}

#[test]
fn cache_key_is_lowercase_8hex_of_sha256() {
    let k = cache_key("/Users/Foo/Bar.PNG");
    assert_eq!(k.len(), 8);
    assert!(k
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
}

#[test]
fn cache_key_is_stable_across_calls() {
    let a = cache_key("/Users/Foo/Bar.PNG");
    let b = cache_key("/Users/Foo/Bar.PNG");
    assert_eq!(a, b);
}

#[test]
fn cache_key_differs_for_different_inputs() {
    let a = cache_key("/Users/Foo/Bar.PNG");
    let b = cache_key("/Users/Foo/Bar.png");
    assert_ne!(a, b);
}
