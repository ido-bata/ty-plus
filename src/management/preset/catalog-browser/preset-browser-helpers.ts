import type { Preset } from "@/management/preset/contract";
import type { GroupEntry } from "@/management/preset/group/catalog";
import { stripKnownIdPrefixes } from "@/management/storage/ids";

/**
 * Display name of a preset file: the last path segment, or an em dash
 * when the path carries no segment.
 */
export function basenamePath(p: string): string {
	const t = p.replace(/\\/g, "/").replace(/\/+$/, "");
	const i = t.lastIndexOf("/");
	return i >= 0 ? t.slice(i + 1) : t || "—";
}

export function presetWorkspaceSummary(
	preset: Preset,
	presetLoc: ReadonlyMap<string, readonly string[]>,
	groupLoc: ReadonlyMap<string, readonly string[]>,
	presetToGroupId: ReadonlyMap<string, string>,
	groupsById: ReadonlyMap<string, GroupEntry>,
): string {
	const own =
		presetLoc.get(preset.id) ??
		presetLoc.get(stripKnownIdPrefixes(String(preset.id ?? "").trim()));
	if (own?.length) {
		return `Workspace: ${own.join(", ")}`;
	}
	const gid =
		presetToGroupId.get(preset.id) ??
		presetToGroupId.get(stripKnownIdPrefixes(String(preset.id ?? "").trim()));
	if (gid) {
		const gTags =
			groupLoc.get(gid) ??
			groupLoc.get(stripKnownIdPrefixes(String(gid).trim()));
		if (gTags?.length) {
			const g = groupsById.get(gid);
			const label = g?.title?.trim() || gid;
			return `Workspace: ${gTags.join(", ")} (group "${label}")`;
		}
	}
	return "Workspace: not placed";
}
