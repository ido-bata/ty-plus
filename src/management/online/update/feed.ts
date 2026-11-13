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
		channel:
			match[4] === "beta" || match[4] === "insider" ? match[4] : "stable",
		sequence,
	};
};

/**
 * Compares supported release versions with SemVer precedence.
 *
 * The prerelease is `<channel>.<sequence>`, so SemVer's rule applies
 * directly: compare the prerelease identifiers left to right, numeric
 * identifiers numerically and alphanumeric ones in ASCII order, and a
 * version with **no** prerelease outranks any prerelease of the same core.
 * Deriving this from the identifiers instead of a hardcoded channel ranking
 * means a new channel orders correctly without another table to update.
 *
 * Invalid versions compare as equal; callers validate before comparing.
 */
export const compareVersions = (left: string, right: string): number => {
	const a = parseVersion(left);
	const b = parseVersion(right);
	if (!a || !b) return 0;
	for (const field of ["major", "minor", "patch"] as const) {
		if (a[field] !== b[field]) return a[field] < b[field] ? -1 : 1;
	}
	// No prerelease outranks any prerelease (SemVer §11.3).
	if (a.sequence === null && b.sequence === null) return 0;
	if (a.sequence === null) return 1;
	if (b.sequence === null) return -1;
	// Compare the channel identifier as an ASCII string (SemVer §11.4.3).
	if (a.channel !== b.channel) return a.channel < b.channel ? -1 : 1;
	// Identical channel: the numeric sequence decides (§11.4.1).
	if (a.sequence !== b.sequence) return a.sequence < b.sequence ? -1 : 1;
	return 0;
};

const officialReleasePage = (url: string, tag: string): boolean => {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === "https:" &&
			parsed.hostname === "github.com" &&
			parsed.pathname === `/ido-bata/ty-plus/releases/tag/${tag}` &&
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
				`/ido-bata/ty-plus/releases/download/${tag}/${name}` &&
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
			if (
				name === `ty-plus-${tag}-${platform}.zip` ||
				name === `ty-plus-${tag}-${platform}.zxp`
			) {
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
	const signedPlatforms = new Set<UpdatePlatform>();
	for (const asset of assets) {
		if (asset.url.endsWith(".zxp")) signedPlatforms.add(asset.platform);
	}
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

/**
 * Runs `fetch` with a deadline without relying on `AbortSignal.timeout`, which
 * is absent in the CEP host Chromium versions After Effects ships. An
 * abandoned request is aborted so a hung connection cannot outlive the check.
 */
const fetchWithDeadline = async (
	url: string,
	timeoutMs: number,
): Promise<string> => {
	const controller =
		typeof AbortController === "function" ? new AbortController() : undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const deadline = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				controller?.abort();
				reject(new Error("GitHub release request timed out"));
			}, timeoutMs);
		});
		const request = fetch(url, {
			headers: { Accept: "application/vnd.github+json" },
			...(controller ? { signal: controller.signal } : {}),
			cache: "default",
		});
		const response = await Promise.race([request, deadline]);
		if (!response.ok) {
			throw new Error(`GitHub release request failed: HTTP ${response.status}`);
		}
		return await Promise.race([response.text(), deadline]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
};

export const defaultFetchFeedText: FetchFeedText = fetchWithDeadline;

/**
 * The host platform of the running panel. `navigator.platform` is deprecated
 * but is the only signal CEP exposes consistently; the user-agent string is
 * the fallback when it is empty.
 */
export const detectUpdatePlatform = (): UpdatePlatform | undefined => {
	if (typeof navigator === "undefined") return undefined;
	const hint = navigator.platform || navigator.userAgent || "";
	if (/Win/i.test(hint)) return "windows";
	if (/Mac/i.test(hint)) return "macos";
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
		return {
			status: "unavailable",
			reason: "invalid update channel or version",
		};
	}
	if (
		!/^https:\/\/api\.github\.com\/repos\/ido-bata\/ty-plus\/releases(?:\?|$)/.test(
			url,
		)
	) {
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
		return {
			status: "unavailable",
			reason: "invalid GitHub Releases response",
		};
	}
	if (!Array.isArray(raw)) {
		return {
			status: "unavailable",
			reason: "invalid GitHub Releases response",
		};
	}
	// Fold the eligibility checks into one pass so the common path is not
	// split across short-circuited filter stages.
	const select = (releases: unknown[]): UpdateFeed[] => {
		const eligible: UpdateFeed[] = [];
		for (const release of releases) {
			const item = parseGitHubRelease(release);
			if (item === null) continue;
			if (!acceptsReleaseChannel(channel, item.channel)) continue;
			if (
				input.platform !== undefined &&
				!item.assets.some((asset) => asset.platform === input.platform)
			)
				continue;
			eligible.push(item);
		}
		return eligible.sort((a, b) => compareVersions(b.version, a.version));
	};

	const pageUrl = (page: number): string => {
		const target = new URL(url);
		target.searchParams.set("page", String(page));
		return target.toString();
	};

	/**
	 * GitHub orders releases by creation time, not by version, so the newest
	 * eligible release can sit behind an older one — an old-line hotfix
	 * published later, or a page saturated by Insider snapshots. Page while
	 * the previous page was full (bounded to a handful of anonymous requests)
	 * and keep the highest version seen, instead of stopping at the first
	 * page that happens to hold *something* newer.
	 */
	const best = (releases: unknown[]): UpdateFeed | undefined =>
		select(releases)[0];
	const fetchFeedText = input.fetchFeedText ?? defaultFetchFeedText;
	const timeoutMs = input.timeoutMs ?? 10_000;
	// Recurrence rather than a for-loop with await: the next page is only
	// fetched once the previous page is known to be full, so the calls are
	// inherently sequential and cannot be batched with Promise.all.
	const paginate = async (
		page: number,
		pass: [UpdateFeed | undefined, number],
	): Promise<[UpdateFeed | undefined, number]> => {
		let [candidate, pageSize] = pass;
		if (pageSize !== 100 || page > 5) return pass;
		let pageBody: string;
		try {
			pageBody = await fetchFeedText(pageUrl(page), timeoutMs);
		} catch {
			return pass;
		}
		let pageData: unknown;
		try {
			pageData = JSON.parse(pageBody) as unknown;
		} catch {
			return pass;
		}
		if (!Array.isArray(pageData)) return pass;
		pageSize = pageData.length;
		const next = best(pageData);
		if (
			next !== undefined &&
			(candidate === undefined ||
				compareVersions(next.version, candidate.version) > 0)
		) {
			candidate = next;
		}
		return paginate(page + 1, [candidate, pageSize]);
	};
	const [candidate] = await paginate(2, [best(raw), raw.length]);
	if (candidate === undefined) {
		return { status: "unavailable", reason: "no releases for this channel" };
	}
	if (compareVersions(candidate.version, input.currentVersion) > 0) {
		return { status: "update-available", feed: candidate };
	}
	return { status: "up-to-date" };
};
