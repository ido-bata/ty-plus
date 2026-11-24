/**
 * Tests for tutorial/state-store.ts (Issue #158).
 *
 * Covers the acceptance criteria:
 * - seen/dismiss state survives a "restart" (fresh load from the same file)
 * - a contentVersion bump re-presents guidance (old flags do not leak)
 * - reset clears the whole file
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
	dismissTutorialHint,
	isTutorialHintDismissed,
	isTutorialSeen,
	loadTutorialState,
	markTutorialSeen,
	parseTutorialState,
	resetTutorialState,
} from "./state-store";

type ReadJson = (
	win: Window,
	key: string,
	...args: unknown[]
) => Promise<Record<string, unknown> | null>;
type WriteJson = (
	win: Window,
	key: string,
	payload: unknown,
	...args: unknown[]
) => Promise<void>;
type RemoveJson = (
	win: Window,
	key: string,
	...args: unknown[]
) => Promise<void>;

let store: Record<string, unknown> | null;
let mockReadJson: Mock<ReadJson>;
let mockWriteJson: Mock<WriteJson>;
let mockRemoveJson: Mock<RemoveJson>;

vi.mock("@/management/storage/persistence", () => ({
	get readJson() {
		return mockReadJson;
	},
	get writeJson() {
		return mockWriteJson;
	},
	get removeJson() {
		return mockRemoveJson;
	},
}));

vi.mock("@/management/storage/lock/persistence-lock", () => ({
	withManagedRootPersistenceLock: async (
		_win: Window,
		fn: () => Promise<unknown>,
	) => fn(),
}));

beforeEach(() => {
	store = null;
	mockReadJson = vi.fn<ReadJson>(async () => store);
	mockWriteJson = vi.fn<WriteJson>(async (_w, _k, payload) => {
		store = payload as Record<string, unknown>;
	});
	mockRemoveJson = vi.fn<RemoveJson>(async () => {
		store = null;
	});
});

const fakeWindow = {} as Window;

describe("tutorial state-store", () => {
	it("markTutorialSeen persists and isTutorialSeen reads it back", async () => {
		await markTutorialSeen(fakeWindow, "easing", "1");
		expect(await isTutorialSeen(fakeWindow, "easing", "1")).toBe(true);
		expect(await isTutorialSeen(fakeWindow, "easing", "2")).toBe(false);
		expect(await isTutorialSeen(fakeWindow, "menu", "1")).toBe(false);
	});

	it("dismissTutorialHint persists independently of seen", async () => {
		await dismissTutorialHint(fakeWindow, "menu", "1");
		expect(await isTutorialHintDismissed(fakeWindow, "menu", "1")).toBe(true);
		expect(await isTutorialSeen(fakeWindow, "menu", "1")).toBe(false);
	});

	it("contentVersion bump re-presents guidance (flags do not leak)", async () => {
		await markTutorialSeen(fakeWindow, "easing", "1");
		await dismissTutorialHint(fakeWindow, "easing", "1");
		expect(await isTutorialSeen(fakeWindow, "easing", "1")).toBe(true);
		expect(await isTutorialHintDismissed(fakeWindow, "easing", "1")).toBe(true);

		// Same type, new content version: treated as never seen/dismissed.
		expect(await isTutorialSeen(fakeWindow, "easing", "2")).toBe(false);
		expect(await isTutorialHintDismissed(fakeWindow, "easing", "2")).toBe(
			false,
		);

		// Marking the new version does not resurrect v1 flags either.
		await markTutorialSeen(fakeWindow, "easing", "2");
		const state = await loadTutorialState(fakeWindow);
		expect(state.entries.easing?.contentVersion).toBe("2");
		expect(await isTutorialHintDismissed(fakeWindow, "easing", "2")).toBe(
			false,
		);
	});

	it("resetTutorialState removes the persisted file", async () => {
		await markTutorialSeen(fakeWindow, "align", "1");
		expect(mockRemoveJson).not.toHaveBeenCalled();
		await resetTutorialState(fakeWindow);
		expect(mockRemoveJson).toHaveBeenCalledWith(fakeWindow, "tutorialState");
		expect(await isTutorialSeen(fakeWindow, "align", "1")).toBe(false);
	});

	it("parseTutorialState drops malformed entries and wrong versions", () => {
		expect(parseTutorialState(null).entries).toEqual({});
		expect(parseTutorialState({ version: 99, entries: {} }).entries).toEqual(
			{},
		);
		const parsed = parseTutorialState({
			version: 1,
			entries: {
				good: { contentVersion: "1", seenAt: "2026-01-01T00:00:00Z" },
				bad: { nope: true },
				alsoBad: "string",
			},
		});
		expect(Object.keys(parsed.entries)).toEqual(["good"]);
		expect(parsed.entries.good?.seenAt).toBe("2026-01-01T00:00:00Z");
	});
});
