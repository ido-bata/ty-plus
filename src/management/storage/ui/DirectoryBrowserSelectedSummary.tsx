import { cx } from "@ty-plus/ui";
import type { JSX } from "react";
import { css } from "@/styled-system/css";

const summaryClass = css({
	truncate: true,
	whiteSpace: "nowrap",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

export type DirectoryBrowserSummary =
	| string
	| { files: number; folders: number };

/**
 * Single implementation of the "N files / M folders selected" readout.
 *
 * The kit footer and every owner that renders a selection summary share
 * this component so the wording, the truncation behaviour and the
 * `ty-shell-directory-summary` hook stay identical everywhere.
 */
export function DirectoryBrowserSelectedSummary({
	summary,
}: {
	summary: DirectoryBrowserSummary;
}): JSX.Element {
	if (typeof summary === "string") {
		return (
			<span
				className={cx("ty-shell-directory-summary", summaryClass)}
				title={summary}
			>
				{summary}
			</span>
		);
	}
	const parts: string[] = [];
	if (summary.files > 0) {
		parts.push(`${summary.files} file${summary.files !== 1 ? "s" : ""}`);
	}
	if (summary.folders > 0) {
		parts.push(`${summary.folders} folder${summary.folders !== 1 ? "s" : ""}`);
	}
	return <span className={summaryClass}>{parts.join(" ")} selected</span>;
}
