// @vitest-environment happy-dom

/**
 * Issue #138 — the Debug Console must not re-read shared storage on a
 * timer.
 *
 * `dialog-root.test.ts` guards this at the timer level (`setInterval` is
 * never registered). This file guards the stronger, behaviour-level form
 * the acceptance criterion actually asks for: advance fake timers far
 * past the old 500 ms polling interval and assert that the *storage read
 * count* does not move. A future refactor that swaps the interval for a
 * `setTimeout` chain, a visibility-change trigger, or any other hidden
 * catch-up loop fails here even if it never reaches for `setInterval`.
 *
 * Real modules under test: the interceptor, `shared-bridge`, the canonical
 * LogBus, `dialog-root`. Only the CEP surface transport (irrelevant
 * plumbing) and CEP shared storage (the thing being counted) are mocked.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the `vi.mock` factory closes over initialized state (it is
// lifted above the module body), and because `.tsx` cannot parse a
// generic arrow function (`async <T>(...)`) — the mock types stay loose
// here; the real module's types are what production is checked against.
const { storageReads, sharedStorage } = vi.hoisted(() => ({
	storageReads: [] as string[],
	sharedStorage: new Map<string, unknown>(),
}));

vi.mock("@/management/ae/cep/transport", () => ({
	createCepSurfaceTransport: () => ({
		publish: vi.fn(async () => undefined),
		subscribe: vi.fn(() => () => {}),
	}),
	readCepOpenParams: () => null,
}));

vi.mock("@/management/storage/cep", () => ({
	// The real helpers take `(win, key[, value])`; only the read path is
	// counted, which is the "periodic storage read" the issue forbids.
	getCepSharedData: async (_win: Window, key: string): Promise<unknown> => {
		storageReads.push(key);
		return sharedStorage.get(key) ?? null;
	},
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

const { DebugDialogRoot } = await import("./dialog-root");

const flush = async (ticks = 20): Promise<void> => {
	for (let i = 0; i < ticks; i += 1) {
		await Promise.resolve();
	}
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
	storageReads.length = 0;
	sharedStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("Debug Console mount performs no periodic storage read (Issue #138)", () => {
	it("does not move the storage read count while fake timers advance", async () => {
		render(<DebugDialogRoot surfaceId="debug-console" />);
		await flush();

		const readsAfterMount = storageReads.length;
		// The mount reads the tombstone and the retained snapshot exactly
		// once — that is the replay half, and it is event-driven.
		expect(readsAfterMount).toBeGreaterThan(0);

		// 120 s is 240x the old 500 ms polling interval.
		await vi.advanceTimersByTimeAsync(120_000);
		await flush();

		expect(
			storageReads.length,
			"no timer-driven shared-storage read may run after mount",
		).toBe(readsAfterMount);
	});

	it("registers no interval while the console is open", async () => {
		const intervalSpy = vi
			.spyOn(globalThis, "setInterval")
			.mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>);

		render(<DebugDialogRoot surfaceId="debug-console" />);
		await flush();
		await vi.advanceTimersByTimeAsync(60_000);
		await flush();

		expect(intervalSpy).not.toHaveBeenCalled();
		intervalSpy.mockRestore();
	});
});
