//! Thumbnail pipeline: cache layout, decoding, rendering, and pipeline
//! orchestration.
//!
//! Modules:
//! - [`cache_root`]: cache root resolution and filesystem path layout.
//! - [`decode`]: still-image / animated / SVG / font / text decoders.
//! - [`meta`]: meta-marker JSON I/O used for cache hit detection.
//! - [`pipeline`]: end-to-end orchestration (lookup → generate → persist).

pub mod cache_root;
pub mod decode;
pub mod meta;
pub mod pipeline;

pub use cache_root::{
    cache_key, resolve_cache_root, source_dir, thumbnail_dir, CacheRootResolution,
};
pub use meta::{read_meta, write_meta, MetaError, MetaMarker};

#[cfg(test)]
mod test_fixtures;
