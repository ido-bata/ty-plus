// @vitest-environment happy-dom

/**
 * Issue #71 regression: `installReplayResponder(win)` chains
 * `snapshotClearedAt(win).then(...)` without a rejection handler. A
 * rejected tombstone read (or a throwing `buildReplaySnapshot` /
 * `transport.publish` inside the `.then`) escaped as an unhandled
 * promise rejection — which CEP hosts can surface as the opaque
 * "Uncaught [object Event]" dialog-settings report.
 *
 * These tests inject a rejecting `snapshotClearedAt` and assert the
 * failure is routed into the bounded transport diagnostic instead of
 * escaping, and that no `replay-response` is published.
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

// `installReplayResponder(win)` creates its transport internally, so the
// mock hands out a single shared instance — the test's
// `createCepSurfaceTransport(win)` call returns the very same object the
// responder subscribed on.
vi.mock("@/management/ae/cep/transport", () => {
	const subscribers = new Set<TransportSubscriber>();
	const publishCalls: SurfaceMessageEnvelope[] = [];
	const transport: MockTransport = {
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
	return { createCepSurfaceTransport: () => transport };
});

const tombstoneError = new Error("tombstone read failed");

vi.mock("@/management/debug/console/shared-bridge", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/debug/console/shared-bridge")
	>("@/management/debug/console/shared-bridge");
	return {
		...actual,
		snapshotClearedAt: vi.fn(() => Promise.reject(tombstoneError)),
	};
});

const { installReplayResponder } = await import(
	"@/management/debug/console/interceptor"
);
const { createCepSurfaceTransport } = await import(
	"@/management/ae/cep/transport"
);
const { SHELL_CHANNELS } = await import(
	"@/management/workspace/surface/contract"
);
const { getEntries, _resetBusForTests } = await import(
	"@/management/debug/logger"
);

const flushMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

const fireReplayRequest = (transport: MockTransport): void => {
	const envelope: SurfaceMessageEnvelope = {
		messageId: "msg-replay-reject",
		channel: SHELL_CHANNELS.debug,
		kind: "request",
		sourceSurfaceId: "debug-console",
		payload: { kind: "replay-request", requestId: "r-reject" },
		createdAt: Date.now(),
	};
	for (const handler of transport.__getSubscribers()) handler(envelope);
};

describe("installReplayResponder tombstone rejection (Issue #71)", () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (event: PromiseRejectionEvent) => {
		unhandled.push(event.reason);
	};

	beforeEach(() => {
		_resetBusForTests();
		unhandled.length = 0;
		process.on("unhandledRejection", onUnhandled);
	});

	afterEach(() => {
		process.off("unhandledRejection", onUnhandled);
		vi.restoreAllMocks();
	});

	it("routes a snapshotClearedAt rejection into the transport diagnostic", async () => {
		const win = {} as Window;
		installReplayResponder(win);
		const transport = createCepSurfaceTransport(win) as MockTransport;

		fireReplayRequest(transport);
		await flushMicrotasks();

		// No replay-response was published — the tombstone read failed
		// before the snapshot could be built.
		expect(
			transport.__getPublishCalls().find((c) => c.kind === "response"),
		).toBeUndefined();

		// The rejection was observed by the bounded diagnostic instead of
		// escaping as an unhandled rejection.
		const diagnostics = getEntries().filter((e) =>
			e.message.includes("transport replay-response failed"),
		);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.level).toBe("warn");
		expect(unhandled).toHaveLength(0);
	});
});
