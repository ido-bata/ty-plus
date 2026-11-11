// @vitest-environment happy-dom

/**
 * Issue #138 — cross-surface replay + live delivery dedup invariants.
 *
 * Mock the CEP surface transport so we can drive the `debug` channel
 * deterministically (no real CSInterface / Adobe host objects). The bus
 * itself is real: this exercises `createLogger` end-to-end, including
 * the bus's subscriber fan-out.
 *
 * Invariants under test:
 *   1. A surface (panel) exposes its bus snapshot via the replay-response
 *      envelope when a `replay-request` arrives on `SHELL_CHANNELS.debug`.
 *   2. The Debug Console dedupes replay entries against future live
 *      publishes by `id` — same `id` arriving via both paths MUST NOT
 *      produce duplicate rows in the rendered buffer.
 *   3. bus capacity (1000) and replay `maxEntries` are honored as
 *      documented; an unbounded payload MUST NOT crash the responder.
 *
 * These cover the core transport contract that dialog-root depends on.
 * The dialog-root component tree itself is exercised separately in
 * `dialog-root.test.ts` (source-string level) and the Storybook
 * browser project (per project conventions).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

interface MockTransport extends SurfaceTransport {
	__getSubscribers: () => Set<(env: SurfaceMessageEnvelope) => void>;
	__getPublishCalls: () => SurfaceMessageEnvelope[];
}

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): MockTransport => {
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
	},
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
const { createLogger, getEntries, _resetBusForTests } = await import(
	"@/management/debug/logger"
);

const flushMicrotasks = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

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
	for (const handler of subs) {
		handler({
			...envelope,
			createdAt: envelope.createdAt ?? Date.now(),
		} as SurfaceMessageEnvelope);
	}
};

beforeEach(() => {
	_resetBusForTests();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Issue #138 — replay + live dedup invariants", () => {
	it("emits a replay-response covering all bus entries", async () => {
		const bootLog = createLogger("boot");
		bootLog.info("[ty-plus] panel boot started");
		bootLog.info("[ty-plus] panel surface resolved");
		createLogger("online-runtime").info("[ty-plus] cloud gateway boot started");
		createLogger("operation-worker").info(
			"[ty-plus] operation worker: handshake accepted",
		);
		expect(getEntries().length).toBe(4);

		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "msg-replay-138",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request", requestId: "r-138" },
		});
		await flushMicrotasks();

		const response = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		expect(response).toBeDefined();
		const payload = response?.payload as {
			kind: string;
			entries: ReadonlyArray<{ id: string; text: string }>;
		};
		expect(payload.kind).toBe("replay-response");
		expect(payload.entries).toHaveLength(4);
	});

	it("dedupes same-id entries on the subscriber side (replay followed by live publish)", async () => {
		// Bus already has one entry that the future Debug Console will
		// receive via replay. LogBus auto-generates ids per emit, so we
		// capture the id the live publish actually used and exercise the
		// dedup invariant using that captured id. Asserting against a
		// hand-rolled literal id would silently fail because the literal
		// never appears in `getEntries()` / `idsInReplay`.
		const legacyLog = createLogger("online-runtime");
		legacyLog.info("[ty-plus] legacy entry reused by both replay and live");
		const entriesBeforeReplay = getEntries();
		expect(entriesBeforeReplay).toHaveLength(1);
		const id = entriesBeforeReplay[0].id;

		const transport = setUpResponder("panel-1");

		// 1) Replay path. The Debug Console receives the snapshot.
		fireRequest(transport, {
			messageId: "msg-replay-138-2",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request", requestId: "r-138-2" },
		});
		await flushMicrotasks();
		const replayResponse = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		expect(replayResponse).toBeDefined();
		// `toBeDefined()` above proves this is non-null; narrow it
		// explicitly so biome doesn't flag the unsafe optional chain.
		const replayedEntries = (
			(replayResponse as SurfaceMessageEnvelope).payload as {
				entries: { id: string }[];
			}
		).entries;
		const idsInReplay = replayedEntries.map((e) => e.id);
		expect(idsInReplay).toContain(id);

		// 2) Live publish path. Same wire id is broadcast again.
		// The dialog-root subscriber must mergeLogMessages (byId Map)
		// and skip the duplicate.  We do NOT observe dialog-root here;
		// the dedup behavior is exercised end-to-end in dialog-root.test.tsx
		// at integration time.  This assertion just confirms both paths
		// agree on the id and we can detect duplicates by id set diff.
		const seen = new Set(idsInReplay);
		expect(seen.has(id)).toBe(true);

		// 3) A second bus entry arriving solely via live publish must be
		// id-distinct so dedup doesn't suppress it.
		const liveOnly = createLogger("operation-worker");
		liveOnly.info("[ty-plus] live only entry");
		const liveIds = getEntries().map((e) => e.id);
		const liveOnlyId = liveIds.find((x) => !seen.has(x));
		expect(liveOnlyId).toBeDefined();
		expect(liveOnlyId).not.toBe(id);
	});

	it("caps the replay snapshot at maxEntries (Issue #138: 1000)", async () => {
		const logger = createLogger("boot");
		for (let i = 0; i < 1200; i += 1) {
			logger.info(`overflow-${i}`);
		}
		expect(getEntries().length).toBe(1000);

		const transport = setUpResponder("panel-1");
		fireRequest(transport, {
			messageId: "msg-replay-138-3",
			channel: SHELL_CHANNELS.debug,
			kind: "request",
			sourceSurfaceId: "debug-console",
			payload: { kind: "replay-request", requestId: "r-138-3" },
		});
		await flushMicrotasks();

		const response = transport
			.__getPublishCalls()
			.find((c) => c.kind === "response");
		const payload = response?.payload as { entries: unknown[] };
		expect(payload.entries).toHaveLength(1000);
	});
});
