//! Subcommand implementations. Each module owns one subcommand and
//! implements `run(...)` returning `Envelope<T>`. The data type `T` is the
//! subcommand-specific payload that the panel reads.

pub mod app_root;
pub mod plugin_scan_stub;
