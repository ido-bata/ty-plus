// @vitest-environment happy-dom
//
// Issue #151 round-4 — cross-surface Clear boundary.
//
// The round-3 fix wiped the in-memory UI buffer + the CEP shared
// storage in the surface that clicked Clear. But peer surfaces (and
// the same surface after a close+reopen) still held:
//
//   - their own subscriber-side legacy buffer (`_messages`)
//   - the open-params boot snapshot (carried up to 200 log rows)
//   - the cross-surface replay response (carried up to 1000 rows)
//
// The fix introduces a `clearedAt` tombstone in CEP shared storage.
// On every Clear the operator triggers, the surface writes
// `clearedAt = Date.now()` to a dedicated key. Every read path
// (`readSharedLogs`, the `subscribeSharedLogs` initial push, the
// `writeSharedLogs` write-side guard, `readOpenParamsFromWindow`, the
// cross-surface replay snapshot) drops any entry whose timestamp
// predates the boundary. The boundary survives panel close + reopen
// and AE process restart because it lives in shared storage.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readCepOpenParams } from "@/management/ae/cep/transport";
import { installReplayResponderWith } from "@/management/debug/console/interceptor";
import {
	readOpenParamsFromWindow,
	toOpenParams,
} from "@/management/debug/console/open-params";
import {
	__resetClearedAtForTest,
	clearSharedLogs,
	filterLogsByClearedAt,
	getClearedAt,
	readSharedLogs,
	refreshSharedLogs,
	setClearedAt,
	subscribeSharedLogs,
	writeSharedLogs,
} from "@/management/debug/console/shared-bridge";
import { _resetBusForTests, createLogger } from "@/management/debug/logger";
import * as cepStorage from "@/management/storage/cep";
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
	for (let i = 0; i < 8; i += 1) {
		await Promise.resolve();
	}
};

beforeEach(async () => {
	_resetBusForTests();
	await __resetClearedAtForTest(window);
	// Belt-and-suspenders: also drop any raw retention entries from
	// the in-memory storage so the read paths see an empty payload.
	await cepStorage.deleteCepSharedData(window, "ty_plus_debug_logs_v1");
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Issue #151 round-4 — cross-surface Clear boundary (clearedAt tombstone)", () => {
	it("getClearedAt returns null before any Clear fires", async () => {
		expect(await getClearedAt(window)).toBeNull();
	});

	it("setClearedAt is monotonic — a stale or older Clear never rewinds the boundary", async () => {
		const t1 = Date.now();
		await setClearedAt(window, t1);
		// Stale timestamp from a peer surface's clock-skewed Clear.
		await setClearedAt(window, t1 - 5_000);
		expect(await getClearedAt(window)).toBe(t1);
	});

	it("setClearedAt advances the boundary on a later Clear", async () => {
		const t1 = Date.now();
		await setClearedAt(window, t1);
		const t2 = t1 + 5_000;
		await setClearedAt(window, t2);
		expect(await getClearedAt(window)).toBe(t2);
	});

	it("setClearedAt ignores non-finite and negative values", async () => {
		await setClearedAt(window, Number.NaN);
		expect(await getClearedAt(window)).toBeNull();
		await setClearedAt(window, -1);
		expect(await getClearedAt(window)).toBeNull();
	});

	it("readSharedLogs filters out pre-Clear entries via the tombstone", async () => {
		const now = Date.now();
		await cepStorage.setCepSharedData(window, "ty_plus_debug_logs_v1", [
			{
				v: 1,
				id: "old-1",
				level: "info",
				text: "pre-clear-row",
				timestamp: new Date(now - 10_000).toISOString(),
			},
			{
				v: 1,
				id: "new-1",
				level: "info",
				text: "post-clear-row",
				timestamp: new Date(now + 10_000).toISOString(),
			},
		]);
		await setClearedAt(window, now);

		const logs = await readSharedLogs(window);
		expect(logs.map((m) => m.id)).toEqual(["new-1"]);
	});

	it("writeSharedLogs filters out pre-Clear entries at the write side (defense in depth)", async () => {
		const now = Date.now();
		await setClearedAt(window, now);
		await writeSharedLogs(window, [
			{
				id: "old-write",
				level: "info",
				text: "pre-clear",
				args: [],
				timestamp: new Date(now - 5_000),
			},
			{
				id: "new-write",
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
		expect(ids).toEqual(["new-write"]);
	});

	it("subscribeSharedLogs initial push filters out pre-Clear entries", async () => {
		const now = Date.now();
		await cepStorage.setCepSharedData(window, "ty_plus_debug_logs_v1", [
			{
				v: 1,
				id: "old-sub",
				level: "info",
				text: "pre-clear",
				timestamp: new Date(now - 1_000).toISOString(),
			},
			{
				v: 1,
				id: "new-sub",
				level: "info",
				text: "post-clear",
				timestamp: new Date(now + 1_000).toISOString(),
			},
		]);
		await setClearedAt(window, now);

		const received: string[] = [];
		const unsub = subscribeSharedLogs(window, (logs) => {
			received.length = 0;
			for (const m of logs) received.push(m.id);
		});
		await flushMicrotasks();
		unsub();
		expect(received).toEqual(["new-sub"]);
	});

	it("readOpenParamsFromWindow filters out pre-Clear entries from the open-params snapshot", async () => {
		const now = Date.now();
		await setClearedAt(window, now);
		const snapshot = [
			{
				v: 1,
				id: "old-open",
				level: "info",
				text: "pre-clear",
				timestamp: new Date(now - 1_000).toISOString(),
			},
			{
				v: 1,
				id: "new-open",
				level: "info",
				text: "post-clear",
				timestamp: new Date(now + 1_000).toISOString(),
			},
		];

		// Route the dialog-side read through our fixture by spying on
		// `readCepOpenParams`. happy-dom does not provide a CSInterface,
		// so the helper currently returns null; the spy lets us inject
		// the snapshot.
		const spy = vi
			.spyOn(await import("@/management/ae/cep/transport"), "readCepOpenParams")
			.mockReturnValue({
				surfaceId: "debug-console",
				initialLogs: snapshot,
			});

		const messages = await readOpenParamsFromWindow(window);
		spy.mockRestore();
		expect(messages.map((m) => m.id)).toEqual(["new-open"]);
	});

	it("replay snapshot filters out pre-Clear entries via the tombstone", async () => {
		const now = Date.now();
		// Seed the bus with one pre-Clear entry, then set the
		// boundary.
		const boot = createLogger("boot");
		boot.info("pre-clear-only");
		await flushMicrotasks();
		await setClearedAt(window, now);

		const transport = makeMockTransport();
		installReplayResponderWith(
			transport,
			"panel-1",
			await getClearedAt(window),
		);
		for (const handler of transport.__getSubscribers()) {
			handler({
				messageId: "msg-replay",
				correlationId: "msg-replay",
				channel: SHELL_CHANNELS.debug,
				kind: "request",
				sourceSurfaceId: "debug-console",
				payload: { kind: "replay-request", requestId: "r-1" },
				createdAt: Date.now(),
			} as SurfaceMessageEnvelope);
		}
		await flushMicrotasks();

		const response = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		expect(response).toBeDefined();
		const payload = response?.payload as { entries: { timestamp: string }[] };
		const clearedAt = await getClearedAt(window);
		expect(clearedAt).not.toBeNull();
		for (const entry of payload.entries) {
			expect(Date.parse(entry.timestamp)).toBeGreaterThanOrEqual(
				clearedAt ?? 0,
			);
		}
	});

	it("replay snapshot is empty when every bus entry predates the boundary", async () => {
		const boot = createLogger("boot");
		for (let i = 0; i < 3; i += 1) {
			boot.info(`only-pre-clear-${i}`);
		}
		await flushMicrotasks();

		const now = Date.now();
		// Boundary strictly after every emitted entry.
		await setClearedAt(window, now + 60_000);

		const transport = makeMockTransport();
		installReplayResponderWith(
			transport,
			"panel-1",
			await getClearedAt(window),
		);
		for (const handler of transport.__getSubscribers()) {
			handler({
				messageId: "msg-replay-empty",
				correlationId: "msg-replay-empty",
				channel: SHELL_CHANNELS.debug,
				kind: "request",
				sourceSurfaceId: "debug-console",
				payload: { kind: "replay-request", requestId: "r-empty" },
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

	it("clearSharedLogs does NOT clear the tombstone (boundary survives a retention wipe)", async () => {
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
		// The tombstone must remain so subsequent reads still apply
		// the boundary, even when the retention payload is wiped.
		expect(await getClearedAt(window)).toBe(now);
		expect(await readSharedLogs(window)).toEqual([]);
		await refreshSharedLogs(window);
	});

	it("openDebugConsole filters pre-Clear entries via the shared-bridge helper", async () => {
		// The production helper (`workspace/hooks/helpers.ts#openDebugConsole`)
		// delegates to `filterLogsByClearedAt(getMessages(), clearedAt)`
		// before encoding the snapshot into the dialog open-params. We
		// verify the filter behaviour directly because the production
		// path goes through `openCepDialogSurface` and is awkward to
		// drive in happy-dom.
		const now = Date.now();
		await setClearedAt(window, now);

		const messages = [
			{
				id: "old-openpanel",
				level: "info" as const,
				text: "pre-clear",
				args: [],
				timestamp: new Date(now - 1_000),
			},
			{
				id: "new-openpanel",
				level: "info" as const,
				text: "post-clear",
				args: [],
				timestamp: new Date(now + 1_000),
			},
		];
		const clearedAt = await getClearedAt(window);
		const filtered = filterLogsByClearedAt(messages, clearedAt);
		const filteredIds = filtered.map((m) => m.id);
		expect(filteredIds).toEqual(["new-openpanel"]);

		// `toOpenParams` itself is a pure mapping; confirm it preserves
		// every input row, so the responsibility for filtering stays
		// on the `openDebugConsole` caller.
		const payload = toOpenParams(messages);
		const payloadIds = payload.initialLogs.map((w) => w.id);
		expect(payloadIds).toContain("old-openpanel");
		expect(payloadIds).toContain("new-openpanel");
	});

	it("readOpenParamsFromWindow returns the input unchanged when no tombstone is set", async () => {
		// Sanity: the helper is a strict superset of the round-3
		// behavior when no Clear has fired.
		const snapshot = [
			{
				v: 1,
				id: "untouched-1",
				level: "info",
				text: "untouched",
				timestamp: new Date(Date.now() - 5_000).toISOString(),
			},
		];
		const spy = vi
			.spyOn(await import("@/management/ae/cep/transport"), "readCepOpenParams")
			.mockReturnValue({
				surfaceId: "debug-console",
				initialLogs: snapshot,
			});
		const messages = await readOpenParamsFromWindow(window);
		spy.mockRestore();
		expect(messages.map((m) => m.id)).toEqual(["untouched-1"]);
		// Silence unused-symbol lint; the import is needed for the
		// `mockReturnValue` call above.
		void readCepOpenParams;
	});
});
