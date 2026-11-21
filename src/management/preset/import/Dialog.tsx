import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { readUserHomeOrFallback } from "@/management/preset/catalog-add/browse-start-dir";
import { Dialog } from "@/management/preset/tool-shell/Dialog";

export function ImportDialog(): JSX.Element {
	const { t } = useTranslation("presets");
	return (
		<Dialog
			surfaceId="dialog-import-preset"
			title={t("presetTool.import.title")}
			type="footage"
			description={t("presetTool.import.lead")}
			defaultName={t("presetTool.import.defaultName")}
			iconText={t("presetTool.import.iconText")}
			buildFilePath={(values) => values.path.trim()}
			pathBrowse={{ fieldKey: "path", mode: "file" }}
			resolveBrowseStartDir={readUserHomeOrFallback}
			fields={[
				{
					key: "path",
					label: t("presetTool.import.fields.path"),
					placeholder: t("presetTool.import.pathPlaceholder"),
				},
				{
					key: "strategy",
					label: t("presetTool.import.fields.strategy"),
					defaultValue: "auto",
				},
			]}
			mapPersistData={(v) => ({
				importStrategy: v.strategy?.trim() ?? "auto",
			})}
		/>
	);
}
