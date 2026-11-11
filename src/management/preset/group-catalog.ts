/**
 * Group catalog (`groups.json`) — **source of truth** for workspace “group” tiles
 * (membership + stable ids). Normal presets live in `presets.json`; grouped preset
 * sets are not preset rows.
 *
 * New onboarding uses `mergeGroupEntries` with explicit group rows.
 */

import { readGroupJson, writeGroupJson } from "@/management/catalog/json-files";
import type {
	Preset,
	PresetIcon,
	PresetType,
} from "@/management/preset/contract";
import { tryParsePresetIconValue } from "@/management/preset/icon-data";
import { logWorkspace } from "@/management/workspace/onboarding/flow-log";

/**
 * Icon rule filter conditions (AND-combined).
 * When `filter` is undefined, this is the base rule applied to all presets.
 */
export type IconRuleFilter = {
	presetType?: PresetType | readonly PresetType[];
	namePattern?: string; // regex for preset.title
	filePathPattern?: string; // regex for preset.filePath
	specificPresetIds?: readonly string[];
	specificDirectories?: readonly string[];
};

/**
 * Icon rule: matched by filter conditions, then applied to matching presets.
 * Rules are evaluated in array order; last match wins.
 */
export type IconRule = {
	filter?: IconRuleFilter; // when undefined, this is the base rule
	icon: PresetIcon;
};

/**
 * Group entry: wraps multiple presets with optional icons and metadata.
 * Mirrors `Preset` structure where applicable (title, description, descriptionImage, icon).
 */
export type GroupEntry = {
	id: string; // UUID (prefix-less)
	title: string; // was: name
	presetIds: readonly string[];
	description?: string;
	descriptionImage?: string;
	icon?: PresetIcon; // group's own icon
	iconRules?: readonly IconRule[];
};

/** @deprecated Use GroupEntry. */
export type GroupCatalogEntry = GroupEntry;

type GroupFile = {
	version: 1;
	groups: GroupEntry[];
};

const parseGroupRaw = (raw: string | null): GroupFile => {
	if (!raw?.trim()) {
		return { version: 1, groups: [] };
	}
	try {
		const parsed = JSON.parse(raw) as Partial<GroupFile>;
		if (
			parsed &&
			typeof parsed === "object" &&
			parsed.version === 1 &&
			Array.isArray(parsed.groups)
		) {
			return {
				version: 1,
				groups: parsed.groups.flatMap((g) => {
					if (
						!(
							g !== null &&
							typeof g === "object" &&
							typeof (g as GroupEntry).id === "string" &&
							Array.isArray((g as GroupEntry).presetIds)
						)
					)
						return [];
					const group = (() => {
						const rec = g as Record<string, unknown>;

						// title (was: name)
						const titleRaw = rec.title ?? rec.name;
						const title =
							typeof titleRaw === "string" && titleRaw.trim()
								? titleRaw.trim()
								: "Group";

						// description
						const descriptionRaw = rec.description;
						const description =
							typeof descriptionRaw === "string" && descriptionRaw.trim()
								? descriptionRaw.trim()
								: undefined;

						// descriptionImage
						const descriptionImageRaw = rec.descriptionImage;
						const descriptionImage =
							typeof descriptionImageRaw === "string" &&
							descriptionImageRaw.trim()
								? descriptionImageRaw.trim()
								: undefined;

						// icon
						const icon =
							tryParsePresetIconValue(rec.icon as Preset["icon"] | undefined) ??
							undefined;

						// iconRules
						const iconRulesRaw = rec.iconRules;
						const iconRules = Array.isArray(iconRulesRaw)
							? iconRulesRaw
									.filter(
										(r): r is IconRule =>
											r !== null &&
											typeof r === "object" &&
											r.icon !== undefined,
									)
									.map((r) => {
										const ruleRec = r as Record<string, unknown>;
										const filterRaw = ruleRec.filter;
										const filter = isPlainRecord(filterRaw)
											? {
													presetType: filterRaw.presetType,
													namePattern:
														typeof filterRaw.namePattern === "string"
															? filterRaw.namePattern
															: undefined,
													filePathPattern:
														typeof filterRaw.filePathPattern === "string"
															? filterRaw.filePathPattern
															: undefined,
													specificPresetIds: Array.isArray(
														filterRaw.specificPresetIds,
													)
														? filterRaw.specificPresetIds.filter(
																(x): x is string => typeof x === "string",
															)
														: undefined,
													specificDirectories: Array.isArray(
														filterRaw.specificDirectories,
													)
														? filterRaw.specificDirectories.filter(
																(x): x is string => typeof x === "string",
															)
														: undefined,
												}
											: undefined;
										return {
											...(filter ? { filter } : {}),
											icon: tryParsePresetIconValue(ruleRec.icon as PresetIcon),
										} as IconRule;
									})
							: undefined;

						return {
							id: String((g as GroupEntry).id).trim(),
							title,
							presetIds: (g as GroupEntry).presetIds.flatMap((x) => {
								if (typeof x !== "string") return [];
								const id = x.trim();
								return id ? [id] : [];
							}),
							...(description ? { description } : {}),
							...(descriptionImage ? { descriptionImage } : {}),
							...(icon ? { icon } : {}),
							...(iconRules && iconRules.length > 0 ? { iconRules } : {}),
						};
					})();
					return group.id.length > 0 ? [group] : [];
				}),
			};
		}
	} catch {
		/* ignore */
	}
	return { version: 1, groups: [] };
};

function isPlainRecord(v: unknown): v is Record<string, unknown> {
	return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Parsed `groups.json` rows (source of truth for workspace “group” tiles). */
export const parseGroupFromText = (raw: string | null): readonly GroupEntry[] =>
	parseGroupRaw(raw).groups;

/** Merge one group row into `groups.json` (by id). */
export const upsertGroupEntry = async (
	win: Window,
	entry: GroupEntry,
): Promise<void> => {
	const existingText = await readGroupJson(win);
	const catalog = parseGroupRaw(existingText);
	const byId = new Map(catalog.groups.map((g) => [g.id, g]));
	byId.set(entry.id, {
		id: entry.id,
		title: entry.title.trim() || "Group",
		presetIds: [...entry.presetIds],
		...(entry.description ? { description: entry.description.trim() } : {}),
		...(entry.descriptionImage
			? { descriptionImage: entry.descriptionImage.trim() }
			: {}),
		...(entry.icon ? { icon: entry.icon } : {}),
		...(entry.iconRules && entry.iconRules.length > 0
			? { iconRules: entry.iconRules }
			: {}),
	});
	const next: GroupFile = {
		version: 1,
		groups: [...byId.values()],
	};
	await writeGroupJson(win, `${JSON.stringify(next, null, 2)}\n`);
};

/** Remove a group row from `groups.json` by id (no-op if missing). */
export const removeGroupEntry = async (
	win: Window,
	groupId: string,
): Promise<void> => {
	const id = groupId.trim();
	if (!id) return;
	const existingText = await readGroupJson(win);
	const catalog = parseGroupRaw(existingText);
	const next: GroupFile = {
		version: 1,
		groups: catalog.groups.filter((g) => g.id !== id),
	};
	await writeGroupJson(win, `${JSON.stringify(next, null, 2)}\n`);
};

/**
 * Remove a preset id from a group row in `groups.json`.
 * If the group is missing or the preset is not a member, this is a no-op.
 */
export const removePresetFromGroupEntry = async (
	win: Window,
	groupId: string,
	presetId: string,
): Promise<void> => {
	const gid = groupId.trim();
	const pid = presetId.trim();
	if (!gid || !pid) return;
	const existingText = await readGroupJson(win);
	const catalog = parseGroupRaw(existingText);
	let changed = false;
	const nextGroups = catalog.groups.map((g) => {
		if (g.id !== gid) return g;
		const nextPresetIds = g.presetIds.filter((id) => id.trim() !== pid);
		if (nextPresetIds.length === g.presetIds.length) {
			return g;
		}
		changed = true;
		return {
			...g,
			presetIds: nextPresetIds,
		};
	});
	if (!changed) return;
	const next: GroupFile = {
		version: 1,
		groups: nextGroups,
	};
	await writeGroupJson(win, `${JSON.stringify(next, null, 2)}\n`);
};

export const reorderPresetInGroupEntry = async (
	win: Window,
	groupId: string,
	fromIndex: number,
	toIndex: number,
): Promise<void> => {
	const gid = groupId.trim();
	if (!gid) return;
	const existingText = await readGroupJson(win);
	const catalog = parseGroupRaw(existingText);
	let changed = false;
	const nextGroups = catalog.groups.map((g) => {
		if (g.id !== gid) return g;
		if (
			fromIndex < 0 ||
			fromIndex >= g.presetIds.length ||
			toIndex < 0 ||
			toIndex >= g.presetIds.length ||
			fromIndex === toIndex
		) {
			return g;
		}
		const nextPresetIds = [...g.presetIds];
		const [item] = nextPresetIds.splice(fromIndex, 1);
		if (!item) return g;
		nextPresetIds.splice(toIndex, 0, item);
		changed = true;
		return { ...g, presetIds: nextPresetIds };
	});
	if (!changed) return;
	const next: GroupFile = { version: 1, groups: nextGroups };
	await writeGroupJson(win, `${JSON.stringify(next, null, 2)}\n`);
};

/** Merge explicit workspace group rows into `groups.json` (by id). */
export const mergeGroupEntries = async (
	win: Window,
	entries: readonly GroupEntry[],
): Promise<void> => {
	if (entries.length === 0) {
		return;
	}
	logWorkspace("mergeGroupEntries", {
		incomingGroupCount: entries.length,
	});
	const existingText = await readGroupJson(win);
	const catalog = parseGroupRaw(existingText);
	const byId = new Map(catalog.groups.map((g) => [g.id, g]));
	for (const g of entries) {
		byId.set(g.id, {
			id: g.id,
			title: g.title.trim() || "Group",
			presetIds: [...g.presetIds],
			...(g.description ? { description: g.description.trim() } : {}),
			...(g.descriptionImage
				? { descriptionImage: g.descriptionImage.trim() }
				: {}),
			...(g.icon ? { icon: g.icon } : {}),
			...(g.iconRules && g.iconRules.length > 0
				? { iconRules: g.iconRules }
				: {}),
		});
	}
	const next: GroupFile = {
		version: 1,
		groups: [...byId.values()],
	};
	await writeGroupJson(win, `${JSON.stringify(next, null, 2)}\n`);
};
