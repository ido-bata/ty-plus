import type { CSSProperties, JSX } from "react";
import { FIELD_LABEL_CLASS } from "@/management/workspace/background/constants";
import { css } from "@/styled-system/css";

const root = css({
	display: "grid",
	height: "full",
	minHeight: "0",
	width: "full",
	gridTemplateRows: "auto minmax(0,1fr)",
	gap: "1",
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "var(--color-ty-widget-border)",
	paddingTop: "2",
});

const headerRow = css({
	display: "grid",
	gridTemplateColumns: "minmax(0,1fr) auto",
	alignItems: "center",
	gap: "2",
});

const statusText = css({
	minWidth: "0",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	textAlign: "right",
	fontSize: "text-xs",
	color: "text.muted",
});

const previewBox = css({
	height: "full",
	minHeight: "20",
	width: "full",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-widget-border)",
	backgroundColor: "surface.panel",
});

export function BackgroundPreview(props: {
	previewStyle: CSSProperties;
	status: string;
	t: (key: string) => string;
}): JSX.Element {
	const { previewStyle, status, t } = props;
	return (
		<div className={root}>
			<div className={headerRow}>
				<span className={FIELD_LABEL_CLASS}>
					{t("workspaceShell.backgroundPanel.preview")}
				</span>
				<span className={statusText}>{status}</span>
			</div>
			<div
				className={previewBox}
				style={previewStyle}
				title={t("workspaceShell.backgroundPanel.preview")}
			/>
		</div>
	);
}
