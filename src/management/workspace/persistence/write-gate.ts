/**
 * The switch that decides whether the workspace may write back to disk.
 *
 * Every user edit funnels through `persistSurfaceState`, which is a no-op
 * while the gate is closed. The gate opens only when a layout restore
 * classified the current `workspace-N.json` as readable (or as genuinely
 * absent), and closes again the moment a later restore classifies it as
 * corrupt or unreadable.
 *
 * This is what turns Issue #204's "a failed read becomes an empty layout
 * that the first edit persists" into "a failed read becomes a session in
 * which nothing is persisted until the file reads back". The gate is
 * deliberately not a warning the user can dismiss: dismissing it would
 * re-enable exactly the overwrite the classification exists to prevent.
 */

import type { LayoutRestorePlan } from "@/management/workspace/layout/restore-plan";
import {
	isLayoutRestoreBlocked,
	type LayoutRestoreNotice,
	layoutRestoreNoticeFromPlan,
	logLayoutRestoreBlocked,
} from "@/management/workspace/layout/restore-plan";

export type WorkspaceWriteGate = {
	/**
	 * Whether user edits may reach disk right now. `persistSurfaceState`
	 * consults this as its **first** statement — before change-detection and
	 * before the baseline update — so a blocked restore leaves every
	 * `workspace-N.json` byte exactly as it was (Issue #204).
	 */
	isReady(): boolean;
	/**
	 * Adopt the outcome of a layout restore. Returns `true` when writes are
	 * open afterwards, `false` when they are held.
	 */
	adoptRestore(plan: LayoutRestorePlan): boolean;
};

export const createWorkspaceWriteGate = (): WorkspaceWriteGate => {
	let ready = false;
	return {
		isReady: () => ready,
		adoptRestore: (plan) => {
			ready = !isLayoutRestoreBlocked(plan);
			return ready;
		},
	};
};

export type LayoutRestoreAdoption = {
	/** Whether writes are open after this restore. */
	enabled: boolean;
	/** Banner content for a blocked restore; `null` when the restore is fine. */
	notice: LayoutRestoreNotice | null;
};

/**
 * Apply one layout restore to the gate, the Debug Console, and the UI.
 *
 * This is the single place a boot (or retry) outcome becomes all three
 * signals the rest of the panel reacts to, so the log line, the banner and
 * the write decision can never disagree with each other.
 */
export const adoptLayoutRestore = (
	gate: WorkspaceWriteGate,
	plan: LayoutRestorePlan,
	detail: { panelId: string; wsIndex: number },
): LayoutRestoreAdoption => {
	logLayoutRestoreBlocked(plan, detail);
	return {
		enabled: gate.adoptRestore(plan),
		notice: layoutRestoreNoticeFromPlan(plan, detail),
	};
};
