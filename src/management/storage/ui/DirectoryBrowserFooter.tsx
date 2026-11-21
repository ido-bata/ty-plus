import type { JSX, ReactNode } from "react";

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
	/** `null` means "nothing selected yet" — no summary is rendered. */
	selectedSummary: DirectoryBrowserSummary | null;
	/**
	 * Whether to render the list/icons toggle.  Owners that provide their
	 * own toolbar toggle hide it to avoid duplication.
	 */
	showViewToggle?: boolean;
	/** Extra content rendered between the summary and the view toggle. */
	footerExtra?: ReactNode;
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
	minWidth: 0,
	fontSize: "shell-text-sm",
	color: "text.muted",
});

export function DirectoryBrowserFooter({
	viewMode,
	onViewModeChange,
	showSelectedSummary,
	selectedSummary,
	showViewToggle = true,
	footerExtra,
}: DirectoryBrowserFooterProps): JSX.Element {
	return (
		<div className={footerClass}>
			{showSelectedSummary && selectedSummary ? (
				<div className={summaryWrapClass}>
					<DirectoryBrowserSelectedSummary summary={selectedSummary} />
				</div>
			) : null}
			{footerExtra}
			{showViewToggle ? (
				<DirectoryBrowserViewModeToggle
					viewMode={viewMode}
					onChange={onViewModeChange}
				/>
			) : null}
		</div>
	);
}
