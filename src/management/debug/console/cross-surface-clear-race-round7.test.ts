// @vitest-environment happy-dom
//
// Issue #151 round-7 — canonical LogBus consumer clearedAt re-check.
//
// Round-6 added consumer-arrival clearedAt re-checks to the three
// CEP delivery paths inside `dialog-root.tsx` (transport
// replay-response, transport live publish, legacy debug-event
// channel). Round-6 explicitly excluded the canonical `LogBus`
// subscriber path because round-6 believed `clearLogs()` already
// wiped the bus. The user's independent re-review of round-6 found
// that the canonical `LogBus.subscribe()` consumer was the one path
// round-6 MISSED:
//
//   - `LogBus.emit()` calls `sub(this._buffer)` on every emit,
//     passing the entire ring buffer to every subscriber. So when
//     a post-Clear log fires between `clearSharedLogs()` and
//     `setClearedAt()` / `clearEntries()` (in the round-6 ordering),
//     the dialog-root's `subscribeLog` consumer receives the FULL
//     pre-Clear buffer and merges it into `localMessagesRef`
//     without re-reading the tombstone.
//
// Round-7 closes that gap (Fix 1) AND reorders the Clear sequence
// (Fix 2) so the tombstone is established BEFORE the canonical bus
// is wiped. This test pins the race end-to-end on the canonical bus:
//
//   1. Mount dialog-root with the real `LogBus` driving the
//      canonical subscriber.
//   2. Emit a pre-Clear log so the buffer and `localMessagesRef`
//      both hold the pre-Clear row.
//   3. Drive the round-7 Clear sequence by clicking the Clear
//      button — `handleClear` synchronously resets `localMessagesRef`
//      to `[]`, then awaits `setClearedAt(window, ...)`,
//      `clearEntries()` (mocked to be a no-op so the bus RETAINS the
//      pre-Clear entry, simulating the race window), and
//      `clearSharedLogs(window)` (the real function).
//   4. Emit a post-Clear log. `LogBus.emit()` calls
//      `sub(this._buffer)` with `[pre-Clear, post-Clear]`. The
//      dialog-root's `subscribeLog` consumer (round-7 Fix 1) re-reads
//      the tombstone and filters the incoming buffer, dropping the
//      pre-Clear row before merging. `localMessagesRef` ends up with
//      ONLY the post-Clear row, and the DOM reflects that.
//
// We mock `clearEntries` from `@/management/debug/logger` to a no-op
// because in production `clearEntries()` would wipe the buffer
// before the post-Clear emit can run; the test wants the bus to
// RETAIN the pre-Clear entry so the consumer's clearedAt filter
// has something to filter. The real bus is otherwise untouched —
// `createLogger`, `_resetBusForTests`, `subscribeLog`, `emit`, and
// `getEntries` are the genuine implementations. The
// `@/management/debug/console/shared-bridge` module is also NOT
// mocked — `setClearedAt`, `getClearedAt`, `clearSharedLogs`, and
// `__resetClearedAtForTest` all run their real implementations
// against the in-memory CEP shared-storage layer.
//
// File placement: sibling of `cross-surface-clear-race-round6.test.ts`.

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetClearedAtForTest,
	getClearedAt,
} from "@/management/debug/console/shared-bridge";
import {
	_resetBusForTests,
	createLogger,
	getEntries,
} from "@/management/debug/logger";

// ── Mocks ───────────────────────────────────────────────────────────────────
//
// Mock the transport factory so dialog-root's `useEffect` registers its
// subscriber against a no-op handler set. The canonical bus is the only
// delivery path under test — the CEP cross-surface transport is not
// exercised here.
//
// Mock the interceptor module to give the test control over `subscribe`,
// `subscribeDebugLogEvents`, `wirePayloadToLogPayload`,
// `executeCommand`. The Clear-related interceptor exports (`clearLogs`,
// `clearRetainedLogs`) are no longer invoked by the dialog-root after
// round-7's reorder — handleClear now drives `setClearedAt` +
// `clearEntries` + `clearSharedLogs` directly, so the interceptor
// mocks just need to be inert on the Clear paths.
//
// Partial-mock `@/management/debug/logger` so `clearEntries` is a no-op
// (simulating the race window where Clear is in progress but the bus
// wipe hasn't run yet) while `createLogger`, `subscribeLog`, and the
// default bus itself remain real.

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: () => ({
		publish: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
	}),
	readCepOpenParams: () => null,
}));

vi.mock("@/management/debug/console/interceptor", () => ({
	subscribe: () => () => {},
	subscribeDebugLogEvents: () => () => {},
	clearLogs: vi.fn(async () => {}),
	clearRetainedLogs: vi.fn(async (_win: Window) => {}),
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

vi.mock("@/management/debug/logger", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/debug/logger")
	>("@/management/debug/logger");
	return {
		...actual,
		// Issue #151 round-7: clearEntries is the canonical-bus wipe step
		// in the new Clear sequence. To exercise the race window the test
		// overrides it to a no-op so the bus retains the pre-Clear entry
		// when the post-Clear emit fires. The real `LogBus.clear()` and
		// `LogBus.emit()` semantics are otherwise untouched.
		clearEntries: vi.fn(),
	};
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const flushMicrotasks = async (): Promise<void> => {
	for (let i = 0; i < 16; i += 1) {
		await Promise.resolve();
	}
};

const rowText = (id: string): string | null => {
	const el = document.querySelector(`[data-debug-msg-id="${id}"]`);
	return el?.textContent ?? null;
};

const waitForNoRow = async (id: string): Promise<void> => {
	await waitFor(() => {
		expect(rowText(id)).toBeNull();
	});
};

beforeEach(async () => {
	_resetBusForTests();
	// shared-bridge's `setClearedAt` writes through
	// `setCepSharedDataMax`, which lives on the in-memory store
	// exported by `@/management/storage/cep`. We don't reset that
	// store here — the only path that touches it during this test
	// is the round-7 Clear sequence itself (and the assertion below
	// just checks the resulting tombstone). The
	// `__resetClearedAtForTest` helper drops any prior tombstone
	// from a previous test so `getClearedAt(window)` starts at
	// `null` here.
	await __resetClearedAtForTest(window);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("Issue #151 round-7 — canonical LogBus consumer clearedAt re-check (Fix 1)", () => {
	it("late canonical LogBus emit must not resurrect pre-Clear entries on screen", async () => {
		// The race we pin: between `setClearedAt(window)` (boundary
		// advance — round-7 Fix 2 step 1) and the canonical bus wipe
		// (round-7 Fix 2 step 2), a local log fires. The bus subscriber
		// receives the FULL ring buffer (including pre-Clear rows)
		// because the bus has not yet been wiped. Without round-7 Fix 1,
		// the consumer would merge the pre-Clear rows into
		// `localMessagesRef`. With round-7 Fix 1, the consumer re-reads
		// the tombstone AFTER the emit and filters the incoming buffer
		// before merging, so the pre-Clear row never re-enters the
		// panel.

		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));
		await flushMicrotasks();

		// Step 1: emit a pre-Clear log via the real `LogBus`. The bus
		// subscriber pushes `[pre-Clear]` to the dialog-root consumer,
		// which merges into `localMessagesRef`. The DOM shows the row.
		createLogger("boot").info("pre-clear-bus-row");
		await flushMicrotasks();

		// Capture the pre-Clear entry id from the bus buffer so we can
		// assert against the rendered DOM row by `data-debug-msg-id`.
		const entriesAfterPre = getEntries();
		const preClearEntry = entriesAfterPre.find(
			(e) => e.message === "pre-clear-bus-row",
		);
		expect(preClearEntry).toBeDefined();
		const preClearId = preClearEntry?.id ?? "";

		// Sanity: the pre-Clear row is on screen before Clear fires.
		await waitFor(() => {
			expect(rowText(preClearId)).toContain("pre-clear-bus-row");
		});

		// Step 2: drive the round-7 Clear sequence by clicking the
		// header Clear button. `handleClear` runs:
		//   - synchronously: localMessagesRef = []
		//   - awaits setClearedAt(window, Date.now()) — REAL function
		//     writes the new tombstone to in-memory shared storage
		//   - clearEntries() — mocked to a no-op so the bus RETAINS
		//     the pre-Clear entry, simulating the race window
		//   - awaits clearSharedLogs(window) — REAL function wipes
		//     the LOG_SHARED_KEY (logs) but leaves CLEARED_AT_KEY
		//     (the tombstone) intact, per the round-4 / round-5
		//     semantics
		//
		// After handleClear completes:
		//   - localMessagesRef = []
		//   - bus still holds [pre-Clear] (clearEntries is mocked)
		//   - clearedAt = T_clear (round-7 boundary advance survives
		//     clearSharedLogs because the tombstone lives on a
		//     separate shared-storage key)
		const clearButton = screen.getByText("Clear");
		fireEvent.click(clearButton);

		// handleClear is `async`; flush microtasks so setClearedAt and
		// clearSharedLogs resolve (clearEntries is sync, mocked no-op).
		await flushMicrotasks();
		await flushMicrotasks();
		await flushMicrotasks();
		await flushMicrotasks();

		// Sanity: tombstone is set, pre-Clear row is gone from the DOM
		// (synchronous reset by handleClear cleared localMessagesRef).
		expect(await getClearedAt(window)).not.toBeNull();
		await waitForNoRow(preClearId);

		// Step 3: emit a post-Clear log via the real `LogBus`. The bus
		// pushes the new entry to its ring buffer (now [pre-Clear,
		// post-Clear]) and calls `sub(this._buffer)` — the consumer
		// receives BOTH entries. The round-7 consumer (Fix 1) re-reads
		// the clearedAt tombstone and filters the incoming buffer to
		// drop the pre-Clear row. merged = [post-Clear].
		createLogger("boot").info("post-clear-bus-row");
		await flushMicrotasks();

		// Capture the post-Clear entry id from the bus buffer.
		const entriesAfterPost = getEntries();
		const postClearEntry = entriesAfterPost.find(
			(e) => e.message === "post-clear-bus-row",
		);
		expect(postClearEntry).toBeDefined();
		const postClearId = postClearEntry?.id ?? "";

		// Final assertion: the pre-Clear row is NOT in the rendered DOM
		// (the consumer filter stripped it before merging) and the
		// post-Clear row IS in the rendered DOM.
		await waitForNoRow(preClearId);
		await waitFor(() => {
			expect(rowText(postClearId)).toContain("post-clear-bus-row");
		});
	});
});
