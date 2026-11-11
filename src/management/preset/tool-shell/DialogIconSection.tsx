import type { JSX } from "react";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset } from "@/management/preset/contract";
import type { PresetIconEditorDraft } from "@/management/preset/icon-editor";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { css } from "@/styled-system/css";

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
