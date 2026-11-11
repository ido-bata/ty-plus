//! ty-plus binary entry point.
//!
//! This file is intentionally thin. Its responsibilities are:
//!   1. Parse CLI args via [`clap`].
//!   2. Dispatch to a subcommand in [`commands`].
//!   3. Convert the subcommand's `Result<Envelope<_>, TyPlusError>` into a
//!      JSON envelope on stdout + the right exit code.
//!
//! All actual logic lives in the workspace's domain crates
//! (`ty-plus-host`, `ty-plus-storage`, etc.) so the binary stays small and
//! the logic stays testable.

#![deny(unsafe_code)]

mod commands;
mod output;

use clap::{Parser, Subcommand};

use ty_plus_core::error::TyPlusResult;
use ty_plus_core::json::Envelope;

/// Top-level CLI shape. Adding a new subcommand means:
///   1. Add a variant to [`CliCommand`] below.
///   2. Add the variant's clap attributes.
///   3. Add a match arm in [`dispatch`] that calls `commands::<name>::run(...)`.
///   4. Create `commands/<name>.rs` with a
///      `run(...) -> TyPlusResult<Envelope<serde_json::Value>>`.
#[derive(Parser, Debug)]
#[command(name = "ty-plus", version, about = "ty-plus host helper CLI", long_about = None)]
struct Cli {
    /// Path to the After Effects install folder. Overrides
    /// `AE_INSTALL_PATH` and registry/Applications discovery. Useful for
    /// dev builds that point at a custom AE install.
    #[arg(long, env = "AE_INSTALL_PATH", global = true)]
    app_root: Option<std::path::PathBuf>,

    /// Subcommand to run. See `ty-plus <subcommand> --help`.
    #[command(subcommand)]
    command: CliCommand,
}

#[derive(Subcommand, Debug)]
enum CliCommand {
    /// Print the discovered After Effects install path. The first command
    /// we ship — it lets the panel drop an ExtendScript call on startup.
    #[command(visible_alias = "ar")]
    AppRoot,

    /// Print the CLI version and exit.
    Version,

    /// Placeholder for future `plugin scan <root>` subcommand.
    #[command(hide = true)]
    PluginScan {
        /// Plugin root to scan (e.g. `<appRoot>/Plug-ins/Effects`).
        root: std::path::PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();

    let result = dispatch(&cli);

    // Convert any error into a JSON envelope at the boundary so we never
    // crash mid-print. `Envelope::err` returns `Envelope<()>` but we need
    // `Envelope<serde_json::Value>` for the output writer — convert by
    // re-shaping into `Value::Null` for the data slot.
    let (envelope, exit_code) = match result {
        Ok(env) => (env, 0),
        Err(err) => {
            let exit_code = err.exit_code();
            let mut err_env: Envelope<serde_json::Value> = Envelope {
                ok: false,
                version: ty_plus_core::CLI_VERSION,
                data: None,
                warnings: Vec::new(),
                error: Some(ty_plus_core::json::ErrorBody {
                    code: err.code().to_string(),
                    message: err.to_string(),
                }),
            };
            // Sanity: ensure ok stays false even after manual construction.
            err_env.ok = false;
            (err_env, exit_code)
        }
    };

    output::write_envelope(&envelope);
    std::process::exit(exit_code);
}

fn dispatch(cli: &Cli) -> TyPlusResult<Envelope<serde_json::Value>> {
    let app_root = cli.app_root.clone();
    let env_value = std::env::var("AE_INSTALL_PATH").ok();

    match &cli.command {
        CliCommand::AppRoot => commands::app_root::run(app_root.as_deref(), env_value.as_deref()),
        CliCommand::Version => Ok(Envelope::ok(serde_json::json!({
            "version": ty_plus_core::CLI_VERSION,
        }))),
        CliCommand::PluginScan { root } => commands::plugin_scan_stub::run(root),
    }
}
