import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import type { PresetAddFolderType } from "@/management/preset/catalog-add/archive-types";
import { css, cx } from "@/styled-system/css";

const FOLDER_TABS: { id: PresetAddFolderType; labelKey: string }[] = [
	{ id: "presets", labelKey: "widgets:folderDirectoryPicker.tab.presets" },
	{ id: "scripts", labelKey: "widgets:folderDirectoryPicker.tab.scripts" },
	{ id: "plugins", labelKey: "widgets:folderDirectoryPicker.tab.plugins" },
	{ id: "other", labelKey: "widgets:folderDirectoryPicker.tab.other" },
];

const folderTabsBaseClass = css({
	height: "7",
	minWidth: "0",
	flex: "1",
	borderRadius: "shell-sm",
	paddingInline: "2",
	fontSize: "shell-text-sm",
	lineHeight: "tight",
	transitionProperty: "colors",
});

const folderTabsActiveClass = css({
	backgroundColor: "text.accent",
	color: "surface.panel",
	boxShadow: "sm",
});

const folderTabsInactiveClass = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "interactive.hover",
		color: "text.primary",
	},
});

const FOLDER_TAB_CLASS = (active: boolean): string =>
	cx(
		folderTabsBaseClass,
		active ? folderTabsActiveClass : folderTabsInactiveClass,
	);

const folderTabsRowClass = css({
	display: "inline-flex",
	width: "full",
	minWidth: "0",
	maxWidth: "full",
	flexWrap: "wrap",
	gap: "1",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "0.5",
});

export function FolderTabs(props: {
	activeTab: PresetAddFolderType;
	onTabChange: (tab: PresetAddFolderType) => void;
}): JSX.Element {
	const { activeTab, onTabChange } = props;
	return (
		<div className={folderTabsRowClass}>
			{FOLDER_TABS.map((tab) => (
				<button
					key={tab.id}
					type="button"
					className={FOLDER_TAB_CLASS(activeTab === tab.id)}
					onClick={() => onTabChange(tab.id)}
				>
					{i18n.t(tab.labelKey)}
				</button>
			))}
		</div>
	);
}
