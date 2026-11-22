import { SegmentedControl } from "@ty-plus/ui";
import type { JSX } from "react";
import type { PresetAddFolderType } from "@/management/preset/catalog-add/archive-types";

const FOLDER_TABS: { id: PresetAddFolderType; label: string }[] = [
	{ id: "presets", label: "Presets" },
	{ id: "scripts", label: "Scripts" },
	{ id: "plugins", label: "Plug-ins" },
	{ id: "other", label: "Other" },
];

export function FolderTabs(props: {
	activeTab: PresetAddFolderType;
	onTabChange: (tab: PresetAddFolderType) => void;
}): JSX.Element {
	const { activeTab, onTabChange } = props;
	return (
		<SegmentedControl
			aria-label="Folder type"
			value={activeTab}
			options={FOLDER_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
			onChange={(next) => {
				onTabChange(next as PresetAddFolderType);
			}}
		/>
	);
}
