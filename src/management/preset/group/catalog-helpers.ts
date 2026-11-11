import type { GroupEntry } from "@/management/preset/group-catalog";

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

const reorderLinearIds = (
	ids: readonly string[],
	fromIndex: number,
	toIndex: number,
): string[] => {
	if (fromIndex === toIndex) return [...ids];
	const next = [...ids];
	const [item] = next.splice(fromIndex, 1);
	if (item === undefined) return [...ids];
	next.splice(toIndex, 0, item);
	return next;
};
