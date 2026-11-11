// @vitest-environment happy-dom
//
// Issue #151 round-6 — consumer-arrival clearedAt re-check on the
// remaining three message-arrival paths in `dialog-root.tsx`.
//
// Round-5 added consumer-arrival tombstone checks to the *shared-bridge*
// reads (`readSharedLogs`, `subscribeSharedLogs`'s initial push,
// `readOpenParamsFromWindow`) and to the cross-surface replay responder
// at snapshot-encoding time. Round-6 extends that contract to the
// three remaining delivery paths inside the dialog-root component:
//
//   1. The replay-response branch of `transport.subscribe`
//      (`envelope.kind === "response"`).
//   2. The live `kind: "publish"` branch of `transport.subscribe`.
//   3. The legacy `subscribeDebugLogEvents` callback.
//
// The two paths NOT touched here — `subscribeSharedLogs`'s pushed
// callback (the shared-bridge layer already filters) and `subscribeLog`
// (the canonical bus, wiped by `clearLogs()`) — are explicitly
// excluded by the round-6 reviewer.
//
// The user's round-6 review pinpoints two race patterns to test
// explicitly: late replay responses (Test A) and late live publishes
// (Test B). The third path (legacy `subscribeDebugLogEvents`) shares
// the same fix shape — the consumer-arrival re-check is identical —
// so we cover it implicitly by the structural identity of the fix.
//
// File placement: chosen as a sibling of `cross-surface-clear-race.test.ts`
// (round-5) rather than appending to it. The round-5 file imports the
// REAL `shared-bridge` module to exercise its in-memory storage and
// uses `installReplayResponderWith(transport, ...)` directly with
// `makeMockTransport()` — no `DebugDialogRoot` mounting. Driving the
// full dialog-root requires `vi.mock` for the transport factory and
// the interceptor's `subscribe` / `subscribeDebugLogEvents` /
// `wirePayloadToLogMessage` / `isSanitizedLogWirePayload` to control
// the side inputs. Hoisting those mocks to the file level would either
// break the round-5 tests (if we re-mock `installReplayResponderWith`)
// or add global stubs that obscure the round-5 tests' intent. Keeping
// the round-6 coverage in its own file preserves the round-5 surface
// and makes the round-6 setup (transport + interceptor stubs around a
// real `shared-bridge` and real `debug/logger`) self-documenting.
//
// The two tests below pin the consumer-arrival invariant end-to-end:
// a late-arriving envelope (replay-response or live publish) whose
// payload predates the clearedAt tombstone MUST NOT reach the rendered
// `Panel` row set. They use `happy-dom` (matching the round-5 race
// tests) and the same `flushMicrotasks` helper shape.

import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetClearedAtForTest,
	getClearedAt,
	setClearedAt,
} from "@/management/debug/console/shared-bridge";
import { _resetBusForTests } from "@/management/debug/logger";
import { resetCepSharedDataForTest } from "@/management/storage/cep";
import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

// ── Mocks ───────────────────────────────────────────────────────────────────
//
// Mock the transport factory so dialog-root's `useEffect` registers its
// subscriber against a captured handler set. The mock factory records
// every `publish` call so the test can inspect what dialog-root emitted
// (the replay-request), and exposes the captured subscribers so the
// test can dispatch envelopes at will (the late replay-response, the
// late live publish, etc.).
//
// Mock the interceptor module to give the test control over
// `subscribe`, `subscribeDebugLogEvents`, `wirePayloadToLogMessage`,
// `isSanitizedLogWirePayload`, `clearLogs`, `clearRetainedLogs`, and
// `executeCommand`. `wirePayloadToLogMessage` is the same conversion
// the real interceptor performs; the test passes through so the row
// shape matches production. `subscribe` and `subscribeDebugLogEvents`
// are captured-handler arrays so the test can fire events at the
// dialog-root's subscribers.
//
// `shared-bridge` and `debug/logger` are NOT mocked — they run against
// the real `sharedMemoryStore` and the real canonical LogBus so the
// clearedAt tombstone state observed by the dialog-root is the state
// the assertions check against.

interface MockTransport extends SurfaceTransport {
	__getSubscribers: () => Set<(env: SurfaceMessageEnvelope) => void>;
	__getPublishCalls: () => SurfaceMessageEnvelope[];
}

const transportSubscribers = new Set<(env: SurfaceMessageEnvelope) => void>();
const transportPublishCalls: SurfaceMessageEnvelope[] = [];

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): MockTransport => ({
		publish: vi.fn(async (message: SurfaceMessageEnvelope) => {
			transportPublishCalls.push(message);
		}),
		subscribe: vi.fn((handler: (env: SurfaceMessageEnvelope) => void) => {
			transportSubscribers.add(handler);
			return () => {
				transportSubscribers.delete(handler);
			};
		}),
		__getSubscribers: () => transportSubscribers,
		__getPublishCalls: () => transportPublishCalls,
	}),
	readCepOpenParams: () => null,
}));

type LogHandler = (entries: readonly unknown[]) => void;
type DebugEventHandler = (message: unknown) => void;

const localInterceptorHandlers: LogHandler[] = [];
const debugEventHandlers: DebugEventHandler[] = [];
const clearLogsCalls: number[] = [];
const clearRetainedLogsCalls: number[] = [];

vi.mock("@/management/debug/console/interceptor", () => ({
	subscribe: (handler: LogHandler) => {
		localInterceptorHandlers.push(handler);
		return () => {
			const idx = localInterceptorHandlers.indexOf(handler);
			if (idx >= 0) localInterceptorHandlers.splice(idx, 1);
		};
	},
	subscribeDebugLogEvents: (_win: Window, handler: DebugEventHandler) => {
		debugEventHandlers.push(handler);
		return () => {
			const idx = debugEventHandlers.indexOf(handler);
			if (idx >= 0) debugEventHandlers.splice(idx, 1);
		};
	},
	clearLogs: vi.fn(async () => {
		clearLogsCalls.push(Date.now());
	}),
	clearRetainedLogs: vi.fn(async (_win: Window) => {
		clearRetainedLogsCalls.push(Date.now());
	}),
	executeCommand: () => {},
	currentSessionStartedAt: () => null,
	LOG_SURFACE_CHANNEL: "com.typlus.workspace.debug",
	DEBUG_LOG_REPLAY_MAX_ENTRIES: 1000,
	isSanitizedLogWirePayload: (p: unknown): boolean =>
		!!p &&
		typeof p === "object" &&
		"id" in (p as Record<string, unknown>) &&
		typeof (p as Record<string, unknown>).id === "string" &&
		"text" in (p as Record<string, unknown>),
	wirePayloadToLogMessage: (w: {
		id: string;
		text: string;
		level: string;
		timestamp: string;
		source?: string;
	}) => ({
		id: w.id,
		text: w.text,
		level: w.level as "log" | "info" | "warn" | "error" | "debug",
		timestamp: new Date(w.timestamp),
		source: w.source,
		args: [],
	}),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const flushMicrotasks = async (): Promise<void> => {
	for (let i = 0; i < 16; i += 1) {
		await Promise.resolve();
	}
};

const countRows = (): number =>
	document.querySelectorAll("[data-debug-msg-id]").length;

const rowText = (id: string): string | null => {
	const el = document.querySelector(`[data-debug-msg-id="${id}"]`);
	return el?.textContent ?? null;
};

const fireTransport = (envelope: SurfaceMessageEnvelope): void => {
	for (const handler of transportSubscribers) {
		handler(envelope);
	}
};

const waitForNoPreClearRow = async (id: string): Promise<void> => {
	await waitFor(() => {
		expect(rowText(id)).toBeNull();
	});
};

beforeEach(async () => {
	_resetBusForTests();
	resetCepSharedDataForTest();
	await __resetClearedAtForTest(window);
	localInterceptorHandlers.length = 0;
	debugEventHandlers.length = 0;
	transportSubscribers.clear();
	transportPublishCalls.length = 0;
	clearLogsCalls.length = 0;
	clearRetainedLogsCalls.length = 0;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("Issue #151 round-6 — consumer-arrival clearedAt re-check (Fix 1)", () => {
	it("late replay response with pre-Clear entries does not resurrect them on screen", async () => {
		// Sequence: dialog-root mounts (subscribes to transport), the
		// test sets a clearedAt tombstone at T_clear, THEN fires the
		// replay-response envelope whose entries have timestamps <
		// T_clear. The dialog-root's consumer-arrival re-check must
		// drop those entries before merging them into localMessages.
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));
		await flushMicrotasks();

		// The dialog-root fires its own replay-request on mount; wait
		// for that to land so we can grab the correlationId and reuse
		// it on the response envelope (the consumer matches by
		// correlationId).
		await waitFor(() =>
			expect(transportPublishCalls.length).toBeGreaterThan(0),
		);
		const replayRequest = transportPublishCalls.find(
			(c) =>
				c.kind === "request" &&
				(c.payload as { kind?: string }).kind === "replay-request",
		);
		expect(replayRequest).toBeDefined();
		const correlationId = replayRequest?.correlationId;
		expect(correlationId).toBeTruthy();

		// T_clear sits strictly between the two snapshot rows.
		const now = Date.now();
		const preClearTs = new Date(now - 5_000).toISOString();
		const postClearTs = new Date(now + 5_000).toISOString();
		await setClearedAt(window, now);
		expect(await getClearedAt(window)).toBe(now);

		// Fire the late replay-response. Both entries are valid wire
		// payloads — the dialog-root's `isSanitizedLogWirePayload`
		// guard must accept them — but only the post-Clear row may
		// reach the rendered Panel.
		const responseEnvelope: SurfaceMessageEnvelope = {
			messageId: "msg-replay-late-round6",
			correlationId,
			channel: "com.typlus.workspace.debug",
			kind: "response",
			sourceSurfaceId: "peer",
			payload: {
				kind: "replay-response",
				requestId: correlationId,
				entries: [
					{
						v: 1,
						id: "round6-replay-pre-clear",
						level: "info",
						text: "pre-clear-replay-row",
						timestamp: preClearTs,
					},
					{
						v: 1,
						id: "round6-replay-post-clear",
						level: "info",
						text: "post-clear-replay-row",
						timestamp: postClearTs,
					},
				],
			},
			createdAt: Date.now(),
		};
		fireTransport(responseEnvelope);
		await flushMicrotasks();

		await waitForNoPreClearRow("round6-replay-pre-clear");
		expect(rowText("round6-replay-post-clear")).toContain(
			"post-clear-replay-row",
		);
	});

	it("late live kind:publish with a pre-Clear timestamp does not resurrect it on screen", async () => {
		// Sequence: dialog-root mounts, the test sets a clearedAt
		// tombstone at T_clear, THEN fires a live `kind: "publish"`
		// envelope whose payload timestamp is < T_clear. The
		// dialog-root's consumer-arrival re-check (Fix 1, branch 2)
		// must drop the row before merging.
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));
		await flushMicrotasks();

		// Drain the on-mount replay-request so the dialog-root's
		// correlation set is fully populated before we publish.
		await waitFor(() =>
			expect(transportPublishCalls.length).toBeGreaterThan(0),
		);

		const now = Date.now();
		const preClearTs = new Date(now - 5_000).toISOString();
		const postClearTs = new Date(now + 5_000).toISOString();
		await setClearedAt(window, now);
		expect(await getClearedAt(window)).toBe(now);

		// Fire the late live publish. The dialog-root's
		// `envelope.kind !== "publish"` guard skips if the kind is
		// anything else, and `isSanitizedLogWirePayload` validates the
		// payload shape (must include `id` and `text`). Both entries
		// clear those guards, but only the post-Clear row may render.
		const preClearLive: SurfaceMessageEnvelope = {
			messageId: "live-publish-pre-clear-round6",
			channel: "com.typlus.workspace.debug",
			kind: "publish",
			sourceSurfaceId: "peer",
			payload: {
				v: 1,
				id: "round6-live-pre-clear",
				level: "info",
				text: "pre-clear-live-row",
				timestamp: preClearTs,
			},
			createdAt: Date.now(),
		};
		const postClearLive: SurfaceMessageEnvelope = {
			messageId: "live-publish-post-clear-round6",
			channel: "com.typlus.workspace.debug",
			kind: "publish",
			sourceSurfaceId: "peer",
			payload: {
				v: 1,
				id: "round6-live-post-clear",
				level: "info",
				text: "post-clear-live-row",
				timestamp: postClearTs,
			},
			createdAt: Date.now(),
		};
		fireTransport(preClearLive);
		fireTransport(postClearLive);
		await flushMicrotasks();

		await waitForNoPreClearRow("round6-live-pre-clear");
		expect(rowText("round6-live-post-clear")).toContain("post-clear-live-row");
	});
});
