#!/usr/bin/env bun
/**
 * Run cargo clippy across the Rust workspace, platform-aware.
 *
 * Why this exists as a wrapper:
 *   `crates/host-filesystem` only compiles on Windows / macOS (its
 *   `src/platform/mod.rs` carries a `compile_error!` for any other
 *   target). On Linux runners, `cargo clippy --workspace` fails because
 *   it pulls host-filesystem in via `apps/operation-worker`,
 *   `apps/runtime`, and `crates/storage`. `--exclude ty-plus-host-filesystem`
 *   does NOT help because cargo still needs to compile the crate as a
 *   transitive dependency.
 *
 *   The clean fix that keeps the Linux CI green while still validating
 *   host-filesystem on Windows / macOS:
 *
 *   - On Windows / macOS: full workspace clippy (host-filesystem and its
 *     dependents compile and lint normally).
 *   - On Linux: clippy only the crates that do not depend on
 *     host-filesystem. The other crates are skipped on this host —
 *     Windows / macOS jobs already exercise them end-to-end.
 *
 *   The Linux-safe set is derived from `cargo metadata` at self-test
 *   time and must equal the canonical list in
 *   `rust-linux-safe-crates.ts`. Any new crate that does not import
 *   `ty-plus-host-filesystem` belongs there.
 *
 * Usage:
 *   bun scripts/check/check-rust-clippy.ts
 *   bun scripts/check/check-rust-clippy.ts --self-test
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { platform } from "node:process";
import { fileURLToPath } from "node:url";
import {
	assertLinuxSafeCratesMatch,
	fetchCargoMetadata,
	LINUX_SAFE_CRATES,
} from "./rust-linux-safe-crates.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rustRoot = resolve(repoRoot, "rust");

const CLIPPY_TAIL = [
	"--all-targets",
	"--all-features",
	"--",
	"-D",
	"warnings",
] as const;

const clippyArgsFor = (host: NodeJS.Platform): readonly string[] => {
	if (host === "win32" || host === "darwin") {
		return ["clippy", "--workspace", ...CLIPPY_TAIL];
	}
	return [
		"clippy",
		...LINUX_SAFE_CRATES.flatMap((name) => ["-p", name]),
		...CLIPPY_TAIL,
	];
};

const runClippy = (): number => {
	const host = platform;
	const args = clippyArgsFor(host);
	const labelSuffix =
		host === "win32" || host === "darwin"
			? "(full workspace)"
			: `(Linux-safe subset: ${LINUX_SAFE_CRATES.join(", ")})`;
	console.log(`[rust-clippy] host=${host} ${labelSuffix}`);
	console.log(`[rust-clippy] cargo ${args.join(" ")}`);

	const result = spawnSync("cargo", [...args], {
		cwd: rustRoot,
		stdio: "inherit",
		shell: false,
	});

	if (result.error) {
		console.error("[rust-clippy] could not start cargo:", result.error);
		return 1;
	}
	if (result.status !== 0) {
		const detail = result.signal
			? `signal ${result.signal}`
			: `exit ${result.status ?? "unknown"}`;
		console.error(`[rust-clippy] failed (${detail})`);
		return 1;
	}
	console.log("[rust-clippy] complete");
	return 0;
};

const runSelfTest = (): number => {
	// Canonical list must match the derivation from cargo metadata; any
	// drift (new workspace member, host-filesystem reachability change)
	// fails here rather than silently skipping clippy in CI.
	const metadata = fetchCargoMetadata();
	assertLinuxSafeCratesMatch(metadata);

	// Linux must pin specific packages, not the whole workspace.
	const linuxArgs = clippyArgsFor("linux");
	assert.ok(linuxArgs.includes("-p"), "linux clippy must pin packages");
	assert.ok(
		!linuxArgs.includes("--workspace"),
		"linux clippy must not use --workspace",
	);
	for (const pkg of LINUX_SAFE_CRATES) {
		assert.ok(
			linuxArgs.includes(pkg),
			`linux clippy must include ${pkg}, got: ${linuxArgs.join(" ")}`,
		);
	}
	// Windows / macOS must keep the full workspace flag.
	const winArgs = clippyArgsFor("win32");
	const macArgs = clippyArgsFor("darwin");
	assert.ok(winArgs.includes("--workspace"), "win32 must use --workspace");
	assert.ok(macArgs.includes("--workspace"), "darwin must use --workspace");
	console.log("[rust-clippy] self-test complete");
	return 0;
};

if (import.meta.main) {
	try {
		if (process.argv.length === 2) {
			process.exitCode = runClippy();
		} else if (process.argv.length === 3 && process.argv[2] === "--self-test") {
			process.exitCode = runSelfTest();
		} else {
			console.error(
				"Usage: bun scripts/check/check-rust-clippy.ts [--self-test]",
			);
			process.exitCode = 2;
		}
	} catch (error) {
		console.error("[rust-clippy] setup failed:", error);
		process.exitCode = 2;
	}
}
