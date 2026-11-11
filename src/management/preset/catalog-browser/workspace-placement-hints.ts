import type { GroupEntry } from "@/management/preset/group-catalog";
import { stripKnownIdPrefixes } from "@/management/storage/ids";
import { readPanelPresetIdsFromSettingsJson } from "@/management/storage/workspace/store";
import {
	type PersistedLayoutDocument,
	parseLayoutDocument,
} from "@/management/workspace/layout/grid-document";
import { readNJson } from "@/management/workspace/layout/panel-json-files";
import {
	type CatalogContext,
	classifyFromCatalogs,
} from "@/management/workspace/surface/tiles";

function rosterRefByPlacementId(
	doc: PersistedLayoutDocument,
): Map<string, string> {
	return new Map(
		(doc.presetLayoutRoster ?? []).map((r) => {
			const placementId = String(r.placementId ?? "").trim();
			const presetRefId = String(r.presetRefId ?? "").trim();
			return [placementId, presetRefId] as const;
		}),
	);
}

/** Normalize roster / cell / settings ids to catalog `Preset.id` (map keys). */
function resolveCanonicalPresetId(
	presets: readonly { id: string }[],
	ref: string,
): string | null {
	const raw = String(ref ?? "").trim();
	if (!raw) {
		return null;
	}
	const bare = stripKnownIdPrefixes(raw);
	for (const p of presets) {
		const pid = String(p.id ?? "").trim();
		if (!pid) {
			continue;
		}
		const pidBare = stripKnownIdPrefixes(pid);
		if (pid === raw || pid === bare) {
			return pid;
		}
		if (pidBare === bare || pidBare === raw) {
			return pid;
		}
	}
	return null;
}

function resolvePresetRefForGridCell(
	cellId: string,
	rosterMap: Map<string, string>,
	presets: readonly { id: string }[],
): string | null {
	const refFromRoster = rosterMap.get(cellId);
	const itemRaw = cellId.trim();
	if (refFromRoster?.trim()) {
		const canon = resolveCanonicalPresetId(presets, refFromRoster);
		if (canon) {
			return canon;
		}
	}
	const fromCell = resolveCanonicalPresetId(presets, itemRaw);
	if (fromCell) {
		return fromCell;
	}
	return null;
}

function resolveGroupIdForCell(
	cellId: string,
	groups: readonly GroupEntry[],
): string | null {
	const raw = cellId.trim();
	const bare = stripKnownIdPrefixes(raw) || raw;
	const hit =
		groups.find((g) => g.id === raw) ?? groups.find((g) => g.id === bare);
	return hit?.id ?? null;
}

/**
 * For preset list: collect where each catalog preset id / group id appears from
 * panel list state in settings plus grid/roster in workspace-N.json.
 */
export async function buildPlacementHints(
	win: Window,
	settingsJson: string | null,
	presets: readonly { id: string }[],
	groups: readonly GroupEntry[],
): Promise<{
	presetLocations: Map<string, string[]>;
	groupLocations: Map<string, string[]>;
}> {
	const ctx: CatalogContext = {
		presets,
		groupCatalogEntries: groups,
	};

	const presetLocations = new Map<string, string[]>();
	const groupLocations = new Map<string, string[]>();

	const add = (m: Map<string, string[]>, id: string, tag: string): void => {
		const key = stripKnownIdPrefixes(String(id ?? "").trim());
		if (!key) {
			return;
		}
		const cur = m.get(key) ?? [];
		if (!cur.includes(tag)) {
			cur.push(tag);
			m.set(key, cur);
		}
	};

	const panelJsonByIndex = await Promise.all(
		([1, 2, 3, 4, 5] as const).map((index) => readNJson(win, index)),
	);
	for (let i = 1; i <= 5; i += 1) {
		const panelTag = `panel-${i}`;
		const fromSettings = readPanelPresetIdsFromSettingsJson(
			settingsJson,
			panelTag,
		);
		for (const raw of fromSettings) {
			const canon = resolveCanonicalPresetId(presets, raw);
			if (canon) {
				add(presetLocations, canon, `${panelTag} (list)`);
			}
		}

		const rawJson = panelJsonByIndex[i - 1];
		if (!rawJson?.trim()) {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(rawJson);
		} catch {
			continue;
		}
		const doc = parseLayoutDocument(parsed);
		const rosterMap = rosterRefByPlacementId(doc);

		if (
			doc.gridCells.length === 0 &&
			(doc.presetLayoutRoster?.length ?? 0) > 0
		) {
			for (const [j, row] of (doc.presetLayoutRoster ?? []).entries()) {
				const canon = resolveCanonicalPresetId(
					presets,
					String(row.presetRefId ?? ""),
				);
				if (canon) {
					add(presetLocations, canon, `${panelTag} (roster ${j + 1})`);
				}
			}
		}

		for (const [idx, cell] of doc.gridCells.entries()) {
			const ord = idx + 1;
			const pref = resolvePresetRefForGridCell(cell.id, rosterMap, presets);
			if (pref) {
				add(presetLocations, pref, `${panelTag} · ${ord}`);
				continue;
			}
			const role = classifyFromCatalogs(ctx, cell.id);
			if (role === "group") {
				const gid = resolveGroupIdForCell(cell.id, groups);
				if (gid) {
					add(groupLocations, gid, `${panelTag} · ${ord}`);
				}
			}
		}
	}

	return { presetLocations, groupLocations };
}
