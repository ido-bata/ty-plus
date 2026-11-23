import { SegmentedControl } from "@ty-plus/ui";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import type { PresetAddFolderType } from "@/management/preset/catalog-add/archive-types";

const FOLDER_TABS: { id: PresetAddFolderType; labelKey: string }[] = [
	{ id: "presets", labelKey: "widgets:folderDirectoryPicker.tab.presets" },
	{ id: "scripts", labelKey: "widgets:folderDirectoryPicker.tab.scripts" },
	{ id: "plugins", labelKey: "widgets:folderDirectoryPicker.tab.plugins" },
	{ id: "other", labelKey: "widgets:folderDirectoryPicker.tab.other" },
];

export function FolderTabs(props: {
	activeTab: PresetAddFolderType;
	onTabChange: (tab: PresetAddFolderType) => void;
}): JSX.Element {
	const { activeTab, onTabChange } = props;
	return (
		<SegmentedControl
			aria-label={i18n.t("presets:catalogAdd.folderTypeAria")}
			value={activeTab}
			options={FOLDER_TABS.map((tab) => ({
				value: tab.id,
				label: i18n.t(tab.labelKey),
			}))}
			onChange={(next) => {
				onTabChange(next as PresetAddFolderType);
			}}
		/>
	);
}
