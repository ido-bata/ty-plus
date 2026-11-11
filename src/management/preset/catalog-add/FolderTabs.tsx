import type { JSX } from "react";
import type { PresetAddFolderType } from "@/management/preset/catalog-add/archive-types";
import { css, cx } from "@/styled-system/css";

const FOLDER_TABS: { id: PresetAddFolderType; label: string }[] = [
	{ id: "presets", label: "Presets" },
	{ id: "scripts", label: "Scripts" },
	{ id: "plugins", label: "Plug-ins" },
	{ id: "other", label: "Other" },
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
					{tab.label}
				</button>
			))}
		</div>
	);
}
