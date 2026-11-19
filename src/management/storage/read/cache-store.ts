/**
 * Read-side cache file helpers for notifications.
 * Routes through the unified persistence API; no path strings here.
 */

import { readJson } from "@/management/storage/persistence";

export type NotificationCache = Record<string, unknown>;

/**
 * Read the notifications cache.
 * Returns parsed object or null if missing/unreadable/invalid.
 */
export const readNotifications = async (
	win: Window,
): Promise<NotificationCache | null> => readJson(win, "notifications");
