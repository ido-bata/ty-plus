/**
 * ## Surface tiles (ADR: index-primary layout)
 *
 * - **Source of truth** for grid order is `surfaceTiles`: an ordered array of
 *   `{ id, x, y, width, height }` only. Shell identity is the **array index**.
 * - **What `id` means** is resolved at runtime from catalogs (widgets.json instance ids,
 *   `ty-plus/groups/groups.json` group ids, presets.json preset ids)  Enever encoded as
 *   `kind` / `refId` fields on the row.
 * - **Disk** (`workspace-N.json`): `{ "gridCells": [ { "id", "x", "y", "width", "height" } ] }`
 *   and optional `presetLayoutRoster`.
 */

import {
	isWidgetType,
	WIDGET_TYPES,
	type WidgetType,
} from "@/function/widget/contract";
import { inferWidgetTypeFromLegacyLayoutId } from "@/function/widget/legacy-parse";
import type { Preset } from "@/management/preset/contract";
import {
	isOpaquePresetPlacementId,
	stripKnownIdPrefixes,
} from "@/management/storage/ids";
import { buildPrimaryPanelWidgets } from "@/management/workspace/layout/default";
import {
	type Layout,
	type LayoutItem,
	type PersistedLayoutDocument,
	serializePersistedLayoutDocument,
} from "@/management/workspace/layout/grid-document";

export type Role = "widget" | "preset" | "group" | "unknown";

export type CatalogContext = {
	widgetInstanceTypes?: Readonly<Record<string, WidgetType>>;
	groupCatalogEntries?: readonly { id: string }[];
	presets?: readonly { id: string }[];
};

const groupIdSet = (ctx: CatalogContext): ReadonlySet<string> =>
	new Set(
		(ctx.groupCatalogEntries ?? []).flatMap((g) => {
			const id = String(g?.id ?? "").trim();
			return id ? [id] : [];
		}),
	);

const presetIdSet = (ctx: CatalogContext): ReadonlySet<string> =>
	new Set(
		(ctx.presets ?? []).flatMap((p) => {
			const id = String(p?.id ?? "").trim();
			return id ? [id] : [];
		}),
	);

/**
 * Classifies a surface tile `id` using widgets.json, `groups.json`, then preset ids.
 */
export const classifyFromCatalogs = (
	ctx: CatalogContext,
	tileId: string | undefined,
): Role => {
	const id = String(tileId ?? "").trim();
	if (!id) return "unknown";
	const idNorm = stripKnownIdPrefixes(id);
	const wtMap = ctx.widgetInstanceTypes ?? {};
	const wt = wtMap[id] ?? wtMap[idNorm];
	if (typeof wt === "string" && isWidgetType(wt)) {
		return "widget";
	}
	const groups = groupIdSet(ctx);
	if (groups.has(id) || groups.has(idNorm)) {
		return "group";
	}
	const inferred = inferWidgetTypeFromLegacyLayoutId(id, WIDGET_TYPES);
	if (inferred && isWidgetType(inferred)) {
		const presets = presetIdSet(ctx);
		if (presets.has(id) || presets.has(idNorm)) {
			return "preset";
		}
		return "widget";
	}
	const presets = presetIdSet(ctx);
	if (presets.has(id) || presets.has(idNorm)) {
		return "preset";
	}
	return "unknown";
};

export type Tile = LayoutItem;

export type WidgetRecordLite = { id: string; type: WidgetType };

const DEFAULT_PRESET_WH = 1;

const geom = (x: number, y: number, w: number, h: number) => ({
	x: Math.max(0, Math.round(x)),
	y: Math.max(0, Math.round(y)),
	width: Math.max(1, Math.round(w)),
	height: Math.max(1, Math.round(h)),
});

/** Clip multi-select indices after array length change. */
export const clipSelection = (
	indices: readonly number[],
	length: number,
): number[] => {
	if (length <= 0) return [];
	const next: number[] = [];
	const seen = new Set<number>();
	for (const raw of indices) {
		const i = Math.trunc(Number(raw));
		if (!Number.isFinite(i) || i < 0 || i >= length || seen.has(i)) continue;
		seen.add(i);
		next.push(i);
	}
	return next;
};

export type WidgetResolution = {
	widgetTypeById: Readonly<Record<string, WidgetType>>;
	groupIds: ReadonlySet<string>;
	presetIds: ReadonlySet<string>;
};

export const widgetResolutionFromCatalogContext = (
	ctx: CatalogContext,
): WidgetResolution => ({
	widgetTypeById: ctx.widgetInstanceTypes ?? {},
	groupIds: groupIdSet(ctx),
	presetIds: presetIdSet(ctx),
});

/**
 * Builds `Layout[]` from surface rows whose `id` resolves as a widget instance
 * (widgets.json / `widgetTypeById`, or legacy `widget-*` ids when not a catalog preset/group id).
 */
export const layoutsFromSurface = (
	tiles: readonly Tile[],
	resolve?: WidgetResolution,
): Layout[] => {
	const wmap = resolve?.widgetTypeById ?? {};
	const gset = resolve?.groupIds ?? new Set<string>();
	const pset = resolve?.presetIds ?? new Set<string>();
	const out: Layout[] = [];
	for (const t of tiles) {
		const id = String(t.id ?? "").trim();
		if (!id) continue;
		const fromRegistry = wmap[id];
		let wt: WidgetType | null =
			typeof fromRegistry === "string" && isWidgetType(fromRegistry)
				? fromRegistry
				: null;
		if (!wt) {
			if (gset.has(id) || pset.has(id)) continue;
			const inferred = inferWidgetTypeFromLegacyLayoutId(id, WIDGET_TYPES);
			if (!inferred || !isWidgetType(inferred)) continue;
			wt = inferred;
		}
		out.push({
			id,
			widgetId: id,
			widgetType: wt,
			x: t.x,
			y: t.y,
			width: t.width,
			height: t.height,
		});
	}
	return out;
};

export const serialize = (tiles: readonly Tile[]): string =>
	serializePersistedLayoutDocument({
		gridCells: tiles.map((t) => ({
			id: t.id,
			x: t.x,
			y: t.y,
			width: t.width,
			height: t.height,
		})),
	});

const buildDefaultPanelTiles = (): Tile[] =>
	buildPrimaryPanelWidgets().map((w) => ({
		id: w.id,
		x: w.x,
		y: w.y,
		width: w.width,
		height: w.height,
	}));

const buildTilesForPanel = (panelId: string): Tile[] =>
	panelId === "panel-1" ? buildDefaultPanelTiles() : [];

/**
 * Build `surfaceTiles` from a persisted workspace layout document (`gridCells`, optional roster)
 * plus widget records and preset catalog (primary disk / runtime path).
 */
export const tilesFromDocument = (input: {
	layout: PersistedLayoutDocument;
	widgetRecords: readonly WidgetRecordLite[];
	presets: readonly Preset[];
	panelPresetIds: readonly string[];
	/**
	 * When there are no geometry rows yet, recovery may stack every catalog preset.
	 * Restrict to the primary panel only; auxiliary panels should stay empty until the user
	 * places presets (otherwise opening panel-2 "does nothing" but persists a full grid).
	 */
	implicitlyFillAllPresetsWhenLayoutEmpty?: boolean;
}): Tile[] => {
	const {
		layout,
		widgetRecords,
		presets,
		panelPresetIds,
		implicitlyFillAllPresetsWhenLayoutEmpty = false,
	} = input;
	const recordById = new Map(widgetRecords.map((r) => [r.id, r]));
	const presetIdSet = new Set(presets.map((p) => p.id));
	const roster = layout.presetLayoutRoster ?? [];
	const rosterPlacementToRef = new Map(
		roster.map((r) => [r.placementId, r.presetRefId]),
	);

	const tiles: Tile[] = [];
	for (const item of layout.gridCells) {
		const rec = recordById.get(item.id);
		if (rec) {
			tiles.push({
				id: item.id,
				...geom(item.x, item.y, item.width, item.height),
			});
			continue;
		}
		const refFromRoster = rosterPlacementToRef.get(item.id);
		const itemRaw = String(item.id ?? "").trim();
		const itemBare = stripKnownIdPrefixes(itemRaw);
		const catalogRef =
			refFromRoster ??
			(presetIdSet.has(itemBare)
				? itemBare
				: presetIdSet.has(itemRaw)
					? itemRaw
					: null);
		/** Keep geometry rows even when preset catalog is empty / ids not yet resolvable — layout is container-first. */
		const surfaceId = (catalogRef ?? String(item.id ?? "").trim()) || null;
		if (!surfaceId) continue;
		tiles.push({
			id: surfaceId,
			...geom(item.x, item.y, item.width, item.height),
		});
	}

	if (tiles.length === 0 && roster.length > 0) {
		let y = 0;
		for (const row of roster) {
			tiles.push({
				id: row.presetRefId,
				...geom(0, y, DEFAULT_PRESET_WH, DEFAULT_PRESET_WH),
			});
			y += DEFAULT_PRESET_WH;
		}
	}

	if (tiles.length > 0) return tiles;

	if (!implicitlyFillAllPresetsWhenLayoutEmpty) {
		return tiles;
	}

	const visible = new Set(panelPresetIds);
	const list = presets.filter((p) => visible.size === 0 || visible.has(p.id));
	const cellById = new Map(layout.gridCells.map((c) => [c.id, c]));
	let fy = 0;
	for (const p of list) {
		const hit = cellById.get(p.id);
		if (hit) {
			tiles.push({
				id: p.id,
				...geom(hit.x, hit.y, hit.width, hit.height),
			});
		} else {
			tiles.push({
				id: p.id,
				...geom(0, fy, DEFAULT_PRESET_WH, DEFAULT_PRESET_WH),
			});
			fy += DEFAULT_PRESET_WH;
		}
	}
	return tiles;
};

/** Map legacy string selection (placement ids / widget ids) to surface indices if possible. */
export const indicesFromLegacy = (
	tiles: readonly Tile[],
	legacySelectedPlacementIds: readonly string[],
): number[] => {
	const out: number[] = [];
	const seen = new Set<number>();
	for (const raw of legacySelectedPlacementIds) {
		const id = raw.trim();
		if (!id) continue;
		const idx = tiles.findIndex((t) => {
			if (isOpaquePresetPlacementId(id)) return false;
			return t.id === id;
		});
		if (idx >= 0 && !seen.has(idx)) {
			seen.add(idx);
			out.push(idx);
		}
	}
	return out;
};
