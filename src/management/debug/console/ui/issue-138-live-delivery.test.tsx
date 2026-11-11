// @vitest-environment happy-dom

/**
 * Issue #138 — live delivery to an already-open Debug Console.
 *
 * Retention answers "can I read what happened before I opened this";
 * this file pins the other half of the acceptance criterion: while the
 * console is open, a `createLogger(source)` emit on this surface and a
 * publish from another surface must appear without waiting for a timer,
 * a poll, or a re-open.
 *
 * Nothing is faked away except the CEP surface bus (which is the seam
 * under test — the test drives it directly) and CEP shared storage (the
 * retention layer, irrelevant here). The interceptor, the canonical
 * LogBus, `shared-bridge` and `dialog-root` are the real modules.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

type TransportSubscriber = (envelope: SurfaceMessageEnvelope) => void;

const { transportProbe } = vi.hoisted(() => ({
	transportProbe: {
		subscribers: new Set<TransportSubscriber>(),
		published: [] as SurfaceMessageEnvelope[],
	},
}));

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): SurfaceTransport => ({
		publish: (message: SurfaceMessageEnvelope) => {
			transportProbe.published.push(message);
			return Promise.resolve();
		},
		subscribe: (handler: TransportSubscriber) => {
			transportProbe.subscribers.add(handler);
			return () => {
				transportProbe.subscribers.delete(handler);
			};
		},
	}),
	readCepOpenParams: () => null,
}));

const { sharedStorage } = vi.hoisted(() => ({
	sharedStorage: new Map<string, unknown>(),
}));

vi.mock("@/management/storage/cep", () => ({
	getCepSharedData: async (_win: Window, key: string): Promise<unknown> =>
		sharedStorage.get(key) ?? null,
	setCepSharedData: async (
		_win: Window,
		key: string,
		value: unknown,
	): Promise<void> => {
		sharedStorage.set(key, value);
	},
	deleteCepSharedData: async (_win: Window, key: string): Promise<void> => {
		sharedStorage.delete(key);
	},
	setCepSharedDataMax: async (
		_win: Window,
		key: string,
		incoming: number,
	): Promise<number> => {
		const existing = sharedStorage.get(key);
		const next =
			typeof existing === "number" && existing > incoming ? existing : incoming;
		sharedStorage.set(key, next);
		return next;
	},
}));

const { DebugDialogRoot } = await import("./dialog-root");
const { LOG_SURFACE_CHANNEL } = await import(
	"@/management/debug/console/interceptor"
);
const { createLogger, _resetBusForTests, _setDevConsoleEnabled } = await import(
	"@/management/debug/logger"
);

const publishFromAnotherSurface = (
	sourceSurfaceId: string,
	payload: Record<string, unknown>,
): void => {
	const envelope = {
		messageId: String(payload.id),
		channel: LOG_SURFACE_CHANNEL,
		kind: "publish" as const,
		sourceSurfaceId,
		payload,
		createdAt: Date.now(),
	} as unknown as SurfaceMessageEnvelope;
	for (const handler of transportProbe.subscribers) {
		handler(envelope);
	}
};

beforeEach(() => {
	_resetBusForTests();
	_setDevConsoleEnabled(false);
	transportProbe.subscribers.clear();
	transportProbe.published.length = 0;
	sharedStorage.clear();
});

afterEach(() => {
	cleanup();
});

describe("Debug Console receives live events while open (Issue #138)", () => {
	it("shows a createLogger emit from this surface immediately", async () => {
		render(<DebugDialogRoot surfaceId="debug-console" />);
		expect(
			await screen.findByText("[ty-plus] Debug console booted"),
		).toBeTruthy();

		// No timer advance, no re-mount, no re-open: the emit is the event.
		createLogger("panel").info("panel-emit-while-open");

		expect(await screen.findByText("panel-emit-while-open")).toBeTruthy();
	});

	it("shows a modeless surface publish immediately, with its source", async () => {
		render(<DebugDialogRoot surfaceId="debug-console" />);
		expect(
			await screen.findByText("[ty-plus] Debug console booted"),
		).toBeTruthy();

		publishFromAnotherSurface("modeless-surface", {
			v: 1,
			id: "remote-modeless-1",
			level: "info",
			text: "modeless-emit-while-open",
			timestamp: new Date().toISOString(),
			source: "modeless",
			action: "open-dialog",
			context: { requestId: "req-9" },
		});

		expect(await screen.findByText("modeless-emit-while-open")).toBeTruthy();
	});

	it("keeps distinct ids that share the same text after both paths deliver", async () => {
		render(<DebugDialogRoot surfaceId="debug-console" />);
		await screen.findByText("[ty-plus] Debug console booted");

		const sharedText = "same-text-two-ids";
		createLogger("panel").info(sharedText);
		publishFromAnotherSurface("modeless-surface", {
			v: 1,
			id: "remote-same-text",
			level: "info",
			text: sharedText,
			timestamp: new Date().toISOString(),
			source: "modeless",
		});

		// Dedupe is by id: two rows with identical text must both survive.
		await waitFor(() => {
			expect(screen.getAllByText(sharedText)).toHaveLength(2);
		});
	});

	it("delivers the same event only once when it echoes back", async () => {
		render(<DebugDialogRoot surfaceId="debug-console" />);
		await screen.findByText("[ty-plus] Debug console booted");

		const echoed = {
			v: 1,
			id: "echoed-1",
			level: "warn",
			text: "echoed-event",
			timestamp: new Date().toISOString(),
			source: "host-bridge",
		};
		publishFromAnotherSurface("panel-surface", echoed);
		// The very same message id arriving a second time (CEP echo,
		// another surface republishing) must not add a row.
		publishFromAnotherSurface("panel-surface", echoed);

		await waitFor(() => {
			expect(screen.getAllByText("echoed-event")).toHaveLength(1);
		});
	});
});
