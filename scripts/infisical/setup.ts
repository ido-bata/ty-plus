/**
 * `bun run secrets:setup` - cross-platform Infisical CLI restore and login.
 *
 * Verifies the repository binding to the self-hosted Infisical project,
 * installs the official Infisical CLI when missing, prompts for
 * `infisical login`, then runs `secrets:doctor` to validate the round-trip.
 *
 * Idempotent — re-running on a configured shell skips install and login when
 * the CLI is already on PATH and authentication succeeds.
 *
 * Supported platforms:
 *   - Windows 10/11   via winget
 *   - macOS           via Homebrew
 *   - Linux / WSL     via the Debian/Ubuntu apt repository
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const ENDPOINT = "https://secrets.rebuildup.dev";
export const PROJECT_ID = "4a42939b-5be2-47e7-8a23-f8931dfe2b1d";
export const ENVIRONMENT = "dev";

export interface BindingExpectation {
	readonly projectId?: string;
	readonly environment?: string;
	readonly endpoint?: string;
}

export interface InstallCommand {
	readonly cmd: string;
	readonly args: readonly string[];
	readonly label: string;
}

function normalizeDomain(domain: string): string {
	return domain.replace(/\/$/, "");
}

export function verifyBinding({
	bindingPath,
	projectId = PROJECT_ID,
	environment = ENVIRONMENT,
	endpoint = ENDPOINT,
}: {
	bindingPath: string;
	projectId?: string;
	environment?: string;
	endpoint?: string;
}): void {
	if (!existsSync(bindingPath)) {
		throw new Error(`.infisical.json not found at ${bindingPath}`);
	}
	let binding: {
		workspaceId?: string;
		defaultEnvironment?: string;
		domain?: string;
	};
	try {
		binding = JSON.parse(readFileSync(bindingPath, "utf8"));
	} catch (err) {
		throw new Error(
			`Failed to parse ${bindingPath}: ${(err as Error).message}`,
		);
	}
	const expectedDomain = normalizeDomain(endpoint);
	const actualDomain = normalizeDomain(String(binding.domain ?? ""));
	if (binding.workspaceId !== projectId) {
		throw new Error(
			`${bindingPath} workspaceId=${binding.workspaceId ?? "(missing)"} does not match expected ${projectId}`,
		);
	}
	if (binding.defaultEnvironment !== environment) {
		throw new Error(
			`${bindingPath} defaultEnvironment=${binding.defaultEnvironment ?? "(missing)"} does not match expected ${environment}`,
		);
	}
	if (actualDomain !== expectedDomain) {
		throw new Error(
			`${bindingPath} domain=${actualDomain || "(missing)"} does not match expected ${expectedDomain}`,
		);
	}
}

export function installCommandFor(platform: NodeJS.Platform): InstallCommand {
	if (platform === "win32") {
		return {
			cmd: "winget",
			args: [
				"install",
				"--id",
				"infisical.infisical",
				"--exact",
				"--accept-source-agreements",
				"--accept-package-agreements",
			],
			label: "winget install --id infisical.infisical --exact",
		};
	}
	if (platform === "darwin") {
		return {
			cmd: "brew",
			args: ["install", "infisical/get-cli/infisical"],
			label: "brew install infisical/get-cli/infisical",
		};
	}
	// Linux / WSL — Debian/Ubuntu (WSL default). The `curl ... | sudo -E bash`
	// form below is a remote-root trust boundary: a DNS-, TLS-, or
	// upstream-endpoint compromise of artifacts-cli.infisical.com yields
	// silent root code execution with no checksum or signature pin. The
	// threat model — and a checksum-verified fallback (download the .deb
	// directly, verify SHA-256 against a pinned value, then `dpkg -i`) — is
	// documented in docs/architecture/cloud/secrets.md. Contributors who
	// need that stronger guarantee should follow the manual path in that
	// doc instead of running this default.
	return {
		cmd: "bash",
		args: [
			"-c",
			"curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | sudo -E bash && sudo apt-get update && sudo apt-get install -y infisical",
		],
		label: "curl ... | sudo -E bash && sudo apt-get install -y infisical",
	};
}

export function defaultRunWhich(): string | null {
	const cmd = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(cmd, ["infisical"], { encoding: "utf8" });
	if (result.status !== 0) return null;
	const first = result.stdout.split(/\r?\n/)[0]?.trim();
	return first ? first : null;
}

export function findInfisicalCli({
	runWhich = defaultRunWhich,
	extraSearchPaths = [],
}: {
	runWhich?: () => string | null;
	extraSearchPaths?: readonly string[];
} = {}): string | null {
	const fromPath = runWhich();
	if (fromPath) return fromPath;
	for (const candidate of extraSearchPaths) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

function wingetLinksPath(): string | null {
	if (process.platform !== "win32") return null;
	const localAppData =
		process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
	return join(localAppData, "Microsoft", "WinGet", "Links", "infisical.exe");
}

function log(message: string): void {
	process.stdout.write(`[secrets:setup] ${message}\n`);
}

function fail(message: string, code = 1): never {
	process.stderr.write(`[secrets:setup] ${message}\n`);
	process.exit(code);
}

function runInherited(cmd: string, args: readonly string[]): number {
	const result = spawnSync(cmd, [...args], { stdio: "inherit" });
	return result.status ?? 1;
}

/**
 * Decide whether `infisical login status` output proves authentication.
 *
 * `login status` is informational rather than a gate: several CLI versions
 * print "You are not logged in." to stdout and still exit 0, so the exit
 * code alone cannot carry the verdict. An explicit stdout marker is required
 * instead.
 *
 * The negative form is tested first on purpose. The positive pattern
 * (`logged in`) is a substring of the negative sentence, so matching the
 * positive first would authenticate a machine that is explicitly not logged
 * in — exactly the case this function exists to reject.
 *
 * `scripts/infisical/secrets-doctor.ps1` implements the same contract in
 * PowerShell; the two must stay in sync.
 */
export function looksAuthenticated(stdout: string): boolean {
	const text = stdout.toLowerCase();
	if (/\bnot\s+(?:logged\s*in|authenticated)\b/.test(text)) return false;
	return /\b(?:logged\s*in|authenticated)\b/.test(text);
}

function isAuthenticated(cliPath: string): boolean {
	const result = spawnSync(cliPath, ["login", "status", "--domain", ENDPOINT], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.status !== 0) return false;
	return looksAuthenticated(result.stdout);
}

function login(cliPath: string, env: NodeJS.ProcessEnv = process.env): number {
	const serviceToken = env.INFISICAL_TOKEN ?? env.INFISICAL_SERVICE_TOKEN;
	if (serviceToken && serviceToken.length > 0) {
		log(`Using INFISICAL_TOKEN from environment (non-interactive login).`);
		return runInherited(cliPath, [
			"login",
			"--domain",
			ENDPOINT,
			"--token",
			serviceToken,
		]);
	}
	log(`Authenticate against ${ENDPOINT} (a browser window will appear).`);
	return runInherited(cliPath, ["login", "--domain", ENDPOINT]);
}

function runDoctor(): number {
	return runInherited("bun", ["run", "secrets:doctor"]);
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
	const dryRun = argv.includes("--dry-run") || argv.includes("-n");
	const execute = (label: string, fn: () => number): number => {
		if (dryRun) {
			log(`[dry-run] would run: ${label}`);
			return 0;
		}
		return fn();
	};

	log(`verifying .infisical.json binding to ${ENDPOINT}`);
	const bindingPath = join(process.cwd(), ".infisical.json");
	try {
		verifyBinding({ bindingPath });
	} catch (err) {
		fail((err as Error).message);
	}
	log("binding OK");

	const extraSearchPaths: string[] = [];
	const wingetPath = wingetLinksPath();
	if (wingetPath) extraSearchPaths.push(wingetPath);

	let cliPath = findInfisicalCli({ extraSearchPaths });
	if (cliPath) {
		log(`Infisical CLI found: ${cliPath}`);
	} else {
		const install = installCommandFor(process.platform);
		log(`Infisical CLI not found; running: ${install.label}`);
		const code = execute(install.label, () =>
			runInherited(install.cmd, install.args),
		);
		if (code !== 0) {
			fail(
				`Infisical CLI install failed (exit ${code}). ` +
					`See docs/architecture/cloud/secrets.md for the manual install steps for this OS.`,
			);
		}
		if (dryRun) {
			log("[dry-run] would re-check PATH for the installed CLI");
			cliPath = "/dev/null/dry-run";
		} else {
			cliPath = findInfisicalCli({ extraSearchPaths });
			if (!cliPath) {
				fail(
					`Infisical CLI install completed but no infisical executable is visible in PATH. ` +
						`Open a new shell so the install location is on PATH, then re-run.`,
				);
			}
			log(`Infisical CLI installed: ${cliPath}`);
		}
	}

	if (dryRun) {
		log(`[dry-run] would check authentication with ${cliPath}`);
		log(`[dry-run] would run: ${cliPath} login --domain ${ENDPOINT}`);
	} else if (
		process.env.INFISICAL_TOKEN ??
		process.env.INFISICAL_SERVICE_TOKEN
	) {
		// Non-interactive CI path: the CLI consumes INFISICAL_TOKEN directly
		// for subsequent `run` invocations, so skip the cached-session check
		// and the interactive browser login.
		log(
			`INFISICAL_TOKEN set in environment; using it for non-interactive auth.`,
		);
	} else if (isAuthenticated(cliPath)) {
		log(`already authenticated to ${ENDPOINT}`);
	} else {
		const loginCode = login(cliPath);
		if (loginCode !== 0) {
			fail(`infisical login failed (exit ${loginCode})`);
		}
	}

	log(
		"running secrets:doctor to validate binding, auth, and runtime injection",
	);
	const doctorCode = execute("bun run secrets:doctor", () => runDoctor());
	if (doctorCode !== 0) {
		fail(`secrets:doctor failed (exit ${doctorCode}). See its output above.`);
	}

	log("setup complete");
	log("");
	log("Infisical is the source of truth for every config value, so setup");
	log("binds, authenticates and verifies — it deliberately writes no value");
	log("file. Wrap each command so the value resolves from that one source:");
	log("");
	log("  bun run secrets:run -- bun run dev");
	log("  bun run secrets:run -- bun run build");
	log("");
	log("`bun run dev` bare resolves nothing; wrap every command so values");
	log(
		"resolve from the Infisical SoT. See docs/architecture/cloud/secrets.md.",
	);
}

if (import.meta.main) {
	main();
}
