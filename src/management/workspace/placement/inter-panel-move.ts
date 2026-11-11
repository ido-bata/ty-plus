/**
 * Cross-panel workspace moves.
 *
 * ## Invariant (Issue #146 / Defect A)
 *
 * The operation is **strictly** ordered as
 *
 *   1. target.applyMove — write `workspace-<target>.json` for the target panel
 *   2. target.readBackMove — re-read the just-written target file and confirm
 *      that every moved catalog id appears in the persisted layout
 *   3. source.removeMove — write `settings.json` with the source's presetIds
 *      updated only AFTER both (1) and (2) succeeded
 *   4. source.persistLayout — write `workspace-<source>.json` with the source's
 *      surface tiles updated to reflect the moved tiles removal ONLY AFTER
 *      (1)–(3) all succeeded
 *
 * If step (1) or step (2) fails (the *pre-source* steps), the target layout
 * is rolled back to its pre-image snapshot captured before step (1) ran.
 * After this rollback the source state is exactly as it was before the call
 * and the target file is exactly as it was before the call — the operation
 * has produced no persistent effect and the caller can safely retry. If the
 * rollback itself fails, the caller is told so explicitly and must recover
 * manually.
 *
 * If step (3) fails after (1)+(2) succeeded, the target layout is rolled
 * back to its pre-image snapshot. Source `settings.json` was untouched
 * (writeSettings failed before producing a write). After rollback, both
 * source and target files are exactly as they were before the call.
 *
 * If step (4) fails after (1)–(3) succeeded, the target layout is rolled
 * back to its pre-image AND the source `settings.json` is rewritten with
 * the original `presetIds` (the inverse of step (3)) AND, if provided, the
 * caller's `restoreSourceLayout` callback is awaited to restore the source
 * `workspace-<source>.json` to a state that still contains the moved tile.
 * The whole operation has produced no persistent effect at this point, and
 * the caller can safely retry.
 *
 * The previous ordering — `movePresetPlacement → writeSettings → persistTargetLayout`,
 * which mutated source state before the target write — silently lost presets
 * when the target write failed. That ordering is gone; the function no longer
 * offers a backwards-compat path (demo stage).
 */

import type { WidgetType } from "@/function/widget";
import { createLogger } from "@/management/debug";
import type { Preset } from "@/management/preset/contract";
import type { GroupCatalogEntry } from "@/management/preset/group-catalog";
import {
	indexFromPanelId,
	movePresetPlacement,
	readNJson,
	readSettings,
	readWidgetRecords,
	removeNJson,
	writeNJson,
	writeSettings,
	writeWidgetRecords,
} from "@/management/storage";
import type { WidgetRecord } from "@/management/widget/record/types";
import { parseLayoutDocument } from "@/management/workspace/layout/grid-document";
import { persistTargetLayout } from "@/management/workspace/placement/cross-panel-write";

export type InterPanelMoveInput = {
	win: Window;
	persistenceRoot: string | undefined;
	sourcePanelId: string;
	targetPanelId: string;
	catalogIdsToMove: readonly string[];
	sourceFallbackPresetIds: readonly string[];
	widgetTilesForCrossPanel: readonly {
		id: string;
		width: number;
		height: number;
	}[];
	widgetTypesForCrossPanel: Readonly<Record<string, string>>;
	presets: readonly Preset[];
	groupCatalogEntries: readonly GroupCatalogEntry[];
	widgetInstanceTypesOverlay: Readonly<Record<string, WidgetType>>;
	/**
	 * Step (4): after steps (1)–(3) all succeed, `applyInterPanelMove` awaits
	 * this callback to persist the source panel's `workspace-<source>.json`
	 * with the moved tiles removed (so a panel reload cannot re-display the
	 * moved preset). If the callback rejects, `applyInterPanelMove` rolls
	 * back the target layout AND restores the source settings.json to the
	 * pre-image, then awaits `restoreSourceLayout` (if supplied) so the
	 * source layout is also reverted on disk.
	 */
	persistSourceLayout: () => Promise<void>;
	/**
	 * Reverse of `persistSourceLayout`. Awaited by `applyInterPanelMove`
	 * when `persistSourceLayout` rejected, AFTER target + source settings
	 * rollback has been performed. Implementations should persist the
	 * source `workspace-<source>.json` with the moved tile back in place.
	 * Optional: omit if the source layout file does not need to be
	 * reverted (e.g. the file was never written in the first place
	 * because no widget tiles were moved).
	 */
	restoreSourceLayout?: () => Promise<void>;
};

const workspaceLog = createLogger("workspace");

/**
 * Classify which persistence root the cross-panel write is using. Round-5 /
 * Needs-fix 2: a structured diagnostic field attached to every
 * `applyInterPanelMove` log emission so the Debug Console can confirm
 * which writer path was used without reading the input shape.
 */
const classifyPersistenceRoot = (
	root: string | undefined,
): "managed" | "local-test" | "none" => {
	if (!root?.trim()) return "none";
	const trimmed = root.trim().toLowerCase();
	if (trimmed.includes("local-test") || trimmed.includes("local_test")) {
		return "local-test";
	}
	return "managed";
};

const summarizePayload = (
	input: Pick<
		InterPanelMoveInput,
		| "persistenceRoot"
		| "sourcePanelId"
		| "targetPanelId"
		| "catalogIdsToMove"
		| "widgetTilesForCrossPanel"
	>,
): Record<string, unknown> => ({
	sourcePanelId: input.sourcePanelId,
	targetPanelId: input.targetPanelId,
	catalogIdsToMove: [...input.catalogIdsToMove],
	widgetIds: input.widgetTilesForCrossPanel.map((t) => t.id),
	persistenceRoot: classifyPersistenceRoot(input.persistenceRoot),
});

/**
 * Read the target `workspace-<N>.json` and `widgets/widgets.json` back and
 * confirm that every moved catalog id AND every moved widget tile appears
 * in the persisted state.
 *
 * Catalog contract:
 *
 * - Each catalog id appears in `gridCells[].id` or
 *   `presetLayoutRoster[].presetRefId`.
 *
 * Widget contract (Round-5 / Blocker 12):
 *
 * - Each widget tile id appears in `gridCells[].id`.
 * - Each widget tile's persisted geometry matches the move payload
 *   (width, height; x/y may shift because auto-pack chooses the next
 *   free column-band slot).
 * - Each widget tile has a corresponding record in `widgets/widgets.json`
 *   with a matching type.
 *
 * Throws when any of the above conditions fail.
 */
const readBackMove = async (
	win: Window,
	targetPanelId: string,
	catalogIdsToMove: readonly string[],
	widgetTilesForCrossPanel: readonly {
		id: string;
		width: number;
		height: number;
	}[],
	widgetTypesForCrossPanel: Readonly<Record<string, string>>,
): Promise<boolean> => {
	const targetIndex = indexFromPanelId(targetPanelId);
	const [verifiedRaw, widgetRecords] = await Promise.all([
		readNJson(win, targetIndex),
		readWidgetRecords(win),
	]);
	if (verifiedRaw === null) {
		throw new Error(
			`applyInterPanelMove: read-back verify failed — target layout file empty for ${targetPanelId}`,
		);
	}
	const verifiedLayout = JSON.parse(verifiedRaw) as unknown;
	const verifiedDoc = parseLayoutDocument(verifiedLayout);
	const cellsByLayoutId = new Map<
		string,
		{ x: number; y: number; width: number; height: number }
	>();
	const presentIds = new Set<string>();
	for (const cell of verifiedDoc.gridCells) {
		const trimmed = cell.id?.trim();
		if (trimmed) {
			presentIds.add(trimmed);
			cellsByLayoutId.set(trimmed, {
				x: cell.x,
				y: cell.y,
				width: cell.width,
				height: cell.height,
			});
		}
	}
	if (verifiedDoc.presetLayoutRoster) {
		for (const entry of verifiedDoc.presetLayoutRoster) {
			const trimmed = entry.presetRefId?.trim();
			if (trimmed) presentIds.add(trimmed);
		}
	}
	const missingIds = catalogIdsToMove.filter((id) => !presentIds.has(id));
	if (missingIds.length > 0) {
		throw new Error(
			`applyInterPanelMove: read-back verify mismatch — missing ${missingIds.join(", ")} in target ${targetPanelId}`,
		);
	}

	// Widget verification (Round-5 / Blocker 12). For each widget tile
	// being moved:
	//   1. gridCells must contain a row with the same id (presence check).
	//   2. The row's width / height must match the move payload
	//      (geometry check).
	//   3. widgets/widgets.json must contain a record with the same id
	//      AND the same type (registry check). The type is resolved from
	//      `widgetTypesForCrossPanel` first, then the widgetInstanceTypes
	//      overlay already on disk.
	const missingWidgets: string[] = [];
	const geometryMismatches: string[] = [];
	const registryMismatches: string[] = [];
	const recordsById = new Map<string, WidgetRecord>();
	for (const r of widgetRecords) {
		recordsById.set(r.id, r);
	}
	for (const tile of widgetTilesForCrossPanel) {
		const id = tile.id.trim();
		if (!id) continue;
		const cell = cellsByLayoutId.get(id);
		if (!cell) {
			missingWidgets.push(id);
			continue;
		}
		if (cell.width !== tile.width || cell.height !== tile.height) {
			geometryMismatches.push(
				`${id} (expected ${tile.width}x${tile.height}, got ${cell.width}x${cell.height})`,
			);
			continue;
		}
		const record = recordsById.get(id);
		const expectedType = widgetTypesForCrossPanel[id];
		if (!record) {
			registryMismatches.push(`${id} (no record in widgets.json)`);
			continue;
		}
		if (expectedType && record.type !== expectedType) {
			registryMismatches.push(
				`${id} (expected type ${expectedType}, got ${String(record.type)})`,
			);
		}
	}
	if (
		missingWidgets.length > 0 ||
		geometryMismatches.length > 0 ||
		registryMismatches.length > 0
	) {
		const parts: string[] = [];
		if (missingWidgets.length > 0) {
			parts.push(`missing tiles: ${missingWidgets.join(", ")}`);
		}
		if (geometryMismatches.length > 0) {
			parts.push(`geometry mismatch: ${geometryMismatches.join(", ")}`);
		}
		if (registryMismatches.length > 0) {
			parts.push(`registry mismatch: ${registryMismatches.join(", ")}`);
		}
		throw new Error(
			`applyInterPanelMove: read-back verify mismatch — widget tile ${parts.join("; ")} in target ${targetPanelId}`,
		);
	}
	return true;
};

/**
 * Restore the target layout to its pre-image. Called from any rollback
 * path after step (1) (target.applyMove) has produced a write.
 *
 * - When `targetPreImageRaw` is non-null, the file content captured before
 *   step (1) is written back verbatim.
 * - When `targetPreImageRaw` is null, the target file did not exist before
 *   the call. Restoring it via `removeNJson` actually deletes the file
 *   from disk so the panel re-boot does not see a stale ghost layout.
 *   `writeNJson(..., "")` is intentionally **not** used: `writeNJson` calls
 *   `JSON.parse(jsonText)` and would throw `SyntaxError` on empty input
 *   (Issue #146 / Blocker 6).
 *
 * Returns the rollforward outcome so the outer call can decide whether the
 * operation can be safely retried.
 */
type RollbackOutcome = {
	readonly rollbackSucceeded: boolean;
	readonly rollbackErrorMessage?: string;
};

const rollbackTargetLayout = async (
	win: Window,
	targetIndex: 1 | 2 | 3 | 4 | 5,
	targetPreImageRaw: string | null,
): Promise<RollbackOutcome> => {
	try {
		if (targetPreImageRaw === null) {
			await removeNJson(win, targetIndex);
		} else {
			await writeNJson(win, targetIndex, targetPreImageRaw);
		}
		return { rollbackSucceeded: true };
	} catch (rollbackError) {
		return {
			rollbackSucceeded: false,
			rollbackErrorMessage:
				rollbackError instanceof Error
					? rollbackError.message
					: String(rollbackError),
		};
	}
};

/**
 * Restore the source `settings.json` to its pre-image (the inverse of
 * step (3)). Called when `persistSourceLayout` (step 4) rejected — step
 * (3) had already mutated the source settings, so undoing the move
 * requires re-writing the original `presetIds`.
 */
const rollbackSourceSettings = async (
	win: Window,
	originalSettingsJson: string,
): Promise<RollbackOutcome> => {
	try {
		await writeSettings(win, originalSettingsJson);
		return { rollbackSucceeded: true };
	} catch (rollbackError) {
		return {
			rollbackSucceeded: false,
			rollbackErrorMessage:
				rollbackError instanceof Error
					? rollbackError.message
					: String(rollbackError),
		};
	}
};

/**
 * Restore `widgets/widgets.json` to its pre-image (Round-5 / Blocker 12 +
 * Round-6 / Blocker 14).
 *
 * Called when the widget read-back (step 2), source-writeSettings
 * (step 3), or persistSourceLayout (step 4) path fails. Re-writes the
 * captured pre-image records so the target's widget registry matches
 * the state before the move. The caller must have snapshotted
 * `widgetRecordsPreImage` BEFORE step (1) ran.
 */
const rollbackWidgetRecords = async (
	win: Window,
	widgetRecordsPreImage: readonly WidgetRecord[],
): Promise<RollbackOutcome> => {
	try {
		await writeWidgetRecords(win, widgetRecordsPreImage);
		return { rollbackSucceeded: true };
	} catch (rollbackError) {
		return {
			rollbackSucceeded: false,
			rollbackErrorMessage:
				rollbackError instanceof Error
					? rollbackError.message
					: String(rollbackError),
		};
	}
};

/**
 * Gate `rollbackWidgetRecords` on `widgetRecordsModified` (Round-6 /
 * Blocker 14). When the move did NOT modify widget records (preset-only
 * move, no widget tiles), the rollback is a no-op: no disk write, no
 * risk of wiping `widgets/widgets.json`. The pre-image was still
 * captured unconditionally at step 0 so when a widget move DOES fail,
 * the restore is exact.
 */
const rollbackWidgetRecordsIfModified = async (
	win: Window,
	widgetRecordsPreImage: readonly WidgetRecord[],
	widgetRecordsModified: boolean,
): Promise<RollbackOutcome> => {
	if (!widgetRecordsModified) {
		return { rollbackSucceeded: true };
	}
	return rollbackWidgetRecords(win, widgetRecordsPreImage);
};

export const applyInterPanelMove = async (
	input: InterPanelMoveInput,
): Promise<void> => {
	const {
		win,
		persistenceRoot,
		sourcePanelId,
		targetPanelId,
		catalogIdsToMove,
		sourceFallbackPresetIds,
		widgetTilesForCrossPanel,
		widgetTypesForCrossPanel,
		presets,
		groupCatalogEntries,
		widgetInstanceTypesOverlay,
		persistSourceLayout,
		restoreSourceLayout,
	} = input;

	const logContext = summarizePayload(input);

	// (read-only) read current settings so we can compute the new settingsJson
	// in-memory; no side effects up to this point. This is also the pre-image
	// used to roll back step (3) when step (4) rejects (Blocker 7).
	const currentSettingsJson: string = (await readSettings(win)) ?? "{}";

	// (compute) the new settingsJson (source presetIds removed, target added).
	// This is a pure in-memory transform — nothing is persisted yet.
	const nextSettingsJson: string =
		catalogIdsToMove.length > 0
			? movePresetPlacement(currentSettingsJson, {
					sourcePanelId,
					targetPanelId,
					presetIds: [...catalogIdsToMove],
					sourceFallbackPresetIds: [...sourceFallbackPresetIds],
				})
			: currentSettingsJson;

	// Snapshot the target layout file **before** step (1) mutates it.
	const targetIndex = indexFromPanelId(targetPanelId);

	// Round-6 / Blocker 14: snapshot the widget records file **before**
	// step (1) UNCONDITIONALLY (regardless of `widgetTilesForCrossPanel.length`).
	//
	// Previously the pre-image was only read when widget tiles were being
	// moved; on a preset-only move failure the rollback path would then
	// call `writeWidgetRecords(win, [])` and WIPE all existing widget
	// records from `widgets/widgets.json`. Capturing the pre-image
	// unconditionally (and tracking `widgetRecordsModified` so the
	// rollback only fires when something was actually written) makes the
	// restore safe AND avoids unnecessary disk writes when no widget
	// records were touched.
	//
	// `widgetRecordsModified` is set true AFTER `persistTargetLayout`
	// returns successfully AND the move requested widget tiles. This
	// mirrors the condition `input.widgetTiles.length > 0` inside
	// `persistTargetLayout` (cross-panel-write.ts) which is the gate
	// for the `upsertWidgetRecords` call. On preset-only moves
	// (`widgetTilesForCrossPanel.length === 0`) this stays false and
	// the rollback path SKIPS `rollbackWidgetRecords` entirely — no
	// write to `widgets/widgets.json`, no risk of wiping records.
	//
	// Both pre-images are read in one `Promise.all`: they are separate
	// stores, neither result feeds the other, and what matters is only
	// that both have landed before `persistTargetLayout` runs below.
	const [targetPreImageRaw, widgetRecordsPreImage]: [
		string | null,
		WidgetRecord[],
	] = await Promise.all([readNJson(win, targetIndex), readWidgetRecords(win)]);
	let widgetRecordsModified = false;

	// Step 1 + Step 2: target.applyMove → target.readBackMove.
	// Wrapped in try/catch: a failure here means target has a partial state
	// (or became unreadable), and the source has not been touched yet, so
	// the only rollback needed is to restore the target to its pre-image.
	// (Issue #146 / Blocker 5.)
	let preSourceStep: "apply" | "read-back" = "apply";
	try {
		workspaceLog.info("applyInterPanelMove:target-write:start", {
			context: logContext,
		});
		await persistTargetLayout(win, {
			persistenceRoot,
			targetPanelId,
			catalogIdsToMove,
			widgetTiles: widgetTilesForCrossPanel,
			widgetTypes: widgetTypesForCrossPanel,
			presets,
			groupCatalogEntries,
			widgetInstanceTypesOverlay,
		});
		// Mark widget records as modified only when this move actually
		// requested widget tiles (see `widgetRecordsPreImage` comment).
		// `persistTargetLayout` returns AFTER both `writeNJson` and
		// `upsertWidgetRecords` complete, so by the time we reach this
		// line any widget-record write the move intended has already
		// landed on disk.
		if (widgetTilesForCrossPanel.length > 0) {
			widgetRecordsModified = true;
		}
		preSourceStep = "read-back";

		await readBackMove(
			win,
			targetPanelId,
			catalogIdsToMove,
			widgetTilesForCrossPanel,
			widgetTypesForCrossPanel,
		);
		workspaceLog.info("applyInterPanelMove:read-back:ok", {
			context: logContext,
		});
	} catch (preSourceError) {
		const preSourceMessage =
			preSourceError instanceof Error
				? preSourceError.message
				: String(preSourceError);

		const targetOutcome = await rollbackTargetLayout(
			win,
			targetIndex,
			targetPreImageRaw,
		);
		const widgetsOutcome = await rollbackWidgetRecordsIfModified(
			win,
			widgetRecordsPreImage,
			widgetRecordsModified,
		);

		workspaceLog.warn(
			"applyInterPanelMove:target-write-failed-target-rolled-back",
			{
				context: {
					...logContext,
					preSourceStep,
					rollbackSucceeded: targetOutcome.rollbackSucceeded,
					rollbackErrorMessage: targetOutcome.rollbackErrorMessage,
					widgetsRollbackSucceeded: widgetsOutcome.rollbackSucceeded,
					widgetsRollbackErrorMessage: widgetsOutcome.rollbackErrorMessage,
					widgetRecordsModified,
					preSourceMessage,
				},
			},
		);

		throw new Error(
			`applyInterPanelMove: target ${preSourceStep} failed; target layout ${
				targetOutcome.rollbackSucceeded
					? "rolled back to pre-image"
					: "ROLLBACK FAILED — manual recovery required"
			}${
				widgetsOutcome.rollbackSucceeded
					? ", widget records restored to pre-image"
					: ", widget records ROLLBACK FAILED — manual recovery required"
			}: ${preSourceMessage}`,
			{ cause: preSourceError },
		);
	}

	// Step 3: source.removeMove (writeSettings). Only after steps 1 + 2
	// succeeded. If writeSettings() fails, roll back the target layout to
	// its pre-image so the operation leaves no persistent effect (Round 2).
	try {
		await writeSettings(win, nextSettingsJson);
		workspaceLog.info("applyInterPanelMove:source-write:ok", {
			context: logContext,
		});
	} catch (writeSettingsError) {
		const writeSettingsMessage =
			writeSettingsError instanceof Error
				? writeSettingsError.message
				: String(writeSettingsError);

		const targetOutcome = await rollbackTargetLayout(
			win,
			targetIndex,
			targetPreImageRaw,
		);
		const widgetsOutcome = await rollbackWidgetRecordsIfModified(
			win,
			widgetRecordsPreImage,
			widgetRecordsModified,
		);

		workspaceLog.warn(
			"applyInterPanelMove:source-write-failed-target-rolled-back",
			{
				context: {
					...logContext,
					rollbackSucceeded: targetOutcome.rollbackSucceeded,
					rollbackErrorMessage: targetOutcome.rollbackErrorMessage,
					widgetsRollbackSucceeded: widgetsOutcome.rollbackSucceeded,
					widgetsRollbackErrorMessage: widgetsOutcome.rollbackErrorMessage,
					widgetRecordsModified,
					writeSettingsMessage,
				},
			},
		);

		throw new Error(
			`applyInterPanelMove: source write failed; target layout ${
				targetOutcome.rollbackSucceeded
					? "rolled back to pre-image"
					: "ROLLBACK FAILED — manual recovery required"
			}${
				widgetsOutcome.rollbackSucceeded
					? ", widget records restored to pre-image"
					: ", widget records ROLLBACK FAILED — manual recovery required"
			}: ${writeSettingsMessage}`,
			{ cause: writeSettingsError },
		);
	}

	// Step 4: source.persistLayout (Blocker 7). After steps 1-3 all succeeded,
	// await the caller's source layout persistence. If it rejects, rollback
	// BOTH target (Blocker 5 path) AND source settings.json (inverse of step
	// 3) AND, if provided, await restoreSourceLayout so the source
	// workspace-N.json is also reverted on disk.
	try {
		await persistSourceLayout();
	} catch (sourceLayoutError) {
		const sourceLayoutMessage =
			sourceLayoutError instanceof Error
				? sourceLayoutError.message
				: String(sourceLayoutError);

		// The three pre-images are independent stores and each rollback helper
		// swallows its own error into a `RollbackOutcome`, so running them
		// together neither short-circuits the others nor changes what the
		// combined error message below reports.
		const [targetOutcome, sourceSettingsOutcome, widgetsOutcome] =
			await Promise.all([
				rollbackTargetLayout(win, targetIndex, targetPreImageRaw),
				rollbackSourceSettings(win, currentSettingsJson),
				rollbackWidgetRecordsIfModified(
					win,
					widgetRecordsPreImage,
					widgetRecordsModified,
				),
			]);

		let sourceLayoutOutcome: RollbackOutcome = {
			rollbackSucceeded: true,
		};
		if (restoreSourceLayout) {
			try {
				await restoreSourceLayout();
				sourceLayoutOutcome = { rollbackSucceeded: true };
			} catch (restoreError) {
				sourceLayoutOutcome = {
					rollbackSucceeded: false,
					rollbackErrorMessage:
						restoreError instanceof Error
							? restoreError.message
							: String(restoreError),
				};
			}
		}

		const allSucceeded =
			targetOutcome.rollbackSucceeded &&
			sourceSettingsOutcome.rollbackSucceeded &&
			sourceLayoutOutcome.rollbackSucceeded &&
			widgetsOutcome.rollbackSucceeded;

		workspaceLog.warn(
			"applyInterPanelMove:source-layout-failed-full-rollback",
			{
				context: {
					...logContext,
					sourceLayoutMessage,
					targetRollbackSucceeded: targetOutcome.rollbackSucceeded,
					targetRollbackErrorMessage: targetOutcome.rollbackErrorMessage,
					sourceSettingsRollbackSucceeded:
						sourceSettingsOutcome.rollbackSucceeded,
					sourceSettingsRollbackErrorMessage:
						sourceSettingsOutcome.rollbackErrorMessage,
					sourceLayoutRollbackSucceeded: sourceLayoutOutcome.rollbackSucceeded,
					sourceLayoutRollbackErrorMessage:
						sourceLayoutOutcome.rollbackErrorMessage,
					widgetsRollbackSucceeded: widgetsOutcome.rollbackSucceeded,
					widgetsRollbackErrorMessage: widgetsOutcome.rollbackErrorMessage,
					widgetRecordsModified,
					allRollbacksSucceeded: allSucceeded,
					sourcePersistResult: "failed-then-rolled-back",
				},
			},
		);

		throw new Error(
			`applyInterPanelMove: source layout persistence failed; target layout ${
				targetOutcome.rollbackSucceeded
					? "rolled back to pre-image"
					: "ROLLBACK FAILED — manual recovery required"
			}, source settings ${
				sourceSettingsOutcome.rollbackSucceeded
					? "restored to pre-image"
					: "ROLLBACK FAILED — manual recovery required"
			}${
				restoreSourceLayout
					? `, source layout ${
							sourceLayoutOutcome.rollbackSucceeded
								? "restored to pre-image"
								: "ROLLBACK FAILED — manual recovery required"
						}`
					: ""
			}${
				widgetsOutcome.rollbackSucceeded
					? ", widget records restored to pre-image"
					: ", widget records ROLLBACK FAILED — manual recovery required"
			}: ${sourceLayoutMessage}`,
			{ cause: sourceLayoutError },
		);
	}

	workspaceLog.info("applyInterPanelMove:committed", {
		context: {
			...logContext,
			sourcePersistResult: "success",
		},
	});
};
