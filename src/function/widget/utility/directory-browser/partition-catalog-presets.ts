import type { Preset } from "@/management/preset/contract";
import type { GroupEntry } from "@/management/preset/group-catalog";

export type GroupedCatalogPresets = {
	group: GroupEntry;
	presets: Preset[];
};

export type PartitionResult = {
	grouped: readonly GroupedCatalogPresets[];
	ungrouped: readonly Preset[];
};

/**
 * Partition catalog presets into groups (by `GroupEntry.presetIds`) and an
 * ungrouped remainder. Groups with no matching presets in the current slice
 * are dropped. Presets in multiple groups appear in each. Presets with no
 * group membership appear in `ungrouped`.
 */
export function partitionCatalogPresetsByGroup(
	presets: readonly Preset[],
	groups: readonly GroupEntry[],
): PartitionResult {
	if (presets.length === 0 || groups.length === 0) {
		return { grouped: [], ungrouped: [...presets] };
	}

	const presetById = new Map<string, Preset>();
	for (const p of presets) {
		presetById.set(p.id, p);
	}

	const grouped: GroupedCatalogPresets[] = [];
	for (const g of groups) {
		const memberPresets: Preset[] = [];
		for (const id of g.presetIds) {
			const p = presetById.get(id);
			if (p) {
				memberPresets.push(p);
			}
		}
		if (memberPresets.length > 0) {
			grouped.push({ group: g, presets: memberPresets });
		}
	}

	const groupedIds = new Set<string>();
	for (const { presets: ps } of grouped) {
		for (const p of ps) {
			groupedIds.add(p.id);
		}
	}
	const ungrouped = presets.filter((p) => !groupedIds.has(p.id));

	return { grouped, ungrouped };
}
