/**
 * Types and helpers aligned with archive `preset-add-dialog.tsx`
 * (`FolderType`, `getValidExtensions`, path normalization).
 */

export type PresetAddFolderType = "presets" | "scripts" | "plugins" | "other";

/** Sentinel path for Windows drive list (archive `DRIVES_PATH`). */
export const PRESET_ADD_DRIVES_PATH = "::DRIVES::";

export const normalizeFsPath = (path: string): string =>
	path.replace(/\\/g, "/").toLowerCase();

/**
 * Valid file extensions per tab — matches archive `getValidExtensions`.
 * `null` means show all files (and navigable dirs).
 */
export const getValidExtensionsForPresetAddTab = (
	tab: PresetAddFolderType,
): readonly string[] | null => {
	switch (tab) {
		case "presets":
			return [".ffx"];
		case "scripts":
			return [".jsx", ".jsxbin"];
		case "plugins":
			return [".aex", ".plugin"];
		case "other":
			return null;
	}
};
