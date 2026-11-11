#!/usr/bin/env bun
/**
 * Run the complete Rust workspace verification from any repository location.
 *
 * Usage:
 *   bun scripts/check/check-rust-workspace.ts
 *   bun scripts/check/check-rust-workspace.ts --self-test
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { rustFixtureEnv } from "./rust-fixture-env.ts";

type CheckStep = Readonly<{
	label: string;
	args: readonly string[];
}>;

/**
 * Crates that compile on any host (no `target_os` / `compile_error!` gates).
 * On non-product hosts (WSL/Linux) we restrict `check` / `clippy` / `test` to
 * this list, because `ty-plus-host-filesystem` (and apps that depend on it)
 * carry `compile_error!` for non-Windows/macOS targets — see CLAUDE.md
 * ("WSL では windows target の cargo check 不可").
 *
 * `cargo fmt` is source-OS-agnostic and continues to run across the full
 * workspace.
 */
const HOST_INDEPENDENT_CRATES = [
	"ty-plus-protocol",
	"ty-plus-online",
	"ty-plus-licensing",
] as const;

const isProductHost = (): boolean =>
	process.platform === "win32" || process.platform === "darwin";

const buildCheckArgs = (label: string): readonly string[] => {
	if (isProductHost()) {
		switch (label) {
			case "check":
				return ["check", "--workspace", "--all-targets"];
			case "clippy":
				return [
					"clippy",
					"--workspace",
					"--all-targets",
					"--",
					"-D",
					"warnings",
				];
			case "test":
				return ["test", "--workspace"];
			default:
				return [];
		}
	}
	const pkgArgs = HOST_INDEPENDENT_CRATES.flatMap((name) => ["-p", name]);
	switch (label) {
		case "check":
			return ["check", ...pkgArgs, "--all-targets"];
		case "clippy":
			return ["clippy", ...pkgArgs, "--all-targets", "--", "-D", "warnings"];
		case "test":
			return ["test", ...pkgArgs];
		default:
			return [];
	}
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rustRoot = resolve(repoRoot, "rust");
const toolchainFile = resolve(rustRoot, "rust-toolchain.toml");

const checkSteps: readonly CheckStep[] = [
	{ label: "format", args: ["fmt", "--all", "--", "--check"] },
	{ label: "check", args: buildCheckArgs("check") },
	{ label: "clippy", args: buildCheckArgs("clippy") },
	{ label: "test", args: buildCheckArgs("test") },
];

const FMT_STEP_LABEL = "format";

const parsePinnedToolchain = (contents: string): string => {
	const channel = contents.match(/^\s*channel\s*=\s*"([^"]+)"\s*$/m)?.[1];
	if (!channel || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9._-]+)?$/.test(channel)) {
		throw new Error(`${toolchainFile} must define a safe, pinned channel`);
	}
	return channel;
};

const readPinnedToolchain = (): string =>
	parsePinnedToolchain(readFileSync(toolchainFile, "utf8"));

const runChecks = (): number => {
	const toolchain = readPinnedToolchain();
	const note = isProductHost()
		? ""
		: ` (host-independent subset: ${HOST_INDEPENDENT_CRATES.join(", ")})`;

	for (const [index, step] of checkSteps.entries()) {
		console.log(
			`[rust-check] ${index + 1}/${checkSteps.length} ${step.label}${note}`,
		);
		const result = spawnSync("cargo", [`+${toolchain}`, ...step.args], {
			cwd: rustRoot,
			stdio: "inherit",
			shell: false,
			env: rustFixtureEnv(),
		});

		if (result.error) {
			console.error(
				`[rust-check] ${step.label} could not start:`,
				result.error,
			);
			return 1;
		}
		if (result.status !== 0) {
			const detail = result.signal
				? `signal ${result.signal}`
				: `exit ${result.status ?? "unknown"}`;
			console.error(`[rust-check] ${step.label} failed (${detail})`);
			return 1;
		}
	}

	console.log("[rust-check] complete");
	return 0;
};

const runSelfTest = (): number => {
	assert.equal(
		parsePinnedToolchain('[toolchain]\nchannel = "1.85.0"\n'),
		"1.85.0",
	);
	assert.throws(() => parsePinnedToolchain('[toolchain]\nchannel = ""\n'));
	assert.throws(() =>
		parsePinnedToolchain('[toolchain]\nchannel = "stable"\n'),
	);
	assert.throws(() =>
		parsePinnedToolchain('[toolchain]\nchannel = "stable;echo unsafe"\n'),
	);
	assert.deepEqual(
		checkSteps.map(({ label }) => label),
		["format", "check", "clippy", "test"],
	);
	assert.match(readPinnedToolchain(), /^\d+\.\d+\.\d+(?:-[A-Za-z0-9._-]+)?$/);
	const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
		process,
		"platform",
	);
	const restorePlatform = (): void => {
		if (originalPlatformDescriptor) {
			Object.defineProperty(process, "platform", originalPlatformDescriptor);
		}
	};
	const linuxLikePlatforms = ["linux", "freebsd", "openbsd", "sunos"];
	for (const platform of linuxLikePlatforms) {
		Object.defineProperty(process, "platform", {
			value: platform,
			configurable: true,
		});
		try {
			assert.deepEqual(
				buildCheckArgs("check"),
				[
					"check",
					"-p",
					"ty-plus-protocol",
					"-p",
					"ty-plus-online",
					"-p",
					"ty-plus-licensing",
					"--all-targets",
				],
				`check args on ${platform}`,
			);
		} finally {
			restorePlatform();
		}
	}
	Object.defineProperty(process, "platform", {
		value: "win32",
		configurable: true,
	});
	try {
		assert.deepEqual(
			buildCheckArgs("check"),
			["check", "--workspace", "--all-targets"],
			"check args on win32",
		);
	} finally {
		restorePlatform();
	}
	// The fixture root is a pure function of the platform argument, so it is
	// asserted directly rather than by rewriting `process.platform`.
	const darwinRoot = rustFixtureEnv("darwin")?.TMPDIR;
	assert.ok(darwinRoot !== undefined, "darwin must supply a fixture root");
	assert.ok(isAbsolute(darwinRoot), "fixture root must be absolute");
	assert.match(darwinRoot, /rust-tests$/);
	for (
		let ancestor: string = resolve(darwinRoot);
		ancestor !== dirname(ancestor);
		ancestor = dirname(ancestor)
	) {
		assert.ok(
			!lstatSync(ancestor).isSymbolicLink(),
			`fixture root ancestor must not be a symlink: ${ancestor}`,
		);
	}
	assert.equal(
		rustFixtureEnv("linux"),
		process.env,
		"non-product hosts keep the inherited temp root",
	);
	console.log("[rust-check] self-test complete");
	return 0;
};

if (import.meta.main) {
	try {
		if (process.argv.length === 2) {
			process.exitCode = runChecks();
		} else if (process.argv.length === 3 && process.argv[2] === "--self-test") {
			process.exitCode = runSelfTest();
		} else {
			console.error(
				"Usage: bun scripts/check/check-rust-workspace.ts [--self-test]",
			);
			process.exitCode = 2;
		}
	} catch (error) {
		console.error("[rust-check] setup failed:", error);
		process.exitCode = 2;
	}
}
