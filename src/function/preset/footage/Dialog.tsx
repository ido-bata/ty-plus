import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { readUserHomeOrFallback, ToolDialog } from "@/management/preset";

export function Dialog(): JSX.Element {
	const { t } = useTranslation("presets");
	return (
		<ToolDialog
			surfaceId="dialog-footage-preset"
			title={t("presetTool.footage.title")}
			type="footage"
			description={t("presetTool.footage.lead")}
			defaultName={t("presetTool.footage.defaultName")}
			iconText="MEDIA"
			buildFilePath={(values) => values.path.trim()}
			pathBrowse={{ fieldKey: "path", mode: "file" }}
			resolveBrowseStartDir={readUserHomeOrFallback}
			fields={[
				{
					key: "path",
					label: t("presetTool.footage.fields.path"),
					placeholder: "C:\\path\\asset.mov",
				},
				{
					key: "mode",
					label: t("presetTool.footage.fields.mode"),
					defaultValue: "footage",
				},
			]}
			mapPersistData={(v) => ({
				footageImportMode: v.mode?.trim() ?? "footage",
			})}
		/>
	);
}
