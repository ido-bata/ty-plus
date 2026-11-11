#!/usr/bin/env bun
/**
 * Single source of truth for the "Linux-safe" workspace members that
 * `cargo clippy` and `cargo test` exercise on Linux CI.
 *
 * `crates/host-filesystem` only compiles on Windows / macOS (its
 * `src/platform/mod.rs` carries a `compile_error!` for any other
 * target). `--exclude ty-plus-host-filesystem` does NOT help on Linux
 * because cargo still has to compile the crate as a transitive
 * dependency of `apps/operation-worker`, `apps/runtime`, and
 * `crates/storage`. The clean fix is to pin a subset of crates that do
 * NOT depend on host-filesystem.
 *
 * This module derives that subset from `cargo metadata` so the wrapper
 * scripts (`check-rust-clippy.ts`, `check-rust-test.ts`) can assert at
 * self-test time that the canonical `LINUX_SAFE_CRATES` list matches
 * the derivation. Adding a workspace member without updating the list
 * fails the gate; flipping a previously-safe crate to depend on
 * host-filesystem also fails the gate.
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rustRoot = resolve(repoRoot, "rust");

/**
 * The crate that requires Windows / macOS surfaces (`cap-std` /
 * `cap-fs-ext`). Anything that transitively depends on it must NOT be
 * exercised on Linux CI; Windows / macOS jobs already cover it.
 */
const HOST_FILESYSTEM_CRATE = "ty-plus-host-filesystem";

/**
 * Canonical list of Linux-safe workspace members — the crates pinned by
 * `cargo clippy -p <name> ...` / `cargo test -p <name> ...` on Linux
 * runners.
 *
 * This is the SINGLE source of truth. The `--self-test` mode of the
 * wrapper scripts derives the same set from `cargo metadata` and
 * asserts equality, so adding a workspace member without updating this
 * list fails CI rather than silently skipping lint/test for it.
 */
export const LINUX_SAFE_CRATES = [
	"ty-plus-protocol",
	"ty-plus-online",
] as const;

type LinuxSafeCrate = (typeof LINUX_SAFE_CRATES)[number];

interface CargoDependency {
	readonly name: string;
	/** `null` for workspace path dependencies, registry URL for external crates. */
	readonly source: string | null;
}

interface CargoPackage {
	readonly name: string;
	readonly dependencies: readonly CargoDependency[];
}

export interface CargoMetadata {
	readonly packages: readonly CargoPackage[];
	readonly workspace_members: readonly string[];
}

/**
 * Shell out to `cargo metadata --no-deps --format-version=1` and parse
 * the JSON. Throws with an actionable message on failure.
 */
export const fetchCargoMetadata = (): CargoMetadata => {
	const result = spawnSync(
		"cargo",
		["metadata", "--no-deps", "--format-version=1"],
		{
			cwd: rustRoot,
			shell: false,
			encoding: "utf-8",
		},
	);

	if (result.error) {
		throw new Error(
			`[rust-meta] could not start cargo: ${result.error.message}`,
		);
	}
	if (result.status !== 0) {
		throw new Error(
			`[rust-meta] cargo metadata failed (exit ${result.status ?? "unknown"})`,
		);
	}
	const stdout = result.stdout ?? "";
	try {
		return JSON.parse(stdout) as CargoMetadata;
	} catch (cause) {
		throw new Error("[rust-meta] could not parse cargo metadata output", {
			cause,
		});
	}
};

/**
 * Extract the package name from a cargo package ID.
 * ID format: `<source-url>#<name>@<version>`, e.g.
 *   `path+file:///repo/rust/crates/online#ty-plus-online@0.1.0`.
 */
const packageNameFromId = (id: string): string | null => {
	const hashIdx = id.lastIndexOf("#");
	if (hashIdx === -1) return null;
	const nameAtVersion = id.slice(hashIdx + 1);
	const atIdx = nameAtVersion.lastIndexOf("@");
	const name = atIdx === -1 ? nameAtVersion : nameAtVersion.slice(0, atIdx);
	return name.length > 0 ? name : null;
};

/**
 * A crate is "linux-unsafe" if it IS `ty-plus-host-filesystem` (the
 * crate itself carries a `compile_error!` on non-Windows/macOS targets)
 * or transitively depends on it. Everything else is linux-safe.
 */
const isLinuxUnsafe = (
	pkgName: string,
	byName: ReadonlyMap<string, CargoPackage>,
	visited: Set<string>,
): boolean => {
	if (pkgName === HOST_FILESYSTEM_CRATE) return true;
	if (visited.has(pkgName)) return false;
	visited.add(pkgName);
	const pkg = byName.get(pkgName);
	if (!pkg) return false;
	for (const dep of pkg.dependencies) {
		// External dependencies (source !== null) are not in `byName` and
		// never resolve to a workspace member; only workspace path
		// dependencies can reach `ty-plus-host-filesystem`.
		if (dep.source !== null) continue;
		if (isLinuxUnsafe(dep.name, byName, visited)) return true;
	}
	return false;
};

interface CrateClassification {
	readonly name: string;
	/** True iff the crate does NOT transitively depend on `ty-plus-host-filesystem`. */
	readonly linuxSafe: boolean;
}

/**
 * Classify each workspace member as `linuxSafe` (no transitive
 * dependency on `ty-plus-host-filesystem`) or not. Result is sorted by
 * name for stable comparison.
 */
const classifyWorkspaceMembers = (
	metadata: CargoMetadata,
): readonly CrateClassification[] => {
	// Restrict to actual workspace members so transitive path deps that
	// happen to appear in `packages[]` do not skew the classification.
	const workspaceMemberNames = new Set<string>();
	for (const id of metadata.workspace_members) {
		const name = packageNameFromId(id);
		if (name !== null) workspaceMemberNames.add(name);
	}
	const byName = new Map<string, CargoPackage>();
	for (const pkg of metadata.packages) {
		byName.set(pkg.name, pkg);
	}
	return [...metadata.packages]
		.filter((pkg) => workspaceMemberNames.has(pkg.name))
		.map((pkg) => ({
			name: pkg.name,
			linuxSafe: !isLinuxUnsafe(pkg.name, byName, new Set()),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
};

const deriveLinuxSafeCrates = (metadata: CargoMetadata): readonly string[] =>
	classifyWorkspaceMembers(metadata)
		.filter((c) => c.linuxSafe)
		.map((c) => c.name);

/**
 * Assert that the canonical list matches the derivation from cargo
 * metadata. Throws with an actionable message listing each unclassified
 * / stale member when they disagree. Returns void on success.
 */
export const assertLinuxSafeCratesMatch = (
	metadata: CargoMetadata,
	canonical: readonly string[] = LINUX_SAFE_CRATES,
): void => {
	const derived = [...deriveLinuxSafeCrates(metadata)].sort();
	const canonicalSorted = [...canonical].sort();
	const derivedSet = new Set(derived);
	const canonicalSet = new Set(canonicalSorted);

	const unclassified = derived.filter((n) => !canonicalSet.has(n));
	const stale = canonicalSorted.filter((n) => !derivedSet.has(n));

	if (unclassified.length === 0 && stale.length === 0) return;

	const lines: string[] = [];
	lines.push("[rust-meta] LINUX_SAFE_CRATES drift detected:");
	for (const name of unclassified) {
		lines.push(`  - unclassified member: ${name}`);
	}
	for (const name of stale) {
		lines.push(`  - stale canonical entry: ${name}`);
	}
	lines.push(`    derived linux-safe: ${derived.join(", ")}`);
	lines.push(`    canonical list:     ${canonicalSorted.join(", ")}`);
	throw new Error(lines.join("\n"));
};
