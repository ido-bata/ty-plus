import type { JSX } from "react";
import { css } from "@/styled-system/css";

const summaryClass = css({
	truncate: true,
	whiteSpace: "nowrap",
});

export type DirectoryBrowserSummary =
	| string
	| { files: number; folders: number };

export function DirectoryBrowserSelectedSummary({
	summary,
}: {
	summary: DirectoryBrowserSummary;
}): JSX.Element {
	if (typeof summary === "string") {
		return (
			<span
				className={`ty-shell-directory-summary ${summaryClass}`}
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
	return <span>{parts.join(" ")} selected</span>;
}
