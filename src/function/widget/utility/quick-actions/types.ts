import type { Preset, PresetType } from "@/management/preset/contract";

export type PluginEffectIndexRow = {
	filePath: string;
	matchName: string;
	displayName: string;
};

type QuickActionRootSourceKind = "preset" | "script" | "plugin";

export type QuickActionRootFileRow = {
	id: string;
	type: PresetType;
	title: string;
	filePath: string;
	description?: string;
	descriptionImage?: string;
	icon?: Preset["icon"];
	data?: Record<string, unknown>;
};

type PaletteRow =
	| { kind: "preset"; preset: Preset }
	| { kind: "rootFile"; rootFile: QuickActionRootFileRow }
	| { kind: "effect"; effect: PluginEffectIndexRow };

export type ScoredPaletteRow = PaletteRow & {
	score: number;
	typeOrder: number;
};
