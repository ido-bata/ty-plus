import { createCepNodeFileBrowserService } from "@/management/storage/file-browser-service";

/** Sentinel path used to indicate "show the Windows drive list". */
export const DRIVES_SENTINEL = "::DRIVES::";

export type DriveRow = {
	name: string;
	path: string;
	kind: "directory";
};

const PROBE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const loadWindowsDriveRows = async (
	win: Window,
): Promise<{ rows: DriveRow[]; error: string | null }> => {
	const service = createCepNodeFileBrowserService({ win });
	const probes = await Promise.all(
		PROBE_LETTERS.split("").map(async (letter) => {
			const drivePath = `${letter}:\\`;
			try {
				await service.listDirectory(drivePath);
				return { letter, drivePath, error: null } as const;
			} catch (e) {
				return {
					letter,
					drivePath,
					error: e instanceof Error ? e.message : String(e),
				} as const;
			}
		}),
	);
	const rows: DriveRow[] = [];
	let firstError: string | null = null;
	for (const probe of probes) {
		if (probe.error) {
			if (!firstError) firstError = probe.error;
			continue;
		}
		rows.push({
			name: `${probe.letter}:`,
			path: probe.drivePath,
			kind: "directory",
		});
	}
	return { rows, error: rows.length === 0 ? firstError : null };
};

export const isAtDriveRoot = (p: string): boolean => {
	const trimmed = p.trim();
	if (!trimmed) return false;
	const n = trimmed.replaceAll("\\", "/");
	return /^[a-z]:[/]?$/i.test(n) || n === "/";
};
