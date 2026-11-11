/**
 * Canonical preset / folder-group icon payload for `presets.json` and in-memory rows.
 * Workspace and dialogs resolve display via `assets/icons` from this shape.
 */

import type { Preset } from "@/management/preset/contract";
import {
	coercePresetCatalogIcon,
	type PresetIcon,
	presetIconText,
} from "@/management/preset/contract";

import { stripKnownIdPrefixes } from "@/management/storage/ids";

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

/** Default structured icon when none is provided (onboarding, legacy rows, cloud gaps). */
export const defaultPresetIconForKind = (
	type: Preset["type"] | undefined,
): PresetIcon => {
	const label = typeFallbackText(type);
	if (label) {
		return presetIconText(label);
	}
	return presetIconText("PRE");
};

/**
 * Parse `icon` field from JSON / runtime into a structured `PresetIcon`, or `null` if absent.
 */
export const tryParsePresetIconValue = (
	icon: Preset["icon"] | undefined,
): PresetIcon | null => {
	if (icon == null) {
		return null;
	}
	return coercePresetCatalogIcon(icon);
};

/** Always returns a structured icon suitable for persisting in `presets.json`. */
export const coercePersistedPresetIcon = (
	type: Preset["type"] | undefined,
	icon: Preset["icon"],
): PresetIcon => {
	const parsed = tryParsePresetIconValue(icon);
	if (parsed) {
		return parsed;
	}
	return defaultPresetIconForKind(type);
};

export const ensurePresetIconForPersistence = (preset: Preset): Preset => ({
	...preset,
	icon: coercePersistedPresetIcon(preset.type, preset.icon),
});

/**
 * Strips legacy `wsi:` / `ppi:` / `pcl:` from catalog `id` and folder `presetIds`
 * so rows match workspace surface ids.
 */
export const normalizeRecordCatalogIds = (preset: Preset): Preset => {
	const id = stripKnownIdPrefixes(String(preset.id ?? "").trim());
	const next: Preset = id === preset.id ? preset : { ...preset, id };

	return next;
};

export const normalizePresets = (presets: readonly Preset[]): Preset[] =>
	presets.map((preset) =>
		ensurePresetIconForPersistence(normalizeRecordCatalogIds(preset)),
	);
