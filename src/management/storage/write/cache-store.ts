/**
 * Write-side cache file helpers for notifications.
 * Routes through the unified persistence API; the supportRoot argument is gone.
 */

import { writeJson } from "@/management/storage/persistence";
import type { NotificationCache } from "@/management/storage/read/cache-store";

export const writeNotifications = (
	win: Window,
	data: NotificationCache,
): Promise<void> => writeJson(win, "notifications", data);
