import {
	createPresetIconDraft,
	type PresetIconEditorDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon/editor-state";

export type ArchiveIconDraft = PresetIconEditorDraft;

export const createArchiveIconDraft = createPresetIconDraft;

export { presetIconDraftToPresetIcon as iconDraftToPresetIcon };
