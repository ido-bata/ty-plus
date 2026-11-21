import { i18n } from "@/management/i18n/index";
import type { Preset } from "@/management/preset/contract";
import type { GroupEntry } from "@/management/preset/group-catalog";

/** Synthetic catalog row for a workspace group placement (not in `presets.json`). */
export function synthesizeGroupPresetForTile(entry: GroupEntry): Preset {
	const memberCount = entry.presetIds.length;
	const memberLine =
		memberCount === 0
			? i18n.t("presets:group.synth.noMembers")
			: i18n.t("presets:group.synth.memberPresets", { count: memberCount });
	return {
		id: entry.id,
		type: "preset",
		title: entry.title?.trim() ?? entry.id,
		filePath: "",
		description: i18n.t("presets:group.synth.description", { memberLine }),
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
