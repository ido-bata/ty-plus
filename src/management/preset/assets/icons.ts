import type { Preset, PresetIcon } from "@/management/preset/contract";

import {
	isDefaultPresetIcon,
	presetTypeFallbackText,
	tryParsePresetIconValue,
} from "@/management/preset/icon/normalize";

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
 * Resolves the persisted `preset.icon` field (structured or legacy string)
 * into a visual, falling back to the type label and then the preset name.
 * This is the floor of icon resolution: it always produces a visual.
 */
const resolvePersistedIconVisual = (
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
			const k = presetTypeFallbackText(preset.type);
			return { kind: "text", value: k ?? nameFallbackText(preset) };
		}
		return { kind: "text", value: clampIconText(rawIcon) || "?" };
	}

	const kindFallback = presetTypeFallbackText(preset.type);
	if (kindFallback) {
		return { kind: "text", value: kindFallback };
	}
	return { kind: "text", value: nameFallbackText(preset) };
};

const hasPersistedIconValue = (
	preset: Pick<Preset, "icon">,
): preset is Pick<Preset, "icon"> & { icon: NonNullable<Preset["icon"]> } => {
	const icon = preset.icon;
	if (icon == null) {
		return false;
	}
	if (typeof icon === "string") {
		return icon.trim().length > 0;
	}
	return true;
};

/**
 * True when the preset carries an icon that differs from the materialized
 * type default — i.e. a user- or import-assigned icon (including a sibling
 * image persisted at import time). Derived sources must not override it.
 */
export const hasCustomPresetIcon = (
	preset: Pick<Preset, "type" | "icon">,
): boolean => {
	if (!hasPersistedIconValue(preset)) {
		return false;
	}
	return !isDefaultPresetIcon(preset.type, preset.icon);
};

export type PresetIconResolutionOptions = {
	/**
	 * Filesystem-derived sibling image for the preset file (e.g. `Foo.png`
	 * next to `Foo.ffx`), resolved by the caller through
	 * `sibling-thumbnail`. It is a display-time derivation, never persisted.
	 */
	siblingImageSrc?: string | null;
};

/**
 * Single owner of "which image represents this preset".
 *
 * Priority: user/import-assigned `icon` > `descriptionImage` > derived
 * sibling image > persisted default icon > type/name fallback.
 *
 * Surfaces that can derive a sibling image pass it via
 * {@link PresetIconResolutionOptions}; surfaces that cannot simply omit it
 * and get the persisted-or-fallback result.
 */
export const resolveWorkspaceGlyphIconVisual = (
	preset: Pick<Preset, "id" | "title" | "type" | "icon" | "descriptionImage">,
	options?: PresetIconResolutionOptions,
): PresetIconVisual => {
	if (hasCustomPresetIcon(preset)) {
		return resolvePersistedIconVisual(preset);
	}
	const descriptionImage = preset.descriptionImage?.trim();
	if (descriptionImage) {
		return { kind: "image", value: descriptionImage };
	}
	const sibling = options?.siblingImageSrc?.trim();
	if (sibling) {
		return { kind: "image", value: sibling };
	}
	return resolvePersistedIconVisual(preset);
};
