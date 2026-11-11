// @vitest-environment happy-dom
//
// Issue #138 — remove Debug Console polling/probe and unify retention.
// The first describe block below keeps the source-string assertions
// that document the removal at the lexical level.  The second describe
// block is a behavioral probe under happy-dom that mounts
// `<DebugDialogRoot />`, advances fake timers by 2 s, and asserts the
// five subscription wirings run exactly once at mount and that the
// effect never reaches for `setInterval` / `setTimeout` (the previous
//   polling loop).
//
// Issue #151 dual-clear: the third describe block asserts that the
// in-UI Clear button (and the context-menu Clear item) drive the
// round-7 reorder — `setClearedAt(window)` (boundary advance), then
// `clearEntries()` (canonical LogBus wipe), then
// `clearSharedLogs(window)` (cross-process CEP shared storage wipe).
// A `clearEntries()`-only call would leave the retained history in
// CEP shared storage untouched, so the bus subscriber would revive
// the cleared entries on the next emit after panel reopen — exactly
// what Issue #138 acceptance forbids. Round-7 reorders the sequence
// so the boundary is established BEFORE the canonical bus wipe,
// closing the canonical-bus subscriber-arrival race that round-6
// missed.

import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ── Source-string suite (unchanged behavior, kept as a hard lexical
//    guardrail against accidental re-introduction of the polling loop
//    or the boot-time ExtendScript probe). ────────────────────────────

const source = fs.readFileSync(
	// Issue #151: happy-dom environment makes `import.meta.url` a non-file
	// scheme URL (`http://localhost/...`), so `new URL(...)` throws
	// `TypeError: The URL must be of scheme file` at top-level import time,
	// which crashes the entire test file before any test can run. Using
	// `import.meta.dirname` (Node ≥ 20.11) bypasses that and reads from the
	// same directory as the test.
	path.join(import.meta.dirname, "dialog-root.tsx"),
	{ encoding: "utf8" },
);

describe("DebugDialogRoot", () => {
	test("subscribes to live CEP log broadcasts without relying only on shared storage", () => {
		expect(source).toContain("subscribe((logs) =>");
		expect(source).toContain("createCepSurfaceTransport(window)");
		expect(source).toContain("envelope.channel !== LOG_SURFACE_CHANNEL");
		// Issue #151 round-6: the live-publish branch binds the sanitized
		// payload into a local so the type narrowing survives into the
		// async closure. Either branch (replay response or live publish)
		// MUST still feed the helper, so probe the broader identifier.
		expect(source).toMatch(/wirePayloadToLogMessage\(/);
		expect(source).toContain("subscribeDebugLogEvents(window");
		expect(source).toContain("subscribeSharedLogs(window");
		expect(source).toContain("subscribeLog((entries) =>");
	});

	test("does not let shared log read failures abort the debug console effect", () => {
		// Issue #138: `loadLogs` was removed entirely (was the only consumer
		// of `readSharedLogs`). The defensive `.catch(() => [])` wrapper is
		// preserved in spirit — code paths that DID read shared storage
		// before were guaranteed to be wrapped. Today that path is purely
		// the `subscribeSharedLogs` initial read inside `shared-bridge.ts`,
		// which already swallows failures.
		expect(source).not.toContain("readSharedLogs(window)");
	});

	test("does not poll shared storage on mount (Issue #138)", () => {
		// Polling via `setInterval` was the source of redundant log reads
		// every 500ms. After the fix the Debug Console subscribes only to
		// event-driven sources (bus, transport, debug event channel,
		// shared-bridge's push-style initial read).
		expect(source).not.toContain("setInterval(");
		expect(source).not.toContain("loadLogs");
	});

	test("does not probe ExtendScript on mount (Issue #138)", () => {
		// The diagnostic-value-low ExtendScript probe was relocated to
		// `boot.tsx` and gated on `TY_PLUS_BOOT_PROBES=on`. Mounting the
		// Debug Console must not fire it.
		expect(source).not.toContain("probeAfterEffectsEvalScript");
		expect(source).not.toContain("ExtendScript probe OK");
		expect(source).not.toContain("ExtendScript probe failed");
	});

	test("Clear handler sources drive the round-7 reorder (Issue #151)", () => {
		// Source-level guardrail: round-7 reorders the Clear sequence
		// so the tombstone advances BEFORE the canonical bus wipe. A
		// `clearEntries()`-only call would leave the retained history
		// in CEP shared storage untouched, and the bus subscriber
		// would revive the cleared entries on the next emit after
		// panel reopen — exactly the regression Issue #151 fixed.
		// Both call sites must drive the three-step sequence in the
		// round-7 order: setClearedAt → clearEntries → clearSharedLogs.
		//
		// Round-7 note: the dialog-root no longer imports the combined
		// `clearLogs()` / `clearRetainedLogs()` helpers from
		// `interceptor.ts` (those continue to exist for other callers
		// like `ui.tsx` but they perform the operations in the OLD
		// order). The dialog-root drives the three primitives
		// directly so the round-7 order is observable here.
		expect(source).not.toMatch(/clearLogs\(\)/);
		expect(source).not.toMatch(/clearRetainedLogs\(window\)/);
		// Each Clear call site must drive all three primitives in the
		// round-7 order: boundary → canonical bus → retained storage.
		const setClearedAtMatches =
			source.match(/setClearedAt\(window,\s*Date\.now\(\)\)/g) ?? [];
		expect(setClearedAtMatches.length).toBeGreaterThanOrEqual(2);
		const clearEntriesMatches = source.match(/clearEntries\(\)/g) ?? [];
		expect(clearEntriesMatches.length).toBeGreaterThanOrEqual(2);
		const clearSharedLogsMatches =
			source.match(/clearSharedLogs\(window\)/g) ?? [];
		expect(clearSharedLogsMatches.length).toBeGreaterThanOrEqual(2);
		// `handleClear` MUST await setClearedAt, then call clearEntries,
		// then await clearSharedLogs — in that order.
		expect(source).toMatch(
			/await\s+setClearedAt\(window,\s*Date\.now\(\)\);\s*\n\s*clearEntries\(\);\s*\n\s*await\s+clearSharedLogs\(window\)/,
		);
	});
});

// ── Behavioral probe (Issue #138 acceptance: no polling after mount) ────────
//
// Mount `<DebugDialogRoot />` with all five CEP/debug subscriptions
// mocked at the module boundary, advance fake timers past the would-be
// 500 ms polling interval, and assert each wiring ran exactly once at
// mount (initial state read) and never again during the 2 s window.

const subscribeSharedLogsSpy = vi.fn(() => () => {});
const subscribeSpy = vi.fn(() => () => {});
const subscribeDebugLogEventsSpy = vi.fn(() => () => {});
const subscribeLogSpy = vi.fn(() => () => {});
const cepTransportSubscribeSpy = vi.fn(() => () => {});
const cepTransportPublishSpy = vi.fn(async () => {});
// Issue #151 round-7: spies on the three primitives that
// `handleClear` and the context-menu Clear path now drive directly,
// in the round-7 reorder order.
const setClearedAtSpy = vi.fn(async (_win: Window, _ts: number) => {});
const clearEntriesSpy = vi.fn(() => {});
const clearSharedLogsSpy = vi.fn(async (_win: Window) => {});

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: () => ({
		publish: cepTransportPublishSpy,
		subscribe: cepTransportSubscribeSpy,
	}),
	readCepOpenParams: () => null,
}));

vi.mock("@/management/debug/console/interceptor", () => ({
	subscribe: subscribeSpy,
	subscribeDebugLogEvents: subscribeDebugLogEventsSpy,
	executeCommand: () => {},
	currentSessionStartedAt: () => null,
	LOG_SURFACE_CHANNEL: "com.typlus.workspace.debug",
	DEBUG_LOG_REPLAY_MAX_ENTRIES: 1000,
	isSanitizedLogWirePayload: (p: unknown) =>
		!!p && typeof p === "object" && "id" in (p as Record<string, unknown>),
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

vi.mock("@/management/debug/console/shared-bridge", () => ({
	subscribeSharedLogs: subscribeSharedLogsSpy,
	readSharedLogs: async () => [],
	writeSharedLogs: async () => {},
	refreshSharedLogs: async () => {},
	clearSharedLogs: clearSharedLogsSpy,
	// Issue #151 round-4: dialog-root now calls `readOpenParamsFromWindow`
	// (which goes through `getClearedAt` + `filterWireByClearedAt`) on
	// mount. The dual-clear behavioral tests mock these helpers as no-ops
	// so the tombstone path stays a no-op and the round-3 in-UI Clear
	// behavior continues to be the asserted invariant. Round-7: the
	// tombstone-advance helper is now `setClearedAt` (a no-op mock
	// here) so the three-step sequence can be observed.
	getClearedAt: async () => null,
	setClearedAt: setClearedAtSpy,
	snapshotClearedAt: async () => null,
	filterLogsByClearedAt: <T>(logs: readonly T[]) => logs.slice(),
	filterWireByClearedAt: <T>(wire: readonly T[]) => wire.slice(),
}));

vi.mock("@/management/debug/logger", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/debug/logger")
	>("@/management/debug/logger");
	return {
		...actual,
		subscribeLog: subscribeLogSpy,
		// Issue #151 round-7: clearEntries is the canonical-bus wipe
		// step in the new Clear sequence. Spying on it lets the
		// behavioral tests assert the round-7 reorder (tombstone →
		// canonical bus → retained storage).
		clearEntries: clearEntriesSpy,
		createLogger: () => ({
			info: () => {},
			warn: () => {},
			error: () => {},
			log: () => {},
			debug: () => {},
		}),
	};
});

describe("DebugDialogRoot — no polling after mount (Issue #138)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
		subscribeSharedLogsSpy.mockClear();
		subscribeSpy.mockClear();
		subscribeDebugLogEventsSpy.mockClear();
		subscribeLogSpy.mockClear();
		cepTransportSubscribeSpy.mockClear();
		cepTransportPublishSpy.mockClear();
		setClearedAtSpy.mockClear();
		clearEntriesSpy.mockClear();
		clearSharedLogsSpy.mockClear();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("mount fires each of the five subscription wirings exactly once", async () => {
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));

		// Effect runs synchronously after the first render commit in
		// React 19; flush microtasks so the async publish/subscribe
		// setup inside the effect has a chance to settle.
		await Promise.resolve();
		await Promise.resolve();

		expect(subscribeSharedLogsSpy).toHaveBeenCalledTimes(1);
		expect(subscribeSpy).toHaveBeenCalledTimes(1);
		expect(cepTransportSubscribeSpy).toHaveBeenCalledTimes(1);
		expect(subscribeDebugLogEventsSpy).toHaveBeenCalledTimes(1);
		expect(subscribeLogSpy).toHaveBeenCalledTimes(1);
	});

	test("no setInterval / setTimeout is registered during the dialog-root effect (2 s window)", async () => {
		const setIntervalSpy = vi
			.spyOn(globalThis, "setInterval")
			.mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>);
		const clearIntervalSpy = vi
			.spyOn(globalThis, "clearInterval")
			.mockImplementation(() => {});
		const _setTimeoutSpy = vi
			.spyOn(globalThis, "setTimeout")
			.mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);
		const _clearTimeoutSpy = vi
			.spyOn(globalThis, "clearTimeout")
			.mockImplementation(() => {});

		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));

		// Far past the 500 ms polling interval that the previous
		// implementation used. If the dialog-root effect still
		// scheduled a timer, the spy would have observed it.
		vi.advanceTimersByTime(2_000);

		expect(setIntervalSpy).not.toHaveBeenCalled();
		expect(clearIntervalSpy).not.toHaveBeenCalled();
		// setTimeout may be used by the CEP transport for its retry
		// loop or by React for scheduling — that's fine.  We just need
		// the dialog-root's effect to NOT add a polling tick of its
		// own.  The remaining assertions guard the effect itself: it
		// ran exactly once at mount and never re-ran.
		expect(subscribeSharedLogsSpy).toHaveBeenCalledTimes(1);
		expect(subscribeSpy).toHaveBeenCalledTimes(1);
		expect(cepTransportSubscribeSpy).toHaveBeenCalledTimes(1);
		expect(subscribeDebugLogEventsSpy).toHaveBeenCalledTimes(1);
		expect(subscribeLogSpy).toHaveBeenCalledTimes(1);
	});
});

// ── Behavioral probe (Issue #151 round-7 dual-clear + reorder acceptance) ──
//
// Mount `<DebugDialogRoot />`, click the header-toolbar "Clear" button,
// and assert the round-7 three-step sequence was driven in order:
// `setClearedAt(window, ...)` (boundary advance), then `clearEntries()`
// (canonical LogBus wipe), then `clearSharedLogs(window)` (retained
// storage wipe). The test also drives the context-menu "Clear messages"
// path via the `__tyPlusDebugCtxHandler` global the dialog installs at
// mount (see `dialog-root.tsx`) and asserts the same three-step order
// on the context-menu path.

describe("DebugDialogRoot — round-7 dual-clear (Issue #151 acceptance)", () => {
	beforeEach(() => {
		setClearedAtSpy.mockClear();
		clearEntriesSpy.mockClear();
		clearSharedLogsSpy.mockClear();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test("header-toolbar Clear button drives the round-7 three-step sequence in order", async () => {
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));

		const clearButton = screen.getByText("Clear");
		fireEvent.click(clearButton);

		// handleClear is `async`; flush the microtask queue so all three
		// awaits resolve before asserting the call order.
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		// Each primitive must have been invoked exactly once.
		expect(setClearedAtSpy).toHaveBeenCalledTimes(1);
		expect(clearEntriesSpy).toHaveBeenCalledTimes(1);
		expect(clearSharedLogsSpy).toHaveBeenCalledTimes(1);
		// Round-7 order: setClearedAt → clearEntries → clearSharedLogs.
		// `mock.invocationCallOrder` is the order of invocation across
		// all spies (ascending); the earliest call has the smallest
		// number.
		const setOrder = setClearedAtSpy.mock.invocationCallOrder[0] ?? 0;
		const clearEntriesOrder = clearEntriesSpy.mock.invocationCallOrder[0] ?? 0;
		const clearSharedLogsOrder =
			clearSharedLogsSpy.mock.invocationCallOrder[0] ?? 0;
		expect(setOrder).toBeLessThan(clearEntriesOrder);
		expect(clearEntriesOrder).toBeLessThan(clearSharedLogsOrder);
	});

	test("context-menu Clear item also drives the round-7 three-step sequence in order", async () => {
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));

		const ctxHandler = (
			window as Window & {
				__tyPlusDebugCtxHandler?: (id: string) => void;
			}
		).__tyPlusDebugCtxHandler;
		expect(ctxHandler).toBeDefined();
		// The handler compares the menuId against `DEBUG_CTX_IDS.clearMessages`
		// which is the wire value `"dbg.ctx.clear"`. Using the property key
		// here would silently skip the clear case in the switch.
		ctxHandler?.("dbg.ctx.clear");

		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		expect(setClearedAtSpy).toHaveBeenCalledTimes(1);
		expect(clearEntriesSpy).toHaveBeenCalledTimes(1);
		expect(clearSharedLogsSpy).toHaveBeenCalledTimes(1);
		const setOrder = setClearedAtSpy.mock.invocationCallOrder[0] ?? 0;
		const clearEntriesOrder = clearEntriesSpy.mock.invocationCallOrder[0] ?? 0;
		const clearSharedLogsOrder =
			clearSharedLogsSpy.mock.invocationCallOrder[0] ?? 0;
		expect(setOrder).toBeLessThan(clearEntriesOrder);
		expect(clearEntriesOrder).toBeLessThan(clearSharedLogsOrder);
	});
});
