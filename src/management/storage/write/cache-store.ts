/**
 * Write-side cache file helpers for notifications and remote presets.
 * Routes through the unified persistence API; the supportRoot argument is gone.
 */

import { writeJson } from "@/management/storage/persistence";
import type {
	NotificationCache,
	PublicLinksCache,
	RemotePresetCache,
} from "@/management/storage/read/cache-store";

export const writeNotifications = (
	win: Window,
	data: NotificationCache,
): Promise<void> => writeJson(win, "notifications", data);

export const writeRemotePresets = (
	win: Window,
	data: RemotePresetCache,
): Promise<void> => writeJson(win, "remotePresets", data);

export const writePublicLinks = (
	win: Window,
	data: PublicLinksCache,
): Promise<void> => writeJson(win, "publicLinks", data);
