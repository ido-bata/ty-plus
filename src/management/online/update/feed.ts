/**
 * Update feed client (Issue #7).
 *
 * The feed is a static JSON document (docs/architecture/feeds.md). Fetching
 * never throws to the caller: every failure mode (network down, timeout,
 * malformed body, invalid URL) reads as "unavailable", because the offline
 * core must not depend on the feed being reachable.
 */

export const DEFAULT_UPDATE_FEED_URL = "https://ty-plus.app/feeds/update.json";

export type UpdateFeedAsset = {
	platform: "windows" | "macos";
	url: string;
	sha256: string;
};

export type UpdateFeed = {
	schema: "ty-plus.update-feed/1";
	channel: string;
	version: string;
	publishedAt: string;
	releaseNotesUrl: string;
	assets: UpdateFeedAsset[];
};

export type UpdateCheckResult =
	| { status: "update-available"; feed: UpdateFeed }
	| { status: "up-to-date" }
	| { status: "unavailable"; reason: string };

const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Compares MAJOR.MINOR.PATCH versions; negative when left is older. */
export const compareVersions = (left: string, right: string): number => {
	const parse = (value: string): readonly number[] | undefined => {
		if (!VERSION_PATTERN.test(value)) return undefined;
		return value.split(".").map((part) => Number.parseInt(part, 10));
	};
	const l = parse(left);
	const r = parse(right);
	if (l === undefined || r === undefined) return 0;
	for (let index = 0; index < 3; index += 1) {
		const a = l[index] ?? 0;
		const b = r[index] ?? 0;
		if (a !== b) return a < b ? -1 : 1;
	}
	return 0;
};

/** Strict feed validation. Returns null for anything malformed. */
export const parseUpdateFeed = (raw: unknown): UpdateFeed | null => {
	if (!isRecord(raw) || raw.schema !== "ty-plus.update-feed/1") return null;
	const channel = raw.channel;
	const version = raw.version;
	const publishedAt = raw.publishedAt;
	const releaseNotesUrl = raw.releaseNotesUrl;
	const assets = raw.assets;
	if (
		typeof channel !== "string" ||
		typeof version !== "string" ||
		!VERSION_PATTERN.test(version) ||
		typeof publishedAt !== "string" ||
		typeof releaseNotesUrl !== "string" ||
		!/^https:\/\//.test(releaseNotesUrl) ||
		!Array.isArray(assets)
	) {
		return null;
	}
	const parsedAssets: UpdateFeedAsset[] = [];
	for (const entry of assets) {
		if (!isRecord(entry)) return null;
		const { platform, url, sha256 } = entry;
		if (
			(platform !== "windows" && platform !== "macos") ||
			typeof url !== "string" ||
			!/^https:\/\//.test(url) ||
			typeof sha256 !== "string" ||
			!SHA256_PATTERN.test(sha256)
		) {
			return null;
		}
		parsedAssets.push({ platform, url, sha256 });
	}
	return {
		schema: "ty-plus.update-feed/1",
		channel,
		version,
		publishedAt,
		releaseNotesUrl,
		assets: parsedAssets,
	};
};

export type FetchFeedText = (url: string, timeoutMs: number) => Promise<string>;

export const defaultFetchFeedText: FetchFeedText = async (url, timeoutMs) => {
	const response = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) {
		throw new Error(`feed request failed: HTTP ${response.status}`);
	}
	return response.text();
};

/**
 * Checks the feed once and compares against the running version.
 * `unavailable` covers every failure: unreachable host, timeout,
 * malformed feed, or an invalid (non-HTTPS) URL.
 */
export const checkForUpdate = async (input: {
	currentVersion: string;
	feedUrl?: string;
	timeoutMs?: number;
	fetchFeedText?: FetchFeedText;
}): Promise<UpdateCheckResult> => {
	const feedUrl = input.feedUrl ?? DEFAULT_UPDATE_FEED_URL;
	const timeoutMs = input.timeoutMs ?? 10_000;
	const fetchFeedText = input.fetchFeedText ?? defaultFetchFeedText;
	if (!/^https:\/\//.test(feedUrl)) {
		return { status: "unavailable", reason: "feed url must be https" };
	}
	let text: string;
	try {
		text = await fetchFeedText(feedUrl, timeoutMs);
	} catch {
		return { status: "unavailable", reason: "feed fetch failed" };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return { status: "unavailable", reason: "feed is not valid JSON" };
	}
	const feed = parseUpdateFeed(parsed);
	if (feed === null) {
		return { status: "unavailable", reason: "feed failed validation" };
	}
	if (compareVersions(feed.version, input.currentVersion) > 0) {
		return { status: "update-available", feed };
	}
	return { status: "up-to-date" };
};
