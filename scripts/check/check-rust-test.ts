#!/usr/bin/env bun
/**
 * Run `cargo test --all-features`, platform-aware.
 *
 * Why this exists as a wrapper:
 *   `crates/host-filesystem` only compiles on Windows / macOS. On Linux
 *   runners, `cargo test --workspace` walks every member and fails to
 *   compile the platform-incompatible crate. See
 *   `scripts/check/check-rust-clippy.ts` for the full rationale — this
 *   wrapper mirrors its Linux subset so the test gate tracks the same
 *   carve-out.
 *
 * Usage:
 *   bun scripts/check/check-rust-test.ts
 *   bun scripts/check/check-rust-test.ts --self-test
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
import { rustFixtureEnv } from "./rust-fixture-env.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rustRoot = resolve(repoRoot, "rust");

const testArgsFor = (host: NodeJS.Platform): readonly string[] => {
	if (host === "win32" || host === "darwin") {
		return ["test", "--workspace", "--all-features"];
	}
	return [
		"test",
		...LINUX_SAFE_CRATES.flatMap((name) => ["-p", name]),
		"--all-features",
	];
};

const runTests = (): number => {
	const host = platform;
	const args = testArgsFor(host);
	const labelSuffix =
		host === "win32" || host === "darwin"
			? "(full workspace)"
			: `(Linux-safe subset: ${LINUX_SAFE_CRATES.join(", ")})`;
	console.log(`[rust-test] host=${host} ${labelSuffix}`);
	console.log(`[rust-test] cargo ${args.join(" ")}`);

	const result = spawnSync("cargo", [...args], {
		cwd: rustRoot,
		stdio: "inherit",
		shell: false,
		// Same fixture root as `check-rust-workspace`: without it this script
		// alone redoes the symlinked-TMPDIR failure the other one avoids
		// (Issue #189).
		env: rustFixtureEnv(),
	});

	if (result.error) {
		console.error("[rust-test] could not start cargo:", result.error);
		return 1;
	}
	if (result.status !== 0) {
		const detail = result.signal
			? `signal ${result.signal}`
			: `exit ${result.status ?? "unknown"}`;
		console.error(`[rust-test] failed (${detail})`);
		return 1;
	}
	console.log("[rust-test] complete");
	return 0;
};

const runSelfTest = (): number => {
	// Canonical list must match the derivation from cargo metadata; any
	// drift (new workspace member, host-filesystem reachability change)
	// fails here rather than silently skipping tests in CI.
	const metadata = fetchCargoMetadata();
	assertLinuxSafeCratesMatch(metadata);

	const linuxArgs = testArgsFor("linux");
	assert.ok(linuxArgs.includes("-p"), "linux test must pin packages");
	assert.ok(
		!linuxArgs.includes("--workspace"),
		"linux test must not use --workspace",
	);
	for (const pkg of LINUX_SAFE_CRATES) {
		assert.ok(
			linuxArgs.includes(pkg),
			`linux test must include ${pkg}, got: ${linuxArgs.join(" ")}`,
		);
	}
	const winArgs = testArgsFor("win32");
	const macArgs = testArgsFor("darwin");
	assert.ok(winArgs.includes("--workspace"), "win32 must use --workspace");
	assert.ok(macArgs.includes("--workspace"), "darwin must use --workspace");
	console.log("[rust-test] self-test complete");
	return 0;
};

if (import.meta.main) {
	try {
		if (process.argv.length === 2) {
			process.exitCode = runTests();
		} else if (process.argv.length === 3 && process.argv[2] === "--self-test") {
			process.exitCode = runSelfTest();
		} else {
			console.error(
				"Usage: bun scripts/check/check-rust-test.ts [--self-test]",
			);
			process.exitCode = 2;
		}
	} catch (error) {
		console.error("[rust-test] setup failed:", error);
		process.exitCode = 2;
	}
}
