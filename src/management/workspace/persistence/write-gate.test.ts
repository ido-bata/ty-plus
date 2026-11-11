/**
 * The write gate `persistSurfaceState` reads (Issue #204).
 *
 * The gate is what makes "the layout could not be read" mean "nothing is
 * written" rather than "an empty layout is written". These tests pin which
 * restore outcomes open it, which close it, and that it starts closed —
 * `isReady()` is the value the hook's first statement checks, so the
 * behavioural half of that contract lives here and the wiring half in
 * `hook-restore-wiring.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
	planLayoutRestoreFromReadError,
	planLayoutRestoreFromText,
} from "@/management/workspace/layout/restore-plan";
import { createWorkspaceWriteGate } from "@/management/workspace/persistence/write-gate";

const CORRUPT = '{"gridCells": [{"id": "widget-a", "x": 0';
const EMPTY_DOC = '{"gridCells": []}';
const LOADED_DOC =
	'{"gridCells": [{"id": "widget-a", "x": 0, "y": 0, "width": 2, "height": 2}]}';

describe("createWorkspaceWriteGate", () => {
	it("starts closed — persistence is not ready before the first restore", () => {
		expect(createWorkspaceWriteGate().isReady()).toBe(false);
	});

	it("opens for a layout that is absent, empty, or loaded", () => {
		for (const raw of [null, EMPTY_DOC, LOADED_DOC]) {
			const gate = createWorkspaceWriteGate();
			expect(gate.adoptRestore(planLayoutRestoreFromText(raw))).toBe(true);
			expect(gate.isReady()).toBe(true);
		}
	});

	it("stays closed for a corrupt layout and for a failed read", () => {
		for (const plan of [
			planLayoutRestoreFromText(CORRUPT),
			planLayoutRestoreFromReadError(new Error("EACCES: permission denied")),
		]) {
			const gate = createWorkspaceWriteGate();
			expect(gate.adoptRestore(plan)).toBe(false);
			expect(gate.isReady()).toBe(false);
		}
	});

	it("closes again when a later restore finds the file unreadable", () => {
		const gate = createWorkspaceWriteGate();
		gate.adoptRestore(planLayoutRestoreFromText(LOADED_DOC));
		expect(gate.isReady()).toBe(true);
		gate.adoptRestore(planLayoutRestoreFromText(CORRUPT));
		expect(gate.isReady()).toBe(false);
		gate.adoptRestore(planLayoutRestoreFromReadError(new Error("boom")));
		expect(gate.isReady()).toBe(false);
		gate.adoptRestore(planLayoutRestoreFromText(null));
		expect(gate.isReady()).toBe(true);
	});
});
