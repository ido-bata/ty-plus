import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Execution-level contract for the argument vector `scripts/infisical/run.ps1`
 * hands to `infisical run`.
 *
 * These tests launch a real PowerShell process that splats the vector at a
 * real child, and assert on the argv the child reports back. Asserting on the
 * array we constructed would only restate the implementation; the defects this
 * guards against were both invisible in the constructed array and only appeared
 * in what the child actually received.
 *
 * Requires PowerShell 7 on PATH — the same prerequisite `secrets:run` itself
 * has. When it is absent the suite reports the condition instead of quietly
 * passing, because a silent pass here would hide the exact regression it
 * exists to catch.
 */

const FIXTURES_DIR = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures",
);
const DRIVER = path.join(FIXTURES_DIR, "forward-argv.ps1");

/** Production runs on Windows, where the default is `Windows`; CI on Linux uses `Standard`. */
const NATIVE_ARGUMENT_PASSING_MODES = ["Windows", "Standard"] as const;

/**
 * Per-test budget for the cases that launch a real `pwsh`.
 *
 * The unit project's `testTimeout: 5000` is sized for in-process tests. Every
 * case here pays for a full PowerShell interpreter start *plus* the child
 * process the fixture spawns, and the first case in the file additionally pays
 * the cold page-cache cost of loading the interpreter from disk on a fresh CI
 * runner — measured at 7636 ms on `ubuntu-latest`, over the default budget by
 * half again. The budget has to cover the interpreter, so it is set well above
 * what the process actually needs rather than tuned down to the local timing.
 */
const POWERSHELL_SPAWN_TIMEOUT_MS = 30_000;

function pwshMajorVersion(): number | null {
	const result = spawnSync(
		"pwsh",
		["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"],
		{ encoding: "utf8" },
	);
	if (result.status !== 0) return null;
	const major = Number.parseInt(result.stdout.trim(), 10);
	return Number.isNaN(major) ? null : major;
}

const pwshMajor = pwshMajorVersion();
const describeWithPwsh =
	pwshMajor === null || pwshMajor < 7 ? describe.skip : describe;

interface ForwardOutcome {
	status: number | null;
	stdout: string;
	stderr: string;
	received: unknown;
}

function forward(tokens: readonly string[], mode?: string): ForwardOutcome {
	const result = spawnSync("pwsh", ["-NoProfile", "-File", DRIVER], {
		encoding: "utf8",
		env: {
			...process.env,
			INFISICAL_WRAPPER_TEST_TOKENS: JSON.stringify(tokens),
			...(mode ? { INFISICAL_WRAPPER_TEST_MODE: mode } : {}),
		},
	});
	let received: unknown;
	try {
		received = JSON.parse(result.stdout.trim());
	} catch {
		received = undefined;
	}
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		received,
	};
}

describeWithPwsh("Infisical run wrapper argument vector", () => {
	if (pwshMajor === null) {
		it("requires PowerShell 7 on PATH, which is missing", () => {
			throw new Error(
				"pwsh was not found on PATH. `bun run secrets:run` needs PowerShell 7, " +
					"so this contract cannot be verified here and must not be reported as passing.",
			);
		});
		return;
	}

	if (pwshMajor < 7) {
		it("requires PowerShell 7 or later", () => {
			throw new Error(
				`PowerShell ${pwshMajor} is on PATH but 7 or later is required by run.ps1.`,
			);
		});
		return;
	}

	describe.each(NATIVE_ARGUMENT_PASSING_MODES)(
		"with $PSNativeCommandArgumentPassing=%s",
		(mode) => {
			it(
				"forwards exactly one argv entry per token",
				() => {
					const tokens = ["bun", "run", "build"];
					const { status, stderr, received } = forward(tokens, mode);
					expect(stderr).toBe("");
					expect(status).toBe(0);
					expect(received).toEqual(tokens);
				},
				POWERSHELL_SPAWN_TIMEOUT_MS,
			);

			it(
				"preserves a token containing spaces as a single argument",
				() => {
					const tokens = [
						"bun",
						"run",
						"C:\\Program Files\\ty plus\\scripts\\build.js",
					];
					const { status, received } = forward(tokens, mode);
					expect(status).toBe(0);
					expect(received).toEqual(tokens);
				},
				POWERSHELL_SPAWN_TIMEOUT_MS,
			);

			it(
				"preserves a token containing embedded quotes",
				() => {
					const tokens = ["bun", "run", 'say "hi"', "it's"];
					const { status, received } = forward(tokens, mode);
					expect(status).toBe(0);
					expect(received).toEqual(tokens);
				},
				POWERSHELL_SPAWN_TIMEOUT_MS,
			);

			it(
				"does not inject a second `--` separator ahead of the command",
				() => {
					// The reported defect: the wrapper prepended a literal "--" while
					// run.ps1 already passed a separator, so `infisical run` tried to
					// execute a program literally named "--".
					const tokens = ["bun", "run", "secrets:doctor"];
					const { status, received } = forward(tokens, mode);
					expect(status).toBe(0);
					expect(received).toEqual(tokens);
					expect(received).not.toContain("--");
				},
				POWERSHELL_SPAWN_TIMEOUT_MS,
			);

			it(
				"keeps a caller-supplied `--` as data instead of consuming it",
				() => {
					const tokens = ["pwsh", "-Command", "$x", "--", "value"];
					const { status, received } = forward(tokens, mode);
					expect(status).toBe(0);
					expect(received).toEqual(tokens);
				},
				POWERSHELL_SPAWN_TIMEOUT_MS,
			);
		},
	);

	it(
		"rejects an empty command vector instead of forwarding nothing",
		() => {
			const { status, stderr, stdout } = forward([]);
			expect(status).not.toBe(0);
			expect(stdout).toBe("");
			expect(stderr).not.toBe("");
		},
		POWERSHELL_SPAWN_TIMEOUT_MS,
	);

	it(
		"forwards a realistic `bun run secrets:run` command unchanged",
		() => {
			const tokens = [
				"bun",
				"run",
				"--silent",
				"scripts/package/sign-zxp.ts",
				"--out",
				"dist/ty plus.zxp",
			];
			const { status, received } = forward(tokens, "Windows");
			expect(status).toBe(0);
			expect(received).toEqual(tokens);
		},
		POWERSHELL_SPAWN_TIMEOUT_MS,
	);
});
