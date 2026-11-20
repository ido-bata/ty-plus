/**
 * Release data boundary.
 *
 * `listReleases` is the single entry point for release information. #260
 * replaces the stub with a GitHub Releases fetch (server-side, cached) while
 * keeping this signature stable for pages and future public API clients.
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
	assets: ReleaseAsset[];
}

/** Returns published (non-draft) releases, newest first. */
export async function listReleases(): Promise<ReleaseInfo[]> {
	// TODO(#260): fetch https://api.github.com/repos/ido-bata/ty-plus/releases
	// with caching and a static fallback snapshot.
	return [];
}
