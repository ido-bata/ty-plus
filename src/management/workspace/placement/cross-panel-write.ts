/**
 * When items move between workspace panels, the layout shell bus only updates
 * **open** panel instances. This module writes the **target** `workspace-N.json`
 * from the source process so the layout survives when the target panel is closed.
 *
 * Uses the same merge + auto-pack helpers as in-memory `presetPlacement` /
 * `widgetPlacement` subscribers (`mergePresetPlacementIntoState`,
 * `mergeWidgetPlacementIntoState`).
 */

import { isWidgetType, type WidgetType } from "@/function/widget/contract";
import { readGroupJson } from "@/management/catalog/json-files";
import { createLogger } from "@/management/debug";
import type { Preset } from "@/management/preset/contract";
import {
	type GroupCatalogEntry,
	parseGroupFromText,
} from "@/management/preset/group/catalog";
import { parsePresetCatalogJsonText } from "@/management/preset/repository/json-text";
import {
	indexFromPanelId,
	readNJson,
	readPanelPresetIdsFromSettingsJson,
	readPresetsJsonText,
	readSettings,
	readWidgetRecords,
	upsertWidgetRecords,
	writeNJson,
} from "@/management/storage";
import { stripKnownIdPrefixes } from "@/management/storage/ids";
import {
	resolvePersistenceLockRoot,
	withPersistenceLock,
} from "@/management/storage/lock/persistence-lock";
import type { WidgetRecord } from "@/management/widget/record/types";
import {
	LayoutDocumentParseError,
	parseLayoutDocumentJsonText,
} from "@/management/workspace/layout/grid-document";
import {
	DEFAULT_TILE_HEIGHT,
	DEFAULT_TILE_WIDTH,
} from "@/management/workspace/placement/gateway";
import { mergePresetPlacementIntoState } from "@/management/workspace/placement/preset-bus";
import { mergeWidgetPlacementIntoState } from "@/management/workspace/placement/widget-bus";
import {
	createInitialSurfaceState,
	type SurfaceState,
} from "@/management/workspace/state";
import {
	serialize,
	type Tile,
	tilesFromDocument,
} from "@/management/workspace/surface/tiles";

const workspaceLog = createLogger("workspace");

/**
 * Turn a target panel's persisted layout into tiles, or refuse.
 *
 * No file returns no tiles — a panel nobody has written yet. A body that
 * cannot be read **throws** instead of returning `[]`: this value feeds
 * `persistTargetLayout`, which packs new tiles onto it and overwrites
 * `workspace-N.json`, so an empty array here is not "nothing to keep", it is
 * "erase everything that was there" (Issue #182).
 *
 * `parseLayoutDocumentJsonText` is what makes the two distinguishable;
 * `parseLayoutDocument` cannot, because it never throws.
 */
const loadTilesFromNJsonRaw = (
	raw: string | null | undefined,
	panelId: string,
	ctx: {
		presets: readonly Preset[];
		panelPresetIds: readonly string[];
		widgetRecordLite: readonly { id: string; type: WidgetType }[];
		groupCatalogEntries: readonly GroupCatalogEntry[];
	},
): Tile[] => {
	const layoutDoc = parseLayoutDocumentJsonText(raw);
	return tilesFromDocument({
		layout: layoutDoc,
		widgetRecords: ctx.widgetRecordLite,
		presets: ctx.presets,
		panelPresetIds: ctx.panelPresetIds,
		implicitlyFillAllPresetsWhenLayoutEmpty: panelId === "panel-1",
	});
};

const buildSyntheticSurfaceState = (input: {
	panelId: string;
	surfaceTiles: Tile[];
	presets: readonly Preset[];
	groupCatalogEntries: readonly GroupCatalogEntry[];
	widgetInstanceTypes: Record<string, WidgetType>;
	panelPresetIds: readonly string[];
}): SurfaceState => ({
	...createInitialSurfaceState({ mode: "static", panelId: input.panelId }),
	surfaceTiles: input.surfaceTiles.map((t) => ({ ...t })),
	presets: [...input.presets],
	groupCatalogEntries: [...input.groupCatalogEntries],
	widgetInstanceTypes: { ...input.widgetInstanceTypes },
	panelPresetIds: [...input.panelPresetIds],
});

export type CrossPanelLayoutWriteInput = {
	persistenceRoot: string | undefined;
	targetPanelId: string;
	catalogIdsToMove: readonly string[];
	widgetTiles: readonly { id: string; width: number; height: number }[];
	widgetTypes: Readonly<Record<string, string>>;
	presets: readonly Preset[];
	groupCatalogEntries: readonly GroupCatalogEntry[];
	/** In-memory widget types (covers instances not yet flushed to widgets.json). */
	widgetInstanceTypesOverlay: Readonly<Record<string, WidgetType>>;
	/**
	 * Optional explicit grid placement (in cell units) applied to the **first**
	 * `catalogIdsToMove` id. The remaining ids still auto-pack around it.
	 */
	dropPlacement?: { x: number; y: number; width?: number; height?: number };
};

/**
 * Build the WidgetRecord rows to write to `widgets/widgets.json` for a widget
 * cross-panel move.
 *
 * For each widget tile in the move payload we resolve its `type` from
 * (in priority order) the explicit `widgetTypes` map → the overlay → the
 * existing record on disk. The `param` is preserved verbatim from the existing
 * record (cross-panel move does not mutate widget parameters — Issue #146
 * / Blocker 12 / Round-5).
 *
 * Returns the records to upsert and the post-image for read-back.
 */
type WidgetMoveInput = {
	widgetTiles: readonly { id: string; width: number; height: number }[];
	widgetTypes: Readonly<Record<string, string>>;
	overlay: Readonly<Record<string, WidgetType>>;
	existing: readonly WidgetRecord[];
};

const buildWidgetRecordsForMove = (input: WidgetMoveInput): WidgetRecord[] => {
	const existingById = new Map<string, WidgetRecord>();
	for (const r of input.existing) {
		existingById.set(r.id, r);
	}
	const out: WidgetRecord[] = [];
	for (const row of input.widgetTiles) {
		const id = row.id.trim();
		if (!id) continue;
		const prior = existingById.get(id);
		const priorType =
			prior && isWidgetType(String(prior.type))
				? (prior.type as WidgetType)
				: undefined;
		const explicit = input.widgetTypes[id];
		const overlayType = input.overlay[id];
		const type: WidgetType | undefined = isWidgetType(String(explicit))
			? (explicit as WidgetType)
			: overlayType !== undefined && isWidgetType(String(overlayType))
				? overlayType
				: priorType;
		if (!type) continue;
		out.push({
			id,
			type,
			param: prior?.param ?? {},
		});
	}
	return out;
};

const catalogRowKey = (id: string): string => stripKnownIdPrefixes(id.trim());

/**
 * Union a caller-supplied catalog with a fresh on-disk supplement, deduped
 * by stripped id. The caller's rows always win on conflict — they may carry
 * entries that are not file-backed (fixture presets, in-memory state) —
 * while the supplement adds rows another CEP context committed after the
 * caller's snapshot was taken.
 */
const mergeCatalogSupplement = <T extends { readonly id: string }>(
	base: readonly T[],
	supplement: readonly T[] | null,
): readonly T[] => {
	if (!supplement || supplement.length === 0) return base;
	const seen = new Set<string>();
	const merged: T[] = [];
	for (const row of [...base, ...supplement]) {
		const key = catalogRowKey(String(row.id ?? ""));
		if (!key || seen.has(key)) continue;
		seen.add(key);
		merged.push(row);
	}
	return merged;
};

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Best-effort fresh read of `presets/presets.json` for the in-lock catalog
 * supplement. Returns null when the read itself fails — the caller's
 * catalog remains the baseline either way, so a transient read error must
 * not fail the whole layout write. A missing/blank/corrupt file yields an
 * empty supplement via the lenient parser.
 */
const readPresetCatalogSupplement = async (
	win: Window,
): Promise<readonly Preset[] | null> => {
	try {
		const raw = await readPresetsJsonText(win);
		if (raw === null || !raw.trim()) return [];
		return parsePresetCatalogJsonText(raw);
	} catch (error) {
		workspaceLog.warn(
			"persistTargetLayout: preset catalog refresh failed; keeping caller catalog",
			{
				action: "persistTargetLayout:catalog-refresh-failed",
				context: { catalog: "presets", message: describeError(error) },
			},
		);
		return null;
	}
};

/** Best-effort fresh read of `groups/groups.json` — same contract as above. */
const readGroupCatalogSupplement = async (
	win: Window,
): Promise<readonly GroupCatalogEntry[] | null> => {
	try {
		return parseGroupFromText((await readGroupJson(win)) ?? "");
	} catch (error) {
		workspaceLog.warn(
			"persistTargetLayout: group catalog refresh failed; keeping caller catalog",
			{
				action: "persistTargetLayout:catalog-refresh-failed",
				context: { catalog: "groups", message: describeError(error) },
			},
		);
		return null;
	}
};

/**
 * Merges moved catalog presets / widgets onto the target panel layout file using
 * the same auto-pack path as live bus subscribers.
 *
 * Round-5 (PR #146 / Blocker 12): when widget tiles are being moved, also
 * upsert their records to `widgets/widgets.json` so the target panel reload
 * resolves the widget types / params. Previously only `workspace-N.json`
 * was updated and the target panel would silently lose widget identity
 * because `widgets.json` (the canonical type registry) was not touched.
 */
export const persistTargetLayout = async (
	win: Window,
	input: CrossPanelLayoutWriteInput,
): Promise<void> => {
	if (input.catalogIdsToMove.length === 0 && input.widgetTiles.length === 0) {
		return;
	}
	// ADR-0006: the whole read→merge→write runs inside the managed-root
	// persistence lock. Every read that feeds the write happens inside the
	// hold so a concurrent owner persist or sibling dialog write cannot
	// interleave between our read and our write. Nested calls (e.g. from
	// `applyInterPanelMove` or the dialog append wrappers) join the outer
	// hold via AsyncLocalStorage.
	const lockRoot = await resolvePersistenceLockRoot(win);
	if (!lockRoot) {
		throw new Error(
			"persistTargetLayout: no managed persistence root (onboarding incomplete)",
		);
	}
	await withPersistenceLock(win, lockRoot, async () => {
		// ADR-0006 §5: `presets` / `groupCatalogEntries` arrive as caller
		// inputs that may predate this hold (dialog paths resolve catalogs
		// before acquiring, the owner panel passes in-memory state). Re-read
		// the shared catalog files INSIDE the lock and union them with the
		// caller's rows so tile-id classification below runs against the
		// freshest catalog state — while keeping caller-only rows (fixture
		// presets, not-yet-flushed entries) that a disk-only read would drop.
		const [diskPresets, diskGroups] = await Promise.all([
			readPresetCatalogSupplement(win),
			readGroupCatalogSupplement(win),
		]);
		const presets = mergeCatalogSupplement(input.presets, diskPresets);
		const groupCatalogEntries = mergeCatalogSupplement(
			input.groupCatalogEntries,
			diskGroups,
		);
		const targetIndex = indexFromPanelId(input.targetPanelId);
		const [rawLayout, widgetRecords, settingsJson] = await Promise.all([
			readNJson(win, targetIndex),
			readWidgetRecords(win),
			readSettings(win),
		]);
		const widgetRecordLite = widgetRecords.map((r) => ({
			id: r.id,
			type: r.type as WidgetType,
		}));
		const panelPresetIdsFromSettings = readPanelPresetIdsFromSettingsJson(
			settingsJson,
			input.targetPanelId,
		);
		// Nothing below this point may run when the target layout cannot be read:
		// the next write is an overwrite of `workspace-N.json`, so a failure here
		// has to surface (and be visible in the Debug Console) before it, not be
		// absorbed into an empty grid.
		let migratedTiles: Tile[];
		try {
			migratedTiles = loadTilesFromNJsonRaw(rawLayout, input.targetPanelId, {
				presets,
				panelPresetIds: panelPresetIdsFromSettings,
				widgetRecordLite,
				groupCatalogEntries,
			});
		} catch (error) {
			workspaceLog.error("target layout could not be read", {
				action: "persistTargetLayout:target-layout-unreadable",
				context: {
					targetPanelId: input.targetPanelId,
					reason:
						error instanceof LayoutDocumentParseError
							? error.reason
							: "unknown",
					message: error instanceof Error ? error.message : String(error),
					consequence: "write aborted; existing tiles left untouched",
				},
			});
			throw error;
		}
		const fromRecords: Record<string, WidgetType> = Object.fromEntries(
			widgetRecords.flatMap((r) =>
				isWidgetType(String(r.type)) ? [[r.id, r.type as WidgetType]] : [],
			),
		);
		const widgetInstanceTypes: Record<string, WidgetType> = { ...fromRecords };
		for (const [id, wt] of Object.entries(input.widgetInstanceTypesOverlay)) {
			const k = id.trim();
			if (!k || !isWidgetType(wt)) continue;
			widgetInstanceTypes[k] = wt;
		}
		let working = buildSyntheticSurfaceState({
			panelId: input.targetPanelId,
			surfaceTiles: migratedTiles,
			presets,
			groupCatalogEntries,
			widgetInstanceTypes,
			panelPresetIds: panelPresetIdsFromSettings,
		});
		if (input.catalogIdsToMove.length > 0) {
			const dp = input.dropPlacement;
			const explicitPlacements =
				dp &&
				Number.isFinite(dp.x) &&
				Number.isFinite(dp.y) &&
				input.catalogIdsToMove.length > 0
					? [
							{
								x: Math.max(0, Math.floor(dp.x)),
								y: Math.max(0, Math.floor(dp.y)),
								width: Math.max(1, Math.floor(dp.width ?? DEFAULT_TILE_WIDTH)),
								height: Math.max(
									1,
									Math.floor(dp.height ?? DEFAULT_TILE_HEIGHT),
								),
							},
						]
					: undefined;
			const patch = mergePresetPlacementIntoState(working, {
				kind: "presetPlacement",
				sourcePanelId: "",
				targetPanelId: input.targetPanelId,
				presetIds: [...input.catalogIdsToMove],
				...(explicitPlacements
					? { explicitPlacements }
					: { auto: { axis: -1 } }),
			});
			working = { ...working, ...patch };
		}
		if (input.widgetTiles.length > 0) {
			const wt: Record<string, string> = { ...input.widgetTypes };
			for (const row of input.widgetTiles) {
				const id = row.id.trim();
				if (!id) continue;
				if (!wt[id]) {
					const w = working.widgetInstanceTypes[id];
					if (w) wt[id] = w;
				}
			}
			const patch = mergeWidgetPlacementIntoState(working, {
				kind: "widgetPlacement",
				sourcePanelId: "",
				targetPanelId: input.targetPanelId,
				tiles: input.widgetTiles.map((t) => ({
					id: t.id,
					x: 0,
					y: 0,
					width: t.width,
					height: t.height,
				})),
				widgetTypes: wt,
				auto: { axis: -1 },
			});
			working = { ...working, ...patch };
		}
		await writeNJson(win, targetIndex, serialize(working.surfaceTiles));

		// Round-5 / Blocker 12: upsert the widget records to
		// `widgets/widgets.json` so the moved tiles are recognized by the
		// target panel after a reload. Without this the read-back will fail
		// (the records are not present) and `applyInterPanelMove` rolls the
		// whole move back.
		if (input.widgetTiles.length > 0) {
			const recordsToUpsert = buildWidgetRecordsForMove({
				widgetTiles: input.widgetTiles,
				widgetTypes: input.widgetTypes,
				overlay: input.widgetInstanceTypesOverlay,
				existing: widgetRecords,
			});
			if (recordsToUpsert.length > 0) {
				await upsertWidgetRecords(win, recordsToUpsert);
			}
		}
	});
};
