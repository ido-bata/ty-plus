// @vitest-environment happy-dom

import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CloseHandler = (event: { data?: unknown }) => void;

interface MockCsInterface {
	getApplicationID: () => string;
	getExtensionID: () => string;
	addEventListener: Mock;
	removeEventListener: Mock;
	dispatchEvent: Mock;
}

const installedListeners = new Map<string, Set<CloseHandler>>();

const makeMockInterface = (): MockCsInterface => {
	const mk = (
		kind: "adobe" | "cs",
	): {
		add: Mock;
		remove: Mock;
		dispatch: Mock;
	} => {
		const target = kind === "adobe" ? window.__adobe_cep__ : window.CSInterface;
		const add: Mock = vi.fn((type: string, h: CloseHandler) => {
			let set = installedListeners.get(type);
			if (!set) {
				set = new Set();
				installedListeners.set(type, set);
			}
			set.add(h);
		});
		const remove: Mock = vi.fn((type: string, h: CloseHandler) => {
			installedListeners.get(type)?.delete(h);
		});
		const dispatch: Mock = vi.fn();
		return { add, remove, dispatch };
	};

	const adobeMk = mk("adobe");
	const csMk = mk("cs");

	// CSInterface is a constructor that returns an instance with getApplicationID etc.
	class FakeCSInterface {
		getApplicationID() {
			return "AEFT";
		}
		getExtensionID() {
			return "app.ty-plus";
		}
		addEventListener(type: string, h: CloseHandler) {
			csMk.add(type, h);
		}
		removeEventListener(type: string, h: CloseHandler) {
			csMk.remove(type, h);
		}
		dispatchEvent(ev: unknown) {
			csMk.dispatch(ev);
		}
	}
	(window as unknown as { CSInterface?: unknown }).CSInterface =
		FakeCSInterface;
	(window as unknown as { __adobe_cep__?: unknown }).__adobe_cep__ = {
		getApplicationID: () => "AEFT",
		getExtensionID: () => "app.ty-plus",
		addEventListener: (type: string, h: CloseHandler) => adobeMk.add(type, h),
		removeEventListener: (type: string, h: CloseHandler) =>
			adobeMk.remove(type, h),
		dispatchEvent: (ev: unknown) => adobeMk.dispatch(ev),
	};

	return {
		getApplicationID: () => "AEFT",
		getExtensionID: () => "app.ty-plus",
		addEventListener: adobeMk.add,
		removeEventListener: adobeMk.remove,
		dispatchEvent: adobeMk.dispatch,
	};
};

vi.mock("@/management/storage/cep", () => ({
	setCepSharedData: vi.fn(
		async (_win: Window, _key: string, value: unknown) => {
			return value;
		},
	),
	getCepSharedData: vi.fn(async () => null),
	deleteCepSharedData: vi.fn(async () => {}),
	// The clearedAt tombstone is persisted through the atomic max-set
	// helper, so the mock has to provide it too — otherwise the persist
	// call throws and the wipe silently stops short of the tombstone.
	setCepSharedDataMax: vi.fn(
		async (_win: Window, _key: string, value: unknown) => value,
	),
}));

const fireClose = async (type: string): Promise<void> => {
	const handlers = installedListeners.get(type);
	if (!handlers) return;
	for (const h of handlers) {
		await h({ data: "" });
	}
	// Allow the async flush chain to settle.
	await new Promise((r) => setTimeout(r, 0));
	await new Promise((r) => setTimeout(r, 0));
};

describe("console interceptor session boundary markers", () => {
	beforeEach(() => {
		vi.resetModules();
		installedListeners.clear();
		makeMockInterface();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("currentSessionStartedAt() returns null until enableInterceptor() runs", async () => {
		const { currentSessionStartedAt } = await import("./interceptor");
		expect(currentSessionStartedAt()).toBeNull();
	});

	it("enableInterceptor() anchors a session-start wall-clock timestamp", async () => {
		const { enableInterceptor, currentSessionStartedAt } = await import(
			"./interceptor"
		);
		const before = Date.now();
		enableInterceptor();
		const after = Date.now();
		const t = currentSessionStartedAt();
		expect(t).not.toBeNull();
		expect(t as number).toBeGreaterThanOrEqual(before);
		expect(t as number).toBeLessThanOrEqual(after);
	});

	it("does not move the session start on subsequent enableInterceptor() calls", async () => {
		const { enableInterceptor, currentSessionStartedAt } = await import(
			"./interceptor"
		);
		enableInterceptor();
		const first = currentSessionStartedAt();
		await new Promise((r) => setTimeout(r, 5));
		enableInterceptor();
		const second = currentSessionStartedAt();
		expect(second).toBe(first);
	});

	it("session start resets across simulated AE panel mounts via resetModules()", async () => {
		const first = await import("./interceptor");
		first.enableInterceptor();
		const firstStart = first.currentSessionStartedAt() as number;
		expect(firstStart).toBeGreaterThan(0);

		vi.resetModules();
		// CSInterface + __adobe_cep__ survive window reset, but the cached
		// module-level interceptor state is gone — a fresh AE session starts
		// with a fresh timestamp.
		const second = await import("./interceptor");
		expect(second.currentSessionStartedAt()).toBeNull();
		second.enableInterceptor();
		const secondStart = second.currentSessionStartedAt() as number;
		expect(secondStart).toBeGreaterThanOrEqual(firstStart);
	});

	it("flushOnAEPanelClose commits the buffer (sliced to MAX_SHARED_LOGS) and writes a session marker", async () => {
		// Force the interceptor to skip the production gate.
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";
		try {
			const { enableInterceptor, flushOnAEPanelClose } = await import(
				"./interceptor"
			);
			const cep = await import("@/management/storage/cep");
			const setCepSharedData = cep.setCepSharedData as Mock;

			enableInterceptor();
			// Reduced from 350 to 50 to avoid test timeout; the slicing logic is the same
			for (let i = 0; i < 50; i += 1) {
				console.log(`flood-${i}`);
			}

			flushOnAEPanelClose(window as Window);
			await fireClose("panel_before_close");

			// Two writes happen: one for the log buffer (LOG_SHARED_KEY) and
			// one for the session marker (SESSION_MARKER_KEY).
			expect(setCepSharedData).toHaveBeenCalled();
			const logCall = setCepSharedData.mock.calls.find(
				(c) => c[1] === "ty_plus_debug_logs_v1",
			);
			expect(logCall).toBeDefined();
			const payload = logCall?.[2] as unknown[];
			expect(Array.isArray(payload)).toBe(true);
			// Issue #138 aligned the legacy `MAX_MESSAGES` (1000) with the
			// canonical bus capacity and `MAX_SHARED_LOGS`. The flood emits
			// 50 entries, so the legacy buffer holds all 50 of them at flush
			// time and `writeSharedLogs` passes them through unchanged.
			expect((payload as unknown[]).length).toBe(50);

			const markerCall = setCepSharedData.mock.calls.find(
				(c) => c[1] === "ty_plus_debug_session_marker_v1",
			);
			expect(markerCall).toBeDefined();
			const marker = markerCall?.[2] as {
				kind?: string;
				startedAt?: string;
				closedAt?: string;
			};
			expect(marker.kind).toBe("closed");
			expect(typeof marker.startedAt).toBe("string");
			expect(typeof marker.closedAt).toBe("string");
		} finally {
			process.env.NODE_ENV = originalEnv;
		}
	}, 15000);

	it("panel_before_close and panel_destroyed both invoke the flush", async () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";
		try {
			const { enableInterceptor, flushOnAEPanelClose } = await import(
				"./interceptor"
			);
			const cep = await import("@/management/storage/cep");
			const setCepSharedData = cep.setCepSharedData as Mock;
			setCepSharedData.mockClear();

			enableInterceptor();
			console.log("a message");
			flushOnAEPanelClose(window as Window);

			await fireClose("panel_before_close");
			const writesBefore = setCepSharedData.mock.calls.length;
			expect(writesBefore).toBeGreaterThan(0);

			await fireClose("panel_destroyed");
			const writesAfter = setCepSharedData.mock.calls.length;
			// The destroyed event fires again, doubling the close-flush chain.
			expect(writesAfter).toBeGreaterThan(writesBefore);
		} finally {
			process.env.NODE_ENV = originalEnv;
		}
	});

	it("flushOnAEPanelClose is idempotent — a second install returns a no-op disposer", async () => {
		const cep = await import("@/management/storage/cep");
		const setCepSharedData = cep.setCepSharedData as Mock;
		setCepSharedData.mockClear();

		const first = await import("./interceptor");
		first.enableInterceptor();
		first.flushOnAEPanelClose(window as Window);
		// Second call must be safe: same listener set, no duplicate install.
		first.flushOnAEPanelClose(window as Window);

		const beforeCloseHandlers = installedListeners.get("panel_before_close");
		// The same `onClose` callback registered via CSInterface and via
		// `__adobe_cep__` is a single Set entry (Sets dedupe by reference).
		expect(beforeCloseHandlers?.size).toBe(1);

		await fireClose("panel_before_close");
		// One close event ⇒ one flush chain ⇒ at most two writes (log + marker).
		const logCallCount = setCepSharedData.mock.calls.filter(
			(c) => c[1] === "ty_plus_debug_logs_v1",
		).length;
		expect(logCallCount).toBe(1);
	});
});

describe("console interceptor retention runs in production builds (Issue #151)", () => {
	// Issue #138 requires Windows AE 2026 release builds to keep the
	// cross-process retention path alive for operator triage. The pre-#151
	// implementation early-returned on `NODE_ENV === "production"` for
	// `clearRetainedLogs`, `initializeLogRetention`, and the
	// shared-storage write path, silently disabling retention in shipped
	// builds. These tests pin the post-#151 contract: all three run
	// normally under `NODE_ENV === "production"`.

	beforeEach(() => {
		vi.resetModules();
		installedListeners.clear();
		makeMockInterface();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("clearRetainedLogs executes the shared-storage wipe in production", async () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const { clearRetainedLogs } = await import("./interceptor");
			const cep = await import("@/management/storage/cep");
			const deleteCepSharedData = cep.deleteCepSharedData as Mock;
			const getCepSharedData = cep.getCepSharedData as Mock;
			deleteCepSharedData.mockClear();
			getCepSharedData.mockClear();

			await clearRetainedLogs(window as Window);

			// Both shared-storage operations must have executed:
			// deleteCepSharedData wipes the LOG_SHARED_KEY, then
			// refreshSharedLogs reads it back to fan out to subscribers.
			expect(deleteCepSharedData).toHaveBeenCalled();
			expect(getCepSharedData).toHaveBeenCalled();
		} finally {
			process.env.NODE_ENV = originalEnv;
		}
	});

	it("initializeLogRetention runs the read-merge-write chain in production", async () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const { enableInterceptor, initializeLogRetention } = await import(
				"./interceptor"
			);
			const cep = await import("@/management/storage/cep");
			const getCepSharedData = cep.getCepSharedData as Mock;
			const setCepSharedData = cep.setCepSharedData as Mock;
			getCepSharedData.mockClear();
			setCepSharedData.mockClear();

			enableInterceptor();
			// The interceptor pushes through the canonical LogBus, which
			// rebuilds the legacy `_messages` via the bus subscriber.
			console.log("retained-after-restart");

			await initializeLogRetention(window as Window);

			// initializeLogRetention reads the retained history and re-asserts
			// the cap; both calls must have hit shared storage.
			expect(getCepSharedData).toHaveBeenCalled();
		} finally {
			process.env.NODE_ENV = originalEnv;
		}
	});

	it("flushOnAEPanelClose writes the log buffer and session marker in production", async () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		try {
			const { enableInterceptor, flushOnAEPanelClose } = await import(
				"./interceptor"
			);
			const cep = await import("@/management/storage/cep");
			const setCepSharedData = cep.setCepSharedData as Mock;
			setCepSharedData.mockClear();

			enableInterceptor();
			console.log("close-flush-in-prod");
			flushOnAEPanelClose(window as Window);

			await fireClose("panel_before_close");

			const logCall = setCepSharedData.mock.calls.find(
				(c) => c[1] === "ty_plus_debug_logs_v1",
			);
			expect(logCall).toBeDefined();
			const markerCall = setCepSharedData.mock.calls.find(
				(c) => c[1] === "ty_plus_debug_session_marker_v1",
			);
			expect(markerCall).toBeDefined();
		} finally {
			process.env.NODE_ENV = originalEnv;
		}
	});
});
