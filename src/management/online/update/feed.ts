/**
 * GitHub Releases update provider (Issue #55 / ADR-0004).
 *
 * This module only checks published releases and links to the official
 * release page. It never downloads or executes release assets. The core
 * continues to operate offline, and no GitHub token is stored in a bundle.
 */
import {
	acceptsReleaseChannel,
	isReleaseChannel,
	type ReleaseChannel,
} from "./channel";

export const OFFICIAL_RELEASES_URL =
	"https://github.com/ido-bata/ty-plus/releases";
export const DEFAULT_UPDATE_FEED_URL =
	"https://api.github.com/repos/ido-bata/ty-plus/releases?per_page=100";

export type UpdatePlatform = "windows" | "macos";

export type UpdateFeedAsset = {
	platform: UpdatePlatform;
	url: string;
	sha256: string;
};

export type UpdateFeed = {
	schema: "ty-plus.github-releases/1";
	channel: ReleaseChannel;
	version: string;
	publishedAt: string;
	releaseNotesUrl: string;
	assets: UpdateFeedAsset[];
};

export type UpdateCheckResult =
	| { status: "update-available"; feed: UpdateFeed }
	| { status: "up-to-date" }
	| { status: "unavailable"; reason: string };

type ParsedVersion = {
	major: number;
	minor: number;
	patch: number;
	channel: ReleaseChannel;
	sequence: number | null;
};

/** CEP manifest still uses numeric X.Y.Z; release identity can include a prerelease suffix. */
const VERSION_PATTERN =
	/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|insider)\.(0|[1-9]\d*))?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const parseVersion = (value: string): ParsedVersion | null => {
	const match = VERSION_PATTERN.exec(value);
	if (!match) return null;
	const numbers = [match[1], match[2], match[3]].map(Number);
	const sequence = match[5] === undefined ? null : Number(match[5]);
	if (
		numbers.some((n) => !Number.isSafeInteger(n)) ||
		(sequence !== null && !Number.isSafeInteger(sequence))
	) {
		return null;
	}
	return {
		major: numbers[0],
		minor: numbers[1],
		patch: numbers[2],
		channel: match[4] === "beta" || match[4] === "insider"
			? match[4]
			: "stable",
		sequence,
	};
};

/** Compare supported SemVer tags; invalid versions compare as equal. */
export const compareVersions = (left: string, right: string): number => {
	const a = parseVersion(left);
	const b = parseVersion(right);
	if (!a || !b) return 0;
	for (const field of ["major", "minor", "patch"] as const) {
		if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
	}
	const rank = (channel: ReleaseChannel): number =>
		channel === "stable" ? 2 : channel === "insider" ? 1 : 0;
	if (rank(a.channel) !== rank(b.channel)) {
		return rank(a.channel) < rank(b.channel) ? -1 : 1;
	}
	if (a.sequence !== null && b.sequence !== null && a.sequence !== b.sequence) {
		return a.sequence < b.sequence ? -1 : 1;
	}
	return 0;
};

const officialReleasePage = (url: string, tag: string): boolean => {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === "https:" &&
			parsed.hostname === "github.com" &&
			parsed.pathname === "/ido-bata/ty-plus/releases/tag/" + tag &&
			parsed.search === "" &&
			parsed.hash === ""
		);
	} catch {
		return false;
	}
};

const officialAssetUrl = (url: string, tag: string, name: string): boolean => {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === "https:" &&
			parsed.hostname === "github.com" &&
			parsed.pathname ===
				"/ido-bata/ty-plus/releases/download/" + tag + "/" + name &&
			parsed.search === "" &&
			parsed.hash === ""
		);
	} catch {
		return false;
	}
};

/**
 * Converts one GitHub Release into a validated update candidate.
 * A public release must include an uploaded, content-digested platform
 * archive; otherwise the UI must not promise an installable update.
 */
export const parseGitHubRelease = (raw: unknown): UpdateFeed | null => {
	if (!isRecord(raw) || raw.draft !== false) return null;
	const tag = raw.tag_name;
	if (typeof tag !== "string" || !tag.startsWith("v")) return null;
	const version = parseVersion(tag);
	if (!version) return null;
	if (raw.prerelease !== (version.channel !== "stable")) return null;
	if (
		typeof raw.html_url !== "string" ||
		!officialReleasePage(raw.html_url, tag) ||
		typeof raw.published_at !== "string" ||
		!Number.isFinite(Date.parse(raw.published_at)) ||
		!Array.isArray(raw.assets)
	) {
		return null;
	}
	const assets: UpdateFeedAsset[] = [];
	for (const asset of raw.assets) {
		if (!isRecord(asset) || asset.state !== "uploaded") continue;
		const { name, browser_download_url: url, digest } = asset;
		if (
			typeof name !== "string" ||
			typeof url !== "string" ||
			typeof digest !== "string" ||
			!digest.startsWith("sha256:") ||
			!SHA256_PATTERN.test(digest.slice(7)) ||
			!officialAssetUrl(url, tag, name)
		) {
			continue;
		}
		for (const platform of ["windows", "macos"] as const) {
			if (name === "ty-plus-" + tag + "-" + platform + ".zip" ||
				name === "ty-plus-" + tag + "-" + platform + ".zxp") {
				assets.push({
					platform,
					url,
					sha256: digest.slice(7).toLowerCase(),
				});
			}
		}
	}
	// A standalone ZIP is not a normally installable CEP package.
	// Require an uploaded ZXP for each advertised platform.
	const signedPlatforms = new Set(
		assets.filter((asset) => asset.url.endsWith(".zxp")).map((asset) => asset.platform),
	);
	if (signedPlatforms.size === 0) return null;
	const publishableAssets = assets.filter((asset) =>
		signedPlatforms.has(asset.platform),
	);
	return {
		schema: "ty-plus.github-releases/1",
		channel: version.channel,
		version: tag.slice(1),
		publishedAt: raw.published_at,
		releaseNotesUrl: raw.html_url,
		assets: publishableAssets,
	};
};

export type FetchFeedText = (url: string, timeoutMs: number) => Promise<string>;

export const defaultFetchFeedText: FetchFeedText = async (url, timeoutMs) => {
	const response = await fetch(url, {
		headers: { Accept: "application/vnd.github+json" },
		signal: AbortSignal.timeout(timeoutMs),
		cache: "default",
	});
	if (!response.ok) {
		throw new Error("GitHub release request failed: HTTP " + response.status);
	}
	return response.text();
};

export const detectUpdatePlatform = (): UpdatePlatform | undefined => {
	if (typeof navigator === "undefined") return undefined;
	if (/Win/i.test(navigator.platform)) return "windows";
	if (/Mac/i.test(navigator.platform)) return "macos";
	return undefined;
};

/** Never throws. Public Releases API returns 404 while the repo is private. */
export const checkForUpdate = async (input: {
	currentVersion: string;
	channel?: ReleaseChannel;
	platform?: UpdatePlatform;
	feedUrl?: string;
	timeoutMs?: number;
	fetchFeedText?: FetchFeedText;
}): Promise<UpdateCheckResult> => {
	const channel = input.channel ?? "stable";
	const url = input.feedUrl ?? DEFAULT_UPDATE_FEED_URL;
	if (!isReleaseChannel(channel) || !parseVersion(input.currentVersion)) {
		return { status: "unavailable", reason: "invalid update channel or version" };
	}
	if (!/^https:\/\/api\.github\.com\/repos\/ido-bata\/ty-plus\/releases(?:\?|$)/.test(url)) {
		return { status: "unavailable", reason: "unsupported release endpoint" };
	}
	let body: string;
	try {
		body = await (input.fetchFeedText ?? defaultFetchFeedText)(
			url,
			input.timeoutMs ?? 10_000,
		);
	} catch {
		return { status: "unavailable", reason: "GitHub Releases unavailable" };
	}
	let raw: unknown;
	try {
		raw = JSON.parse(body) as unknown;
	} catch {
		return { status: "unavailable", reason: "invalid GitHub Releases response" };
	}
	if (!Array.isArray(raw)) {
		return { status: "unavailable", reason: "invalid GitHub Releases response" };
	}
	const select = (releases: unknown[]): UpdateFeed[] =>
		releases
			.map(parseGitHubRelease)
			.filter((item): item is UpdateFeed => item !== null)
			.filter((item) => acceptsReleaseChannel(channel, item.channel))
			.filter(
				(item) =>
					input.platform === undefined ||
					item.assets.some((asset) => asset.platform === input.platform),
			)
			.sort((a, b) => compareVersions(b.version, a.version));

	let candidates = select(raw);
	// GitHub's first release page can be saturated by Insider snapshots.
	// Page only if no release is eligible for this channel, with a bounded
	// number of anonymous API requests; do not loop indefinitely.
	let pageSize = raw.length;
	for (let page = 2; candidates.length === 0 && pageSize === 100 && page <= 5; page += 1) {
		let pageBody: string;
		try {
			pageBody = await (input.fetchFeedText ?? defaultFetchFeedText)(
				DEFAULT_UPDATE_FEED_URL + "&page=" + page,
				input.timeoutMs ?? 10_000,
			);
			const pageData: unknown = JSON.parse(pageBody) as unknown;
			if (!Array.isArray(pageData)) break;
			pageSize = pageData.length;
			candidates = select(pageData);
		} catch {
			break;
		}
	}
	if (candidates.length === 0) {
		return { status: "unavailable", reason: "no releases for this channel" };
	}
	const newest = candidates[0];
	if (compareVersions(newest.version, input.currentVersion) > 0) {
		return { status: "update-available", feed: newest };
	}
	return { status: "up-to-date" };
};
