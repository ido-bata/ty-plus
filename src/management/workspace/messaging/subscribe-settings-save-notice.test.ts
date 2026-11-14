import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationStore } from "@/management/online/notification/service";
import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";
import { subscribeSettingsSaveNotices } from "./subscribe-settings-save-notice";

type Handler = (message: SurfaceMessageEnvelope) => void;

const mountSubscriber = (surfaceId: string) => {
	let handler: Handler | null = null;
	const transport: SurfaceTransport = {
		publish: vi.fn(),
		subscribe: vi.fn((h: Handler) => {
			handler = h;
			return () => {};
		}),
	};
	const unsub = subscribeSettingsSaveNotices(transport, surfaceId);
	return {
		emit: (message: SurfaceMessageEnvelope) => handler?.(message),
		unsub,
	};
};

const saveNoticeEnvelope = (
	overrides: Partial<SurfaceMessageEnvelope> = {},
): SurfaceMessageEnvelope => ({
	messageId: "m1",
	channel: SHELL_CHANNELS.settings,
	kind: "publish",
	sourceSurfaceId: "dialog-settings",
	payload: {
		kind: "saveNotice",
		sourceSurfaceId: "dialog-settings",
		at: new Date().toISOString(),
		ok: false,
		message: "Failed to save settings.",
	},
	createdAt: Date.now(),
	...overrides,
});

describe("subscribeSettingsSaveNotices (#96)", () => {
	afterEach(() => {
		notificationStore.clear();
	});

	it("shows a persistent error toast on the primary panel", () => {
		const { emit } = mountSubscriber("panel-1");
		emit(saveNoticeEnvelope());
		const entries = notificationStore.getNotifications();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.type).toBe("error");
		expect(entries[0]?.duration).toBe(0);
	});

	it("ignores notices on auxiliary panels to avoid duplicate toasts", () => {
		const { emit } = mountSubscriber("panel-3");
		emit(saveNoticeEnvelope());
		expect(notificationStore.getNotifications()).toHaveLength(0);
	});

	it("ignores successful saves and other channels", () => {
		const { emit } = mountSubscriber("panel-1");
		emit(
			saveNoticeEnvelope({
				payload: {
					kind: "saveNotice",
					sourceSurfaceId: "dialog-settings",
					at: new Date().toISOString(),
					ok: true,
				},
			}),
		);
		emit(saveNoticeEnvelope({ channel: SHELL_CHANNELS.layout }));
		expect(notificationStore.getNotifications()).toHaveLength(0);
	});
});
