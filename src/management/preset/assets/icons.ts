import type { Preset, PresetIcon } from "@/management/preset/contract";

import { tryParsePresetIconValue } from "@/management/preset/icon-data";

export type PresetIconVisual =
	| { kind: "image"; value: string }
	| { kind: "emoji"; value: string; backgroundColor?: string }
	| {
			kind: "text";
			value: string;
			color?: string;
			backgroundColor?: string;
	  }
	| {
			kind: "canvas";
			cubic: [number, number, number, number];
			color?: string;
			backgroundColor?: string;
	  };

const IMAGE_PATH_RE =
	/^(?:https?:\/\/|file:\/\/|data:image\/|[a-zA-Z]:\\|\.{1,2}[\\/]|[\\/]).+\.(?:png|jpe?g|gif|webp|svg)$/i;
const IMAGE_URL_RE = /^(?:https?:\/\/|file:\/\/|data:image\/)/i;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

const clampIconText = (value: string): string => value.trim().slice(0, 6);

const typeFallbackText = (type: Preset["type"] | undefined): string | null => {
	switch (type) {
		case "script":
			return "SCRIPT";
		case "footage":
			return "MEDIA";
		case "preset":
			return "FFX";
		case "plugin":
			return "PLUGIN";
		default:
			return null;
	}
};

const nameFallbackText = (preset: Pick<Preset, "title" | "id">): string => {
	const raw = (preset.title?.trim() || preset.id || "?").trim();
	return clampIconText(raw) || "?";
};

const presetIconToVisual = (
	preset: Pick<Preset, "title" | "id" | "type">,
	icon: PresetIcon,
): PresetIconVisual => {
	switch (icon.type) {
		case "image":
			return { kind: "image", value: icon.param.src.trim() || "?" };
		case "emoji":
			return {
				kind: "emoji",
				value: icon.param.emoji.trim() || "?",
				backgroundColor: icon.param.backgroundColor,
			};
		case "text":
			return {
				kind: "text",
				value: icon.param.text.trim() || "?",
				color: icon.param.color,
				backgroundColor: icon.param.backgroundColor,
			};
		case "canvas": {
			return {
				kind: "canvas",
				cubic: icon.param.cubic ?? [0.25, 0.1, 0.25, 1],
				color: icon.param.color,
				backgroundColor: icon.param.backgroundColor,
			};
		}
		default: {
			return { kind: "text", value: nameFallbackText(preset) };
		}
	}
};

/**
 * Workspace catalog / list UIs: use structured `icon` (or legacy string) only.
 * Skips `descriptionImage` so thumbnails stay distinct from preset icons.
 */
const resolvePresetCatalogIconVisual = (
	preset: Pick<Preset, "id" | "title" | "type" | "icon">,
): PresetIconVisual => {
	const structured = tryParsePresetIconValue(preset.icon);
	if (structured) {
		return presetIconToVisual(preset, structured);
	}

	const rawIcon = typeof preset.icon === "string" ? preset.icon.trim() : "";
	if (rawIcon) {
		if (IMAGE_URL_RE.test(rawIcon) || IMAGE_PATH_RE.test(rawIcon)) {
			return { kind: "image", value: rawIcon };
		}
		if (EMOJI_RE.test(rawIcon) && rawIcon.length <= 8) {
			return { kind: "emoji", value: rawIcon };
		}
		if (rawIcon.startsWith("lucide:")) {
			const k = typeFallbackText(preset.type);
			return { kind: "text", value: k ?? nameFallbackText(preset) };
		}
		return { kind: "text", value: clampIconText(rawIcon) || "?" };
	}

	const kindFallback = typeFallbackText(preset.type);
	if (kindFallback) {
		return { kind: "text", value: kindFallback };
	}
	return { kind: "text", value: nameFallbackText(preset) };
};

const resolvePresetIconVisual = (
	preset: Pick<Preset, "id" | "title" | "type" | "icon" | "descriptionImage">,
): PresetIconVisual => {
	const imagePath = preset.descriptionImage?.trim();
	if (imagePath) {
		return { kind: "image", value: imagePath };
	}

	return resolvePresetCatalogIconVisual(preset);
};

/**
 * Glyph in tiles / dialogs: prefer structured `preset.icon` (incl. text colors).
 * If there is no explicit icon, fall back to `descriptionImage` then catalog defaults
 * (same priority as {@link resolvePresetIconVisual} but skips description when icon is set).
 */
export const resolveWorkspaceGlyphIconVisual = (
	preset: Pick<Preset, "id" | "title" | "type" | "icon" | "descriptionImage">,
): PresetIconVisual => {
	const structured = tryParsePresetIconValue(preset.icon);
	if (structured) {
		return presetIconToVisual(preset, structured);
	}
	const rawIcon = typeof preset.icon === "string" ? preset.icon.trim() : "";
	if (rawIcon) {
		return resolvePresetCatalogIconVisual({
			id: preset.id,
			title: preset.title,
			type: preset.type,
			icon: preset.icon,
		});
	}
	return resolvePresetIconVisual(preset);
};
