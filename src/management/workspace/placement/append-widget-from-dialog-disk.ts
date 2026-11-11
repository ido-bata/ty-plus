/**
 * Append a widget from the modeless `dialog-widget-selector` surface.
 *
 * APPLICATION-scoped CEP surface messages from a modeless extension often do not reach
 * sibling workspace panels. This path writes the same artifacts as the in-panel
 * `appendWidgetFromBusPayload` flow (`workspace-N.json` + `widgets/widgets.json`) so the
 * panel's layout file watcher reloads and shows the new tile. Disk is the primary
 * persistence for widget creation; the cross-surface bus is only a refresh hint
 * (Issue #159 / D).
 *
 * ## Local / cloud boundary (Issue #159 / A)
 *
 * The original implementation called `getDataServices().presetRepository.list()`
 * before doing anything else. Since Issue #128, `getDataServices()` throws
 * `GatewayBootRequiredError` whenever boot mode is `"live"` and the runtime-backed
 * gateway was never registered — the normal post-onboarding state in the real AE
 * host. The whole body was wrapped in `catch { return false }`, so a cloud
 * dependency that is irrelevant to widget placement silently produced `false`,
 * the dialog fell back to the modeless `addWidget` bus message that does not
 * reach sibling panels, and the widget was never placed.
 *
 * Widget placement needs local workspace state, the widget registry, the widget
 * records file and the target layout — nothing from the online catalog. The
 * preset metadata `persistTargetLayout` requires is read from the local
 * `presets/presets.json` catalog with the same strict parser the preset path
 * uses, so both dialog paths agree on what the local-authoritative catalog is.
 * `getDataServices()` is not reached from this module at all.
 *
 * ## Failure classification (Issue #159 / B)
 *
 * The function no longer returns a bare `boolean`. It returns a discriminated
 * result carrying the failing stage, and every failure is logged at ERROR level
 * through `createLogger("workspace")` so the stage is visible in the Debug
 * Console.
 *
 * ## Local transaction (Issue #159 / C)
 *
 * `persistTargetLayout` and the widget-record write are two independent file
 * writes. The layout write runs first and the record write second, so a failed
 * record write would leave an orphan layout row pointing at a widget id that
 * has no record. Both files are snapshotted before the first write and restored
 * on failure, so a failed add leaves neither an orphan layout row nor an orphan
 * widget record.
 */

import type { WidgetType } from "@/function/widget";
import { readGroupJson } from "@/management/catalog/json-files";
import { createLogger } from "@/management/debug";
import {
	PresetCatalogParseError,
	parsePresetCatalogJsonTextStrict,
} from "@/management/preset/catalog-json-text";
import type { Preset } from "@/management/preset/contract";
import { parseGroupFromText } from "@/management/preset/group-catalog";
import { indexFromPanelId, readPresetsJson } from "@/management/storage";
import {
	readWidgetRecordsFileStrict,
	writeWidgetRecords,
} from "@/management/widget/persistence/records-file";
import { registry } from "@/management/widget/registry";
import {
	readNJson,
	removeNJson,
	writeNJson,
} from "@/management/workspace/layout/panel-json-files";
import { resolveWorkspacePersistenceManagedRoot } from "@/management/workspace/layout/persistence-root";
import { persistTargetLayout } from "@/management/workspace/placement/cross-panel-write";

const workspaceLog = createLogger("workspace");

export type AppendWidgetFromDialogDiskInput = {
	targetPanelId: string;
	widgetType: WidgetType;
};

/**
 * The stage that failed. Every value is observable in the Debug Console log
 * emitted for the same operation, so `reason` is a stable diagnostic key rather
 * than a user-facing sentence.
 */
export type AppendWidgetFailureReason =
	/** The managed `…/ty-plus` persistence root could not be resolved. */
	| "persistence-root-unavailable"
	/** The requested widget type is not in the registry, or is not available. */
	| "widget-type-unavailable"
	/** The local `presets/presets.json` catalog is missing or corrupt. */
	| "local-catalog-read-failed"
	/** The local `groups.json` catalog could not be read or parsed. */
	| "local-group-read-failed"
	/** Reading the target `workspace-N.json` / `widgets.json` snapshot failed. */
	| "local-layout-read-failed"
	/** `workspace-N.json` could not be written. */
	| "target-layout-write-failed"
	/** `widgets/widgets.json` could not be written (layout already rolled back). */
	| "widget-record-write-failed";

export type AppendWidgetResult =
	| {
			ok: true;
			/** Widget instance id created for this add. */
			widgetId: string;
			/** Panel the widget was placed on. */
			targetPanelId: string;
	  }
	| {
			ok: false;
			reason: AppendWidgetFailureReason;
			/** Human-readable detail for the Debug Console / dialog footer. */
			message: string;
	  };

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Read the local preset catalog from the managed persistence root.
 *
 * A missing file is not an error here: it means the user has no local presets,
 * which is the authoritative answer for layout reconstruction. A file that
 * exists but cannot be parsed IS an error — silently treating a corrupt catalog
 * as "no presets" would drop existing preset tiles from the layout we are about
 * to rewrite.
 */
const readLocalPresetCatalog = async (win: Window): Promise<Preset[]> => {
	const text = await readPresetsJson(win);
	if (!text) {
		return [];
	}
	return parsePresetCatalogJsonTextStrict(text);
};

/**
 * Persist a new widget tile onto the target panel's layout file and its widget
 * record into `widgets/widgets.json`, as one local transaction.
 *
 * Never throws for a classified failure — the reason is returned so the caller
 * can surface it instead of silently falling back to an unreliable bus message.
 */
export async function persistAppendWidgetFromDialog(
	win: Window,
	input: AppendWidgetFromDialogDiskInput,
): Promise<AppendWidgetResult> {
	const targetPanelId = input.targetPanelId.trim() || "panel-1";
	const fail = (
		reason: AppendWidgetFailureReason,
		message: string,
		extra?: Record<string, unknown>,
	): AppendWidgetResult => {
		workspaceLog.error("append-widget-from-dialog-disk:placement-failed", {
			context: {
				step: reason,
				targetPanelId,
				widgetType: input.widgetType,
				reason,
				message,
				...extra,
			},
		});
		return { ok: false, reason, message };
	};

	// Root resolution reads the initialization locator and settings from disk,
	// so it can throw. Classify it rather than letting it escape: an uncaught
	// throw would leave the dialog with no message and nothing in the log,
	// which is the silent failure this module exists to remove.
	let root: string | undefined;
	try {
		root = (await resolveWorkspacePersistenceManagedRoot(win))?.trim();
	} catch (error) {
		return fail(
			"persistence-root-unavailable",
			`The managed ty-plus persistence root could not be resolved: ${messageOf(
				error,
			)}`,
			{ cause: messageOf(error) },
		);
	}
	if (!root) {
		return fail(
			"persistence-root-unavailable",
			"The managed ty-plus persistence root could not be resolved.",
		);
	}
	const cfg = registry.getConfig(input.widgetType);
	if (!cfg?.available) {
		return fail(
			"widget-type-unavailable",
			`Widget type "${input.widgetType}" is not available in the registry.`,
		);
	}
	const id = registry.createId(input.widgetType);
	const { cols, rows } = cfg.defaultSize;

	// Local-authoritative reads only. `getDataServices()` is deliberately not
	// on this path (Issue #159 / A).
	let presets: Preset[];
	let groupCatalogEntries: ReturnType<typeof parseGroupFromText>;
	try {
		presets = await readLocalPresetCatalog(win);
	} catch (error) {
		return fail(
			"local-catalog-read-failed",
			error instanceof PresetCatalogParseError
				? `The local preset catalog is corrupt (${error.reason}): ${error.message}`
				: `The local preset catalog could not be read: ${messageOf(error)}`,
			{ cause: messageOf(error) },
		);
	}
	try {
		groupCatalogEntries = parseGroupFromText((await readGroupJson(win)) ?? "");
	} catch (error) {
		return fail(
			"local-group-read-failed",
			`The local group catalog could not be read: ${messageOf(error)}`,
			{ cause: messageOf(error) },
		);
	}

	// Snapshot both files before the first write so a partial add can be undone
	// (Issue #159 / C).
	const targetIndex = indexFromPanelId(targetPanelId);
	let rawLayoutBefore: string | null;
	let widgetRecordsSnapshot: Awaited<
		ReturnType<typeof readWidgetRecordsFileStrict>
	>;
	try {
		[rawLayoutBefore, widgetRecordsSnapshot] = await Promise.all([
			readNJson(win, targetIndex),
			readWidgetRecordsFileStrict(win),
		]);
	} catch (error) {
		return fail(
			"local-layout-read-failed",
			`The existing workspace state for ${targetPanelId} could not be read: ${messageOf(
				error,
			)}`,
			{ cause: messageOf(error) },
		);
	}
	const widgetRecordsBefore =
		widgetRecordsSnapshot.status === "loaded"
			? widgetRecordsSnapshot.records
			: [];

	const restoreLayout = async (): Promise<string | null> => {
		try {
			if (rawLayoutBefore === null) {
				await removeNJson(win, targetIndex);
			} else {
				await writeNJson(win, targetIndex, rawLayoutBefore);
			}
			return null;
		} catch (error) {
			return messageOf(error);
		}
	};

	/**
	 * Remove the just-written widget record, but only when it is actually on
	 * disk. Re-reading first keeps a concurrent writer's record from being
	 * clobbered by the rollback.
	 */
	const removeOrphanedWidgetRecord = async (): Promise<string | null> => {
		try {
			const current = await readWidgetRecordsFileStrict(win);
			if (
				current.status === "missing" ||
				!current.records.some((record) => record.id === id)
			) {
				return null;
			}
			await writeWidgetRecords(
				win,
				current.records.filter((record) => record.id !== id),
			);
			return null;
		} catch (error) {
			return messageOf(error);
		}
	};

	try {
		await persistTargetLayout(win, {
			persistenceRoot: root,
			targetPanelId,
			catalogIdsToMove: [],
			widgetTiles: [{ id, width: cols, height: rows }],
			widgetTypes: { [id]: input.widgetType },
			presets,
			groupCatalogEntries,
			widgetInstanceTypesOverlay: {},
		});
	} catch (error) {
		return fail(
			"target-layout-write-failed",
			`The layout for ${targetPanelId} could not be written: ${messageOf(error)}`,
			{ cause: messageOf(error) },
		);
	}

	try {
		await writeWidgetRecords(win, [
			...widgetRecordsBefore.filter((record) => record.id !== id),
			{ id, type: input.widgetType, param: {} },
		]);
	} catch (error) {
		// The layout row is already on disk and references a widget id that has
		// no record. Undo both writes so the panel reload does not resurrect a
		// tile whose type cannot be resolved.
		const rollbackErrors = [
			await restoreLayout(),
			await removeOrphanedWidgetRecord(),
		].filter((value): value is string => value !== null);
		return fail(
			"widget-record-write-failed",
			`The widget record for ${id} could not be written: ${messageOf(error)}`,
			{
				cause: messageOf(error),
				rolledBack: true,
				...(rollbackErrors.length > 0
					? { rollbackErrors: [...rollbackErrors] }
					: {}),
			},
		);
	}

	workspaceLog.info("append-widget-from-dialog-disk:placement-written", {
		context: {
			step: "written",
			targetPanelId,
			widgetType: input.widgetType,
			widgetId: id,
		},
	});
	return { ok: true, widgetId: id, targetPanelId };
}
