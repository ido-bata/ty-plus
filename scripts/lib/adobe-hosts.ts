import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const readRegistryInstallPath = (key: string) => {
	try {
		const output = execFileSync("reg", ["query", key, "/v", "InstallPath"], {
			encoding: "utf8",
			windowsHide: true,
		});

		const line = output
			.split(/\r?\n/)
			.find((entry) => entry.includes("InstallPath"));
		if (!line) {
			return undefined;
		}

		const match = line.match(/InstallPath\s+REG_\w+\s+(.+)$/);
		return match?.[1]?.trim();
	} catch {
		return undefined;
	}
};

/**
 * Locate the After Effects application bundle on macOS.
 *
 * Windows resolves an install path from the registry and finds `AfterFX.exe`
 * inside it. macOS has no equivalent registry entry, and Adobe ships two
 * layouts — `…/Adobe After Effects <major>/Adobe After Effects <major>.app`,
 * and the bundle directly under `/Applications` — so both are searched
 * explicitly rather than assumed. The highest installed version wins.
 *
 * Returns the `.app` bundle, not a binary inside it: macOS launches
 * applications, not their `Contents/MacOS` executables.
 */
export const findAfterEffectsMacApp = (
	applicationsRoot = "/Applications",
): string | undefined => {
	let entries: string[];
	try {
		entries = readdirSync(applicationsRoot);
	} catch {
		return undefined;
	}
	const newestFirst = entries
		.filter((name) => /^Adobe After Effects \d/.test(name))
		.sort((left, right) =>
			right.localeCompare(left, undefined, { numeric: true }),
		);
	for (const entry of newestFirst) {
		// The entry is either the version folder or the bundle itself.
		const base = entry.endsWith(".app") ? entry.slice(0, -4) : entry;
		for (const candidate of [
			path.join(applicationsRoot, entry, `${base}.app`),
			path.join(applicationsRoot, `${base}.app`),
		]) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}
	return undefined;
};

const findAfterEffectsMacApplication = (): string => {
	const app = findAfterEffectsMacApp();
	if (app) {
		return app;
	}
	const looked = [
		"/Applications/Adobe After Effects <version>/Adobe After Effects <version>.app",
		"/Applications/Adobe After Effects <version>.app",
	].join(", ");
	throw new Error(
		`After Effects application could not be found (looked for: ${looked}). ` +
			"Launch After Effects yourself and run `bun run host:deploy` instead — " +
			"the build and the CEP install do not depend on the launch step.",
	);
};

const findAfterEffectsWindowsExecutable = () => {
	const installPath =
		readRegistryInstallPath("HKLM\\SOFTWARE\\Adobe\\After Effects\\26.0") ??
		readRegistryInstallPath(
			"HKLM\\SOFTWARE\\WOW6432Node\\Adobe\\After Effects\\26.0",
		);

	const candidates = [
		installPath ? path.join(installPath, "AfterFX.exe") : undefined,
		installPath ? path.join(installPath, "AfterFX.com") : undefined,
	].filter((value): value is string => Boolean(value));

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error("After Effects executable could not be found");
};

const findAfterEffectsExecutable = (): string =>
	process.platform === "darwin"
		? findAfterEffectsMacApplication()
		: findAfterEffectsWindowsExecutable();

/**
 * Start After Effects.
 *
 * On macOS the argument is an `.app` bundle and `open -a` is used: launching
 * `Contents/MacOS/…` directly bypasses Launch Services.
 *
 * @returns the application path or executable that was launched.
 */
export const launchAfterEffects = (
	applicationPath = findAfterEffectsExecutable(),
) => {
	const child =
		process.platform === "darwin"
			? spawn("open", ["-a", applicationPath], {
					detached: true,
					stdio: "ignore",
				})
			: spawn(applicationPath, [], {
					detached: true,
					stdio: "ignore",
					windowsHide: true,
				});
	child.unref();
	return applicationPath;
};
