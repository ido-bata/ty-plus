/**
 * Read-side cache file helpers for notifications and remote presets.
 * Routes through the unified persistence API; no path strings here.
 */

import { readJson } from "@/management/storage/persistence";

export type NotificationCache = Record<string, unknown>;
export type RemotePresetCache = Record<string, unknown>;

type PublicLinkCacheEntry = {
	url: string;
	label?: string;
	updatedAt?: string;
};

export type PublicLinksCache = {
	version: 1;
	updatedAt: string;
	links: Record<string, PublicLinkCacheEntry>;
};

/**
 * Read the notifications cache.
 * Returns parsed object or null if missing/unreadable/invalid.
 */
export const readNotifications = async (
	win: Window,
): Promise<NotificationCache | null> => readJson(win, "notifications");

/**
 * Read the remote presets cache.
 * Returns parsed object or null if missing/unreadable/invalid.
 */
export const readRemotePresets = async (
	win: Window,
): Promise<RemotePresetCache | null> => readJson(win, "remotePresets");

/**
 * Read the public-links cache.
 * Returns parsed object or null if missing/unreadable/invalid or if the
 * stored version does not match the v1 schema.
 */
export const readPublicLinks = async (
	win: Window,
): Promise<PublicLinksCache | null> => {
	const parsed = await readJson(win, "publicLinks");
	if (!parsed) return null;
	if (parsed.version !== 1) return null;
	const linksRaw = parsed.links;
	if (!linksRaw || typeof linksRaw !== "object") return null;
	const links: Record<string, PublicLinkCacheEntry> = {};
	for (const [key, value] of Object.entries(
		linksRaw as Record<string, unknown>,
	)) {
		if (!value || typeof value !== "object") continue;
		const entry = value as Record<string, unknown>;
		if (typeof entry.url !== "string") continue;
		links[key] = {
			url: entry.url,
			label: typeof entry.label === "string" ? entry.label : undefined,
			updatedAt:
				typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
		};
	}
	const updatedAt =
		typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
	return { version: 1, updatedAt, links };
};
