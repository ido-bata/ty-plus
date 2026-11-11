/**
 * Boot-time classification of the workspace layout read (Issue #204).
 *
 * `reloadLayoutFromStorage` used to absorb every failure into
 * `migratedTiles = []`, mark persistence ready, and seed the change-detection
 * baseline with that empty surface — so the first user edit wrote the empty
 * layout over `workspace-N.json` and destroyed every tile already on disk.
 * Issue #182 / PR #203 closed the same hole on the write side
 * (`persistTargetLayout`); this module closes it on the read side by keeping
 * the four states a read can be in distinguishable all the way to the
 * persistence gate:
 *
 * - `not-created` — no file yet (or a blank one): a genuinely untouched panel.
 * - `empty` — a readable layout document that holds no cells: the user emptied it.
 * - `loaded` — a readable layout document with cells.
 * - `corrupt` — bytes are there but they are not a layout (bad JSON, or JSON
 *   of some other shape). Never an empty array.
 * - `read-failure` — the file (or a file the restore needs) could not be read
 *   at all. Never an empty array either.
 *
 * The distinction cannot be made with `parseLayoutDocument`: it deliberately
 * never throws, so an object that is not a layout is indistinguishable from a
 * panel the user emptied. `parseLayoutDocumentJsonText` (Issue #182) is the
 * read path for anything that writes back what it read.
 */

import { createLogger } from "@/management/debug";
import {
	LayoutDocumentParseError,
	type PersistedLayoutDocument,
	parseLayoutDocumentJsonText,
} from "@/management/workspace/layout/grid-document";

const workspaceLog = createLogger("workspace");

/**
 * Why a restore was blocked. `json-parse-failed` / `unrecognized-shape` come
 * from `LayoutDocumentParseError`; `read-error` means the bytes never reached
 * the parser.
 */
type LayoutRestoreBlockedReason =
	| "json-parse-failed"
	| "unrecognized-shape"
	| "read-error";

/**
 * The outcome of one layout read.
 *
 * The three safe variants carry the document to build tiles from. The two
 * blocked variants carry a classification and a message — and deliberately
 * carry **no** document, so a caller cannot accidentally keep going with an
 * empty grid.
 */
export type LayoutRestorePlan =
	| {
			status: "not-created" | "empty" | "loaded";
			document: PersistedLayoutDocument;
	  }
	| {
			status: "corrupt";
			reason: "json-parse-failed" | "unrecognized-shape";
			message: string;
	  }
	| {
			status: "read-failure";
			reason: "read-error";
			message: string;
	  };

/** A restore failure the panel must show instead of a silently empty grid. */
export type LayoutRestoreNotice = {
	status: "corrupt" | "read-failure";
	reason: LayoutRestoreBlockedReason;
	message: string;
	panelId: string;
	wsIndex: number;
};

/**
 * Classify a layout body that was read successfully (including "read as
 * `null` because nothing was written").
 *
 * Never throws and never reports an unreadable body as empty: `corrupt` is
 * returned for anything present that is not a layout.
 */
export const planLayoutRestoreFromText = (
	raw: string | null | undefined,
): LayoutRestorePlan => {
	try {
		const document = parseLayoutDocumentJsonText(raw);
		const status =
			raw === null || raw === undefined || !raw.trim()
				? "not-created"
				: document.gridCells.length > 0
					? "loaded"
					: "empty";
		return { status, document };
	} catch (error) {
		return {
			status: "corrupt",
			reason:
				error instanceof LayoutDocumentParseError
					? error.reason
					: "json-parse-failed",
			message: error instanceof Error ? error.message : String(error),
		};
	}
};

/**
 * Classify a read that never produced a body — the storage layer rejected
 * (EACCES, EISDIR, a gateway error, …) or the restore failed before or while
 * reading the files it needs.
 */
export const planLayoutRestoreFromReadError = (
	error: unknown,
): LayoutRestorePlan => ({
	status: "read-failure",
	reason: "read-error",
	message: error instanceof Error ? error.message : String(error),
});

/** A blocked plan must stop the restore: no commit, no persistence. */
export const isLayoutRestoreBlocked = (
	plan: LayoutRestorePlan,
): plan is Extract<LayoutRestorePlan, { status: "corrupt" | "read-failure" }> =>
	plan.status === "corrupt" || plan.status === "read-failure";

/** The UI notice for a blocked plan; `null` when the restore may proceed. */
export const layoutRestoreNoticeFromPlan = (
	plan: LayoutRestorePlan,
	detail: { panelId: string; wsIndex: number },
): LayoutRestoreNotice | null =>
	isLayoutRestoreBlocked(plan)
		? {
				status: plan.status,
				reason: plan.reason,
				message: plan.message,
				panelId: detail.panelId,
				wsIndex: detail.wsIndex,
			}
		: null;

/**
 * Record a blocked restore in the Debug Console with its classification.
 *
 * The old boot path had a comment claiming the inner catches logged the
 * failure while the outer bare `catch` logged nothing at all, which is why
 * a destroyed panel left no trace. The reason travels in `context.reason` so
 * a support dump can tell "the file is corrupt" from "the file could not be
 * read".
 */
export const logLayoutRestoreBlocked = (
	plan: LayoutRestorePlan,
	detail: { panelId: string; wsIndex: number },
): void => {
	if (!isLayoutRestoreBlocked(plan)) return;
	workspaceLog.error("workspace layout could not be restored", {
		action: "reloadLayoutFromStorage:restore-blocked",
		context: {
			panelId: detail.panelId,
			wsIndex: detail.wsIndex,
			status: plan.status,
			reason: plan.reason,
			message: plan.message,
			consequence:
				"persistence left disabled; workspace files are not overwritten by edits",
		},
	});
};
