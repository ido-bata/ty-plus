/**
 * Classification of the boot layout read (Issue #204).
 *
 * The acceptance criteria demand that 未作成 (no file), 正常な空 (legitimately
 * empty), 破損 (corrupt) and 読み込み失敗 (read failure) stay distinguishable —
 * because only the first two may ever become an empty `gridCells` that a later
 * write is allowed to replace.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetBusForTests, getEntries } from "@/management/debug/logger";
import type { PersistedLayoutDocument } from "@/management/workspace/layout/grid-document";
import {
	isLayoutRestoreBlocked,
	type LayoutRestorePlan,
	layoutRestoreNoticeFromPlan,
	logLayoutRestoreBlocked,
	planLayoutRestoreFromReadError,
	planLayoutRestoreFromText,
} from "@/management/workspace/layout/restore-plan";

const DETAIL = { panelId: "panel-1", wsIndex: 1 };

const TRUNCATED_JSON = '{"gridCells": [{"id": "widget-a", "x": 0';
const NON_LAYOUT_JSON = '{"version": 3, "panels": []}';
const EMPTY_DOC = '{"gridCells": []}';
const EMPTY_LEGACY_ARRAY = "[]";
const LOADED_DOC =
	'{"gridCells": [{"id": "widget-a", "x": 0, "y": 0, "width": 2, "height": 2}]}';

beforeEach(() => {
	_resetBusForTests();
});

afterEach(() => {
	_resetBusForTests();
});

describe("planLayoutRestoreFromText", () => {
	/** Narrow a safe plan, failing loudly if the fixture came back blocked. */
	const safeDocument = (plan: LayoutRestorePlan): PersistedLayoutDocument => {
		if (!("document" in plan)) {
			throw new Error(`expected a safe plan, got ${plan.status}`);
		}
		return plan.document;
	};

	it("classifies an absent or blank body as not-created", () => {
		for (const raw of [null, undefined, "", "   ", "\n\t"]) {
			const plan = planLayoutRestoreFromText(raw);
			expect(plan.status).toBe("not-created");
			expect(safeDocument(plan)).toEqual({ gridCells: [] });
			expect(isLayoutRestoreBlocked(plan)).toBe(false);
		}
	});

	it("classifies a readable layout with no cells as empty", () => {
		for (const raw of [EMPTY_DOC, EMPTY_LEGACY_ARRAY]) {
			const plan = planLayoutRestoreFromText(raw);
			expect(plan.status).toBe("empty");
			expect(safeDocument(plan).gridCells).toEqual([]);
			expect(isLayoutRestoreBlocked(plan)).toBe(false);
		}
	});

	it("classifies a readable layout with cells as loaded", () => {
		const plan = planLayoutRestoreFromText(LOADED_DOC);
		expect(plan.status).toBe("loaded");
		expect(safeDocument(plan).gridCells).toHaveLength(1);
		expect(safeDocument(plan).gridCells[0]?.id).toBe("widget-a");
		expect(isLayoutRestoreBlocked(plan)).toBe(false);
	});

	it("classifies truncated JSON as corrupt instead of returning an empty grid", () => {
		const plan = planLayoutRestoreFromText(TRUNCATED_JSON);
		expect(plan.status).toBe("corrupt");
		expect(isLayoutRestoreBlocked(plan)).toBe(true);
		if (plan.status !== "corrupt") throw new Error("unreachable");
		expect(plan.reason).toBe("json-parse-failed");
		expect(plan.message.length).toBeGreaterThan(0);
		// The whole point: no document, so a caller cannot keep going with [].
		expect("document" in plan).toBe(false);
	});

	it("classifies valid JSON of a foreign shape as corrupt instead of empty", () => {
		const plan = planLayoutRestoreFromText(NON_LAYOUT_JSON);
		expect(plan.status).toBe("corrupt");
		expect(isLayoutRestoreBlocked(plan)).toBe(true);
		if (plan.status !== "corrupt") throw new Error("unreachable");
		expect(plan.reason).toBe("unrecognized-shape");
	});
});

describe("planLayoutRestoreFromReadError", () => {
	it("classifies a storage rejection as read-failure and keeps the message", () => {
		const plan = planLayoutRestoreFromReadError(
			new Error("EISDIR: illegal operation on a directory, read"),
		);
		expect(plan.status).toBe("read-failure");
		expect(isLayoutRestoreBlocked(plan)).toBe(true);
		if (plan.status !== "read-failure") throw new Error("unreachable");
		expect(plan.reason).toBe("read-error");
		expect(plan.message).toContain("EISDIR");
	});

	it("stringifies a non-Error rejection instead of dropping it", () => {
		const plan = planLayoutRestoreFromReadError("gateway went away");
		expect(plan.status).toBe("read-failure");
		if (plan.status !== "read-failure") throw new Error("unreachable");
		expect(plan.message).toBe("gateway went away");
	});
});

describe("layoutRestoreNoticeFromPlan", () => {
	it("builds a notice carrying the classification for a blocked plan", () => {
		const notice = layoutRestoreNoticeFromPlan(
			planLayoutRestoreFromText(TRUNCATED_JSON),
			DETAIL,
		);
		expect(notice).not.toBeNull();
		expect(notice?.status).toBe("corrupt");
		expect(notice?.reason).toBe("json-parse-failed");
		expect(notice?.message.length).toBeGreaterThan(0);
		expect(notice?.panelId).toBe("panel-1");
		expect(notice?.wsIndex).toBe(1);
	});

	it("returns null for every plan the panel may keep going with", () => {
		for (const raw of [null, EMPTY_DOC, LOADED_DOC]) {
			expect(
				layoutRestoreNoticeFromPlan(planLayoutRestoreFromText(raw), DETAIL),
			).toBeNull();
		}
	});
});

describe("logLayoutRestoreBlocked", () => {
	it("records a classified error for a corrupt layout", () => {
		logLayoutRestoreBlocked(planLayoutRestoreFromText(TRUNCATED_JSON), DETAIL);
		const entries = getEntries();
		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry?.level).toBe("error");
		expect(entry?.source).toBe("workspace");
		expect(entry?.action).toBe("reloadLayoutFromStorage:restore-blocked");
		expect(entry?.context?.reason).toBe("json-parse-failed");
		expect(entry?.context?.status).toBe("corrupt");
		expect(entry?.context?.wsIndex).toBe(1);
		expect(String(entry?.context?.consequence)).toMatch(/not overwritten/);
	});

	it("records a classified error for a failed read", () => {
		logLayoutRestoreBlocked(
			planLayoutRestoreFromReadError(new Error("EACCES: permission denied")),
			DETAIL,
		);
		const entries = getEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.context?.reason).toBe("read-error");
		expect(String(entries[0]?.context?.message)).toContain("EACCES");
	});

	it("stays silent for a restore that may proceed", () => {
		logLayoutRestoreBlocked(planLayoutRestoreFromText(LOADED_DOC), DETAIL);
		logLayoutRestoreBlocked(planLayoutRestoreFromText(null), DETAIL);
		expect(getEntries()).toHaveLength(0);
	});
});
