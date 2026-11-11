import {
	getValidExtensionsForPresetAddTab,
	PRESET_ADD_DRIVES_PATH,
	type PresetAddFolderType,
} from "@/management/preset/catalog-add/archive-types";
import type { FileBrowserEntry } from "@/management/storage/file-browser-service";
import { createCepNodeFileBrowserService } from "@/management/storage/file-browser-service";

export type ArchiveListRow = {
	path: string;
	name: string;
	/** Directory rows navigate; "file" rows update selection (includes `.plugin` bundles). */
	kind: "directory" | "file";
};

const extOf = (name: string): string => {
	const i = name.lastIndexOf(".");
	return i >= 0 ? name.slice(i).toLowerCase() : "";
};

const mapRawToRows = (
	raw: readonly FileBrowserEntry[],
	tab: PresetAddFolderType,
): ArchiveListRow[] => {
	const valid = getValidExtensionsForPresetAddTab(tab);
	const validSet = valid ? new Set(valid) : null;
	const rows: ArchiveListRow[] = [];
	for (const e of raw) {
		const ext = (e.extension || extOf(e.name)).toLowerCase();
		if (e.isDirectory) {
			const isPluginBundle = tab === "plugins" && ext === ".plugin";
			if (isPluginBundle) {
				rows.push({ path: e.path, name: e.name, kind: "file" });
			} else {
				rows.push({ path: e.path, name: e.name, kind: "directory" });
			}
			continue;
		}
		if (validSet === null || validSet.has(ext)) {
			rows.push({ path: e.path, name: e.name, kind: "file" });
		}
	}
	rows.sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === "directory" ? -1 : 1;
		}
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	});
	return rows;
};

/**
 * Windows drive roots using `listDirectory` probes (archive `loadDrives` / `fs.access`).
 *
 * Intentionally module-private. The unrelated `function/widget/utility/directory-browser/load-drives.ts`
 * defines its own `loadWindowsDriveRows`; that is the public surface consumed by the
 * workspace widget. Do not re-export from this file — the archive catalog-add
 * surface only needs the helper internally for the drives-listing row.
 */
const loadWindowsDriveRows = async (
	win: Window,
): Promise<{ rows: ArchiveListRow[]; error: string | null }> => {
	const service = createCepNodeFileBrowserService({ win });
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	const checks = await Promise.all(
		letters.split("").map(async (letter) => {
			const drivePath = `${letter}:\\`;
			try {
				await service.listDirectory(drivePath);
				return { letter, drivePath } as const;
			} catch {
				return null;
			}
		}),
	);
	const rows: ArchiveListRow[] = [];
	for (const ok of checks) {
		if (!ok) continue;
		rows.push({
			name: `${ok.letter}:`,
			path: ok.drivePath,
			kind: "directory",
		});
	}
	return { rows, error: null };
};

export const loadArchiveRows = async (
	win: Window,
	dirPath: string,
	tab: PresetAddFolderType,
): Promise<{ rows: ArchiveListRow[]; error: string | null }> => {
	const trimmed = dirPath.trim();
	if (!trimmed) {
		return { rows: [], error: null };
	}
	if (trimmed === PRESET_ADD_DRIVES_PATH) {
		return loadWindowsDriveRows(win);
	}
	try {
		const service = createCepNodeFileBrowserService({ win });
		const raw = await service.listDirectory(trimmed);
		return { rows: mapRawToRows(raw, tab), error: null };
	} catch (err) {
		return {
			rows: [],
			error: err instanceof Error ? err.message : String(err),
		};
	}
};
