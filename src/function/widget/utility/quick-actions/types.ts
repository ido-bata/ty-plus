import type { Preset, PresetType } from "@/management/preset/contract";
import type { SiblingListingEntry } from "@/management/preset/sibling/thumbnail";

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
	/**
	 * Display-time sidecar image path resolved during the root scan.
	 * Never persisted inside `Preset.icon` (issue #191).
	 */
	siblingImagePath?: string | null;
	data?: Record<string, unknown>;
};

/** Async directory listing used for display-time sibling image resolution. */
export type ThumbnailListDirectory = (
	dirPath: string,
) => Promise<ReadonlyArray<SiblingListingEntry>>;

type PaletteRow =
	| { kind: "preset"; preset: Preset }
	| { kind: "rootFile"; rootFile: QuickActionRootFileRow }
	| { kind: "effect"; effect: PluginEffectIndexRow };

export type ScoredPaletteRow = PaletteRow & {
	score: number;
	typeOrder: number;
};
