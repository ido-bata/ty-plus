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
