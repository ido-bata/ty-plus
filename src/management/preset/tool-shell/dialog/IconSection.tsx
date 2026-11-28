import type { JSX } from "react";
import type { Preset } from "@/management/preset/contract";
import { PresetIconEditor } from "@/management/preset/icon/Editor";
import type { PresetIconEditorDraft } from "@/management/preset/icon/editor-state";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph/WorkspaceGlyph";
import { css } from "@/styled-system/css";
import { shellFieldLabelClass } from "../preset-tool-helpers";

const areaClass = css({ minWidth: "0" });

const previewBoxClass = css({
	height: "full",
	width: "full",
});

export type ToolDialogIconSectionProps = {
	iconDraft: PresetIconEditorDraft;
	onIconDraftChange: (next: PresetIconEditorDraft) => void;
	browseDir: string;
	label: string;
	previewPreset: Preset;
};

export function ToolDialogIconSection({
	iconDraft,
	onIconDraftChange,
	browseDir,
	label,
	previewPreset,
}: ToolDialogIconSectionProps): JSX.Element {
	return (
		<div data-preset-tool-area="icon" className={areaClass}>
			<PresetIconEditor
				draft={iconDraft}
				onChange={onIconDraftChange}
				browseDir={browseDir}
				label={label}
				// Issue #793: match the `shellFieldLabelClass` labels used by
				// the sibling fields — the editor's default `sectionLabelClass`
				// (10px) read smaller than File Path / Strategy (12px).
				labelClassName={shellFieldLabelClass}
				preview={
					<FramedPresetGlyph
						preset={previewPreset}
						boxClass={previewBoxClass}
					/>
				}
				showCanvasTab={iconDraft.type === "canvas"}
			/>
		</div>
	);
}
