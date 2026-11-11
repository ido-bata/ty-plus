import type { Preset, PresetType } from "@/management/preset/contract";
import type { QuickActionRootFileRow } from "./types";

const PRESET_TYPE_ORDER: PresetType[] = [
	"preset",
	"script",
	"plugin",
	"footage",
];

const EFFECT_SORT_ORDER = 100;

export const rootFilePresetType = (row: QuickActionRootFileRow): PresetType =>
	row.type === "script" || row.type === "plugin" ? row.type : "preset";

const isGroupFolderRow = (p: Preset): boolean =>
	Array.isArray((p.data as { presetIds?: unknown } | undefined)?.presetIds);

const presetHaystack = (p: Preset, typeLabel: string): string =>
	`${p.title}\n${p.filePath}\n${p.type}\n${typeLabel}`.toLowerCase();

const effectHaystack = (e: {
	displayName: string;
	matchName: string;
	filePath: string;
}): string => `${e.displayName}\n${e.matchName}\n${e.filePath}`.toLowerCase();

const fileHaystack = (
	rf: QuickActionRootFileRow,
	anchorLabel: string,
): string => `${rf.title}\n${rf.filePath}\n${anchorLabel}`.toLowerCase();

const scoreHaystack = (hay: string, q: string): number => {
	if (!q) return 1;
	if (hay.includes(q)) return 2;
	const parts = q.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return 1;
	const hayTokens = new Set(hay.split(/\s+/).filter(Boolean));
	let s = 0;
	for (const w of parts) {
		if (hayTokens.has(w)) s += 1;
	}
	return s;
};
