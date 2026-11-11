import type { Preset } from "@/management/preset/contract";

const PRESET_DIALOG_REQUEST_EVENT = "com.typlus.presetDialog.request";

export type PresetDialogRequest =
	| {
			action: "open-create";
			surfaceId: string;
			params?: Record<string, unknown>;
	  }
	| {
			action: "open-edit";
			presetId: string;
	  };

type PresetDialogMetadata = {
	authoringDialog?: string;
	editDialog?: string;
};

function readPresetDialogMetadata(
	preset: Pick<Preset, "data">,
): PresetDialogMetadata {
	const data = preset.data ?? {};
	const authoringDialog =
		typeof data.authoringDialog === "string" ? data.authoringDialog.trim() : "";
	const editDialog =
		typeof data.editDialog === "string" ? data.editDialog.trim() : "";
	return {
		...(authoringDialog ? { authoringDialog } : {}),
		...(editDialog ? { editDialog } : {}),
	};
}
