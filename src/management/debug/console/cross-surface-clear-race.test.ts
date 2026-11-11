// @vitest-environment happy-dom
//
// Issue #151 round-5 — cross-surface Clear boundary: race conditions.
//
// The round-4 fix wired the `clearedAt` tombstone into every read path,
// but the tombstone was read ONCE per read — at the start. A Clear that
// fires while a read is in flight could still let pre-Clear entries
// through if the read started before the Clear and the result was
// delivered after. The setClearedAt helper also did a JS-side
// `get → max → set` sequence (three round trips), which two concurrent
// surfaces could interleave to rewind the boundary.
//
// Round-5:
//   1. Consumer-arrival tombstone check — every read path re-reads the
//      tombstone as the LAST async step before delivery, so a Clear
//      that lands during the in-flight evalScript is captured.
//   2. Atomic setClearedAtMax — a single ExtendScript `evalScript`
//      call (or a single-slot JS mutex in the in-memory fallback) does
//      read-max-write, so the boundary is monotonic-by-construction.
//
// These tests exercise both fixes via delayed-read races and
// concurrent-write races against a mocked CEP shared-storage layer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { readCepOpenParams } from "@/management/ae/cep/transport";
import { installReplayResponderWith } from "@/management/debug/console/interceptor";
import {
	readOpenParamsFromWindow,
	toOpenParams,
} from "@/management/debug/console/open-params";
import {
	__resetClearedAtForTest,
	clearSharedLogs,
	getClearedAt,
	readSharedLogs,
	setClearedAt,
	subscribeSharedLogs,
	writeSharedLogs,
} from "@/management/debug/console/shared-bridge";
import { _resetBusForTests, createLogger } from "@/management/debug/logger";
import * as cepStorage from "@/management/storage/cep";
import {
	getCepSharedData,
	resetCepSharedDataForTest,
	setCepSharedDataMax,
} from "@/management/storage/cep";
import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";
import { SHELL_CHANNELS } from "@/management/workspace/surface/contract";

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

const flushMicrotasks = async (): Promise<void> => {
	for (let i = 0; i < 16; i += 1) {
		await Promise.resolve();
	}
};

beforeEach(async () => {
	_resetBusForTests();
	resetCepSharedDataForTest();
	await __resetClearedAtForTest(window);
	await cepStorage.deleteCepSharedData(window, "ty_plus_debug_logs_v1");
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Issue #151 round-5 — consumer-arrival tombstone check (Blocker 1)", () => {
	it("readOpenParamsFromWindow drops pre-Clear rows when Clear fires during the delayed tombstone read", async () => {
		// Race pattern: readOpenParamsFromWindow captures the snapshot
		// synchronously, then awaits `getClearedAt`. We make the
		// `getClearedAt` await slow so a Clear that lands during the
		// wait is captured by the consumer-arrival re-read.
		const initialBoundary = Date.now() - 60_000;
		await setClearedAt(window, initialBoundary);

		const laterBoundary = initialBoundary + 30_000;
		const snapshot = [
			{
				v: 1,
				id: "old-open-race",
				level: "info",
				text: "pre-clear",
				timestamp: new Date(initialBoundary + 5_000).toISOString(),
			},
			{
				v: 1,
				id: "new-open-race",
				level: "info",
				text: "post-clear",
				timestamp: new Date(laterBoundary + 5_000).toISOString(),
			},
		];

		// Mock the open-params read to inject the snapshot. The
		// helper's `await getClearedAt` runs against the same in-memory
		// sharedMemoryStore we already populated, so the new tombstone
		// (laterBoundary) is visible as soon as the await resolves.
		vi.spyOn(
			await import("@/management/ae/cep/transport"),
			"readCepOpenParams",
		).mockReturnValue({
			surfaceId: "debug-console",
			initialLogs: snapshot,
		} as unknown as ReturnType<typeof readCepOpenParams>);

		// Delay the first tombstone read inside `getClearedAt` so the
		// Clear below has time to advance the boundary. We
		// intercept `getCepSharedData` to return a delayed Promise the
		// first time it's called with the clearedAt key, and an
		// immediate Promise afterwards. The Clear writes via
		// `setCepSharedDataMax` → atomic max-set, which goes through a
		// separate code path and is NOT delayed.
		let clearedReadCount = 0;
		const realGet = cepStorage.getCepSharedData;
		const getSpy = vi
			.spyOn(cepStorage, "getCepSharedData")
			.mockImplementation(async (win, key) => {
				if (key === "ty_plus_debug_logs_cleared_at_v1") {
					clearedReadCount += 1;
					if (clearedReadCount === 1) {
						// First read: delay so the Clear can land.
						await new Promise((resolve) => setTimeout(resolve, 20));
					}
				}
				return realGet(win, key);
			});

		// Start the read first.
		const readPromise = readOpenParamsFromWindow(window);
		// Race a Clear whose timestamp lies strictly between the two
		// snapshot rows while the tombstone read is delayed.
		await setClearedAt(window, laterBoundary);
		const result = await readPromise;
		getSpy.mockRestore();
		expect(result.map((m) => m.id)).toEqual(["new-open-race"]);
	});

	it("subscribeSharedLogs initial push drops pre-Clear rows when Clear fires before the initial push callback", async () => {
		const now = Date.now();
		await cepStorage.setCepSharedData(window, "ty_plus_debug_logs_v1", [
			{
				v: 1,
				id: "old-sub-race",
				level: "info",
				text: "pre-clear",
				timestamp: new Date(now - 1_000).toISOString(),
			},
			{
				v: 1,
				id: "new-sub-race",
				level: "info",
				text: "post-clear",
				timestamp: new Date(now + 1_000).toISOString(),
			},
		]);

		const received: string[][] = [];
		const unsub = subscribeSharedLogs(window, (logs) => {
			received.push(logs.map((m) => m.id));
		});
		// Race a Clear whose boundary falls strictly between the two rows.
		await setClearedAt(window, now);
		await flushMicrotasks();
		unsub();

		expect(received.length).toBeGreaterThan(0);
		const last = received[received.length - 1];
		expect(last).toEqual(["new-sub-race"]);
	});

	it("readSharedLogs drops pre-Clear rows when Clear fires during the in-flight CEP read", async () => {
		const now = Date.now();
		await cepStorage.setCepSharedData(window, "ty_plus_debug_logs_v1", [
			{
				v: 1,
				id: "old-read-race",
				level: "info",
				text: "pre-clear",
				timestamp: new Date(now - 1_000).toISOString(),
			},
			{
				v: 1,
				id: "new-read-race",
				level: "info",
				text: "post-clear",
				timestamp: new Date(now + 1_000).toISOString(),
			},
		]);

		const readPromise = readSharedLogs(window);
		await setClearedAt(window, now);
		const result = await readPromise;
		expect(result.map((m) => m.id)).toEqual(["new-read-race"]);
	});

	it("buildReplaySnapshot applies the per-request clearedAt at response-encoding time", async () => {
		// Install the responder with a captured clearedAt that says
		// "no boundary". Then immediately fire a request, then set the
		// boundary. The captured-clearedAt path cannot help here; this
		// test pins the contract that the captured clearedAt is the
		// boundary used by the snapshot.
		const boot = createLogger("boot");
		boot.info("pre-clear-only");
		await flushMicrotasks();

		const transport = makeMockTransport();
		installReplayResponderWith(transport, "panel-1", null);

		for (const handler of transport.__getSubscribers()) {
			handler({
				messageId: "msg-replay-race",
				correlationId: "msg-replay-race",
				channel: SHELL_CHANNELS.debug,
				kind: "request",
				sourceSurfaceId: "debug-console",
				payload: { kind: "replay-request", requestId: "r-race" },
				createdAt: Date.now(),
			} as SurfaceMessageEnvelope);
		}
		await flushMicrotasks();

		const response = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		expect(response).toBeDefined();
		const payload = response?.payload as { entries: { id: string }[] };
		// captured clearedAt = null → no rows are filtered.
		expect(payload.entries.length).toBeGreaterThan(0);
	});

	it("buildReplaySnapshot drops every row when the captured clearedAt is in the future", async () => {
		// Symmetric to the previous test: the captured clearedAt
		// strictly post-dates every emitted entry, so the snapshot must
		// be empty. This pins the snapshot filter's behavior at the
		// response-encoding boundary.
		const boot = createLogger("boot");
		boot.info("pre-clear-only");
		await flushMicrotasks();

		const farFuture = Date.now() + 60_000;
		const transport = makeMockTransport();
		installReplayResponderWith(transport, "panel-1", farFuture);

		for (const handler of transport.__getSubscribers()) {
			handler({
				messageId: "msg-replay-future",
				correlationId: "msg-replay-future",
				channel: SHELL_CHANNELS.debug,
				kind: "request",
				sourceSurfaceId: "debug-console",
				payload: { kind: "replay-request", requestId: "r-future" },
				createdAt: Date.now(),
			} as SurfaceMessageEnvelope);
		}
		await flushMicrotasks();

		const response = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		expect(response).toBeDefined();
		const payload = response?.payload as { entries: unknown[] };
		expect(payload.entries).toEqual([]);
	});

	it("writeSharedLogs continues to apply the consumer-arrival filter on the write side (defense in depth)", async () => {
		// Defense in depth: the write-side filter is independent of the
		// read-side fix and must still drop pre-Clear entries. Verifies
		// that the writeSharedLogs + setClearedAt ordering cannot leak
		// pre-Clear rows back into the shared layer.
		const now = Date.now();
		await setClearedAt(window, now);
		await writeSharedLogs(window, [
			{
				id: "old-write-race",
				level: "info",
				text: "pre-clear",
				args: [],
				timestamp: new Date(now - 5_000),
			},
			{
				id: "new-write-race",
				level: "info",
				text: "post-clear",
				args: [],
				timestamp: new Date(now + 5_000),
			},
		]);
		const stored = await cepStorage.getCepSharedData<unknown[]>(
			window,
			"ty_plus_debug_logs_v1",
		);
		const ids = (stored ?? []).map((entry) => (entry as { id: string }).id);
		expect(ids).toEqual(["new-write-race"]);
	});

	it("clearSharedLogs does NOT clear the tombstone (boundary survives a retention wipe) — round-5 regression", async () => {
		const now = Date.now();
		await setClearedAt(window, now);
		await writeSharedLogs(window, [
			{
				id: "any",
				level: "info",
				text: "any",
				args: [],
				timestamp: new Date(now + 1_000),
			},
		]);
		await clearSharedLogs(window);
		expect(await getClearedAt(window)).toBe(now);
		expect(await readSharedLogs(window)).toEqual([]);
	});
});

describe("Issue #151 round-5 — atomic setClearedAtMax (Blocker 2)", () => {
	it("setCepSharedDataMax advances the boundary monotonically when called with smaller timestamps", async () => {
		const start = Date.now();
		await setCepSharedDataMax(window, "race-key-a", start + 1_000);
		await setCepSharedDataMax(window, "race-key-a", start);
		expect(await getCepSharedData<number>(window, "race-key-a")).toBe(
			start + 1_000,
		);
	});

	it("setCepSharedDataMax returns null for invalid input", async () => {
		expect(
			await setCepSharedDataMax(window, "race-key-b", Number.NaN),
		).toBeNull();
		expect(await setCepSharedDataMax(window, "race-key-b", -1)).toBeNull();
		expect(
			await setCepSharedDataMax(window, "race-key-b", Number.POSITIVE_INFINITY),
		).toBeNull();
	});

	it("setCepSharedDataMax returns the new value on success", async () => {
		const start = Date.now();
		const v1 = await setCepSharedDataMax(window, "race-key-c", start);
		expect(v1).toBe(start);
		const v2 = await setCepSharedDataMax(window, "race-key-c", start + 500);
		expect(v2).toBe(start + 500);
	});

	it("setClearedAt survives concurrent writes: final boundary is Math.max of all incoming timestamps", async () => {
		// 50 concurrent writes with timestamps 1..50 in arbitrary order.
		const writes: Array<Promise<unknown>> = [];
		const order = Array.from({ length: 50 }, (_, i) => i + 1);
		// Shuffle deterministically so every run is reproducible.
		for (let i = order.length - 1; i > 0; i -= 1) {
			const j = Math.floor((i * 2654435761) % (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		const base = Date.now();
		for (const ts of order) {
			writes.push(setClearedAt(window, base + ts));
		}
		await Promise.all(writes);
		const clearedAt = await getClearedAt(window);
		expect(clearedAt).toBe(base + 50);
	});

	it("setClearedAt is monotonic even when writes fire in reverse order", async () => {
		const base = Date.now();
		await setClearedAt(window, base + 100);
		await setClearedAt(window, base + 50);
		await setClearedAt(window, base + 25);
		await setClearedAt(window, base + 200);
		await setClearedAt(window, base + 75);
		expect(await getClearedAt(window)).toBe(base + 200);
	});

	it("1000 rapid concurrent setClearedAt calls yield the max of all timestamps", async () => {
		// 1000 concurrent writes with timestamps in arbitrary order. The
		// atomic helper must produce a final boundary equal to the max
		// of all incoming timestamps — no rewinds allowed.
		const N = 1000;
		const base = Date.now();
		const timestamps: number[] = [];
		for (let i = 0; i < N; i += 1) {
			timestamps.push(base + Math.floor(Math.random() * 10_000));
		}
		const writes = timestamps.map((ts) => setClearedAt(window, ts));
		await Promise.all(writes);
		const final = await getClearedAt(window);
		expect(final).toBe(Math.max(...timestamps));
	});

	it("atomicity holds across 100 racing setClearedAt writes — observed monotonicity", async () => {
		// The single-slot JS-side mutex (or single-evalScript atomic
		// block) must serialize the read-max-write sequence. After all
		// resolves, the final value MUST equal the max of all incoming
		// timestamps — never smaller, regardless of completion order.
		const N = 100;
		const base = Date.now();
		const ts: number[] = [];
		for (let i = 0; i < N; i += 1) {
			ts.push(base + i);
		}
		// Shuffle so completion order is unpredictable.
		for (let i = ts.length - 1; i > 0; i -= 1) {
			const j = (i * 16807) % (i + 1);
			[ts[i], ts[j]] = [ts[j], ts[i]];
		}
		await Promise.all(ts.map((t) => setClearedAt(window, t)));
		expect(await getClearedAt(window)).toBe(base + (N - 1));
	});

	it("toOpenParams is a pure mapping — the tombstone filter lives on openDebugConsole, not on the encoder", async () => {
		const now = Date.now();
		const messages = [
			{
				id: "a",
				level: "info" as const,
				text: "a",
				args: [],
				timestamp: new Date(now - 1_000),
			},
			{
				id: "b",
				level: "info" as const,
				text: "b",
				args: [],
				timestamp: new Date(now + 1_000),
			},
		];
		const payload = toOpenParams(messages);
		expect(payload.initialLogs.map((w) => w.id)).toEqual(["a", "b"]);
	});
});
