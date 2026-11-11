// @vitest-environment happy-dom
//
// Issue #151 round-8 — legacy `subscribe()` consumer clearedAt re-check.
//
// Round-7 closed the canonical `LogBus.subscribe()` path inside
// `dialog-root.tsx` by re-reading the clearedAt tombstone as the
// last async step before merging. Round-7's test mocks
// `@/management/debug/console/interceptor` so the canonical
// subscriber is the only delivery path exercised.
//
// The user's independent re-review of round-7 found a FIFTH
// delivery path round-6 + round-7 missed: the legacy
// `interceptor.subscribe()` callback. The interceptor module
// subscribes to canonical `subscribeLog()` and mirrors the entire
// bus ring buffer into its `_messages` array on every emit, then
// calls `notify()` to deliver `[..._messages]` to every
// `subscribe()` consumer. The dialog-root's `unsubLocal`
// consumer used to merge that snapshot without consulting the
// tombstone, so a log that fires between `setClearedAt()` and
// `clearEntries()` lands in `_messages` alongside the pre-Clear
// rows and the legacy consumer receives `[pre-Clear, post-Clear]`
// in one shot — which resurrects wiped rows.
//
// Round-8 adds the same async-closure consumer-arrival clearedAt
// re-check to `unsubLocal` (Fix 1) and pins the race end-to-end
// with the REAL interceptor bridge — no mock of
// `@/management/debug/console/interceptor` (Fix 2).
//
// Mock strategy:
//
//   | Mock target                                       | Why
//   |----------------------------------------------------|------
//   | `@/management/ae/cep/transport`                   | Test only cares about the legacy
//   |                                                    | `subscribe()` path; the transport
//   |                                                    | wiring is irrelevant. Stub as in
//   |                                                    | round-7.
//   | `@/management/debug/logger` (`clearEntries` only) | Mock `clearEntries` to no-op so the
//   |                                                    | race window is controllable. The
//   |                                                    | real `createLogger`, `_resetBusForTests`,
//   |                                                    | `subscribeLog`, `getEntries`, the
//   |                                                    | default bus, and the bridge are
//   |                                                    | otherwise untouched.
//   | `@/management/debug/console/interceptor`          | NOT MOCKED. The real `subscribe()`
//   |                                                    | and the real bridge reflect the bus
//   |                                                    | into `_messages` + `notify()`. The
//   |                                                    | test exercises the production path.
//
// Test scenario (the fifth path):
//
//   1. Enable the interceptor (the real `enableInterceptor()` wires
//      the bus → `_messages` bridge). Without this, `_messages`
//      stays `[]` and `notify()` is never called.
//   2. Mount `<DebugDialogRoot />` — its effect registers
//      `subscribe()` against the interceptor, and the bridge fires
//      the listener with the current buffer (`[]`).
//   3. Reset state: `await __resetClearedAtForTest(window)`,
//      `await resetCepSharedDataForTest(window)`, `_resetBusForTests()`.
//   4. `createLogger('boot').info('pre-clear-bus-row')` — bus pushes
//      `[pre-Clear]`, bridge sets `_messages = [pre-Clear]`,
//      `notify()` calls `subscribe()` consumer, which fires the
//      round-8 async closure: `clearedAt` is null → all rows pass
//      through → DOM shows pre-Clear row.
//   5. Click the header `Clear` button. `handleClear` runs the
//      round-7 sequence:
//        - sync: `localMessagesRef = []` → DOM empties
//        - awaits REAL `setClearedAt(window, Date.now())` →
//          tombstone in shared storage
//        - calls MOCKED `clearEntries()` no-op → bus RETAINS the
//          pre-Clear row
//        - awaits REAL `clearSharedLogs(window)` → wipes
//          LOG_SHARED_KEY but tombstone intact
//   6. `createLogger('boot').info('post-clear-bus-row')` — bus
//      pushes `[pre-Clear, post-Clear]`, bridge sets
//      `_messages = [pre-Clear, post-Clear]`, `notify()` calls
//      `subscribe()` consumer, which fires the round-8 async
//      closure: re-reads the new tombstone, filters out
//      pre-Clear, merges ONLY post-Clear.
//   7. Assert: pre-Clear row absent, post-Clear row present.
//
// File placement: sibling of `cross-surface-clear-race-round7.test.ts`.

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableInterceptor } from "@/management/debug/console/interceptor";
import { __resetClearedAtForTest } from "@/management/debug/console/shared-bridge";
import {
	_resetBusForTests,
	createLogger,
	getEntries,
} from "@/management/debug/logger";
import { resetCepSharedDataForTest } from "@/management/storage/cep";

// ── Mocks ───────────────────────────────────────────────────────────────────
//
// Mock the transport factory so dialog-root's `useEffect` registers its
// subscriber against a no-op handler set. The legacy `subscribe()` is the
// only delivery path under test.
//
// Partial-mock `@/management/debug/logger` so `clearEntries` is a no-op
// (simulating the race window where Clear is in progress but the bus
// wipe hasn't run yet) while `createLogger`, `subscribeLog`, and the
// default bus itself remain real.
//
// DO NOT mock `@/management/debug/console/interceptor` — the real
// `subscribe()`, `notify()`, and the bus → `_messages` bridge must run
// here. That is the whole point of round-8.

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: () => ({
		publish: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
	}),
	readCepOpenParams: () => null,
}));

vi.mock("@/management/debug/logger", async () => {
	const actual = await vi.importActual<
		typeof import("@/management/debug/logger")
	>("@/management/debug/logger");
	return {
		...actual,
		// Issue #151 round-8: clearEntries is the canonical-bus wipe
		// step in the round-7 Clear sequence. To exercise the race
		// window the test overrides it to a no-op so the bus
		// retains the pre-Clear entry when the post-Clear emit
		// fires. The real `LogBus.clear()` and `LogBus.emit()`
		// semantics are otherwise untouched, and the interceptor
		// bridge sees the full ring buffer on every emit.
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
	resetCepSharedDataForTest();
	await __resetClearedAtForTest(window);
	// Issue #151 round-8: enable the real interceptor so the
	// canonical-bus → `_messages` bridge is wired. Without this,
	// `_messages` stays `[]` and `notify()` is never called,
	// meaning the legacy `subscribe()` consumer would never
	// receive the bus snapshot. `enableInterceptor()` is idempotent
	// — the second call after the first is a no-op — so this is
	// safe across tests.
	enableInterceptor();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("Issue #151 round-8 — legacy `subscribe()` consumer clearedAt re-check (Fix 1)", () => {
	it("late canonical LogBus emit must not resurrect pre-Clear entries on the legacy subscribe() path", async () => {
		// The race we pin: the interceptor's `subscribeLog` callback
		// (lines ~440-466 of `interceptor.ts`) rebuilds the legacy
		// `_messages` array on every emit and calls `notify()`,
		// delivering the FULL ring buffer to every `subscribe()`
		// subscriber. Between `setClearedAt(window)` (boundary
		// advance — round-7 step 1) and `clearEntries()` (round-7
		// step 2), a local log fires. The bus subscriber does NOT
		// merge until the consumer's async closure re-reads the
		// tombstone — but the legacy `subscribe()` consumer MUST
		// also re-read the tombstone, otherwise pre-Clear rows merge
		// into `localMessagesRef` along with the post-Clear row.
		// Round-8 (Fix 1) closes that gap.

		const { DebugDialogRoot } = await import(
			"@/management/debug/console/ui/dialog-root"
		);
		render(createElement(DebugDialogRoot));
		await flushMicrotasks();

		// Step 1: emit a pre-Clear log via the real `LogBus`. The
		// bus pushes `[pre-Clear]` to the interceptor bridge, which
		// mirrors it into `_messages` and calls `notify()`. The
		// dialog-root's `subscribe()` consumer fires the round-8
		// async closure: `clearedAt` is null → all rows pass
		// through → DOM shows the pre-Clear row.
		createLogger("boot").info("pre-clear-bus-row");
		await flushMicrotasks();

		// Capture the pre-Clear entry id from the bus buffer so we
		// can assert against the rendered DOM row by
		// `data-debug-msg-id`.
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
		//   - awaits setClearedAt(window, Date.now()) — REAL
		//     function writes the new tombstone to in-memory shared
		//     storage
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

		// handleClear is `async`; flush microtasks so setClearedAt
		// and clearSharedLogs resolve (clearEntries is sync, mocked
		// no-op).
		await flushMicrotasks();
		await flushMicrotasks();
		await flushMicrotasks();
		await flushMicrotasks();

		// Sanity: pre-Clear row is gone from the DOM (synchronous
		// reset by handleClear cleared localMessagesRef).
		await waitForNoRow(preClearId);

		// Step 3: emit a post-Clear log via the real `LogBus`. The
		// bus pushes the new entry to its ring buffer (now
		// `[pre-Clear, post-Clear]`) and calls `sub(this._buffer)`.
		// The interceptor bridge (lines ~440-466) receives the
		// full buffer, sets `_messages = [pre-Clear, post-Clear]`,
		// and calls `notify()`. The dialog-root's `subscribe()`
		// consumer fires the round-8 async closure: re-reads the
		// clearedAt tombstone, filters the incoming buffer, drops
		// the pre-Clear row, merges ONLY the post-Clear row.
		createLogger("boot").info("post-clear-bus-row");
		await flushMicrotasks();

		// Capture the post-Clear entry id from the bus buffer.
		const entriesAfterPost = getEntries();
		const postClearEntry = entriesAfterPost.find(
			(e) => e.message === "post-clear-bus-row",
		);
		expect(postClearEntry).toBeDefined();
		const postClearId = postClearEntry?.id ?? "";

		// Final assertion: the pre-Clear row is NOT in the rendered
		// DOM (the round-8 consumer filter stripped it before
		// merging) and the post-Clear row IS in the rendered DOM.
		await waitForNoRow(preClearId);
		await waitFor(() => {
			expect(rowText(postClearId)).toContain("post-clear-bus-row");
		});
	});
});
