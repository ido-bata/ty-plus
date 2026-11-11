import type { Preset } from "@/management/preset/contract";
import type { GroupEntry } from "@/management/preset/group-catalog";

/** Synthetic catalog row for a workspace group placement (not in `presets.json`). */
export function synthesizeGroupPresetForTile(entry: GroupEntry): Preset {
	const memberCount = entry.presetIds.length;
	const memberLine =
		memberCount === 0
			? "No member presets."
			: memberCount === 1
				? "1 member preset."
				: `${memberCount} member presets.`;
	return {
		id: entry.id,
		type: "preset",
		title: entry.title?.trim() ?? entry.id,
		filePath: "",
		description: `Group container. ${memberLine}`,
		data: {
			groupId: entry.id,
			presetIds: [...entry.presetIds],
		},
		...(entry.icon !== undefined ? { icon: entry.icon } : {}),
	};
}

export function isGroupCatalogPreset(preset: Preset | undefined): boolean {
	const data = preset?.data;
	return (
		data !== null &&
		data !== undefined &&
		typeof data === "object" &&
		typeof (data as { groupId?: string }).groupId === "string"
	);
}

export function memberCountFromGroupPreset(preset: Preset | undefined): number {
	if (!isGroupCatalogPreset(preset)) return 0;
	const ids = preset?.data?.presetIds;
	return Array.isArray(ids) ? ids.length : 0;
}
