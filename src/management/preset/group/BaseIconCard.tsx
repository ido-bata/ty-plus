import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset } from "@/management/preset/contract";
import type { PresetIconEditorDraft } from "@/management/preset/icon-editor";
import { presetIconDraftToPresetIcon } from "@/management/preset/icon-editor";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { glyphBoxFillClass } from "@/management/preset/workspace/glyph-classes";
import { css } from "@/styled-system/css";

const cardClass = css({
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	padding: "3",
});

const headerClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
});

const labelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

const editorHostClass = css({
	marginTop: "3",
});

export function BaseIconCard({
	baseIconDraft,
	onBaseIconDraftChange,
}: {
	baseIconDraft: PresetIconEditorDraft;
	onBaseIconDraftChange: (next: PresetIconEditorDraft) => void;
}): JSX.Element {
	return (
		<div className={cardClass}>
			<div className={headerClass}>
				<span className={labelClass}>
					{i18n.t("presets:group.baseIcon.heading")}
				</span>
			</div>
			<div className={editorHostClass}>
				<PresetIconEditor
					draft={baseIconDraft}
					onChange={onBaseIconDraftChange}
					label={i18n.t("presets:group.baseIcon.label")}
					browseDir={readUserHomeOrFallback()}
					framed={true}
					preview={
						<FramedPresetGlyph
							preset={
								{
									id: "base-icon-preview",
									type: "preset" as const,
									// i18n-exempt: synthetic preset record title for the glyph preview, never rendered as a label
									title: "Preview",
									filePath: "ty-plus://base-icon-preview",
									icon: presetIconDraftToPresetIcon(baseIconDraft) ?? {
										type: "text",
										param: { text: "?" },
									},
								} satisfies Preset
							}
							boxClass={glyphBoxFillClass}
						/>
					}
				/>
			</div>
		</div>
	);
}
