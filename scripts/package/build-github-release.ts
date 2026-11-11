#!/usr/bin/env bun
/**
 * One-command GitHub Release candidate creation.
 * Builds, audits and stages platform artifacts; never publishes.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolveReleaseAssetNames } from "./prepare-github-release";

const option = (name: string): string | undefined =>
	process.argv.slice(2).find((arg) => arg.startsWith("--" + name + "="))
		?.slice(name.length + 3);

const main = (): void => {
	const channel = option("channel");
	const releaseVersion = option("release-version");
	if (
		(channel !== "stable" && channel !== "beta" && channel !== "insider") ||
		!releaseVersion
	) {
		throw new Error(
			"Usage: bun scripts/package/build-github-release.ts " +
				"--channel=stable|beta|insider --release-version=X.Y.Z[-beta.N|-insider.N]",
		);
	}
	const platform =
		process.platform === "win32"
			? "windows"
			: process.platform === "darwin"
				? "macos"
				: null;
	if (!platform) {
		throw new Error("GitHub Release packaging requires Windows or macOS");
	}
	const metadata = resolveReleaseAssetNames(releaseVersion, platform);
	if (metadata.channel !== channel) {
		throw new Error("channel and prerelease tag disagree");
	}
	const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
	const coreVersion = releaseVersion.split("-")[0];
	if (pkg.version !== coreVersion) {
		throw new Error(
			"package.json.version must be " + coreVersion + " (actual: " + pkg.version + ")",
		);
	}

	const env = {
		...process.env,
		TY_PLUS_RELEASE_VERSION: releaseVersion,
		TY_PLUS_RELEASE_CHANNEL: channel,
	};
	for (const script of [
		"scripts/package/build-release.ts",
		"scripts/verify/verify-release-artifacts.ts",
		"scripts/package/prepare-github-release.ts",
	]) {
		const result = spawnSync("bun", [script], {
			stdio: "inherit",
			env,
			cwd: process.cwd(),
		});
		if (result.status !== 0) {
			throw new Error(
				"GitHub release candidate stopped at " + script +
					" (exit " + (result.status ?? "unknown") + ")",
			);
		}
	}
	console.log(
		"[github-release] " + metadata.tag +
			" (" + channel + ") prepared; no tag, release or public upload created",
	);
};

if (import.meta.main) {
	main();
}
