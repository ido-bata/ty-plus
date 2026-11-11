/**
 * Installs the repository pre-push hook, which runs the canonical quality gate
 * (`scripts/ci-local.sh` -> `bun run ci`) before any push leaves the machine.
 *
 * Replaces a shell implementation that `package.json` never invoked. That is
 * why the gate could be absent from a fresh clone: nothing ran it. The gate is
 * now installed from `bun run setup`, the canonical bootstrap.
 *
 * This runs under Bun rather than `sh` because `setup` also runs on stock
 * Windows, where `sh` is only present once Git for Windows puts it on PATH.
 * The hook this writes is still a POSIX shell script because Git executes
 * hooks through `sh` on every platform.
 *
 * Refusing to clobber someone else's hook is deliberate. `--allow-decline`
 * makes that refusal a non-error for `setup`, which must not abort onboarding
 * for a contributor who already has a pre-push hook they chose.
 */

import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

/** Marker written into the hook so a re-run recognises its own work. */
const HOOK_MARKER = "rebuildup-local-ci-dispatch";

export type HookInstallDecision =
	| Readonly<{ action: "install"; reason: string }>
	| Readonly<{ action: "decline"; reason: string; remedy: string }>;

export interface HookStateInput {
	readonly configuredHooksPath?: string | undefined;
	readonly hookExists: boolean;
	readonly hookContent?: string | undefined;
}

/**
 * Decide what to do with the pre-push hook, independent of the filesystem.
 *
 * Pure so the refusal rules are testable: each branch here previously ended in
 * a non-zero exit from a shell script nothing ran.
 */
export function evaluateHookInstall({
	configuredHooksPath,
	hookExists,
	hookContent,
}: HookStateInput): HookInstallDecision {
	if (configuredHooksPath) {
		return {
			action: "decline",
			reason: `core.hooksPath is already configured (${configuredHooksPath})`,
			remedy: `Point your existing pre-push dispatcher at: sh <repo>/scripts/ci-local.sh`,
		};
	}
	if (hookExists && !hookContent?.includes(HOOK_MARKER)) {
		return {
			action: "decline",
			reason: "an existing pre-push hook was not installed by this repository",
			remedy: `Point it at: sh <repo>/scripts/ci-local.sh`,
		};
	}
	if (hookExists) {
		return {
			action: "install",
			reason: "refreshing the existing ty-plus hook",
		};
	}
	return { action: "install", reason: "no pre-push hook is installed yet" };
}

const HOOK_SCRIPT = `#!/usr/bin/env sh
# ${HOOK_MARKER}
set -eu
repo_root="$(git rev-parse --show-toplevel)"
exec sh "$repo_root/scripts/ci-local.sh"
`;

function git(args: readonly string[]): string {
	const result = spawnSync("git", [...args], { encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed: ${(result.stderr || "").trim()}`,
		);
	}
	return (result.stdout || "").trim();
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
	const allowDecline = argv.includes("--allow-decline");

	let repoRoot: string;
	try {
		repoRoot = git(["rev-parse", "--show-toplevel"]);
	} catch (err) {
		process.stderr.write(
			`[git-hooks] could not resolve the repository root: ${(err as Error).message}\n`,
		);
		return allowDecline ? 0 : 1;
	}

	let configuredHooksPath: string | undefined;
	try {
		configuredHooksPath =
			git(["config", "--get", "core.hooksPath"]) || undefined;
	} catch {
		// `--get` exits non-zero when the key is unset, which is the normal case.
		configuredHooksPath = undefined;
	}

	const hookPath = path.resolve(
		repoRoot,
		git(["rev-parse", "--git-path", "hooks"]),
		"pre-push",
	);
	const hookExists = existsSync(hookPath);
	const hookContent = hookExists ? readFileSync(hookPath, "utf8") : undefined;

	const decision = evaluateHookInstall({
		configuredHooksPath,
		hookExists,
		hookContent,
	});

	if (decision.action === "decline") {
		process.stderr.write(`[git-hooks] ${decision.reason}; not touching it.\n`);
		process.stderr.write(`[git-hooks] ${decision.remedy}\n`);
		if (allowDecline) {
			process.stderr.write(
				"[git-hooks] pre-push quality gate NOT installed. `bun run ci` still " +
					"has to pass before pushing.\n",
			);
			return 0;
		}
		return 1;
	}

	mkdirSync(path.dirname(hookPath), { recursive: true });
	writeFileSync(hookPath, HOOK_SCRIPT, "utf8");
	if (process.platform !== "win32") {
		// Git executes hooks through sh on Windows regardless of this bit.
		chmodSync(hookPath, 0o755);
	}

	process.stdout.write(
		`[git-hooks] installed pre-push hook (${decision.reason}): ${hookPath}\n`,
	);
	return 0;
}

if (import.meta.main) {
	process.exit(main());
}
