import type { PresetType } from "@/management/preset/contract";
import type {
	IconRule,
	IconRuleFilter,
} from "@/management/preset/group-catalog";
import type { PresetIconEditorDraft } from "@/management/preset/icon-editor";
import { presetIconDraftToPresetIcon } from "@/management/preset/icon-editor";

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type ConditionRule = {
	id: string;
	filterType: "name" | "path" | "preset" | "presetType";
	pattern: string;
	matchMode?: "regex" | "contains" | "startsWith" | "endsWith";
	presetType?: PresetType;
	draft: PresetIconEditorDraft;
};

const buildConditionIconRules = (
	rules: readonly ConditionRule[],
): IconRule[] => {
	return rules.flatMap<IconRule>((r) => {
		const icon = presetIconDraftToPresetIcon(r.draft);
		let filter: IconRuleFilter | undefined;
		if (r.filterType === "name" && r.pattern.trim())
			filter = { namePattern: r.pattern.trim() };
		if (r.filterType === "path" && r.pattern.trim())
			filter = { filePathPattern: r.pattern.trim() };
		if (r.filterType === "preset" && r.pattern.trim())
			filter = {
				specificPresetIds: r.pattern.split(/\s*,\s*/).filter(Boolean),
			};
		if (r.filterType === "presetType" && r.presetType)
			filter = { presetType: r.presetType };
		if (icon && filter) return [{ filter, icon }];
		if (icon) return [{ icon }];
		return [];
	});
};
