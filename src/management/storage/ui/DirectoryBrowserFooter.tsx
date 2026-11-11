import type { JSX } from "react";

import { css } from "@/styled-system/css";

import {
	DirectoryBrowserSelectedSummary,
	type DirectoryBrowserSummary,
} from "./DirectoryBrowserSelectedSummary";
import {
	type DirectoryBrowserViewMode,
	DirectoryBrowserViewModeToggle,
} from "./DirectoryBrowserViewModeToggle";

export type DirectoryBrowserFooterProps = {
	viewMode: DirectoryBrowserViewMode;
	onViewModeChange: (mode: DirectoryBrowserViewMode) => void;
	showSelectedSummary: boolean;
	selectedSummary: DirectoryBrowserSummary;
};

const footerClass = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
	backgroundColor: "surface.widget",
	paddingBlock: "0",
	paddingInline: "1",
	flexShrink: 0,
});

const summaryWrapClass = css({
	display: "flex",
	alignItems: "center",
	gap: "3",
	fontSize: "--ty-shell-text-size-sm",
	color: "text.muted",
});

export function DirectoryBrowserFooter({
	viewMode,
	onViewModeChange,
	showSelectedSummary,
	selectedSummary,
}: DirectoryBrowserFooterProps): JSX.Element {
	return (
		<div className={footerClass}>
			{showSelectedSummary && selectedSummary ? (
				<div className={summaryWrapClass}>
					<DirectoryBrowserSelectedSummary summary={selectedSummary} />
				</div>
			) : null}
			<DirectoryBrowserViewModeToggle
				viewMode={viewMode}
				onChange={onViewModeChange}
			/>
		</div>
	);
}
