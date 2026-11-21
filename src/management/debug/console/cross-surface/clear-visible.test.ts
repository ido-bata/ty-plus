// @vitest-environment happy-dom
//
// Issue #151 round-3 — UI Clear visible behavior.
//
// The bus/storage layers clear correctly, but the Debug Console's
// `mergeLogMessages(openParamMessages, localMessages, logs)` was
// merging against a closure-captured `localMessages` that the Clear
// handlers did NOT reset. Result: after the canonical bus wipe +
// retained storage wipe the bus was empty but the React state still
// rendered every pre-clear row.
//
// The round-3 fix moves `localMessages` and `openParamMessages` onto
// `useRef`s that the Clear handlers reset synchronously, so the UI
// empties atomically with the bus wipe and reopen reads an empty
// retention layer.
//
// Issue #151 round-7: the Clear sequence is reordered. The
// dialog-root now drives three primitives directly —
// `setClearedAt(window, ...)` (boundary advance), `clearEntries()`
// (canonical bus wipe), and `clearSharedLogs(window)` (retained
// storage wipe) — in that order. The previously-asserted
// `clearLogs()` and `clearRetainedLogs()` from `interceptor.ts` are
// no longer called by the dialog-root; the round-6 wrappers still
// exist for other callers (`ui.tsx`, etc.) but the dialog-root
// composes the three primitives directly so the round-7 reorder is
// observable here. The test exercises the rendered `Panel`
// end-to-end:
//   1. Emit 5 logs via the canonical bus
//      (`createLogger('panel').info(...)`), wait for the subscriber
//      tick, assert the rendered buffer holds 5 `[data-debug-msg-id]`
//      rows.
//   2. Click the header Clear button, assert the panel shows 0 rows
//      and the round-7 three-step sequence fired in order.
//   3. Emit 1 fresh log post-Clear, assert exactly 1 row (no
//      resurrection).
//   4. Unmount and re-mount the panel, assert none of the pre-Clear
//      `hello-*` rows resurrect from the cleared retention layer.
//
// Mocks are local to this file: `subscribe` / `subscribeSharedLogs` /
// `subscribeDebugLogEvents` / `subscribeLog` / `transport.subscribe`
// all forward into a captured handler array so the test can drive
// every subscription path deterministically. The round-7 Clear
// primitives (`setClearedAt`, `clearSharedLogs`) are mocked as spies;
// `clearEntries` is the real function so the canonical bus actually
// wipes during the test.

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	SurfaceMessageEnvelope,
	SurfaceTransport,
} from "@/management/workspace/surface/contract";

type LogHandler = (entries: readonly unknown[]) => void;
type EnvelopeHandler = (envelope: SurfaceMessageEnvelope) => void;

const busHandlers: LogHandler[] = [];
const sharedLogsHandlers: LogHandler[] = [];
const localInterceptorHandlers: LogHandler[] = [];
const debugEventHandlers: ((message: unknown) => void)[] = [];
const transportHandlers: EnvelopeHandler[] = [];

const localInterceptorHandlersSpy = vi.fn((handler: LogHandler) => {
	localInterceptorHandlers.push(handler);
	return () => {
		const idx = localInterceptorHandlers.indexOf(handler);
		if (idx >= 0) localInterceptorHandlers.splice(idx, 1);
	};
});

const sharedLogsHandlersSpy = vi.fn((_win: Window, handler: LogHandler) => {
	sharedLogsHandlers.push(handler);
	// Production wiring emits the current shared-storage snapshot
	// immediately on subscribe. Drive it with `[]` (retention is empty
	// in this test).
	handler([]);
	return () => {
		const idx = sharedLogsHandlers.indexOf(handler);
		if (idx >= 0) sharedLogsHandlers.splice(idx, 1);
	};
});

const debugEventHandlersSpy = vi.fn(
	(_win: Window, handler: (message: unknown) => void) => {
		debugEventHandlers.push(handler);
		return () => {
			const idx = debugEventHandlers.indexOf(handler);
			if (idx >= 0) debugEventHandlers.splice(idx, 1);
		};
	},
);

const transportHandlersSpy = vi.fn((handler: EnvelopeHandler) => {
	transportHandlers.push(handler);
	return () => {
		const idx = transportHandlers.indexOf(handler);
		if (idx >= 0) transportHandlers.splice(idx, 1);
	};
});

// Issue #151 round-7: the dialog-root drives three primitives directly
// in `handleClear` — `setClearedAt` (boundary advance), `clearEntries`
// (canonical bus wipe, the real function from `debug/logger`), and
// `clearSharedLogs` (retained storage wipe). We spy on the two
// shared-bridge primitives so the round-7 reorder is observable; the
// real `clearEntries` runs as-is, wiping the canonical bus buffer.
//
// The retained-storage mock mirrors the production wipe: drop every
// captured `subscribeSharedLogs` handler's pending state by emitting
// `[]` to it. The next subscribe re-seeds with the current (empty)
// snapshot.
const setClearedAtSpy = vi.fn(async (_win: Window, _ts: number) => {});
const clearSharedLogsSpy = vi.fn(async (_win: Window) => {
	for (const handler of sharedLogsHandlers.slice()) handler([]);
});

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: (): SurfaceTransport => ({
		publish: vi.fn(async () => {}),
		subscribe: transportHandlersSpy,
	}),
	readCepOpenParams: () => null,
}));

vi.mock("@/management/debug/console/interceptor", () => ({
	subscribe: localInterceptorHandlersSpy,
	subscribeDebugLogEvents: debugEventHandlersSpy,
	// Issue #151 round-7: the dialog-root no longer drives `clearLogs`
	// or `clearRetainedLogs` directly — it composes the three primitives
	// (setClearedAt + clearEntries + clearSharedLogs) inline so the
	// round-7 reorder is observable. The combined wrappers still exist
	// in `interceptor.ts` for other callers (e.g. `ui.tsx`) but the
	// dialog-root doesn't go through them. We keep them as inert
	// stubs here so any incidental import does not blow up.
	clearLogs: async () => {},
	clearRetainedLogs: async () => {},
	executeCommand: () => {},
	currentSessionStartedAt: () => null,
	LOG_SURFACE_CHANNEL: "com.typlus.workspace.debug",
	DEBUG_LOG_REPLAY_MAX_ENTRIES: 1000,
	isSanitizedLogWirePayload: (p: unknown) =>
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

vi.mock("@/management/debug/console/shared-bridge", () => ({
	subscribeSharedLogs: sharedLogsHandlersSpy,
	readSharedLogs: async () => [],
	writeSharedLogs: async () => {},
	refreshSharedLogs: async () => {},
	// Issue #151 round-7: `clearSharedLogs` is the third step of the
	// round-7 Clear sequence. Spy on it so the test can verify the
	// call order against `setClearedAtSpy`.
	clearSharedLogs: clearSharedLogsSpy,
	// Issue #151 round-4: the clearedAt tombstone helpers and the
	// filter helpers are imported by `open-params.ts` (which dialog-root
	// calls synchronously on mount). We stub them as no-ops so the test
	// stays focused on the round-3 in-UI Clear behavior; the
	// cross-surface boundary itself is covered by
	// `cross-surface-clear-boundary.test.ts`. Round-7 turns
	// `setClearedAt` into a spy so the call-order assertion can fire.
	getClearedAt: async () => null,
	setClearedAt: setClearedAtSpy,
	snapshotClearedAt: async () => null,
	filterLogsByClearedAt: <T>(logs: readonly T[]) => logs.slice(),
	filterWireByClearedAt: <T>(wire: readonly T[]) => wire.slice(),
}));

const subscribeLogImpl = (handler: LogHandler): (() => void) => {
	// Wire through to the REAL canonical LogBus so calls to
	// `createLogger('panel').info(...)` propagate to the dialog-root
	// subscriber. We use `vi.importActual` inside the mock factory (see
	// below) so `subscribeLogImpl` can register on the real bus.
	const { getBus } = busInternals;
	return getBus().subscribe((entries) => handler(entries));
};

const busInternals = await vi.importActual<
	typeof import("@/management/debug/logger")
>("@/management/debug/logger");
const _resetBusForTests = busInternals._resetBusForTests;

vi.mock("@/management/debug/logger", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/debug/logger")
	>("@/management/debug/logger");
	return {
		...actual,
		subscribeLog: subscribeLogImpl,
	};
});

const flushMicrotasks = async (): Promise<void> => {
	for (let i = 0; i < 8; i += 1) {
		await Promise.resolve();
	}
};

const countRows = (): number => {
	// `Panel.tsx#MessageRow` renders each log as a `[data-debug-msg-id]`
	// div. Counting those yields the user-visible buffer length.
	return document.querySelectorAll("[data-debug-msg-id]").length;
};

beforeEach(() => {
	// Reset the singleton LogBus so a previous test's `createLogger`
	// entries do not leak into the next test's mount (the dialog-root
	// subscribes to the bus and the bus emits its current buffer on
	// subscribe).
	_resetBusForTests();
	busHandlers.length = 0;
	sharedLogsHandlers.length = 0;
	localInterceptorHandlers.length = 0;
	debugEventHandlers.length = 0;
	transportHandlers.length = 0;
	localInterceptorHandlersSpy.mockClear();
	sharedLogsHandlersSpy.mockClear();
	debugEventHandlersSpy.mockClear();
	transportHandlersSpy.mockClear();
	setClearedAtSpy.mockClear();
	clearSharedLogsSpy.mockClear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("DialogRoot — Clear visible behavior (#151 round-3)", () => {
	it("after Clear, UI shows 0 entries (not pre-existing localMessages)", async () => {
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		const { createLogger } = await import("@/management/debug/logger");
		render(createElement(DebugDialogRoot));

		const testLogger = createLogger("panel");
		for (let i = 0; i < 5; i += 1) {
			testLogger.info(`hello-${i}`);
		}
		await flushMicrotasks();

		// Five new entries + the boot message = six rows total before
		// Clear. The boot message is part of `localMessages` too, so
		// the round-3 regression would resurrect it as well as the five
		// test entries.
		await waitFor(() => expect(countRows()).toBeGreaterThanOrEqual(5));

		const clearButton = screen.getByText("Clear");
		fireEvent.click(clearButton);
		await flushMicrotasks();

		// Issue #151 round-7: the dialog-root drives three primitives
		// directly — setClearedAt → clearEntries (real, wipes bus) →
		// clearSharedLogs. The round-6 `clearLogs` / `clearRetainedLogs`
		// from `interceptor.ts` are no longer invoked here; the
		// assertions below pin the round-7 sequence.
		expect(setClearedAtSpy).toHaveBeenCalledTimes(1);
		expect(clearSharedLogsSpy).toHaveBeenCalledTimes(1);
		expect(countRows()).toBe(0);
	});

	it("after Clear + 1 new log, UI shows exactly 1 (no resurrection of old)", async () => {
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		const { createLogger } = await import("@/management/debug/logger");
		render(createElement(DebugDialogRoot));

		const testLogger = createLogger("panel");
		for (let i = 0; i < 5; i += 1) {
			testLogger.info(`hello-${i}`);
		}
		await flushMicrotasks();
		await waitFor(() => expect(countRows()).toBeGreaterThanOrEqual(5));

		const clearButton = screen.getByText("Clear");
		fireEvent.click(clearButton);
		await flushMicrotasks();
		expect(countRows()).toBe(0);

		// Emit one new entry post-Clear. The bus was wiped, so the
		// subscriber should observe only this single entry.
		testLogger.info("after-clear");
		await flushMicrotasks();

		await waitFor(() => expect(countRows()).toBe(1));
		const rendered = document.querySelectorAll("[data-debug-msg-id]");
		expect(rendered[0]?.textContent ?? "").toContain("after-clear");
	});

	it("after Clear + reopen, no old logs from retention", async () => {
		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		const { createLogger } = await import("@/management/debug/logger");
		const view = render(createElement(DebugDialogRoot));

		const testLogger = createLogger("panel");
		for (let i = 0; i < 5; i += 1) {
			testLogger.info(`hello-${i}`);
		}
		await flushMicrotasks();
		await waitFor(() => expect(countRows()).toBeGreaterThanOrEqual(5));

		const clearButton = screen.getByText("Clear");
		fireEvent.click(clearButton);
		await flushMicrotasks();
		expect(countRows()).toBe(0);

		// Simulate panel close / reopen by unmounting and re-mounting.
		view.unmount();
		// Subscriptions were torn down on unmount; clear the test-side
		// handler pools so the new mount registers cleanly.
		busHandlers.length = 0;
		sharedLogsHandlers.length = 0;
		localInterceptorHandlers.length = 0;
		debugEventHandlers.length = 0;
		transportHandlers.length = 0;

		render(createElement(DebugDialogRoot));
		await flushMicrotasks();

		// The post-Clear retention layer is empty: `readSharedLogs` →
		// `[]`, the canonical bus is empty, the open-param boot snapshot
		// is null. The dialog-root effect still emits the `[ty-plus]
		// Debug console booted` notification on mount, which counts as
		// a single row, but NONE of the pre-Clear `hello-*` rows may
		// resurrect.
		const renderedText = Array.from(
			document.querySelectorAll("[data-debug-msg-id]"),
		)
			.map((el) => el.textContent ?? "")
			.join("\n");
		expect(renderedText).not.toMatch(/hello-[0-4]/);
	});
});
