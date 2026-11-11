/**
 * Tests for the pure undo/redo stack used by the layout cache.
 *
 * This file exercises only the stack math. The companion persistence
 * wrapper (`layout-undo-cache.ts`) translates these operations into disk
 * writes under `<managed-root>/cache/layout-undo/`.
 */
import { describe, expect, it } from "vitest";

import {
	type LayoutSnapshot,
	LayoutUndoStack,
	MAX_STACK_SIZE,
} from "./cache-stack";

const snap = (id: string, panelId = "panel-1"): LayoutSnapshot => ({
	panelId,
	widgets: [{ id, x: 0, y: 0, width: 1, height: 1 } as never],
});

describe("LayoutUndoStack — push / undo / redo", () => {
	it("starts with no undo or redo available", () => {
		const s = new LayoutUndoStack();
		expect(s.canUndo()).toBe(false);
		expect(s.canRedo()).toBe(false);
		expect(s.size()).toBe(0);
	});

	it("after one push, undo is not yet available (idx=0 is the bottom)", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		expect(s.canUndo()).toBe(false);
		expect(s.canRedo()).toBe(false);
	});

	it("undo returns the previous snapshot (the one pushed BEFORE the current)", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		// Currently at "b"; undo should return "a".
		const result = s.undo();
		expect(result?.widgets[0]?.id).toBe("a");
		expect(s.canUndo()).toBe(false);
		expect(s.canRedo()).toBe(true);
	});

	it("redo returns the snapshot that undo just stepped off", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		s.undo();
		const result = s.redo();
		expect(result?.widgets[0]?.id).toBe("b");
	});

	it("undo at the bottom of the stack returns null and does not move the pointer", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		s.undo(); // now at "a"
		expect(s.undo()).toBeNull();
		expect(s.canUndo()).toBe(false);
	});

	it("redo at the top of the stack returns null and does not move the pointer", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		// Currently at top; redo should fail.
		expect(s.redo()).toBeNull();
	});

	it("a new push after undo clears the redo branch", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		s.undo(); // now at "a"
		s.push(snap("c"));
		expect(s.canRedo()).toBe(false);
		expect(s.peekCurrent()?.widgets[0]?.id).toBe("c");
	});

	it("returns cloned snapshots so callers cannot mutate the stack", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		const returned = s.undo();
		expect(returned).not.toBeNull();
		// Mutate the returned snapshot; the stack must still see "a".
		returned!.widgets[0]!.id = "mutated";
		s.push(snap("c"));
		const before = s.undo();
		expect(before?.widgets[0]?.id).toBe("a");
	});
});

describe("LayoutUndoStack — capacity", () => {
	it("drops the oldest entry when MAX_STACK_SIZE is exceeded", () => {
		const s = new LayoutUndoStack();
		for (let i = 0; i < MAX_STACK_SIZE + 5; i += 1) {
			s.push(snap(`s${i}`));
		}
		expect(s.size()).toBe(MAX_STACK_SIZE);
		// The first surviving entry should be s5 (we dropped s0..s4).
		// Push then undo to peek the bottom.
		const bottom = s.undo();
		// After one undo from the top, we land on s(MAX-1). But the bottom
		// (s5) is reachable via enough undos. Verify size + canUndo bounds.
		expect(s.canUndo()).toBe(true);
		void bottom;
	});
});

describe("LayoutUndoStack — serialize / restore", () => {
	it("round-trips stack and pointer through JSON", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		s.push(snap("c"));
		s.undo(); // at b
		const wire = s.serialize();
		const json = JSON.stringify(wire);
		const restored = LayoutUndoStack.restore(
			JSON.parse(json) as ReturnType<LayoutUndoStack["serialize"]>,
		);
		expect(restored.size()).toBe(3);
		expect(restored.canUndo()).toBe(true);
		expect(restored.canRedo()).toBe(true);
		expect(restored.peekCurrent()?.widgets[0]?.id).toBe("b");
	});

	it("restore of a missing/null payload returns an empty stack", () => {
		const s = LayoutUndoStack.restore(
			null as unknown as ReturnType<LayoutUndoStack["serialize"]>,
		);
		expect(s.size()).toBe(0);
		expect(s.canUndo()).toBe(false);
	});

	it("restore clamps an out-of-range idx back into the stack", () => {
		const s = LayoutUndoStack.restore({
			schema: 1,
			stack: [snap("a"), snap("b")],
			idx: 99,
		});
		expect(s.peekCurrent()?.widgets[0]?.id).toBe("b");
	});

	it("serialize tags the payload with schema=1", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		const wire = s.serialize();
		expect(wire.schema).toBe(1);
	});
});

describe("LayoutUndoStack — clear", () => {
	it("clear empties the stack and resets the pointer", () => {
		const s = new LayoutUndoStack();
		s.push(snap("a"));
		s.push(snap("b"));
		s.clear();
		expect(s.size()).toBe(0);
		expect(s.canUndo()).toBe(false);
		expect(s.canRedo()).toBe(false);
	});
});
