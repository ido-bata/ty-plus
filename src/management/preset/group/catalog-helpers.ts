import type { GroupEntry } from "@/management/preset/group/catalog";

export const collectGroupedMemberPresetIds = (
	groups: readonly GroupEntry[],
): ReadonlySet<string> => {
	const out = new Set<string>();
	for (const g of groups) {
		for (const id of g.presetIds) {
			const t = id.trim();
			if (t) out.add(t);
		}
	}
	return out;
};

export const findGroupEntry = (
	groups: readonly GroupEntry[],
	groupId: string,
): GroupEntry | undefined => {
	const t = groupId.trim();
	if (!t) return undefined;
	return groups.find((g) => g.id.trim() === t);
};
