/**
 * Web-only server functions.
 *
 * Everything under `src/server/` runs exclusively on the server (Workers in
 * production, the Vite dev/preview server locally). These functions are NOT
 * the public API for CEP or third-party clients — that contract lives in
 * `src/lib/` and any future `src/api/` surface. Keep I/O, secrets, and
 * runtime-specific APIs here.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
	ReleaseInfo,
	ReleasesResult,
	ReleasesSource,
} from "../lib/releases";

const RELEASES_API_URL =
	"https://api.github.com/repos/ido-bata/ty-plus/releases?per_page=30";
const FETCH_TIMEOUT_MS = 8_000;
/** Reuse a live result briefly so bursts do not hammer the anonymous rate limit. */
const LIVE_CACHE_TTL_MS = 10 * 60 * 1000;

interface GitHubReleaseAsset {
	name?: unknown;
	browser_download_url?: unknown;
	size?: unknown;
}

interface GitHubRelease {
	tag_name?: unknown;
	name?: unknown;
	published_at?: unknown;
	prerelease?: unknown;
	draft?: unknown;
	html_url?: unknown;
	assets?: unknown;
}

interface SnapshotFile {
	generatedAt?: unknown;
	releases?: unknown;
}

let liveCache: { at: number; result: ReleasesResult } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function mapRelease(raw: unknown): ReleaseInfo | null {
	if (!isRecord(raw)) return null;
	const r = raw as GitHubRelease;
	if (typeof r.tag_name !== "string" || typeof r.html_url !== "string") {
		return null;
	}
	if (r.draft === true) return null;
	const assets = Array.isArray(r.assets) ? r.assets : [];
	return {
		tagName: r.tag_name,
		name: typeof r.name === "string" ? r.name : "",
		publishedAt: typeof r.published_at === "string" ? r.published_at : "",
		prerelease: r.prerelease === true,
		draft: false,
		htmlUrl: r.html_url,
		assets: assets.flatMap((a) => {
			if (!isRecord(a)) return [];
			const asset = a as GitHubReleaseAsset;
			if (
				typeof asset.name !== "string" ||
				typeof asset.browser_download_url !== "string"
			) {
				return [];
			}
			return [
				{
					name: asset.name,
					url: asset.browser_download_url,
					size: typeof asset.size === "number" ? asset.size : null,
				},
			];
		}),
	};
}

/**
 * Fetches and maps live GitHub Releases. Exported for the snapshot refresh
 * script (`scripts/fetch-release-snapshot.ts`); pages should use
 * `listReleases`, which adds caching and fallback.
 */
export async function fetchGitHubReleases(): Promise<ReleaseInfo[]> {
	const response = await fetch(RELEASES_API_URL, {
		headers: {
			Accept: "application/vnd.github+json",
			// GitHub rejects API requests without a User-Agent.
			"User-Agent": "ty-plus-web (+https://github.com/ido-bata/ty-plus)",
		},
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`GitHub Releases API responded ${response.status}`);
	}
	const body: unknown = await response.json();
	if (!Array.isArray(body)) {
		throw new Error("GitHub Releases API returned a non-array body");
	}
	return body
		.map(mapRelease)
		.filter((r): r is ReleaseInfo => r !== null)
		.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

async function loadSnapshot(): Promise<ReleasesResult> {
	// Dynamic import keeps the snapshot out of the client bundle; the
	// createServerFn transform strips handler bodies from client builds.
	const { default: snapshot } = (await import("./releases.snapshot.json")) as {
		default: SnapshotFile;
	};
	const releases = Array.isArray(snapshot.releases)
		? (snapshot.releases as ReleaseInfo[])
		: [];
	const source: ReleasesSource = releases.length > 0 ? "snapshot" : "empty";
	return {
		releases,
		source,
		fetchedAt:
			typeof snapshot.generatedAt === "string" ? snapshot.generatedAt : null,
	};
}

/**
 * Returns published releases newest-first. Falls back to the bundled snapshot
 * when the GitHub API is unreachable or rate-limited so pages never break.
 */
export const listReleases = createServerFn({ method: "GET" }).handler(
	async (): Promise<ReleasesResult> => {
		if (liveCache && Date.now() - liveCache.at < LIVE_CACHE_TTL_MS) {
			return liveCache.result;
		}
		try {
			const releases = await fetchGitHubReleases();
			const result: ReleasesResult = {
				releases,
				source: "live",
				fetchedAt: new Date().toISOString(),
			};
			liveCache = { at: Date.now(), result };
			return result;
		} catch {
			return loadSnapshot();
		}
	},
);
