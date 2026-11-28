import type { CSSProperties, JSX } from "react";
import { SECTION_LABEL_CLASS } from "@/management/workspace/background/constants";
import { css } from "@/styled-system/css";

const root = css({
	display: "grid",
	height: "full",
	minHeight: "0",
	width: "full",
	gridTemplateRows: "auto minmax(0,1fr)",
	gap: "1",
	borderTopWidth: "hairline",
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
	borderWidth: "hairline",
	borderStyle: "solid",
	// Issue #795: passive chrome rests on `border.subtle`; the previous
	// `--color-ty-widget-border` (#0e0e0e) was darker than the dialog
	// surface, so the preview bounds dissolved into the panel — worst when
	// the composed background itself was near-black.
	borderColor: "border.subtle",
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
				<span className={SECTION_LABEL_CLASS}>
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
