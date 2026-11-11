import {
	createPresetIconDraft,
	PRESET_ICON_TEXT_MAX,
	type PresetIconEditorDraft,
	presetIconDraftToPresetIcon,
} from "@/management/preset/icon-editor";

export type ArchiveIconDraft = PresetIconEditorDraft;

const MAX_ARCHIVE_ICON_TEXT = PRESET_ICON_TEXT_MAX;

export const createArchiveIconDraft = createPresetIconDraft;

export { presetIconDraftToPresetIcon as iconDraftToPresetIcon };
