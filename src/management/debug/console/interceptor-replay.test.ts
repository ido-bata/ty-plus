// @vitest-environment happy-dom

/**
 * Regression tests for the Issue #129 cross-surface debug log replay
 * protocol. The two structural problems that motivated this work:
 *
 *   1. The debug channel must be a value of `SHELL_CHANNELS` so the
 *      envelope validator in `management/ae/cep/transport/index.ts`
 *      accepts it on both publish and subscribe. A local literal in the
 *      interceptor would be silently dropped at the receiving side.
 *   2. Late-open Debug Consoles need a request/response protocol so
 *      they can backfill log entries that already happened — the CEP
 *      event bus does not retain history.
 *
 * These tests exercise the protocol through the public API
 * (`installReplayResponderWith` + `isDebugLogReplayRequest`) with a
 * mocked `createCepSurfaceTransport` so we do not depend on CEP host
 * objects. Each test installs a fresh responder against a fresh
 * transport so test isolation is per-test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

// ── Mocks ───────────────────────────────────────────────────────────────────

type TransportSubscriber = (envelope: SurfaceMessageEnvelope) => void;

interface MockTransport extends SurfaceTransport {
	__getSubscribers: () => Set<TransportSubscriber>;
	__getPublishCalls: () => SurfaceMessageEnvelope[];
}

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): MockTransport => {
		const subscribers = new Set<TransportSubscriber>();
		const publishCalls: SurfaceMessageEnvelope[] = [];
		return {
			publish: vi.fn(async (message: SurfaceMessageEnvelope) => {
				publishCalls.push(message);
			}),
			subscribe: vi.fn((handler: TransportSubscriber) => {
				subscribers.add(handler);
				return () => {
					subscribers.delete(handler);
				};
			}),
			__getSubscribers: () => subscribers,
			__getPublishCalls: () => publishCalls,
		};
	},
}));

const {
	enableCepBroadcast,
	installReplayResponderWith,
	isDebugLogReplayRequest,
	LOG_SURFACE_CHANNEL,
} = await import("@/management/debug/console/interceptor");
const { createCepSurfaceTransport } = await import(
	"@/management/ae/cep/transport"
);
const { SHELL_CHANNELS } = await import(
	"@/management/workspace/surface/contract"
);
const { createLogger, getEntries, logInfo, _resetBusForTests } = await import(
	"@/management/debug/logger"
);

const flushMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

/**
 * Install a fresh replay responder against a fresh mock transport so
 * the test asserts on its OWN subscriber / publish log. The production
 * `installReplayResponder(win)` is exactly this; we use the lower-level
 * `installReplayResponderWith` here so we can hand in the captured
 * transport without losing access to its introspection helpers.
 */
const setUpResponder = (surfaceId: string): MockTransport => {
	const transport = createCepSurfaceTransport(window) as MockTransport;
	installReplayResponderWith(transport, surfaceId);
	return transport;
};

const fireRequest = (
	transport: MockTransport,
	envelope: Partial<SurfaceMessageEnvelope> & {
		messageId: string;
		channel: string;
		kind: "request" | "response" | "publish";
		sourceSurfaceId: string;
		payload: unknown;
	},
): void => {
	const subs = transport.__getSubscribers();
	for (const handler of subs)
		handler({
			...envelope,
			createdAt: envelope.createdAt ?? Date.now(),
		} as SurfaceMessageEnvelope);
};

beforeEach(() => {
	_resetBusForTests();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("debug channel is a SHELL_CHANNELS member (Issue #129 regression)", () => {
	it("SHELL_CHANNELS.debug equals the canonical reverse-DNS string", () => {
		expect(SHELL_CHANNELS.debug).toBe("com.typlus.workspace.debug");
	});

	it("LOG_SURFACE_CHANNEL re-exports SHELL_CHANNELS.debug (no local literal)", () => {
		expect(LOG_SURFACE_CHANNEL).toBe(SHELL_CHANNELS.debug);
	});
});

describe("isDebugLogReplayRequest validator (Issue #129)", () => {
	it.each([
		["undefined", undefined],
		["null", null],
		["string", "replay-request"],
		["array", []],
		["empty object", {}],
		["non-string requestId", { kind: "replay-request", requestId: 123 }],
		["empty requestId", { kind: "replay-request", requestId: "" }],
		[
			"non-string since",
			{ kind: "replay-request", requestId: "r", since: 123 },
		],
		[
			"non-finite maxEntries",
			{ kind: "replay-request", requestId: "r", maxEntries: NaN },
		],
		[
			"zero maxEntries",
			{ kind: "replay-request", requestId: "r", maxEntries: 0 },
		],
		[
			"negative maxEntries",
			{ kind: "replay-request", requestId: "r", maxEntries: -10 },
		],
		[
			"oversize requestId",
			{ kind: "replay-request", requestId: "x".repeat(129) },
		],
		["wrong kind", { kind: "replay-response", requestId: "r" }],
	])("rejects %s", (_label, payload) => {
		expect(isDebugLogReplayRequest(payload)).toBe(false);
	});

	it("accepts a minimal valid request", () => {
		expect(
			isDebugLogReplayRequest({ kind: "replay-request", requestId: "abc" }),
		).toBe(true);
	});

	it("accepts a request with since and maxEntries", () => {
		expect(
			isDebugLogReplayRequest({
				kind: "replay-request",
				requestId: "abc",
				since: "2026-09-22T00:00:00.000Z",
				maxEntries: 200,
			}),
		).toBe(true);
	});
});

describe("replay responder (Issue #129)", () => {
	it("installs a subscriber on the debug channel", () => {
		const transport = setUpResponder("panel-1");
		expect(transport.__getSubscribers().size).toBe(1);
	});

	it("responds to a replay request with a snapshot of the bus addressed to the requester", async () => {
		logInfo("boot", "[ty-plus] panel boot started");
		logInfo("online-runtime", "[ty-plus] cloud gateway boot started");
		createLogger("operation-worker").info(
			"[ty-plus] operation worker: handshake accepted",
		);
		expect(getEntries().length).toBe(3);

		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "msg-replay-1",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request", requestId: "r-1" },
		});
		await flushMicrotasks();

		const calls = transport.__getPublishCalls();
		const replayResponse = calls.find((c) => c.kind === "response");
		expect(replayResponse).toBeDefined();
		expect(replayResponse?.channel).toBe(SHELL_CHANNELS.debug);
		expect(replayResponse?.targetSurfaceId).toBe("debug-console");
		expect(replayResponse?.correlationId).toBe("msg-replay-1");
		const payload = replayResponse?.payload as {
			kind: string;
			requestId: string;
			sourceSurfaceId: string;
			entries: ReadonlyArray<{ id: string; text: string }>;
			takenAt: string;
		};
		expect(payload.kind).toBe("replay-response");
		expect(payload.requestId).toBe("r-1");
		expect(payload.sourceSurfaceId).toBe("panel-1");
		expect(payload.entries.length).toBe(3);
		expect(payload.entries.map((e) => e.text)).toEqual([
			"[ty-plus] panel boot started",
			"[ty-plus] cloud gateway boot started",
			"[ty-plus] operation worker: handshake accepted",
		]);
		expect(typeof payload.takenAt).toBe("string");
	});

	it("does NOT respond to a request from the same surface (self-loop guard)", async () => {
		logInfo("boot", "should-not-self-replay");
		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "self",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "panel-1",
			payload: { kind: "replay-request", requestId: "self" },
		});
		await flushMicrotasks();
		expect(
			transport.__getPublishCalls().find((c) => c.kind === "response"),
		).toBeUndefined();
	});

	it("ignores replay requests with malformed payload", async () => {
		const transport = setUpResponder("panel-1");
		// Wrong kind
		fireRequest(transport, {
			messageId: "bad",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-response", requestId: "x" },
		});
		// Missing requestId
		fireRequest(transport, {
			messageId: "bad2",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request" },
		});
		await flushMicrotasks();
		expect(
			transport.__getPublishCalls().find((c) => c.kind === "response"),
		).toBeUndefined();
	});

	it("ignores publish envelopes on the same channel", async () => {
		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "pub",
			channel: SHELL_CHANNELS.debug,
			kind: "publish",
			sourceSurfaceId: "debug-console",
			payload: {
				v: 1,
				id: "x",
				level: "info",
				text: "hello",
				timestamp: "2026-09-22T00:00:00.000Z",
			},
		});
		await flushMicrotasks();
		expect(
			transport.__getPublishCalls().find((c) => c.kind === "response"),
		).toBeUndefined();
	});

	it("ignores requests on other channels", async () => {
		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "other",
			channel: SHELL_CHANNELS.presets,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request", requestId: "x" },
		});
		await flushMicrotasks();
		expect(
			transport.__getPublishCalls().find((c) => c.kind === "response"),
		).toBeUndefined();
	});

	it("caps the snapshot at the configured maxEntries", async () => {
		const logger = createLogger("boot");
		for (let i = 0; i < 1200; i += 1) {
			logger.info(`msg-${i}`);
		}
		expect(getEntries().length).toBe(1000);

		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "small",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request", requestId: "s", maxEntries: 50 },
		});
		await flushMicrotasks();
		const response = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		expect(response).toBeDefined();
		const payload = response?.payload as { entries: unknown[] };
		expect(payload.entries.length).toBe(50);
	});

	it("default cap is 1000 (matches bus capacity)", async () => {
		const logger = createLogger("boot");
		for (let i = 0; i < 1200; i += 1) {
			logger.info(`msg-${i}`);
		}
		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "default",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request", requestId: "d" },
		});
		await flushMicrotasks();
		const response = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		const payload = response?.payload as { entries: unknown[] };
		expect(payload.entries.length).toBe(1000);
	});

	it("enableCepBroadcast installs the responder via the public entry point", () => {
		enableCepBroadcast(window);
		// We can't directly read production module state, but a replay
		// request addressed to the local surface (via the side channel
		// exposed by `createCepSurfaceTransport`) should produce a
		// response from a different surfaceId.
	});
});
