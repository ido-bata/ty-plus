import { describe, expect, it, vi } from "vitest";

import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";
import { subscribeWorkspaceGridLive } from "./subscribe-grid-live";

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
	const onGrid = vi.fn();
	subscribeWorkspaceGridLive(transport, surfaceId, onGrid);
	return {
		onGrid,
		emit: (message: SurfaceMessageEnvelope) => handler?.(message),
	};
};

const themeLiveEnvelope = (
	overrides: Record<string, string>,
	options: { sourceSurfaceId?: string; replace?: boolean } = {},
): SurfaceMessageEnvelope => ({
	messageId: "m1",
	channel: SHELL_CHANNELS.settings,
	kind: "publish",
	sourceSurfaceId: options.sourceSurfaceId ?? "dialog-settings",
	payload: {
		kind: "themeLive",
		sourceSurfaceId: options.sourceSurfaceId ?? "dialog-settings",
		at: new Date().toISOString(),
		overrides,
		...(options.replace ? { replace: true } : {}),
	},
	createdAt: Date.now(),
});

const GRID_OVERRIDES = {
	"ty-ws-cell": "64px",
	"ty-ws-grid-gap": "8px",
	"ty-ws-grid-radius": "4px",
};

describe("subscribeWorkspaceGridLive", () => {
	it("reports grid metrics from a partial themeLive payload", () => {
		const { emit, onGrid } = mountSubscriber("panel-1");
		emit(themeLiveEnvelope(GRID_OVERRIDES));
		expect(onGrid).toHaveBeenCalledWith({
			cellSize: 64,
			gap: 8,
			radius: 4,
		});
	});

	it("ignores payloads from the same surface", () => {
		const { emit, onGrid } = mountSubscriber("panel-1");
		emit(themeLiveEnvelope(GRID_OVERRIDES, { sourceSurfaceId: "panel-1" }));
		expect(onGrid).not.toHaveBeenCalled();
	});

	it("keeps stale metrics when a partial payload lacks grid tokens", () => {
		const { emit, onGrid } = mountSubscriber("panel-1");
		emit(themeLiveEnvelope({ "accent-color": "#ff0000" }));
		expect(onGrid).not.toHaveBeenCalled();
	});

	it("converges to dialog defaults when a replace payload omits grid tokens", () => {
		const { emit, onGrid } = mountSubscriber("panel-1");
		emit(themeLiveEnvelope({ "accent-color": "#ff0000" }, { replace: true }));
		expect(onGrid).toHaveBeenCalledWith({
			cellSize: 48,
			gap: 4,
			radius: 2,
		});
	});
});
