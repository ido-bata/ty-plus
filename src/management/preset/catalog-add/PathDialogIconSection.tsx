import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import type { ArchiveIconDraft } from "@/management/preset/catalog-add/archive-icon";
import { iconDraftToPresetIcon } from "@/management/preset/catalog-add/archive-icon";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset } from "@/management/preset/contract";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";
import { glyphBoxFillClass } from "@/management/preset/workspace/glyph-classes";

export function PathDialogIconSection(props: {
	draft: ArchiveIconDraft;
	onChange: (next: ArchiveIconDraft) => void;
	browseDir: string;
}): JSX.Element {
	const { draft, onChange, browseDir } = props;
	return (
		<PresetIconEditor
			draft={draft}
			onChange={onChange}
			browseDir={browseDir}
			label={i18n.t("presets:catalogAdd.icon")}
			preview={
				<FramedPresetGlyph
					preset={
						{
							id: "icon-preview",
							type: "preset",
							// i18n-exempt: synthetic preset record title for the glyph preview, never rendered as a label
							title: "Preview",
							filePath: "ty-plus://icon-preview",
							icon: iconDraftToPresetIcon(draft) ?? {
								type: "text",
								param: { text: "?" },
							},
						} satisfies Preset
					}
					boxClass={glyphBoxFillClass}
				/>
			}
		/>
	);
}
