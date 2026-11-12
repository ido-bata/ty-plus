#!/usr/bin/env bun
/**
 * One-command GitHub Release candidate creation (Issue #55).
 *
 * This is the operator entry point used by the release runbook and the
 * `release-channels` Skill. It builds, audits and stages platform artifacts
 * for one channel; it never creates a tag, a GitHub Release or any public
 * upload. Publication is a separate, explicitly authorized action.
 *
 * Channel semantics live in `release-version.ts`. Do not re-implement them
 * here or in another script — a new channel or distribution provider must be
 * added to that module (and to the panel's subscription contract) instead.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
	assertReleaseIdentity,
	isPrereleaseChannel,
	type ReleasePlatform,
	releaseAssetNames,
} from "./release-version";

const option = (name: string): string | undefined =>
	process.argv
		.slice(2)
		.find((arg) => arg.startsWith(`--${name}=`))
		?.slice(name.length + 3);

export type CandidatePlan = Readonly<{
	releaseVersion: string;
	channel: string;
	platform: ReleasePlatform;
	prerelease: boolean;
	stagedDirectory: string;
	assetNames: readonly string[];
}>;

/** Pure planning step: everything the command will do, without doing it. */
export const planCandidate = (input: {
	readonly channel: string | undefined;
	readonly releaseVersion: string | undefined;
	readonly packageVersion: string;
	readonly hostPlatform: NodeJS.Platform;
}): CandidatePlan => {
	// A lookup keeps host→platform in one place instead of growing a ternary
	// chain when another host is supported.
	const platformsByHost: Partial<Record<NodeJS.Platform, ReleasePlatform>> = {
		win32: "windows",
		darwin: "macos",
	};
	const platform = platformsByHost[input.hostPlatform];
	if (!platform) {
		throw new Error("GitHub Release packaging requires Windows or macOS");
	}
	if (!input.releaseVersion) {
		throw new Error(
			"Usage: bun scripts/package/build-github-release.ts " +
				"--channel=stable|beta|insider --release-version=X.Y.Z[-beta.N|-insider.N]",
		);
	}
	const version = assertReleaseIdentity({
		releaseVersion: input.releaseVersion,
		packageVersion: input.packageVersion,
		channel: input.channel,
	});
	const names = releaseAssetNames(version, platform);
	return {
		releaseVersion: version.releaseVersion,
		channel: version.channel,
		platform,
		prerelease: isPrereleaseChannel(version.channel),
		stagedDirectory: "dist/github-release",
		assetNames: [names.zip, names.zxp, names.manifest],
	};
};

const main = (): void => {
	const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
		version: string;
	};
	const plan = planCandidate({
		channel: option("channel"),
		releaseVersion: option("release-version"),
		packageVersion: pkg.version,
		hostPlatform: process.platform,
	});

	const env = {
		...process.env,
		TY_PLUS_RELEASE_VERSION: plan.releaseVersion,
		TY_PLUS_RELEASE_CHANNEL: plan.channel,
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
				"GitHub release candidate stopped at " +
					script +
					" (exit " +
					(result.status ?? "unknown") +
					")",
			);
		}
	}
	console.log(
		"[github-release] v" +
			plan.releaseVersion +
			" (" +
			plan.channel +
			", " +
			plan.platform +
			", prerelease=" +
			plan.prerelease +
			") prepared under " +
			plan.stagedDirectory,
	);
	console.log(`[github-release] assets: ${plan.assetNames.join(", ")}`);
	console.log(
		"[github-release] no tag, release or public upload was created — " +
			"publication needs the owner's explicit authorization",
	);
};

if (import.meta.main) {
	main();
}
