import type {
	ClipboardFile,
	EasingClipboard,
	ValuesClipboard,
} from "@/management/storage/clipboard-types";
import { readJson, writeJson } from "@/management/storage/persistence";

const EMPTY: ClipboardFile = { version: 1 };

/**
 * Read the persisted clipboard file. Returns an empty clipboard if the file
 * does not exist or contains unparseable JSON. Missing/corrupt files are
 * treated as empty rather than throwing — clipboard restore is best-effort.
 */
export async function loadClipboard(
	win: Window,
	path?: string,
): Promise<ClipboardFile> {
	try {
		// Use persistence layer if no path provided
		if (!path) {
			const data = await readJson(win, "clipboard");
			if (
				data &&
				typeof data === "object" &&
				(data as ClipboardFile).version === 1
			) {
				return data as ClipboardFile;
			}
			return { ...EMPTY };
		}
		// Legacy fallback for direct path access
		const fsMod = await import("node:fs/promises");
		const raw = await fsMod.readFile(path, "utf-8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && parsed.version === 1) {
			return parsed as ClipboardFile;
		}
		return { ...EMPTY };
	} catch {
		return { ...EMPTY };
	}
}

async function persist(
	win: Window,
	path: string | undefined,
	mutate: (current: ClipboardFile) => ClipboardFile,
): Promise<void> {
	const current = await loadClipboard(win, path);
	const next = mutate(current);
	// Use persistence layer if no path provided
	if (!path) {
		await writeJson(win, "clipboard", next);
		return;
	}
	// Legacy fallback for direct path access
	const fsMod = await import("node:fs/promises");
	await fsMod.writeFile(path, JSON.stringify(next), "utf-8");
}

export async function saveEasing(
	win: Window,
	easing: EasingClipboard,
	path?: string,
): Promise<void> {
	await persist(win, path, (current) => ({ ...current, easing }));
}

export async function saveValues(
	win: Window,
	values: ValuesClipboard,
	path?: string,
): Promise<void> {
	await persist(win, path, (current) => ({ ...current, values }));
}

export async function clearEasing(win: Window, path?: string): Promise<void> {
	await persist(win, path, (current) => {
		const { easing: _e, ...rest } = current;
		return rest;
	});
}

export async function clearValues(win: Window, path?: string): Promise<void> {
	await persist(win, path, (current) => {
		const { values: _v, ...rest } = current;
		return rest;
	});
}
