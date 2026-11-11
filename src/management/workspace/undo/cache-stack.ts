/**
 * Pure undo/redo stack for the layout cache.
 *
 * Extracted from `history.ts` so the stack math is unit-testable in
 * isolation. The companion persistence wrapper
 * (`layout-undo-cache.ts`) translates push/undo/redo into disk writes
 * under `<managed-root>/cache/layout-undo/`.
 *
 * The stack is bounded to `MAX_STACK_SIZE` entries; older snapshots are
 * dropped when the limit is exceeded.
 *
 * `serialize` / `restore` round-trip the stack through a plain JSON shape
 * so it can be persisted across workspace reloads within a single AE
 * session. The cache is reset on session start (see `initLayoutUndoCache`).
 */

import type { Layout } from "@/management/workspace/layout/grid-document";

export type LayoutSnapshot = {
	panelId: string;
	widgets: Layout[];
};

export type SerializedStack = {
	schema: 1;
	stack: LayoutSnapshot[];
	idx: number;
};

export const MAX_STACK_SIZE = 30;

export class LayoutUndoStack {
	private stack: LayoutSnapshot[] = [];
	private idx = -1;

	push(snapshot: LayoutSnapshot): void {
		// Drop redo branch.
		this.stack.splice(this.idx + 1);
		this.stack.push(cloneSnapshot(snapshot));
		this.idx = this.stack.length - 1;
		if (this.stack.length > MAX_STACK_SIZE) {
			const overflow = this.stack.length - MAX_STACK_SIZE;
			this.stack.splice(0, overflow);
			this.idx -= overflow;
			if (this.idx < -1) this.idx = -1;
		}
	}

	undo(): LayoutSnapshot | null {
		if (this.idx <= 0) return null;
		this.idx -= 1;
		const snap = this.stack[this.idx];
		return snap ? cloneSnapshot(snap) : null;
	}

	redo(): LayoutSnapshot | null {
		if (this.idx >= this.stack.length - 1) return null;
		this.idx += 1;
		const snap = this.stack[this.idx];
		return snap ? cloneSnapshot(snap) : null;
	}

	canUndo(): boolean {
		return this.idx > 0;
	}

	canRedo(): boolean {
		return this.idx < this.stack.length - 1;
	}

	peekCurrent(): LayoutSnapshot | null {
		if (this.idx < 0 || this.idx >= this.stack.length) return null;
		const snap = this.stack[this.idx];
		return snap ? cloneSnapshot(snap) : null;
	}

	clear(): void {
		this.stack = [];
		this.idx = -1;
	}

	size(): number {
		return this.stack.length;
	}

	serialize(): SerializedStack {
		return {
			schema: 1,
			stack: this.stack.map(cloneSnapshot),
			idx: this.idx,
		};
	}

	static restore(data: SerializedStack): LayoutUndoStack {
		const s = new LayoutUndoStack();
		if (!data || !Array.isArray(data.stack)) {
			return s;
		}
		s.stack = data.stack.map(cloneSnapshot);
		const maxIdx = s.stack.length - 1;
		const requested = Number.isFinite(data.idx) ? data.idx : -1;
		s.idx = Math.max(-1, Math.min(maxIdx, requested));
		return s;
	}
}

const cloneSnapshot = (snap: LayoutSnapshot): LayoutSnapshot => ({
	panelId: snap.panelId,
	widgets: snap.widgets.map((w) => ({ ...w })),
});
