import type {
	CanvasParams,
	Preset,
	PresetIcon,
} from "@/management/preset/contract";

import { tryParsePresetIconValue } from "@/management/preset/icon/normalize";

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

/**
 * Factory-default cubic written by legacy catalog ingestion. A canvas icon
 * carrying only this value (no points, no paint) is content-free: every
 * auto-detected preset rendered the identical curve, making tiles
 * indistinguishable (Issue #325). Such icons resolve to the name-based text
 * fallback instead of the canvas visual.
 */
const FACTORY_CANVAS_CUBIC: [number, number, number, number] = [
	0.25, 0.1, 0.25, 1,
];

const isFactoryCanvasCubic = (
	cubic: CanvasParams["cubic"],
): cubic is [number, number, number, number] =>
	cubic !== undefined &&
	cubic[0] === FACTORY_CANVAS_CUBIC[0] &&
	cubic[1] === FACTORY_CANVAS_CUBIC[1] &&
	cubic[2] === FACTORY_CANVAS_CUBIC[2] &&
	cubic[3] === FACTORY_CANVAS_CUBIC[3];

const hasCanvasPaint = (param: CanvasParams): boolean =>
	Boolean(param.color?.trim() || param.backgroundColor?.trim());

const isContentlessCanvasParams = (param: CanvasParams): boolean =>
	(param.points === undefined || param.points.length === 0) &&
	(param.cubic === undefined || isFactoryCanvasCubic(param.cubic)) &&
	!hasCanvasPaint(param);

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
			if (isContentlessCanvasParams(icon.param)) {
				return { kind: "text", value: nameFallbackText(preset) };
			}
			return {
				kind: "canvas",
				cubic: icon.param.cubic ?? FACTORY_CANVAS_CUBIC,
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
