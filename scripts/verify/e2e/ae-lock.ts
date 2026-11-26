/**
 * Cross-project After Effects instance lock for E2E runs (Issue #641).
 *
 * After Effects is single-tenant: only one automation may drive a given
 * installed instance at a time. Aulymo_v04 (`scripts/host/run.ts --owned`)
 * already serializes its runs through a shared lock outside every
 * repository — `~/Library/Application Support/Aulymo/host-locks/locks/` on
 * macOS, `%LOCALAPPDATA%/Aulymo/host-locks/locks/` on Windows. This module
 * implements the SAME protocol (atomic `mkdir`, `owner.json`, scope key
 * `sha256("<label> <path>")[:16]`) so ty-plus E2E and Aulymo exclude each
 * other instead of fighting over the same AE process.
 *
 * The lock is fail-closed: a busy lock aborts the run without touching AE,
 * and a stale lock (dead owner pid) is only released by the explicit
 * `--recover` mode after the operator confirms AE state — never silently.
 */
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type LockScope = {
	/** What the scope protects, for the messages. */
	label: string;
	/** The value that identifies the resource. */
	path: string;
};

export type LockOwner = {
	pid: number;
	runId: string;
	host: string;
	/** The repository root of the worktree that took the lock. */
	worktree: string;
	startedAt: string;
	target: string;
	scope: LockScope;
};

export type AcquireResult =
	| { status: "acquired"; lockDir: string }
	| {
			status: "busy";
			lockDir: string;
			owner: LockOwner | null;
			holderAlive: boolean | null;
	  };

const LOCK_LABEL = "After Effects instance";

/**
 * The shared lock root. `AULYMO_AE_LOCK_DIR` is honored so a test (or a
 * machine with a different layout) can redirect BOTH this runner and
 * Aulymo runs to the same place; `TY_PLUS_E2E_LOCK_DIR` is the
 * ty-plus-native override and wins when both are set.
 */
const lockRoot = (
	env: Partial<Record<string, string | undefined>> = process.env,
): string => {
	const chosen = env.TY_PLUS_E2E_LOCK_DIR ?? env.AULYMO_AE_LOCK_DIR;
	if (chosen?.trim()) return path.resolve(chosen.trim());
	if (process.platform === "win32") {
		const local = env.LOCALAPPDATA;
		return path.join(
			local ?? path.join(homedir(), "AppData", "Local"),
			"Aulymo",
			"host-locks",
		);
	}
	return path.join(
		homedir(),
		"Library",
		"Application Support",
		"Aulymo",
		"host-locks",
	);
};

const scopeKey = (scope: LockScope): string =>
	createHash("sha256")
		.update(`${scope.label} ${scope.path}`)
		.digest("hex")
		.slice(0, 16);

export const lockDirFor = (
	scope: LockScope,
	root: string = lockRoot(),
): string => path.join(root, "locks", scopeKey(scope));

const processAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process exists but is not ours — still alive.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
};

const readOwner = (lockDir: string): LockOwner | null => {
	try {
		return JSON.parse(
			readFileSync(path.join(lockDir, "owner.json"), "utf8"),
		) as LockOwner;
	} catch {
		return null;
	}
};

export const describeOwner = (owner: LockOwner | null): string => {
	if (owner === null) return "the owner record is missing or unreadable";
	return `run ${owner.runId} (${owner.target}) of ${owner.worktree} on ${owner.host}, pid ${owner.pid}, started ${owner.startedAt}`;
};

/**
 * The AE app name Aulymo's `aeApp()` reports for the same install — the
 * directory component matching `Adobe After Effects <year>` in the
 * managed root's ancestry (`/Applications/Adobe After Effects 2027/ty-plus`
 * on macOS; `.../Adobe After Effects 2027/Support Files/ty-plus` on
 * Windows). Returns null when no such component exists.
 */
export const aeAppNameFromManagedRoot = (
	managedRoot: string,
): string | null => {
	const normalized = managedRoot.replace(/\\/g, "/");
	const segments = normalized.split("/").filter(Boolean);
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i];
		if (seg && /^Adobe After Effects \d/.test(seg)) return seg;
	}
	return null;
};

export const aeScopeForManagedRoot = (
	managedRoot: string,
): LockScope | null => {
	const appName = aeAppNameFromManagedRoot(managedRoot);
	if (!appName) return null;
	return { label: LOCK_LABEL, path: appName };
};

export const acquireAeLock = (input: {
	scope: LockScope;
	target: string;
	worktree?: string;
	runId?: string;
	root?: string;
}): AcquireResult => {
	const root = input.root ?? lockRoot();
	const lockDir = lockDirFor(input.scope, root);
	// Only the parent is made recursively; the lock itself is a
	// non-recursive mkdir, which is what makes acquisition atomic.
	mkdirSync(path.join(lockDir, ".."), { recursive: true });
	try {
		mkdirSync(lockDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		const current = readOwner(lockDir);
		return {
			status: "busy",
			lockDir,
			owner: current,
			holderAlive: current === null ? null : processAlive(current.pid),
		};
	}
	const record: LockOwner = {
		pid: process.pid,
		runId: input.runId ?? `${Date.now().toString(36)}-${process.pid}`,
		host: hostname(),
		worktree: input.worktree ?? process.cwd(),
		startedAt: new Date().toISOString(),
		target: input.target,
		scope: input.scope,
	};
	writeFileSync(
		path.join(lockDir, "owner.json"),
		`${JSON.stringify(record, null, 2)}\n`,
		"utf8",
	);
	return { status: "acquired", lockDir };
};

/** Releases only when the recorded runId matches — never touches others. */
export const releaseAeLock = (lockDir: string, runId: string): boolean => {
	const current = readOwner(lockDir);
	if (current === null || current.runId !== runId) return false;
	rmSync(lockDir, { recursive: true, force: true });
	return true;
};

export const staleLocks = (
	root: string = lockRoot(),
): { key: string; owner: LockOwner | null }[] => {
	const locksDir = path.join(root, "locks");
	if (!existsSync(locksDir)) return [];
	const stale: { key: string; owner: LockOwner | null }[] = [];
	for (const key of readdirSync(locksDir)) {
		const owner = readOwner(path.join(locksDir, key));
		if (owner !== null && processAlive(owner.pid)) continue;
		stale.push({ key, owner });
	}
	return stale;
};

/**
 * Explicit stale-lock recovery for ONE scope. The caller must have
 * already confirmed After Effects is not being driven; this only removes
 * locks whose recorded owner pid is gone (or unreadable).
 */
export const recoverStaleAeLock = (input: {
	scope: LockScope;
	root?: string;
}): { recovered: boolean; owner: LockOwner | null } => {
	const root = input.root ?? lockRoot();
	const lockDir = lockDirFor(input.scope, root);
	if (!existsSync(lockDir)) return { recovered: false, owner: null };
	const owner = readOwner(lockDir);
	if (owner !== null && processAlive(owner.pid)) {
		return { recovered: false, owner };
	}
	rmSync(lockDir, { recursive: true, force: true });
	return { recovered: true, owner };
};

// ── CLI: explicit stale-lock recovery ──────────────────────────────────────
//
//   bun scripts/verify/e2e/ae-lock.ts --recover --managed-root=<path>
//
// Removes the lock for the AE instance that manages `<path>` ONLY when the
// recorded owner pid is gone (or the record is unreadable). Run it after
// confirming After Effects is not being driven by anyone — the same rule
// Aulymo's `run.ts --recover` follows.

const isCliEntry =
	typeof process.argv[1] === "string" &&
	import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCliEntry) {
	const args = process.argv.slice(2);
	const managedRoot = args
		.find((a) => a.startsWith("--managed-root="))
		?.split("=")
		.slice(1)
		.join("=");
	if (!args.includes("--recover") || !managedRoot) {
		console.error(
			"usage: bun scripts/verify/e2e/ae-lock.ts --recover --managed-root=<path>",
		);
		process.exit(2);
	}
	const scope = aeScopeForManagedRoot(managedRoot);
	if (!scope) {
		console.error(`ae-lock: could not derive AE app name from ${managedRoot}`);
		process.exit(2);
	}
	const result = recoverStaleAeLock({ scope });
	if (!result.recovered) {
		console.error(
			result.owner
				? `ae-lock: lock is held by a live process — ${describeOwner(result.owner)}`
				: "ae-lock: no lock present",
		);
		process.exit(1);
	}
	console.log(
		`ae-lock: recovered stale lock for ${scope.path} (was ${describeOwner(result.owner)})`,
	);
}
