/**
 * Release domain contract.
 *
 * This module is the isomorphic boundary for release information: pure types
 * and helpers that both the web server functions (`src/server/`) and future
 * public API clients (CEP, third-party) can share. Anything that performs I/O
 * or depends on a runtime belongs in `src/server/` instead.
 */

export interface ReleaseAsset {
	name: string;
	url: string;
	size: number | null;
}

export interface ReleaseInfo {
	tagName: string;
	name: string;
	publishedAt: string;
	prerelease: boolean;
	draft: boolean;
	htmlUrl: string;
	/** GitHub release notes body (may be empty). */
	body: string;
	assets: ReleaseAsset[];
}

export type ReleaseChannel = "stable" | "beta" | "insider";

/** Where the release list came from when it was served. */
export type ReleasesSource = "live" | "snapshot" | "empty";

export interface ReleasesResult {
	releases: ReleaseInfo[];
	source: ReleasesSource;
	/** ISO timestamp of the live fetch, or of the snapshot generation. */
	fetchedAt: string | null;
}

const INSIDER_PATTERN = /insider/i;

/**
 * Maps a GitHub release to a distribution channel. Stable is any published
 * non-prerelease; prereleases are split into Insider (tag contains
 * "insider") and Beta (everything else).
 */
export function classifyChannel(
	release: Pick<ReleaseInfo, "tagName" | "prerelease">,
): ReleaseChannel {
	if (!release.prerelease) return "stable";
	return INSIDER_PATTERN.test(release.tagName) ? "insider" : "beta";
}

/** Latest published stable release, or undefined when none exists. */
export function findLatestStable(
	releases: readonly ReleaseInfo[],
): ReleaseInfo | undefined {
	return releases.find((r) => classifyChannel(r) === "stable");
}

/** Returns the ZXP installer asset for the given OS, if the release ships one. */
export function zxpAsset(
	release: Pick<ReleaseInfo, "assets">,
	os: "windows" | "macos",
): ReleaseAsset | undefined {
	const suffix = `-${os}.zxp`;
	return release.assets.find((a) => a.name.endsWith(suffix));
}
