//! `ty-plus app-root` — print the discovered After Effects install path.
//!
//! This is the first working subcommand. It replaces the ExtendScript call
//! at `src/management/setting/onboarding/initialization.ts:39-65` with a
//! Rust read of either:
//!   - the `--app-root` CLI flag,
//!   - the `AE_INSTALL_PATH` env var, or
//!   - the Windows registry / macOS /Applications entry.
//!
//! The returned envelope shape (the `data` field) is the JSON contract the
//! panel reads. Bumping this requires bumping `CLI_VERSION` and a panel-side
//! update.

use std::path::Path;

use ty_plus_core::error::TyPlusResult;
use ty_plus_core::json::Envelope;
use ty_plus_host::{find_app_root_with, AppRootSource};

pub fn run(
    cli_override: Option<&Path>,
    env_override: Option<&str>,
) -> TyPlusResult<Envelope<serde_json::Value>> {
    let candidate = find_app_root_with(cli_override, env_override)?;

    // Build the JSON shape directly so the binary's dispatch stays uniform.
    // Field names are the contract; do not rename without bumping
    // `CLI_VERSION` and updating the panel's reader.
    let mut data = serde_json::json!({
        "appRoot": candidate.path.to_string_lossy(),
        "source": candidate.source,
    });
    if let Some(version) = candidate.version {
        data["version"] = serde_json::json!(version);
    }
    Ok(Envelope::ok(data))
}

// `AppRootSource` is part of the public envelope; keep the import in scope
// so its `Serialize` derive participates in the JSON shape.
const _: Option<AppRootSource> = None;
