// @vitest-environment happy-dom

/**
 * Issue #138 — cross-surface event transport contract.
 *
 * PR #151 removed the polling loop and added replay/retention, but the
 * *event* half of the contract still has three gaps this file pins:
 *
 *   1. Structured `action` / `context` from the canonical `LogEntry`
 *      never reach the wire, so a modeless surface's emit arrives at the
 *      Debug Console stripped of the fields Issue #158 (request
 *      correlation, worker lifecycle correlation) has to read.
 *   2. Transport failures are swallowed by `catch { /* noop *\/ }` with
 *      no defined diagnostic policy: no recursion guard, no bounded
 *      fallback, and nothing that proves the logger itself survives.
 *   3. The live publish path had no regression guard for "distinct
 *      message ids are never collapsed by text" or for "the wire carries
 *      the emitting surface's source".
 *   4. `SurfaceTransport.publish` is `async` in production
 *      (`createCepSurfaceTransport(...).publish` is an `async` method), so
 *      a failure inside its body — the `JSON.stringify`, the CEP dispatch,
 *      anything else in that async body — surfaces as a **rejected
 *      promise**, not a synchronous throw. The surrounding `try/catch`
 *      never sees it.
 *   5. The diagnostic carried `error.message`, which can embed tokens,
 *      URLs and paths. Issue #138 forbids secrets in the log.
 *
 * Mocks: the CEP surface transport (to capture published envelopes) and
 * CEP shared storage (so retention writes do not need a host). The
 * interceptor, the canonical LogBus, and the wire codec are REAL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

type TransportSubscriber = (envelope: SurfaceMessageEnvelope) => void;

interface MockTransport extends SurfaceTransport {
	__getPublishCalls: () => SurfaceMessageEnvelope[];
	__getAttempts: () => number;
}

/**
 * Mirrors the production contract: `createCepSurfaceTransport` can fail
 * synchronously (construction), while `publish` is an `async` method, so
 * failures inside its body reject the returned promise instead of
 * throwing at the call site.
 */
const transportState = vi.hoisted(() => {
	const publishCalls: SurfaceMessageEnvelope[] = [];
	return {
		publishCalls,
		/** Async rejection reason returned by `publish`. */
		rejectWith: null as Error | null,
		/** Synchronous failure thrown by `createCepSurfaceTransport`. */
		createThrows: null as Error | null,
		attempts: 0,
	};
});

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): MockTransport => {
		if (transportState.createThrows) {
			throw transportState.createThrows;
		}
		const subscribers = new Set<TransportSubscriber>();
		return {
			// `async` exactly like production: a `throw` below becomes a
			// rejected promise, never a synchronous caller-visible throw.
			publish: async (message: SurfaceMessageEnvelope) => {
				transportState.attempts += 1;
				if (transportState.rejectWith) {
					throw transportState.rejectWith;
				}
				transportState.publishCalls.push(message);
				void subscribers;
			},
			subscribe: (handler: TransportSubscriber) => {
				subscribers.add(handler);
				return () => {
					subscribers.delete(handler);
				};
			},
			__getPublishCalls: () => transportState.publishCalls,
			__getAttempts: () => transportState.attempts,
		} as unknown as MockTransport;
	},
	readCepOpenParams: () => null,
}));

// In-memory stand-in for CEP shared storage: `shared-bridge` reads the
// clearedAt tombstone on every consumer arrival, and the broadcast path
// debounces a retention write through this module. Hoisted so the
// `vi.mock` factory (which is lifted above the module body) closes over
// an initialized Map rather than one still in its temporal dead zone.
const { sharedStorage } = vi.hoisted(() => ({
	sharedStorage: new Map<string, unknown>(),
}));

vi.mock("@/management/storage/cep", () => ({
	// The real helpers take `(win, key[, value])`.
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

const {
	DEBUG_LOG_REPLAY_MAX_ENTRIES,
	enableCepBroadcast,
	enableInterceptor,
	isSanitizedLogWirePayload,
	wirePayloadToLogMessage,
	__resetTransportDiagnosticsForTest,
} = await import("@/management/debug/console/interceptor");
const { createLogger, getEntries, _setDevConsoleEnabled } = await import(
	"@/management/debug/logger"
);
const { mergeLogMessages } = await import(
	"@/management/debug/console/message-store"
);
const { readSharedLogs, writeSharedLogs } = await import(
	"@/management/debug/console/shared-bridge"
);

let idCounter = 0;
const nextId = (): number => {
	idCounter += 1;
	return idCounter;
};
const uniqueText = (label: string): string =>
	`${label}-${nextId()}-${Date.now()}`;

const publishedWireFor = (text: string) =>
	transportState.publishCalls
		.map((call) => call.payload as Record<string, unknown>)
		.find((payload) => payload?.text === text);

/**
 * Drain the async publish path. `publish` is async, so its `.catch`
 * handler (and Node's unhandled-rejection turn) run on a later
 * microtask/macrotask than the emit that scheduled them. Real timers are
 * used deliberately — the retention debounce below also needs wall time.
 */
const flushTransport = async (waitMs = 0): Promise<void> => {
	for (let i = 0; i < 4; i += 1) {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	if (waitMs > 0) {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, waitMs);
		});
	}
};

/**
 * Capture diagnostics emitted from THIS point onward.
 *
 * The bus is process-wide and the failure budget is per module load, so
 * filtering `getEntries()` outright would assert on rows a previous case
 * produced. Slicing from a start index keeps every diagnostic assertion
 * scoped to the failure the current case actually caused.
 */
const captureDiagnostics = (): (() => ReturnType<typeof getEntries>) => {
	const start = getEntries().length;
	return () =>
		getEntries()
			.slice(start)
			.filter(
				(entry) =>
					entry.source === "debug-console" &&
					entry.level === "warn" &&
					entry.message.includes("transport"),
			);
};

/**
 * Cycle-safe JSON for assertions: the bus legitimately holds a circular
 * `context` (another case proves an un-encodable one never breaks the
 * logger), and a raw `JSON.stringify` would throw before we could look
 * for the secret.
 */
const serializeSafely = (value: unknown): string => {
	const seen = new WeakSet<object>();
	try {
		return (
			JSON.stringify(value, (_key, entry: unknown) => {
				if (entry !== null && typeof entry === "object") {
					if (seen.has(entry)) return "[Circular]";
					seen.add(entry);
				}
				return entry;
			}) ?? ""
		);
	} catch {
		return "";
	}
};

beforeEach(() => {
	sharedStorage.clear();
	transportState.publishCalls.length = 0;
	transportState.attempts = 0;
	transportState.rejectWith = null;
	transportState.createThrows = null;
	// Fresh failure budget per case: the budget is what stops a dead
	// transport from flooding the log, and without resetting it only the
	// first case in the file could ever observe a recorded failure.
	__resetTransportDiagnosticsForTest();
	_setDevConsoleEnabled(false);
	// One install per file: `enableInterceptor` / `enableCepBroadcast` are
	// idempotent, and the bus subscriber they install must outlive the
	// per-test buffer resets (resetting would silently uninstall it).
	enableCepBroadcast(window);
	enableInterceptor();
});

describe("structured context crosses the surface boundary (Issue #138 → #158)", () => {
	it("carries action and context on the published wire payload", () => {
		const text = uniqueText("modeless-context");
		createLogger("modeless").info(text, {
			action: "open-settings",
			context: { requestId: "req-42", generation: 3 },
		});

		const wire = publishedWireFor(text);
		expect(wire, "the emit must reach the CEP surface bus").toBeDefined();
		expect(wire?.action).toBe("open-settings");
		expect(wire?.context).toEqual({ requestId: "req-42", generation: 3 });
	});

	it("restores action and context when the wire payload is decoded", () => {
		const text = uniqueText("decode-context");
		createLogger("host-bridge").warn(text, {
			action: "eval-script",
			context: { requestId: "req-7" },
		});

		const wire = publishedWireFor(text);
		expect(wire).toBeDefined();
		const decoded = wirePayloadToLogMessage(
			wire as unknown as Parameters<typeof wirePayloadToLogMessage>[0],
		);
		expect(decoded.action).toBe("eval-script");
		expect(decoded.context).toEqual({ requestId: "req-7" });
		expect(decoded.source).toBe("host-bridge");
	});

	it("keeps action and context through the sanitizer gate", () => {
		const text = uniqueText("sanitized-context");
		createLogger("operation-worker").info(text, {
			action: "worker-start",
			context: { pid: 1234 },
		});

		const wire = publishedWireFor(text);
		expect(wire).toBeDefined();
		expect(
			isSanitizedLogWirePayload(wire),
			"a payload carrying context must still clear the ingress guard",
		).toBe(true);
	});

	it("rejects a wire payload whose context exceeds the size limit", () => {
		const oversized = {
			v: 1,
			id: "big-context",
			level: "info",
			text: "hello",
			timestamp: new Date().toISOString(),
			context: { blob: "x".repeat(8192) },
		};
		expect(isSanitizedLogWirePayload(oversized)).toBe(false);
	});

	it("does not let an unserializable context break the logger", () => {
		const circular: Record<string, unknown> = { name: "loop" };
		circular.self = circular;

		const text = uniqueText("circular-context");
		expect(() =>
			createLogger("workspace").info(text, { context: circular }),
		).not.toThrow();

		// The entry still landed on the canonical bus ...
		expect(getEntries().some((entry) => entry.message === text)).toBe(true);
		// ... and the transport still published the row (without the
		// unserializable context attached).
		const wire = publishedWireFor(text);
		expect(
			wire,
			"a serialization failure must not drop the message",
		).toBeDefined();
		expect(wire?.context).toBeUndefined();
	});
});

describe("transport failure diagnostic policy (Issue #138)", () => {
	it("records async publish rejections instead of silently swallowing them", async () => {
		// Production `publish` is `async`: a failure inside its body is a
		// rejected promise, which the surrounding `try/catch` never sees.
		const diagnostics = captureDiagnostics();
		transportState.rejectWith = new Error("surface bus unavailable");

		for (let i = 0; i < 8; i += 1) {
			createLogger("panel").info(uniqueText("failing-emit"));
		}
		await flushTransport();

		const recorded = diagnostics();
		expect(
			recorded.length,
			"async rejections must produce a diagnostic",
		).toBeGreaterThan(0);
		expect(
			recorded.length,
			"the diagnostic path must be bounded",
		).toBeLessThanOrEqual(5);
	});

	it("leaves no unhandled rejection behind", async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown): void => {
			unhandled.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);
		try {
			transportState.rejectWith = new Error("unawaited publish failure");
			createLogger("panel").info(uniqueText("unhandled-emit"));
			await flushTransport();
			expect(
				unhandled,
				"an async publish rejection must be handled by the transport path",
			).toHaveLength(0);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	it("records a synchronous createCepSurfaceTransport failure too", async () => {
		// The construction failure is the other half of the contract: it
		// really does throw at the call site, so the outer try/catch owns it.
		const diagnostics = captureDiagnostics();
		transportState.createThrows = new Error("transport unavailable");

		createLogger("panel").info(uniqueText("create-fail-emit"));
		await flushTransport();

		expect(
			diagnostics().length,
			"a synchronous construction failure must be recorded",
		).toBeGreaterThan(0);
	});

	it("never broadcasts its own transport-failure diagnostic (no loop)", async () => {
		const diagnostics = captureDiagnostics();
		transportState.rejectWith = new Error("loop emit failure");

		createLogger("panel").info(uniqueText("loop-emit"));
		await flushTransport();

		const diagnostic = diagnostics()[0];
		expect(diagnostic, "the failure must be recorded").toBeDefined();

		const attemptsForDiagnostic = transportState.publishCalls.filter(
			(call) => (call.payload as { id?: string })?.id === diagnostic?.id,
		);
		expect(
			attemptsForDiagnostic.length,
			"logging a transport failure must not re-enter the transport",
		).toBe(0);
	});

	it("keeps the logger working after transport failures stop", async () => {
		transportState.rejectWith = new Error("transient failure");
		for (let i = 0; i < 10; i += 1) {
			createLogger("panel").info(uniqueText("broken-emit"));
		}
		await flushTransport();

		transportState.rejectWith = null;
		const text = uniqueText("recovered-emit");
		createLogger("panel").info(text);
		await flushTransport();

		expect(
			publishedWireFor(text),
			"the transport must recover without a restart",
		).toBeDefined();
	});

	it("records at most the budget for a storm of failures", async () => {
		const diagnostics = captureDiagnostics();
		transportState.rejectWith = new Error("storm failure");

		for (let i = 0; i < 40; i += 1) {
			createLogger("panel").info(uniqueText("storm-emit"));
		}
		await flushTransport();

		expect(diagnostics().length).toBeLessThanOrEqual(5);
	});
});

describe("transport diagnostics never carry the failure reason (Issue #138)", () => {
	// Issue #138: "secret / token をログへ追加しない". A transport
	// exception's `.message` can embed an Authorization header, a URL
	// query, a filesystem path or user data — truncation is not
	// redaction, and there is no canonical message redactor in this repo
	// that covers all of those shapes. So the reason is not stored at all.
	const SECRET = "super-secret-token";
	const SECRET_QUERY = "abc123";
	const rejectReason = `POST https://example.test/api?token=${SECRET_QUERY} Authorization: Bearer ${SECRET}`;

	it("keeps the reject reason out of the canonical retained diagnostic", async () => {
		const diagnostics = captureDiagnostics();
		transportState.rejectWith = new Error(rejectReason);

		const before = getEntries().length;
		createLogger("panel").info(uniqueText("secret-emit"));
		await flushTransport();

		expect(
			diagnostics().length,
			"the failure itself must still be recorded",
		).toBeGreaterThan(0);

		const bus = serializeSafely(getEntries().slice(before));
		expect(bus).not.toContain(SECRET);
		expect(bus).not.toContain(SECRET_QUERY);
		expect(bus).not.toContain("Bearer");
		expect(bus).not.toContain("Authorization");
	});

	it("keeps the reject reason out of every wire payload", async () => {
		transportState.rejectWith = new Error(rejectReason);

		createLogger("panel").info(uniqueText("secret-wire-emit"));
		await flushTransport();

		const wire = JSON.stringify(transportState.publishCalls);
		expect(wire).not.toContain(SECRET);
		expect(wire).not.toContain(SECRET_QUERY);
	});

	it("keeps the reject reason out of shared retention", async () => {
		transportState.rejectWith = new Error(rejectReason);

		createLogger("panel").info(uniqueText("secret-retention-emit"));
		// The retention write is debounced by 100 ms; wait past it so the
		// assertion inspects the real retained payload, not an empty store.
		await flushTransport(160);

		expect(
			sharedStorage.size,
			"the retention write must have landed before we assert on it",
		).toBeGreaterThan(0);

		const retained = JSON.stringify([...sharedStorage.values()]);
		expect(retained).not.toContain(SECRET);
		expect(retained).not.toContain(SECRET_QUERY);
		expect(retained).not.toContain("Bearer");
	});
});

describe("oversized action degrades to a bare event (Issue #138)", () => {
	it("preserves an action at exactly the limit", () => {
		const action = "a".repeat(128);
		const text = uniqueText("action-at-limit");
		createLogger("panel").info(text, { action });

		const wire = publishedWireFor(text);
		expect(wire?.action).toBe(action);
		expect(isSanitizedLogWirePayload(wire)).toBe(true);
	});

	it("omits only the action when it exceeds the limit, keeping the row", () => {
		const action = "a".repeat(129);
		const text = uniqueText("action-oversized");
		createLogger("panel").info(text, { action });

		const wire = publishedWireFor(text);
		expect(wire, "the base event must still reach the transport").toBeDefined();
		expect(wire?.action).toBeUndefined();
		expect(wire?.id).toBeDefined();
		expect(wire?.level).toBe("info");
		expect(wire?.text).toBe(text);
		expect(wire?.source).toBe("panel");
		expect(
			isSanitizedLogWirePayload(wire),
			"an oversized action must not get the whole payload rejected at ingress",
		).toBe(true);
	});

	it("does not throw when emitting an oversized action", () => {
		expect(() =>
			createLogger("panel").info(uniqueText("action-throws"), {
				action: "b".repeat(8192),
			}),
		).not.toThrow();
	});
});

describe("live event delivery invariants (Issue #138)", () => {
	it("publishes the emitting surface's source so the console can filter it", () => {
		const text = uniqueText("source-carry");
		createLogger("preset-execution").info(text);

		const wire = publishedWireFor(text);
		expect(wire).toBeDefined();
		expect(wire?.source).toBe("preset-execution");
		expect(wire?.level).toBe("info");
		expect(typeof wire?.id).toBe("string");
	});

	it("keeps two distinct ids that happen to share the same text", () => {
		const text = uniqueText("identical-text");
		createLogger("panel").info(text);
		createLogger("modeless").info(text);

		const ids = transportState.publishCalls
			.map((call) => call.payload as { id?: string; text?: string })
			.filter((payload) => payload.text === text)
			.map((payload) => payload.id);
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);

		// And the consumer side must not collapse them by text: dedupe is
		// by message id only (Issue #138: "duplicate を message text 比較で
		// 消す" is forbidden).
		const merged = mergeLogMessages([
			{
				id: ids[0] ?? "a",
				level: "info",
				text,
				args: [],
				timestamp: new Date(),
				source: "panel",
			},
			{
				id: ids[1] ?? "b",
				level: "info",
				text,
				args: [],
				timestamp: new Date(),
				source: "modeless",
			},
		]);
		expect(merged).toHaveLength(2);
	});

	it("caps the retained snapshot at the unified 1000-entry capacity", async () => {
		const overflow = Array.from({ length: 1005 }, (_, i) => ({
			id: `retained-${i}`,
			level: "info" as const,
			text: `row ${i}`,
			args: [],
			timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60, i)),
			source: "panel" as const,
		}));
		await writeSharedLogs(window, overflow);

		const retained = await readSharedLogs(window);
		expect(retained).toHaveLength(1000);
		expect(retained.some((m) => m.id === "retained-0")).toBe(false);
		expect(retained.some((m) => m.id === "retained-1004")).toBe(true);
	});

	it("keeps the replay cap aligned with the bus capacity", () => {
		expect(DEBUG_LOG_REPLAY_MAX_ENTRIES).toBe(1000);
	});
});
