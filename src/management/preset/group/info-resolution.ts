import type { Preset } from "@/management/preset/contract";
import { findGroupEntry } from "@/management/preset/group/catalog-helpers";
import { synthesizeGroupPresetForTile } from "@/management/preset/group/synthesize";
import type { SurfaceState } from "@/management/workspace/state";

/**
 * Resolve catalog ids for the info widget: real presets from `presets.json`,
 * group container ids → synthetic group row, members stay as catalog presets.
 */
export function resolvePresetsForInfoByCatalogIds(
	state: Pick<SurfaceState, "presets" | "groupCatalogEntries">,
	catalogIds: readonly string[],
): Preset[] {
	const byId = new Map(state.presets.map((p) => [p.id, p] as const));
	const out: Preset[] = [];
	const seen = new Set<string>();

	for (const raw of catalogIds) {
		const id = raw.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);

		const group = findGroupEntry(state.groupCatalogEntries, id);
		if (group) {
			out.push(synthesizeGroupPresetForTile(group));
			continue;
		}

		const preset = byId.get(id);
		if (preset) out.push(preset);
	}

	return out;
}

function isGroupCatalogRef(
	state: Pick<SurfaceState, "groupCatalogEntries">,
	catalogId: string,
): boolean {
	return findGroupEntry(state.groupCatalogEntries, catalogId) !== undefined;
}
