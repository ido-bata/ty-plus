import type { PresetType } from "@/management/preset/contract";

/**
 * On-disk extension / base-name resolution for catalog downloads.
 *
 * NET-010 downloads happen inside the Rust runtime (`online.download`), so
 * the TS side never sees the preset body or the signed URL. This module only
 * derives the destination from catalog metadata — the bytes-sniffing and
 * URL-filename paths were removed with the legacy fetch transport.
 */

// ===== Sanitization =====

/**
 * Strip filesystem-hostile characters and collapse whitespace. Mirrors the
 * archive's `sanitizeFileName` so the saved name is valid on Windows/macOS.
 */
export const sanitizeFileName = (value: string): string =>
	value
		.replace(/[\\/:*?"<>|]+/g, "_")
		.replace(/\s+/g, " ")
		.trim();

// ===== Hints from `info` =====

export type DownloadInfo = {
	type?: PresetType;
	title?: string;
	category?: string;
};

/**
 * Force an effect/plugin extension based on the host OS. The archive uses
 * `.aex` on Windows and `.plugin` on macOS so the same catalog entry can
 * deliver the right file to the right host. (Mac plugin extraction is
 * out of scope here — the zip gets saved as-is and the user extracts it.)
 */
const forceEffectExtension = (
	info: DownloadInfo,
	isMacOS: boolean,
): string | null => {
	const cat = info.category?.toLowerCase();
	if (cat === "effect" || cat === "plugin") {
		return isMacOS ? ".plugin" : ".aex";
	}
	return null;
};

// ===== Extension + base name =====

const FALLBACK_EXT_BY_TYPE: Record<PresetType, string> = {
	preset: ".ffx",
	script: ".jsx",
	plugin: ".aex",
	footage: ".ffx",
};

/**
 * Map a catalog `category` value to the canonical on-disk extension. The
 * catalog DB's `category` column is the authoritative signal for what kind
 * of file the row is — "script" is always JSX, "plugin"/"effect" is always
 * AEX (or .plugin on Mac), "footage" is always FFX.
 *
 * Returns `null` when the category is missing or "preset" (the default
 * bucket that gets resolved via `info.type`).
 */
const mapCategoryToExt = (
	category: string | undefined,
	isMacOS: boolean,
): string | null => {
	const cat = category?.toLowerCase().trim();
	if (!cat) return null;
	if (cat === "script") return ".jsx";
	if (cat === "effect" || cat === "plugin") {
		return isMacOS ? ".plugin" : ".aex";
	}
	if (cat === "footage") return ".ffx";
	// "preset" or any unrecognized value: no signal.
	return null;
};

/**
 * Map a catalog `category` value to the canonical `PresetType`. The catalog
 * DB's `category` column is the authoritative premise for what kind of file
 * the row is; the download pipeline uses it to pick the save root before the
 * final file extension is known.
 */
export const mapCategoryToType = (
	category: string | undefined,
): PresetType | undefined => {
	const cat = category?.toLowerCase().trim();
	if (cat === "script") return "script";
	if (cat === "effect" || cat === "plugin") return "plugin";
	if (cat === "footage") return "footage";
	if (cat === "preset") return "preset";
	return undefined;
};

// ===== Orchestrator =====

export type DownloadFileLayout = {
	/** Lowercased extension with leading dot, e.g. ".jsx". */
	ext: string;
	/** Base filename (no extension), already sanitized. */
	baseName: string;
};

/**
 * Choose the on-disk extension and base name WITHOUT inspecting the downloaded
 * body or the (signed) URL. NET-010 downloads happen inside the Rust runtime,
 * so the TS side only has the catalog metadata when picking a destination.
 *
 * Resolution priority (most to least authoritative):
 *   1. Forced effect extension (`.aex` / `.plugin`) when the catalog row is
 *      tagged `category: "effect"` / `"plugin"` (Mac wins on macOS hosts).
 *   2. The catalog `category` value, mapped through `mapCategoryToExt`.
 *   3. `info.type`, mapped through `FALLBACK_EXT_BY_TYPE`.
 *   4. Last-resort `.ffx`.
 *
 * The base name comes from the catalog title (sanitized), falling back to the
 * preset id — the URL filename is no longer visible and cannot be trusted on
 * signed Supabase / S3 URLs anyway.
 */
export const resolveDownloadFileLayout = (input: {
	info: DownloadInfo;
	presetId: string;
	isMacOS: boolean;
}): DownloadFileLayout => {
	const baseName =
		sanitizeFileName(input.info.title ?? input.presetId) || input.presetId;

	const forcedEffectExt = forceEffectExtension(input.info, input.isMacOS);
	if (forcedEffectExt) {
		return { ext: forcedEffectExt, baseName };
	}

	const categoryExt = mapCategoryToExt(input.info.category, input.isMacOS);
	if (categoryExt) {
		return { ext: categoryExt, baseName };
	}

	if (input.info.type) {
		return { ext: FALLBACK_EXT_BY_TYPE[input.info.type], baseName };
	}

	return { ext: ".ffx", baseName };
};
