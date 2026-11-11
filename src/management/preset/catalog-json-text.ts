import {
	inferPresetTypeFromFilePath,
	titleFromFilePath,
} from "@/management/preset/authoring/request";
import type { Preset, PresetType } from "@/management/preset/contract";
import { normalizePresets } from "@/management/preset/icon-data";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isPresetType = (value: unknown): value is PresetType =>
	value === "preset" ||
	value === "script" ||
	value === "plugin" ||
	value === "footage";

const filePathFromLegacy = (row: Record<string, unknown>): string => {
	if (typeof row.filePath === "string") return row.filePath.trim();
	return "";
};

const titleFromRow = (
	row: Record<string, unknown>,
	filePath: string,
): string => {
	if (typeof row.title === "string" && row.title.trim())
		return row.title.trim();
	return titleFromFilePath(filePath);
};

const descriptionImageFromRow = (
	row: Record<string, unknown>,
): string | undefined => {
	const value = row.descriptionImage;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const parentIdFromRow = (row: Record<string, unknown>): string | undefined => {
	const value = row.parentId;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const parsePreset = (value: unknown): Preset | null => {
	if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
		return null;
	}
	const filePath = filePathFromLegacy(value);
	if (!filePath) return null;
	const type = isPresetType(value.type)
		? value.type
		: inferPresetTypeFromFilePath(filePath);
	return {
		id: value.id.trim(),
		type,
		title: titleFromRow(value, filePath),
		filePath,
		...(typeof value.description === "string" && value.description.trim()
			? { description: value.description.trim() }
			: {}),
		...(descriptionImageFromRow(value)
			? { descriptionImage: descriptionImageFromRow(value) }
			: {}),
		...(value.icon !== undefined ? { icon: value.icon as Preset["icon"] } : {}),
		...(isRecord(value.data) ? { data: value.data } : {}),
		...(parentIdFromRow(value) ? { parentId: parentIdFromRow(value) } : {}),
	};
};

/**
 * Strict variant of {@link parsePresetCatalogJsonText}. Throws
 * {@link PresetCatalogParseError} when the input is corrupt or structurally
 * invalid. Empty arrays are still a valid (no-error) state and return `[]`.
 *
 * Round-5 (PR #156): the local catalog fallback in
 * `append-preset-from-dialog-disk.ts` now uses this strict parser so a
 * corrupt `presets/presets.json` is surfaced as a failure (REJECT) instead
 * of being silently swallowed to `[]` (which previously made the placement
 * path run as if "正常な空catalog").
 */
export class PresetCatalogParseError extends Error {
	override readonly name = "PresetCatalogParseError";
	readonly source: string | undefined;
	readonly filePath: string | undefined;
	readonly reason: "json-parse-failed" | "root-not-array" | "all-rows-invalid";
	constructor(input: {
		message: string;
		reason: PresetCatalogParseError["reason"];
		source?: string;
		filePath?: string;
	}) {
		super(input.message);
		this.source = input.source;
		this.filePath = input.filePath;
		this.reason = input.reason;
	}
}

/**
 * Lenient variant: returns `[]` on any structural / parse failure.
 *
 * Existing boot paths (`services.ts`, `catalog-root-pinned.ts`) call this
 * helper from inside their own try/catch wrappers, so the "swallow to []"
 * behavior is intentional for the boot-time contract. For the local catalog
 * fallback that must REJECT on corrupt input, use
 * {@link parsePresetCatalogJsonTextStrict} instead.
 */
export const parsePresetCatalogJsonText = (raw: string | null): Preset[] => {
	try {
		return parsePresetCatalogJsonTextStrict(raw);
	} catch {
		return [];
	}
};

/**
 * Strict preset-catalog parser. Behavior:
 *
 * - `raw === null` or empty/whitespace-only → throws (NOT `[]`) so callers
 *   that read `null` from the gateway can distinguish "no file" from
 *   "valid empty catalog".
 * - JSON.parse failure → throws {@link PresetCatalogParseError} with
 *   `reason: "json-parse-failed"`.
 * - Top-level not an array (e.g. `{ presets: ... }` was never the wire
 *   shape but is still accepted leniently; when `presets` is missing OR not
 *   an array, this is `root-not-array`) → throws.
 * - Empty array → returns `[]` (legitimate empty catalog, NOT an error).
 * - At least one valid row → returns the parsed rows (drops invalid rows
 *   silently). All rows invalid → throws with `reason: "all-rows-invalid"`.
 *
 * @throws PresetCatalogParseError when the input is structurally invalid.
 */
export const parsePresetCatalogJsonTextStrict = (
	raw: string | null,
): Preset[] => {
	if (raw === null || raw === undefined) {
		throw new PresetCatalogParseError({
			message:
				"parsePresetCatalogJsonTextStrict: input is null/undefined — no catalog text was provided",
			reason: "json-parse-failed",
		});
	}
	if (!raw.trim()) {
		throw new PresetCatalogParseError({
			message:
				"parsePresetCatalogJsonTextStrict: input is empty/whitespace — no catalog text was provided",
			reason: "json-parse-failed",
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new PresetCatalogParseError({
			message: `parsePresetCatalogJsonTextStrict: JSON.parse failed — ${
				error instanceof Error ? error.message : String(error)
			}`,
			reason: "json-parse-failed",
			source: raw,
		});
	}
	const top = (parsed as { presets?: unknown })?.presets;
	if (!Array.isArray(top)) {
		throw new PresetCatalogParseError({
			message:
				"parsePresetCatalogJsonTextStrict: top-level `presets` is not an array",
			reason: "root-not-array",
			source: raw,
		});
	}
	if (top.length === 0) {
		return [];
	}
	const allParsed = top.map((value) => parsePreset(value));
	const valid = allParsed.filter((value): value is Preset => Boolean(value));
	if (valid.length === 0) {
		throw new PresetCatalogParseError({
			message:
				"parsePresetCatalogJsonTextStrict: every row failed parsing — refusing to return an all-invalid result",
			reason: "all-rows-invalid",
			source: raw,
		});
	}
	return normalizePresets(valid);
};

export const serializePresetCatalogJsonText = (presets: Preset[]): string =>
	`${JSON.stringify(
		{
			version: 1,
			presets: normalizePresets(presets).map((preset) => ({
				id: preset.id,
				type: preset.type,
				title: preset.title,
				filePath: preset.filePath,
				...(preset.description ? { description: preset.description } : {}),
				...(preset.descriptionImage
					? { descriptionImage: preset.descriptionImage }
					: {}),
				...(preset.icon ? { icon: preset.icon } : {}),
				...(preset.data ? { data: preset.data } : {}),
				...(preset.parentId ? { parentId: preset.parentId } : {}),
			})),
		},
		null,
		2,
	)}\n`;
