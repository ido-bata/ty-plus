/**
 * User-facing notification service for CEP panels.
 * React-friendly version using a simple pub/sub pattern for React to render via Portal.
 */

export type NotificationType = "info" | "warning" | "error";

export type NotificationOptions = {
	/** Auto-dismiss after milliseconds (0 = no auto-dismiss) */
	duration?: number;
	/** Whether notification can be dismissed by clicking */
	dismissible?: boolean;
};

export type NotificationEntry = {
	id: string;
	message: string;
	type: NotificationType;
	duration: number;
	dismissible: boolean;
};

// ── Reactive Store ────────────────────────────────────────────────────────────

let listeners: Array<(entries: readonly NotificationEntry[]) => void> = [];
let notifications: readonly NotificationEntry[] = [];

const notifyListeners = (): void => {
	for (const listener of listeners) {
		listener(notifications);
	}
};

export const notificationStore = {
	getNotifications(): readonly NotificationEntry[] {
		return notifications;
	},
	subscribe(
		listener: (entries: readonly NotificationEntry[]) => void,
	): () => void {
		listeners.push(listener);
		return () => {
			listeners = listeners.filter((l) => l !== listener);
		};
	},
	add(
		message: string,
		type: NotificationType,
		options: NotificationOptions = {},
	): string {
		const { duration = 5000, dismissible = true } = options;
		const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`;

		const entry: NotificationEntry = {
			id,
			message,
			type,
			duration,
			dismissible,
		};

		notifications = [...notifications, entry];
		notifyListeners();

		if (duration > 0) {
			setTimeout(() => {
				this.remove(id);
			}, duration);
		}

		return id;
	},
	remove(id: string): void {
		notifications = notifications.filter((n) => n.id !== id);
		notifyListeners();
	},
	clear(): void {
		notifications = [];
		notifyListeners();
	},
};

// ── Core API (Maintains Backward Compatibility) ──────────────────────────────────

/**
 * Show a notification toast.
 * @returns notification id
 */
const showNotification = (
	message: string,
	type: NotificationType = "info",
	options: NotificationOptions = {},
): string => {
	return notificationStore.add(message, type, options);
};

/**
 * Dismiss a notification by id.
 */
const dismissNotification = (id: string): void => {
	notificationStore.remove(id);
};

/**
 * Dismiss all active notifications.
 */
const dismissAllNotifications = (): void => {
	notificationStore.clear();
};

// ── Convenience wrappers ───────────────────────────────────────────────────────

/** Show error notification. */
const showError = (message: string, options?: NotificationOptions): string =>
	showNotification(message, "error", options);

/** Show warning notification. */
const showWarning = (message: string, options?: NotificationOptions): string =>
	showNotification(message, "warning", options);

/** Show info notification. */
const showInfo = (message: string, options?: NotificationOptions): string =>
	showNotification(message, "info", options);

/** Convert AppError to user-friendly notification message. */
const notifyError = (error: { code?: string; message?: string }): string => {
	let message = error.message || "An error occurred";

	if (error.code) {
		switch (error.code) {
			case "FS_PERMISSION":
				message = "Permission denied. Please check file/folder permissions.";
				break;
			case "FS_NOT_FOUND":
				message =
					"File or folder not found. It may have been moved or deleted.";
				break;
			case "FS_CORRUPTED":
				message =
					"Data file is corrupted and has been backed up. Please retry.";
				break;
			case "AE_EVAL_FAILED":
				message = "After Effects command failed. Try again or restart AE.";
				break;
			case "AE_NOT_AVAILABLE":
				message = "After Effects connection lost. Please restart the panel.";
				break;
			case "NETWORK":
			case "NETWORK_TIMEOUT":
				message = "Network error. Please check your connection.";
				break;
			default:
				break;
		}
	}

	return showError(message, { duration: 8000 });
};
