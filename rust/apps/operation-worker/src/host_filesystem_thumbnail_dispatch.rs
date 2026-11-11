//! Host thumbnail pipeline adapters.
//!
//! Wires `HostThumbnailLookup` / `HostThumbnailGenerate` IPC methods to
//! `ty_plus_host_filesystem::thumbnails::pipeline::lookup_or_generate`. Both
//! methods share the same wire shape and the same backing pipeline; the
//! difference is whether the panel asks the worker to consult the cache
//! only (lookup) or unconditionally generate (generate).
//!
//! See THB-WIRE-001 for the request/response shape and THB-CACHE-001 /
//! THB-PIPE-001 for the on-disk cache layout.

use std::path::PathBuf;

use ty_plus_host_filesystem::{
    context::SessionContext,
    thumbnails::{
        cache_root::{CacheRootResolution, resolve_cache_root, source_dir, thumbnail_dir},
        meta::read_meta,
        pipeline::{PipelineError, ThumbnailKind, ThumbnailRequest, lookup_or_generate},
    },
};
use ty_plus_protocol::{
    BatchThumbnailRequest, BatchThumbnailResponse, BatchThumbnailResult, GenerateThumbnailRequest,
    GenerateThumbnailResponse, LookupOrGenerateThumbnailRequest, LookupOrGenerateThumbnailResponse,
    LookupThumbnailRequest, LookupThumbnailResponse, RequestEnvelope,
};

/// Sentinel mtime that the dispatcher treats as "unknown".
///
/// `ThumbnailRequest.mtime_ms` is `i64` (Unix epoch ms); the TS panel
/// hook feeds `Date.parse(entry.modifiedAt)` which yields `NaN` for
/// missing values, and `Date.parse(NaN)` is `NaN`. The wire encoder
/// then writes `0`. The cache meta marker requires a meaningful mtime,
/// so we surface a clear error instead of silently caching forever.
const MISSING_MTIME_MS: i64 = 0;

/// Dispatches a `host.thumbnail.lookup` request.
///
/// Resolves the cache root from the request's `host_context` and
/// consults the meta marker directly — lookup is cache-only and does
/// **not** trigger generation. Returns `cache_path: Some(_)` only when
/// the cache already holds a thumbnail whose meta marker matches the
/// request's `(mtime, size)` triple; returns `cache_path: None` for a
/// miss so the panel can route to a subsequent `generate` call.
pub fn dispatch_thumbnail_lookup_for_request(
    request: &RequestEnvelope,
    thumbnail_request: LookupThumbnailRequest,
) -> Result<LookupThumbnailResponse, HostFilesystemThumbnailError> {
    let validated = validate(&thumbnail_request)?;
    let ctx = SessionContext::new(non_empty_path(&request.context.host_context.app_root));
    let (cache_root, _sdir, _stem) = resolve_paths(&validated, &ctx)?;
    let cache_file = cache_file_path(&validated, &cache_root);
    if !cache_file.exists() {
        return Ok(LookupThumbnailResponse {
            cache_path: None,
            animated_source_path: None,
        });
    }
    let stem = stem_of(&validated.source_path);
    let sdir = source_dir(&thumbnail_dir(&cache_root), &validated.source_path);
    let meta = read_meta(&sdir, &stem).map_err(HostFilesystemThumbnailError::Meta)?;
    if let Some(meta) = meta {
        if meta.source_mtime_ms == validated.mtime_ms
            && meta.source_size_bytes == validated.size_bytes
        {
            return Ok(LookupThumbnailResponse {
                cache_path: Some(path_to_string(&cache_file)),
                animated_source_path: animated_source(&validated).as_deref().map(path_to_string),
            });
        }
    }
    Ok(LookupThumbnailResponse {
        cache_path: None,
        animated_source_path: None,
    })
}

/// Dispatches a `host.thumbnail.generate` request.
///
/// Always populates the cache: if a matching entry is already on disk
/// it is returned unchanged (idempotent over `(mtime, size)`),
/// otherwise the pipeline decodes + resizes + encodes a new WebP
/// thumbnail and writes the meta marker.
pub fn dispatch_thumbnail_generate_for_request(
    request: &RequestEnvelope,
    thumbnail_request: GenerateThumbnailRequest,
) -> Result<GenerateThumbnailResponse, HostFilesystemThumbnailError> {
    let validated = validate(&thumbnail_request)?;
    let ctx = SessionContext::new(non_empty_path(&request.context.host_context.app_root));
    let result = block_on(lookup_or_generate(validated, &ctx))?;
    Ok(GenerateThumbnailResponse {
        cache_path: path_to_string(&result.cache_path),
        animated_source_path: result.animated_source_path.as_deref().map(path_to_string),
    })
}

/// Dispatches a `host.thumbnail.lookup_or_generate` request.
///
/// Accepts any of `host.thumbnail.lookup`, `host.thumbnail.generate`, or
/// `host.thumbnail.lookup_or_generate` wire methods. All three are handled
/// identically via `lookup_or_generate` which performs cache check first,
/// then generation on miss (THB-WIRE-002).
pub fn dispatch_thumbnail_lookup_or_generate_for_request(
    request: &RequestEnvelope,
    payload: LookupOrGenerateThumbnailRequest,
) -> Result<LookupOrGenerateThumbnailResponse, HostFilesystemThumbnailError> {
    let validated = validate(&payload)?;
    let ctx = SessionContext::new(non_empty_path(&request.context.host_context.app_root));
    let result = block_on(lookup_or_generate(validated, &ctx))?;
    Ok(LookupOrGenerateThumbnailResponse {
        cache_path: path_to_string(&result.cache_path),
        animated_source_path: result.animated_source_path.as_deref().map(path_to_string),
    })
}

/// Dispatches a batch of thumbnail requests sequentially.
///
/// Results maintain input order. Each request reuses the same session
/// context constructed from the host context.
pub fn dispatch_thumbnail_batch_for_request(
    request: &RequestEnvelope,
    batch: BatchThumbnailRequest,
) -> Result<BatchThumbnailResponse, HostFilesystemThumbnailError> {
    let ctx = SessionContext::new(non_empty_path(&request.context.host_context.app_root));
    let results: Vec<BatchThumbnailResult> = batch
        .requests
        .into_iter()
        .map(|item| match validate(&item) {
            Ok(validated) => match block_on(lookup_or_generate(validated, &ctx)) {
                Ok(result) => BatchThumbnailResult {
                    cache_path: Some(path_to_string(&result.cache_path)),
                    animated_source_path: result
                        .animated_source_path
                        .as_deref()
                        .map(path_to_string),
                    error: None,
                },
                Err(error) => BatchThumbnailResult {
                    cache_path: None,
                    animated_source_path: None,
                    error: Some(error.to_string()),
                },
            },
            Err(error) => BatchThumbnailResult {
                cache_path: None,
                animated_source_path: None,
                error: Some(error.to_string()),
            },
        })
        .collect();
    Ok(BatchThumbnailResponse { results })
}

fn validate(
    req: &(impl ThumbnailRequestLike + ?Sized),
) -> Result<ThumbnailRequest, HostFilesystemThumbnailError> {
    if req.source_path().trim().is_empty() {
        return Err(HostFilesystemThumbnailError::InvalidRequest(
            "source_path must not be empty",
        ));
    }
    if req.mtime_ms() == MISSING_MTIME_MS {
        return Err(HostFilesystemThumbnailError::InvalidRequest(
            "mtime_ms must be a non-zero Unix epoch ms value",
        ));
    }
    Ok(ThumbnailRequest {
        source_path: req.source_path().to_owned(),
        mtime_ms: req.mtime_ms(),
        size_bytes: req.size_bytes(),
        file_type: req.file_type().to_owned(),
    })
}

fn resolve_paths(
    req: &ThumbnailRequest,
    ctx: &SessionContext,
) -> Result<(PathBuf, PathBuf, String), HostFilesystemThumbnailError> {
    let resolved = resolve_cache_root(ctx);
    let cache_root = match resolved {
        CacheRootResolution::Managed(p) | CacheRootResolution::TempFallback(p) => p,
    };
    let tdir = thumbnail_dir(&cache_root);
    let sdir = source_dir(&tdir, &req.source_path);
    let stem = stem_of(&req.source_path);
    Ok((cache_root, sdir, stem))
}

fn cache_file_path(req: &ThumbnailRequest, cache_root: &std::path::Path) -> PathBuf {
    let tdir = thumbnail_dir(cache_root);
    let sdir = source_dir(&tdir, &req.source_path);
    let stem = stem_of(&req.source_path);
    sdir.join(format!("{stem}.webp"))
}

fn animated_source(req: &ThumbnailRequest) -> Option<PathBuf> {
    let lower = req.source_path.to_lowercase();
    if lower.ends_with(".gif") || lower.ends_with(".svg") {
        Some(PathBuf::from(&req.source_path))
    } else {
        None
    }
}

fn non_empty_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

fn path_to_string(p: &std::path::Path) -> String {
    p.to_string_lossy().into_owned()
}

/// `Some(_)` for sources the UI should hand to its animated viewer
/// (GIF/SVG); `None` otherwise. Mirrors the pipeline's classification
/// so the lookup and generate responses stay aligned.
#[allow(dead_code)]
fn kind_for(req: &ThumbnailRequest) -> ThumbnailKind {
    if req.file_type == "image-sequence" {
        ThumbnailKind::StaticAndFrames(8)
    } else if req.file_type == "svg" {
        ThumbnailKind::SvgPassthrough
    } else {
        ThumbnailKind::Static
    }
}

/// Extract the file stem (the final path segment without its extension).
fn stem_of(p: &str) -> String {
    let normalized = p.replace('\\', "/");
    let seg = normalized.split('/').next_back().unwrap_or(p);
    let dot = seg.rfind('.').unwrap_or(seg.len());
    seg[..dot].to_string()
}

/// Run an async future to completion on the current thread.
///
/// We deliberately avoid pulling `tokio` / `futures-executor` into the
/// worker manifest just for one call: `lookup_or_generate` has no
/// `.await` points in its current shape, so a noop-waker block_on is
/// sufficient and keeps the dependency footprint flat.
fn block_on<F: std::future::Future>(future: F) -> F::Output {
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll, Wake, Waker};

    struct NoopWake {
        signaled: Mutex<bool>,
    }
    impl Wake for NoopWake {
        fn wake(self: Arc<Self>) {
            *self.signaled.lock().expect("wake lock") = true;
        }
        fn wake_by_ref(self: &Arc<Self>) {
            *self.signaled.lock().expect("wake lock") = true;
        }
    }

    let wake = Arc::new(NoopWake {
        signaled: Mutex::new(false),
    });
    let waker: Waker = wake.clone().into();
    let mut cx = Context::from_waker(&waker);
    let mut future = Box::pin(future);
    loop {
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(value) => return value,
            Poll::Pending => {
                if *wake.signaled.lock().expect("wake lock") {
                    continue;
                }
                std::thread::yield_now();
            }
        }
    }
}

/// Errors surfaced by the thumbnail dispatch.
#[derive(Debug)]
pub enum HostFilesystemThumbnailError {
    /// The request payload failed structural validation (missing
    /// `source_path`, zero `mtime_ms`, ...).
    InvalidRequest(&'static str),
    /// The thumbnail pipeline returned an error.
    Pipeline(PipelineError),
    /// Reading the cache meta marker failed for an unexpected reason.
    Meta(ty_plus_host_filesystem::thumbnails::meta::MetaError),
}

impl std::fmt::Display for HostFilesystemThumbnailError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(detail) => write!(f, "invalid thumbnail request: {detail}"),
            Self::Pipeline(error) => write!(f, "thumbnail pipeline failed: {error}"),
            Self::Meta(error) => write!(f, "thumbnail cache meta read failed: {error}"),
        }
    }
}

impl std::error::Error for HostFilesystemThumbnailError {}

impl From<PipelineError> for HostFilesystemThumbnailError {
    fn from(error: PipelineError) -> Self {
        Self::Pipeline(error)
    }
}

/// Internal trait used by [`validate`] so the dispatch helpers for
/// `Lookup` and `Generate` can share the validation / context-building
/// path even though the two request types are distinct protocol
/// messages.
trait ThumbnailRequestLike {
    fn source_path(&self) -> &str;
    fn mtime_ms(&self) -> i64;
    fn size_bytes(&self) -> u64;
    fn file_type(&self) -> &str;
}

impl ThumbnailRequestLike for LookupThumbnailRequest {
    fn source_path(&self) -> &str {
        &self.source_path
    }
    fn mtime_ms(&self) -> i64 {
        self.mtime_ms
    }
    fn size_bytes(&self) -> u64 {
        self.size_bytes
    }
    fn file_type(&self) -> &str {
        &self.file_type
    }
}

impl ThumbnailRequestLike for GenerateThumbnailRequest {
    fn source_path(&self) -> &str {
        &self.source_path
    }
    fn mtime_ms(&self) -> i64 {
        self.mtime_ms
    }
    fn size_bytes(&self) -> u64 {
        self.size_bytes
    }
    fn file_type(&self) -> &str {
        &self.file_type
    }
}

impl ThumbnailRequestLike for LookupOrGenerateThumbnailRequest {
    fn source_path(&self) -> &str {
        &self.source_path
    }
    fn mtime_ms(&self) -> i64 {
        self.mtime_ms
    }
    fn size_bytes(&self) -> u64 {
        self.size_bytes
    }
    fn file_type(&self) -> &str {
        &self.file_type
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ty_plus_protocol::{HostContext, InvocationContext, ManagedRootContext, RequestMetadata};

    fn make_request(app_root: String) -> RequestEnvelope {
        let host = HostContext {
            app_root,
            support_root: "/host/support".into(),
            session_id: "session-test".into(),
        };
        let context = InvocationContext {
            host_context: host,
            managed_root: ManagedRootContext::SessionDefault,
        };
        RequestEnvelope {
            protocol_version: ty_plus_protocol::CURRENT_PROTOCOL_VERSION,
            metadata: RequestMetadata {
                request_id: ty_plus_protocol::RequestId::parse("test-request").unwrap(),
                session_id: ty_plus_protocol::SessionId::parse("session-test").unwrap(),
                deadline_unix_ms: ty_plus_protocol::DeadlineUnixMs::new(u64::MAX),
                cancellable: true,
                idempotency_key: None,
            },
            context,
            method: ty_plus_protocol::MethodName::parse("host.thumbnail.generate").unwrap(),
            payload: serde_json::Value::Null,
        }
    }

    #[test]
    fn rejects_empty_source_path() {
        let req = make_request("/host".into());
        let lookup = LookupThumbnailRequest {
            source_path: "".into(),
            mtime_ms: 1,
            size_bytes: 0,
            file_type: "image".into(),
        };
        let err = dispatch_thumbnail_lookup_for_request(&req, lookup).unwrap_err();
        assert!(matches!(
            err,
            HostFilesystemThumbnailError::InvalidRequest(_)
        ));
    }

    #[test]
    fn rejects_zero_mtime() {
        let req = make_request("/host".into());
        let generate = GenerateThumbnailRequest {
            source_path: "/host/foo.png".into(),
            mtime_ms: 0,
            size_bytes: 1,
            file_type: "image".into(),
        };
        let err = dispatch_thumbnail_generate_for_request(&req, generate).unwrap_err();
        assert!(matches!(
            err,
            HostFilesystemThumbnailError::InvalidRequest(_)
        ));
    }

    #[test]
    fn rejects_whitespace_source_path() {
        let req = make_request("/host".into());
        let lookup = LookupThumbnailRequest {
            source_path: "   ".into(),
            mtime_ms: 1,
            size_bytes: 0,
            file_type: "image".into(),
        };
        let err = dispatch_thumbnail_lookup_for_request(&req, lookup).unwrap_err();
        assert!(matches!(
            err,
            HostFilesystemThumbnailError::InvalidRequest(_)
        ));
    }
}
