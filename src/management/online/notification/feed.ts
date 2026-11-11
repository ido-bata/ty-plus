/**
 * Static notification feed client (Issue #8).
 *
 * R0 runs without the ty-plus backend: official notifications come from a
 * static JSON document (docs/architecture/feeds.md) on any static host.
 * Fetching never throws to the caller — a failed or malformed feed reads as
 * "no remote items" and the local cache stays authoritative.
 */

import type { NotificationSummary } from "@/management/online/contract";

export const DEFAULT_NOTIFICATION_FEED_URL =
	"https://ty-plus.app/feeds/notifications.json";

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationFeedItem = {
	id: string;
	title: string;
	summary?: string;
	url?: string;
	severity: NotificationSeverity;
	publishedAt: string;
	expiresAt?: string;
};

export type NotificationFeed = {
	schema: "ty-plus.notification-feed/1";
	items: NotificationFeedItem[];
};

const IS_KNOWN_SEVERITY: Record<string, boolean> = {
	info: true,
	warning: true,
	critical: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isExpired = (item: NotificationFeedItem, now: Date): boolean => {
	if (item.expiresAt === undefined) return false;
	const expires = new Date(item.expiresAt);
	return (
		Number.isFinite(expires.getTime()) && expires.getTime() <= now.getTime()
	);
};

/**
 * Strict feed validation. Invalid items are dropped individually; the feed
 * as a whole only fails on a wrong schema or a non-object body. Expired
 * items are filtered with the provided clock (injectable for tests).
 */
export const parseNotificationFeed = (
	raw: unknown,
	now: Date = new Date(),
): NotificationFeed | null => {
	if (!isRecord(raw) || raw.schema !== "ty-plus.notification-feed/1") {
		return null;
	}
	if (!Array.isArray(raw.items)) return null;
	const items: NotificationFeedItem[] = [];
	for (const entry of raw.items) {
		if (!isRecord(entry)) continue;
		const { id, title, summary, url, severity, publishedAt, expiresAt } = entry;
		if (
			typeof id !== "string" ||
			id.length === 0 ||
			typeof title !== "string" ||
			title.length === 0 ||
			typeof severity !== "string" ||
			!IS_KNOWN_SEVERITY[severity] ||
			typeof publishedAt !== "string" ||
			(summary !== undefined && typeof summary !== "string") ||
			(url !== undefined &&
				(typeof url !== "string" || !/^https:\/\//.test(url))) ||
			(expiresAt !== undefined && typeof expiresAt !== "string")
		) {
			continue;
		}
		const item: NotificationFeedItem = {
			id,
			title,
			severity: severity as NotificationSeverity,
			publishedAt,
			...(summary !== undefined ? { summary } : {}),
			...(url !== undefined ? { url } : {}),
			...(expiresAt !== undefined ? { expiresAt } : {}),
		};
		if (!isExpired(item, now)) {
			items.push(item);
		}
	}
	return { schema: "ty-plus.notification-feed/1", items };
};

/** Maps a feed item onto the persisted notification summary shape. */
export const toNotificationSummary = (
	item: NotificationFeedItem,
): NotificationSummary & {
	severity?: NotificationSeverity;
	url?: string;
} => ({
	notificationId: item.id,
	name: item.title,
	...(item.summary !== undefined ? { summary: item.summary } : {}),
	...(item.publishedAt !== undefined ? { publishedAt: item.publishedAt } : {}),
	severity: item.severity,
	...(item.url !== undefined ? { url: item.url } : {}),
});

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
 * Fetches and validates the feed. Returns the mapped summaries, or null when
 * anything fails (unreachable, timeout, malformed) — the caller keeps its
 * local cache in that case.
 */
export const fetchNotificationFeed = async (
	input: {
		feedUrl?: string;
		timeoutMs?: number;
		now?: Date;
		fetchFeedText?: FetchFeedText;
	} = {},
): Promise<NotificationSummary[] | null> => {
	const feedUrl = input.feedUrl ?? DEFAULT_NOTIFICATION_FEED_URL;
	const timeoutMs = input.timeoutMs ?? 10_000;
	const fetchFeedText = input.fetchFeedText ?? defaultFetchFeedText;
	if (!/^https:\/\//.test(feedUrl)) return null;
	let text: string;
	try {
		text = await fetchFeedText(feedUrl, timeoutMs);
	} catch {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return null;
	}
	const feed = parseNotificationFeed(parsed, input.now);
	if (feed === null) return null;
	return feed.items.map(toNotificationSummary);
};
