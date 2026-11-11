// @vitest-environment happy-dom
//
// Issue #138 — reopen-replay cross-surface coverage.
//
// Scenario:
//   1. Surface A (a panel that has been alive for a while) emits
//      diagnostic logs via the canonical LogBus.
//   2. Surface B (the Debug Console re-opening later) fires a
//      `replay-request` envelope on `SHELL_CHANNELS.debug` and expects
//      surface A to answer with the bus snapshot.
//   3. A subsequent live `publish` carrying the same id MUST be
//      merged into the response payload's `byId` map without producing
//      a duplicate row.
//
// Mock the CEP surface transport (the same way as
// `cross-surface-replay-live.test.ts`) so the bus and the
// `installReplayResponderWith` pathway exercise end-to-end without a
// real CSInterface.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeLogMessages } from "@/management/debug/console/message-store";
import {
	_resetBusForTests,
	createLogger,
	getEntries,
} from "@/management/debug/logger";
import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

// ── Mocked transport factory ────────────────────────────────────────────────
//
// Each window has its own subscriber set; the responder uses
// `transport.subscribe(...)` and publishes through `transport.publish(...)`.

interface MockTransport extends SurfaceTransport {
	__getSubscribers: () => Set<(env: SurfaceMessageEnvelope) => void>;
	__getPublishCalls: () => SurfaceMessageEnvelope[];
}

const makeMockTransport = (): MockTransport => {
	const subscribers = new Set<(env: SurfaceMessageEnvelope) => void>();
	const publishCalls: SurfaceMessageEnvelope[] = [];
	return {
		publish: vi.fn(async (message: SurfaceMessageEnvelope) => {
			publishCalls.push(message);
		}),
		subscribe: vi.fn((handler: (env: SurfaceMessageEnvelope) => void) => {
			subscribers.add(handler);
			return () => {
				subscribers.delete(handler);
			};
		}),
		__getSubscribers: () => subscribers,
		__getPublishCalls: () => publishCalls,
	};
};

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): MockTransport => makeMockTransport(),
}));

const { installReplayResponderWith } = await import(
	"@/management/debug/console/interceptor"
);
const { createCepSurfaceTransport } = await import(
	"@/management/ae/cep/transport"
);
const { SHELL_CHANNELS } = await import(
	"@/management/workspace/surface/contract"
);

const flushMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

const installResponderOnWindow = (surfaceId: string): MockTransport => {
	const transport = createCepSurfaceTransport(window) as MockTransport;
	installReplayResponderWith(transport, surfaceId);
	return transport;
};

/**
 * Simulate a fresh Debug Console opening by firing a `replay-request`
 * envelope on the live surface's transport.  The responder installed
 * by `installReplayResponderWith` will publish a `replay-response` back
 * through the same transport; we collect it here so the caller can
 * inspect the entries without needing the panel's own subscriber to
 * trigger.
 */
const requestReplayOn = async (
	panelTransport: MockTransport,
	request: {
		messageId: string;
		sourceSurfaceId: string;
		requestId: string;
	},
): Promise<SurfaceMessageEnvelope> => {
	const subs = panelTransport.__getSubscribers();
	for (const handler of subs) {
		handler({
			messageId: request.messageId,
			correlationId: request.messageId,
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: request.sourceSurfaceId,
			payload: {
				kind: "replay-request",
				requestId: request.requestId,
				maxEntries: 1000,
			},
			createdAt: Date.now(),
		});
	}
	await flushMicrotasks();
	const response = panelTransport
		.__getPublishCalls()
		.find((c) => c.kind === "response");
	if (!response) throw new Error("replay-response was not published");
	return response;
};

const fireLivePublish = (
	panelTransport: MockTransport,
	envelope: SurfaceMessageEnvelope,
): void => {
	const subs = panelTransport.__getSubscribers();
	for (const handler of subs) {
		handler(envelope);
	}
};

beforeEach(() => {
	_resetBusForTests();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Issue #138 — reopen-replay cross-surface coverage", () => {
	it("win2 receives the original entry via replay-request after win1 emitted it via createLogger", async () => {
		// win1 (panel) has been alive for a while.  Drop a diagnostic
		// event into the canonical LogBus.
		const panel = createLogger("online-runtime");
		panel.info("[ty-plus] write A");

		expect(getEntries()).toHaveLength(1);
		const originalId = getEntries()[0].id;

		// win1 installs the replay responder.
		const panelTransport = installResponderOnWindow("panel-1");

		// win2 (the Debug Console re-opening) fires a replay-request.
		const response = await requestReplayOn(panelTransport, {
			messageId: "msg-reopen-138-A",
			sourceSurfaceId: "debug-console",
			requestId: "r-reopen-138-A",
		});

		// The response MUST carry the original entry's id and text.
		const payload = response.payload as {
			kind: string;
			entries: ReadonlyArray<{ id: string; text: string }>;
			sourceSurfaceId: string;
		};
		expect(payload.kind).toBe("replay-response");
		expect(payload.sourceSurfaceId).toBe("panel-1");
		const ids = payload.entries.map((e) => e.id);
		expect(ids).toContain(originalId);
		const matchEntry = payload.entries.find((e) => e.id === originalId);
		expect(matchEntry?.text).toBe("[ty-plus] write A");
	});

	it("a subsequent live publish with the SAME id does not duplicate the row (byId dedup on win2)", async () => {
		// Same setup — win1 has emitted one entry.
		const panel = createLogger("operation-worker");
		panel.info("[ty-plus] write B");
		const idB = getEntries()[0].id;

		const panelTransport = installResponderOnWindow("panel-1");

		// 1) win2 receives the bus snapshot via replay-request.
		const replayResponse = await requestReplayOn(panelTransport, {
			messageId: "msg-reopen-138-B",
			sourceSurfaceId: "debug-console",
			requestId: "r-reopen-138-B",
		});
		const replayEntries = (
			replayResponse.payload as { entries: { id: string }[] }
		).entries;
		const seen = new Set(replayEntries.map((e) => e.id));
		expect(seen.has(idB)).toBe(true);

		// 2) A live publish envelope carrying the SAME id is dispatched
		//    AFTER the replay.  This is the canonical replay-then-live
		//    race that the Debug Console must dedupe by id (the same
		//    `byId` Map that `mergeLogMessages` uses).
		const liveEnvelope: SurfaceMessageEnvelope = {
			messageId: `live-${idB}`,
			channel: SHELL_CHANNELS.debug,
			kind: "publish",
			sourceSurfaceId: "panel-1",
			payload: {
				v: 1,
				id: idB,
				level: "info",
				text: "[ty-plus] write B (live echo)",
				timestamp: new Date().toISOString(),
				source: "operation-worker",
			},
			createdAt: Date.now(),
		};
		fireLivePublish(panelTransport, liveEnvelope);
		await flushMicrotasks();

		// 3) win2's merged buffer (replay + live) MUST contain exactly
		//    one row for idB, not two.  This is the contract
		//    `mergeLogMessages` enforces — same id from any source
		//    collapses to one row.
		const replayedOnly = replayEntries.map((e) => ({
			id: e.id,
			level: "info" as const,
			text: (e as { id: string; text?: string }).text ?? "from-replay",
			args: [],
			timestamp: new Date(),
			source: "operation-worker",
		}));
		const liveEcho = [
			{
				id: idB,
				level: "info" as const,
				text: "[ty-plus] write B (live echo)",
				args: [],
				timestamp: new Date(),
				source: "operation-worker",
			},
		];
		const merged = mergeLogMessages(replayedOnly, []);
		// The actual live path also goes through `wirePayloadToLogMessage`
		// before being merged.  Simulate the same on the win2 side.
		const mergedAfterLive = mergeLogMessages(
			merged,
			liveEcho.map((m) => ({
				id: m.id,
				level: m.level,
				text: m.text,
				args: [],
				timestamp: m.timestamp,
				source: m.source,
			})),
		);
		const idBCount = mergedAfterLive.filter((m) => m.id === idB).length;
		expect(idBCount).toBe(1);
		// And the dedup merged row must not push the buffer above the
		// bus cap; with two distinct ids the cap of 1000 is preserved.
		expect(mergedAfterLive.length).toBeLessThanOrEqual(1000);
	});

	it("the bus cap (1000) bounds the replay snapshot across the reopen", async () => {
		// Fill the bus to its capacity before the reopen.
		const noise = createLogger("boot");
		for (let i = 0; i < 1200; i += 1) {
			noise.info(`reopen-overflow-${i}`);
		}
		expect(getEntries()).toHaveLength(1000);

		const panelTransport = installResponderOnWindow("panel-1");
		const response = await requestReplayOn(panelTransport, {
			messageId: "msg-reopen-138-cap",
			sourceSurfaceId: "debug-console",
			requestId: "r-reopen-138-cap",
		});
		const payload = response.payload as { entries: unknown[] };
		expect(payload.entries).toHaveLength(1000);
	});
});
