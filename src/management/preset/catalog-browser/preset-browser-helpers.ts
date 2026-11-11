import type { Preset } from "@/management/preset/contract";
import type { GroupEntry } from "@/management/preset/group-catalog";
import { stripKnownIdPrefixes } from "@/management/storage/ids";

function basenamePath(p: string): string {
	const t = p.replace(/\\/g, "/").replace(/\/+$/, "");
	const i = t.lastIndexOf("/");
	return i >= 0 ? t.slice(i + 1) : t || "—";
}

function matchesPresetQuery(preset: Preset, q: string): boolean {
	const t = q.trim().toLowerCase();
	if (!t) {
		return true;
	}
	return (
		preset.id.toLowerCase().includes(t) ||
		(preset.title ?? "").toLowerCase().includes(t) ||
		preset.type.toLowerCase().includes(t) ||
		preset.filePath.toLowerCase().includes(t)
	);
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

function groupWorkspaceSummary(
	group: GroupEntry,
	groupLoc: ReadonlyMap<string, readonly string[]>,
): string {
	const tags =
		groupLoc.get(group.id) ??
		groupLoc.get(stripKnownIdPrefixes(String(group.id ?? "").trim()));
	if (tags?.length) {
		return `Workspace: ${tags.join(", ")}`;
	}
	return "Workspace: not placed";
}

function sourceLine(preset: Preset): string {
	return `${preset.type} · ${basenamePath(preset.filePath)}`;
}
