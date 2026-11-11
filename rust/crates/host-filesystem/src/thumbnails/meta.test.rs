use super::{read_meta, write_meta, MetaMarker};
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
    assert_eq!(got.source_sha256_hex, m.source_sha256_hex);
    assert_eq!(got.generated_at, m.generated_at);
}

#[test]
fn read_returns_none_when_missing() {
    let tmp = TempDir::new().unwrap();
    assert!(read_meta(tmp.path(), "missing").unwrap().is_none());
}

#[test]
fn read_propagates_io_errors() {
    let tmp = TempDir::new().unwrap();
    // Replace the directory with a regular file so read_meta can't stat
    // the meta path as a missing file and is forced into the read branch
    // where it must surface the underlying error rather than swallow it.
    let meta = tmp.path().join("blocked.meta.json");
    std::fs::write(&meta, b"not-json").unwrap();
    let err = read_meta(tmp.path(), "blocked").unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("json"),
        "expected JSON decode error, got: {msg}"
    );
}

#[test]
fn meta_file_lives_next_to_stem_with_meta_json_suffix() {
    let tmp = TempDir::new().unwrap();
    let m = MetaMarker {
        source_mtime_ms: 0,
        source_size_bytes: 0,
        source_sha256_hex: String::new(),
        generated_at: String::new(),
    };
    write_meta(tmp.path(), "stem", &m).unwrap();
    assert!(tmp.path().join("stem.meta.json").exists());
}
