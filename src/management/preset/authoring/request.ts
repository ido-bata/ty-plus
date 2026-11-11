import type { Preset, PresetType } from "@/management/preset/contract";

export const inferPresetTypeFromFilePath = (filePath: string): PresetType => {
	const lower = filePath.trim().toLowerCase();
	if (lower.endsWith(".ffx")) return "preset";
	if (
		lower.endsWith(".jsx") ||
		lower.endsWith(".jsxbin") ||
		lower.endsWith(".js")
	) {
		return "script";
	}
	if (lower.endsWith(".aex") || lower.endsWith(".plugin")) return "plugin";
	return "footage";
};

export const titleFromFilePath = (filePath: string): string =>
	filePath
		.split(/[\\/]/)
		.pop()
		?.replace(/\.[^/.]+$/, "")
		.trim() || filePath.trim();

export const createPresetFromFile = (input: {
	id: string;
	filePath: string;
	title?: string;
	description?: string;
	descriptionImage?: string;
	icon?: Preset["icon"];
	data?: Record<string, unknown>;
}): Preset | null => {
	const filePath = input.filePath.trim();
	if (!filePath) return null;
	return {
		id: input.id,
		type: inferPresetTypeFromFilePath(filePath),
		title: input.title?.trim() || titleFromFilePath(filePath),
		filePath,
		...(input.description ? { description: input.description } : {}),
		...(input.descriptionImage
			? { descriptionImage: input.descriptionImage }
			: {}),
		...(input.icon ? { icon: input.icon } : {}),
		...(input.data ? { data: input.data } : {}),
	};
};

const resolveToolSurfaceId = (_preset: Preset): string => "dialog-preset-add";

export { resolveToolSurfaceId as resolvePresetToolSurfaceIdForPreset };
