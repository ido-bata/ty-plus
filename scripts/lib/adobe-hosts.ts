import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

const findAfterEffectsExecutable = () => {
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

export const launchAfterEffects = (
	executablePath = findAfterEffectsExecutable(),
) => {
	const child = spawn(executablePath, [], {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	child.unref();
	return executablePath;
};
