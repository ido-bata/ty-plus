import type { JSX } from "react";

import type { ArchiveIconDraft } from "@/management/preset/catalog-add/archive-icon";
import { iconDraftToPresetIcon } from "@/management/preset/catalog-add/archive-icon";
import { PresetIconEditor } from "@/management/preset/components/IconEditor";
import type { Preset } from "@/management/preset/contract";
import { FramedPresetGlyph } from "@/management/preset/workspace/glyph";

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
			label="Icon"
			preview={
				<FramedPresetGlyph
					preset={
						{
							id: "icon-preview",
							type: "preset",
							title: "Preview",
							filePath: "ty-plus://icon-preview",
							icon: iconDraftToPresetIcon(draft) ?? {
								type: "text",
								param: { text: "?" },
							},
						} satisfies Preset
					}
					boxClass="h-full w-full"
				/>
			}
		/>
	);
}
