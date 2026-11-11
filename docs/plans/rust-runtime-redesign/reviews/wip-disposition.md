# WIP disposition audit

> Scope: `FND-001`–`FND-005` input. This is an audit record, not canonical architecture. All inspected source/WIP files remained read-only.

## Decision rules

- `preserve`: keep the existing user or plan change intact; this audit does not absorb it into a redesign commit.
- `reuse-rewrite`: retain only the named idea or convention, then implement it at the target path under the target task. Do not move the file wholesale.
- `delete`: the file or added slice encodes a rejected design; delete only at the named gate, after its replacement exists where required.
- `defer`: no safe product decision can be made in Foundation; the named task owns the later decision.
- `appRoot` has one product source: ExtendScript `app.path`, registered as immutable per-session host context. Registry, `/Applications`, `AE_INSTALL_PATH`, `--app-root`, highest-version selection, and process-global discovery are prohibited.
- The target is a shared, on-demand, single-instance companion runtime. A stateless command-per-spawn CLI, stdout protocol, hidden subcommands, or automatic ExtendScript fallback is not an intermediate product boundary.

## Blocking findings

1. `docs/architecture/runtime/host-boundary.md:50-104`, `tools/ty-plus-cli/README.md`, `crates/cli/src/main.rs`, and `crates/cli/src/output.rs` all define a stateless, per-invocation CLI. This conflicts with the accepted companion-runtime lifecycle, multi-surface sessions, cancellation, shared locks, progress, and connection reuse. `FND-005` must treat this as a replacement, not an incremental extension.
2. `crates/host/src/app_root.rs`, `crates/cli/src/commands/app_root.rs`, and the global CLI flags discover or override `appRoot` from the Windows registry, `/Applications`, `AE_INSTALL_PATH`, or `--app-root`. They also select one “best” AE installation. This violates the sole-source rule and breaks simultaneous AE-version sessions. The discovery code and its tests are deletion-only material under `FND-004` / `HFS-013`.
3. `scripts/package/package-cep-archive.ts` succeeds when either binary is missing and explicitly promises an ExtendScript fallback. `PKG-004` instead requires runtime and worker artifacts for both Windows and macOS and a hard failure on absence.
4. `scripts/build/build-cli.ts` claims a universal macOS artifact but defines only `aarch64-apple-darwin`; it neither builds `x86_64-apple-darwin` nor combines slices. It also builds no elevated worker. Preserve only its fail-fast command wrapper and staging intent for `PKG-002`.
5. `scripts/package/sign-cli.ts` is macOS-only and exits successfully when signing is disabled or run on Windows. It cannot satisfy the paired Windows/macOS release gate in `PKG-005`; signing/notarization must be rebuilt around runtime plus worker artifacts.
6. `crates/core/src/paths.rs` combines AE layout, cache-key normalization, JSON reads, and writes in a forbidden aggregate core. Its Windows write deletes the committed target before rename, creating a loss window and providing no runtime acceptance ordering. Only small ideas may be reimplemented under `HFS-*` / `STO-*`; the function is not an atomic-write implementation suitable for `STO-005` / `STO-007`.
7. `crates/core/src/json.rs` is a response-only stdout envelope tied to the CLI package version. It lacks request/session IDs, deadlines, idempotency, events, progress, cancellation, capabilities, and framed transport limits. It is reference material for `PRO-001`–`PRO-006`, not a protocol foundation.
8. `tools/ty-plus-cli/README.md` assigns network ownership to the panel and proposes `self-update`; both conflict with the accepted Rust network boundary and installer-owned simultaneous extension/runtime updates.

## Dirty tracked and non-CLI untracked files

| Current file | Disposition | Reason and retained value | Target task ID | Overlap risk |
| --- | --- | --- | --- | --- |
| `biome.json` | preserve | Pre-existing quality/config cleanup (including removal of `ignoreUnknown`) is not Rust-boundary work. Keep out of redesign commits. | `FND-001` ownership only | Medium — repository-wide formatting can rewrite unrelated files. |
| `docs/architecture/runtime/host-boundary.md` | reuse-rewrite | Preserve the pre-existing canonical host-boundary content; remove/replace only the added “Rust Host Helper” section because it mandates one-shot CLI, discovery overrides, panel-owned network, and future fallback. | `FND-008`, then `REP-007` / `DEL-009` | High — canonical doc and current WIP directly contradict each other. |
| `package.json` | reuse-rewrite | Do not keep `*:cli` as final names. Reuse the build-script integration point for Rust checks first, then replace it with runtime/worker build and dev commands. | `REP-004`, `PKG-002`, `PKG-007` | High — shared script table and existing user edits. |
| `scripts/package/package-cep-archive.ts` | reuse-rewrite | Retain the artifact-staging location, but require both-OS runtime and worker artifacts; remove warning-skip and ExtendScript fallback. | `PKG-004` | High — release-critical and explicitly violates the missing-artifact gate. |
| `tsconfig.base.json` | preserve | Pre-existing TS strictness/format changes are independent of the Rust migration. Do not normalize or commit them with runtime work. | `FND-001` ownership only | Medium — later generated protocol aliases may touch shared TS config. |
| `tsconfig.extendscript.json` | preserve | Existing removal of skip/deprecation options and formatting is unrelated; keep user ownership. | `FND-001` ownership only | Low — `HFS-002` uses this config but should not need to edit it. |
| `tsconfig.json` | preserve | Existing include/exclude and compiler-option changes are unrelated to the redesign and may expose existing failures. | `FND-001` ownership only | Medium — `PRO-008` generated types may tempt config edits. |
| `vitest.config.ts` | preserve | Existing re-enablement of previously excluded tests is quality WIP. It must be reviewed separately and not folded into Rust commits. | `FND-001` ownership only | Medium — `REP-004` and IPC harness work will use this file. |
| `docs/plans/rust-runtime-redesign/README.md` | preserve | Execution index and restart contract for the approved plan. | `FND-001` through `DEL-014` | High — supervisor-owned coordination file. |
| `docs/plans/rust-runtime-redesign/architecture.md` | preserve | Accepted design rationale; only supervisor-integrated decisions should change it before canonical promotion. | `FND-006`–`FND-008` | High — shared decision source for all agents. |
| `docs/plans/rust-runtime-redesign/migration-map.md` | preserve | Existing map is the baseline; supervisor should merge this report's dispositions into it after review. | `FND-001`–`FND-005`, then slice tasks | High — active shared migration ledger. |
| `docs/plans/rust-runtime-redesign/phases/00-foundation.md` | preserve | Defines the current audit gates and safe-stop rules. | `FND-001`–`FND-008` | High — current phase control. |
| `docs/plans/rust-runtime-redesign/phases/01-repository-contracts.md` | preserve | Defines destination workspace, domain crates, guards, and protocol tasks. | `REP-001`–`PRO-010` | Medium — edit only when task facts change. |
| `docs/plans/rust-runtime-redesign/phases/02-runtime-ipc.md` | preserve | Defines companion lifecycle and both-OS IPC; it is the replacement contract for CLI assumptions. | `IPC-001`–`IPC-014` | Medium — edit only when task facts change. |
| `docs/plans/rust-runtime-redesign/phases/03-host-filesystem.md` | preserve | Defines session-supplied `appRoot` and paired platform scan work. | `HFS-001`–`HFS-014` | Medium — edit only when task facts change. |
| `docs/plans/rust-runtime-redesign/phases/04-storage.md` | preserve | Defines visible managed storage, same-directory transactions, last-write ordering, cache, and history. | `STO-001`–`STO-024` | Medium — edit only when task facts change. |
| `docs/plans/rust-runtime-redesign/phases/05-online-licensing.md` | preserve | Defines Rust-owned network and licensing implementation tasks. | `NET-001`–`LIC-012` | Medium — edit only when task facts change. |
| `docs/plans/rust-runtime-redesign/phases/06-elevation.md` | preserve | Defines adjacent Windows/macOS elevated-worker work. | `ELV-001`–`ELV-012` | Medium — edit only when task facts change. |
| `docs/plans/rust-runtime-redesign/phases/07-package-decommission.md` | preserve | Defines mandatory paired artifacts, installer ownership, signing, and old-path deletion. | `PKG-001`–`DEL-014` | High — directly owns multiple dirty scripts. |
| `docs/plans/rust-runtime-redesign/status.md` | preserve | Supervisor-owned current checkpoint; audit agent must not update it. | `FND-001` | High — concurrent-agent coordination hotspot. |
| `docs/plans/rust-runtime-redesign/task-ledger.md` | preserve | Supervisor-owned status authority; audit agent must not update it. | `FND-001` through `DEL-014` | High — exactly one task may be in progress. |
| `docs/plans/rust-runtime-redesign/verification.md` | preserve | Common evidence and platform-matrix rules. | All phase gates | Medium — verification owners may append evidence rules. |
| `docs/plans/rust-runtime-redesign/reviews/wip-disposition.md` | preserve | This file is the bounded `FND-001` audit evidence created after the pre-existing inventory was captured. | `FND-001` | Low — supervisor may integrate findings, but source evidence should remain intact. |
| `scripts/build/build-cli.ts` | reuse-rewrite | Reuse fail-fast subprocess/staging concepts only. Replace CLI paths/names, build runtime plus worker, and produce verified Windows plus macOS artifacts; current universal-Mac claim is false. | `PKG-002` | High — package naming and artifact layout both change. |
| `scripts/lib/cli-paths.ts` | reuse-rewrite | Retain typed platform mapping, but rename to runtime artifact resolution, include worker/version manifest, and never return nullable output to a production packager/dev launcher. | `PKG-003` | High — imported by the dirty packager. |
| `scripts/package/sign-cli.ts` | reuse-rewrite | Reuse command execution/env configuration patterns only. Implement Windows signing and macOS signing/notarization together for runtime and worker; release skip must fail. | `PKG-005` | High — credentials and release behavior are platform-sensitive. |
| `vitest.config.ts.bak` | delete | Exact copy of `HEAD:vitest.config.ts`; it contains no unique work and is not a supported configuration source. Do not delete until supervisor accepts this disposition. | `FND-001` supervisor cleanup | Low — preserve until explicit cleanup to avoid discarding user-owned WIP silently. |

## `tools/ty-plus-cli` file inventory

The entire directory is a temporary WIP source. Reusable behavior moves by responsibility into `rust/`; no file is copied wholesale and `DEL-012` removes the old tree after product cutover.

| Current file | Disposition | Reason and retained value | Target task ID | Overlap risk |
| --- | --- | --- | --- | --- |
| `tools/ty-plus-cli/.gitignore` | reuse-rewrite | Move only Rust build-output ignores to the new root; review broad `.env` / `*.log` ignores against repository policy. | `REP-001` | Low — old directory remains until `DEL-012`. |
| `tools/ty-plus-cli/Cargo.lock` | reuse-rewrite | The lock is valid for the three-crate WIP, but must be regenerated from the accepted workspace/domain dependencies rather than copied as authority. | `REP-001`, `REP-002` | Medium — dependency graph changes completely. |
| `tools/ty-plus-cli/Cargo.toml` | reuse-rewrite | Reuse workspace release-profile/toolchain ideas. Replace `cli/core/host` members with responsibility crates and `apps/runtime`; no aggregate `core`. | `REP-001`, `REP-002` | High — root of all Rust work. |
| `tools/ty-plus-cli/README.md` | delete | It is not canonical and repeatedly encodes rejected one-shot, panel-network, self-update, and fallback assumptions. Keep only until replacement docs and paths exist. | `DEL-012` (do not cite before then) | High — likely to mislead implementers if treated as a spec. |
| `tools/ty-plus-cli/rust-toolchain.toml` | reuse-rewrite | Pinning `rustfmt`/`clippy` is useful; verify the selected toolchain against new dependencies and both CI targets when creating `rust/`. | `FND-002`, `REP-001` | Low — value may change, policy remains. |
| `tools/ty-plus-cli/crates/cli/Cargo.toml` | delete | A clap subcommand binary is not the target runtime app. Re-declare dependencies in `rust/apps/runtime` around IPC/session lifecycle. | `REP-002`, `IPC-001` | High — reusing it would preserve the wrong process model. |
| `tools/ty-plus-cli/crates/cli/src/main.rs` | reuse-rewrite | Retain only “thin entrypoint” and structured boundary-error intent. Replace clap dispatch/stdout/exit lifecycle with single-instance runtime bootstrap, IPC listener, handshake, and graceful idle shutdown. Remove all appRoot flags/env reads. | `FND-005`, `IPC-003`–`IPC-008` | High — central one-shot and discovery violation. |
| `tools/ty-plus-cli/crates/cli/src/output.rs` | reuse-rewrite | Stderr/stdout separation is useful for CLI tooling, but product protocol must use framed IPC and structured logs. Error-code ideas move to protocol; stdout envelopes do not. | `FND-005`, `PRO-003`, `IPC-002`, `IPC-013` | High — easy to accidentally retain stdout as transport. |
| `tools/ty-plus-cli/crates/cli/src/commands/mod.rs` | delete | Command-module dispatch is not the runtime operation registry. Rebuild method routing from versioned protocol capabilities. | `REP-002`, `PRO-001`, `IPC-008` | Medium — names may resemble future operations but architecture differs. |
| `tools/ty-plus-cli/crates/cli/src/commands/app_root.rs` | delete | Product discovery/override is prohibited. Runtime receives `appRoot` from an initialized host session and never reports a discovered candidate. | `FND-004`, `HFS-013` | Critical — direct violation of a fixed premise. |
| `tools/ty-plus-cli/crates/cli/src/commands/plugin_scan_stub.rs` | delete | An arbitrary-root hidden CLI stub is not a vertical slice. Replace with a scoped, session-bound protocol operation and both-OS implementation. | `HFS-006`, `HFS-007` | High — arbitrary root bypasses capability/path policy. |
| `tools/ty-plus-cli/crates/core/Cargo.toml` | delete | Aggregate core owns domain dependencies (`dirs`, `walkdir`, `blake3`) and conflicts with the no-general-core rule. Dependencies move only with their owning responsibility. | `REP-002` | High — copying it recreates the rejected debt bucket. |
| `tools/ty-plus-cli/crates/core/src/lib.rs` | delete | The aggregate re-export surface and CLI-global version disappear. Version belongs to protocol/release metadata; primitives remain local to responsible crates. | `REP-002`, `PRO-001`, `PKG-001` | High — apparent convenience would re-form a catch-all crate. |
| `tools/ty-plus-cli/crates/core/src/error.rs` | reuse-rewrite | Reuse stable machine-readable error intent, not the variants/exit codes or fallback comment. Protocol errors need retryability, diagnostic ID, and OS-message isolation. | `FND-003`, `PRO-003` | Medium — consumers currently assume process exit codes. |
| `tools/ty-plus-cli/crates/core/src/json.rs` | reuse-rewrite | Reuse serde round-trip/golden-fixture intent only. Replace response-only static-version envelope with versioned request/response/event messages and framed limits. | `FND-003`, `PRO-001`–`PRO-006` | High — shape is insufficient and coupled to stdout. |
| `tools/ty-plus-cli/crates/core/src/hash.rs` | reuse-rewrite | Deterministic hashing and domain separation are useful. Move hashing beside the cache/index owner, define full invalidation inputs, normalize through validated capabilities, and avoid a shared global tag. | `FND-003`, `HFS-009`, `STO-010` | Medium — current file/dir keys have incomplete semantics. |
| `tools/ty-plus-cli/crates/core/src/paths.rs` | reuse-rewrite | Split AE-derived path construction into host-filesystem and scoped read/transaction logic into storage. Do not retain existence-filtering as path resolution, claimed `..` cleaning, arbitrary paths, or delete-before-rename Windows writes. | `FND-003`, `HFS-005`, `STO-003`, `STO-005`–`STO-007` | Critical — security, crash consistency, and ownership overlap. |
| `tools/ty-plus-cli/crates/host/Cargo.toml` | reuse-rewrite | Host-filesystem is a valid responsibility, but remove registry/discovery dependencies and create it as a destination crate with session-context inputs. | `REP-002`, `HFS-004`, `HFS-005` | High — `winreg` exists solely for rejected discovery. |
| `tools/ty-plus-cli/crates/host/src/lib.rs` | reuse-rewrite | Keep the boundary idea that AE DOM stays in ExtendScript. Remove all discovery exports and UAC-stays-in-TS claim; expose session-context-derived path operations only. | `HFS-004`, `HFS-005`; elevation later `ELV-*` | High — comments currently assign responsibilities incorrectly. |
| `tools/ty-plus-cli/crates/host/src/app_root.rs` | delete | Registry and `/Applications` discovery, `AE_INSTALL_PATH`, `--app-root`, and highest-version selection are all prohibited. Its tests prove the wrong contract and must not be migrated. | `FND-004`, `HFS-013` | Critical — violates sole source and simultaneous-version support. |

## Verification evidence

| Command | Result |
| --- | --- |
| `git status --porcelain=v1 -uall` | 8 tracked modifications and 38 pre-existing untracked files were inventoried (14 plan files, 3 package/build helpers, 20 CLI-tree files, 1 Vitest backup). |
| `cargo metadata --locked --format-version 1 --no-deps --manifest-path tools/ty-plus-cli/Cargo.toml` | Exit 0; 3 workspace members: `ty-plus-cli`, `ty-plus-core`, `ty-plus-host`. This confirms the current aggregate/CLI topology, not the target topology. |
| `cargo test --locked --manifest-path tools/ty-plus-cli/Cargo.toml` | Exit 0; 12 tests passed (9 core, 3 host), 0 failed. Passing tests validate WIP behavior, including prohibited appRoot overrides; they are not acceptance evidence for the redesign. |
| repository search for `AE_INSTALL_PATH`, registry, `/Applications`, `app-root`, `stateless`, `per invocation`, fallback, and daemon assumptions | Violations found in the files identified above. The Rust `app_root` implementation contains both platform-discovery branches; the one-shot contract appears in canonical-doc WIP, README, Cargo profile comments, main/output/paths, and packaging fallback. |
| comparison of `vitest.config.ts.bak` with `HEAD:vitest.config.ts` | Exact content match; deletion has no unique-content loss after supervisor approval. |

## Supervisor integration order

1. Record the critical appRoot files as `delete` under `FND-004`; do not move them into `rust/`.
2. Record the CLI lifecycle files as conceptual-only `reuse-rewrite` under `FND-005`; explicitly ban stdout JSON as product IPC.
3. Use `FND-002` / `FND-003` to approve only the toolchain, deterministic error/hash/serde test ideas, and responsibility-specific destination crates.
4. Keep all unrelated config/test changes user-owned and unstaged during Foundation commits.
5. Do not touch packaging WIP until `PKG-*`; when reached, replace warning/skip and one-platform behavior rather than layering on it.
