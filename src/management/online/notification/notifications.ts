/**
 * Notifications cache helpers — persists to cache/notifications.json via the
 * unified persistence API. Combines notification items and per-id read
 * timestamps into a single store object.
 */

import type { NotificationSummary } from "@/management/online/contract";
import { readNotifications } from "@/management/storage/read/cache-store";
import { writeNotifications } from "@/management/storage/write/cache-store";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationStore = {
	items: NotificationSummary[];
	readAtById: Record<string, string>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_STORE = (): NotificationStore => ({
	items: [],
	readAtById: {},
});

const validateItems = (raw: unknown): NotificationSummary[] => {
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(row): row is NotificationSummary =>
			!!row &&
			typeof row === "object" &&
			typeof (row as NotificationSummary).notificationId === "string" &&
			typeof (row as NotificationSummary).name === "string",
	);
};

const validateReadAtById = (raw: unknown): Record<string, string> => {
	if (!raw || typeof raw !== "object") return {};
	const entries = Object.entries(raw as Record<string, unknown>);
	return Object.fromEntries(
		entries.filter(([, v]) => typeof v === "string"),
	) as Record<string, string>;
};

const toStore = (raw: unknown): NotificationStore => {
	if (!raw || typeof raw !== "object") return EMPTY_STORE();
	const obj = raw as Record<string, unknown>;
	return {
		items: validateItems(obj.items),
		readAtById: validateReadAtById(obj.readAtById),
	};
};

// ── Exported API ─────────────────────────────────────────────────────────────

/** Load the notifications store from cache/notifications.json. */
export const loadNotificationsStore = async (
	win: Window,
): Promise<NotificationStore> => {
	const raw = await readNotifications(win);
	if (raw == null) return EMPTY_STORE();
	return toStore(raw);
};

/** Save the notifications store to cache/notifications.json. */
export const saveNotificationsStore = async (
	win: Window,
	store: NotificationStore,
): Promise<void> => {
	await writeNotifications(win, store);
};
