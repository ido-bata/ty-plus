/**
 * Workspace tile chrome shared by the placement grid (`GridTile`) and
 * host-free preset surfaces (e.g. the Web LP demo via `PresetTileButton`).
 * Pure presentation: positioning stays with the caller via `style`.
 */

import { cx } from "@ty-plus/ui";
import type { CSSProperties, JSX, ReactNode } from "react";
import { css } from "@/styled-system/css";

const tileShell = css({
	position: "relative",
	boxSizing: "border-box",
	minHeight: "0",
	minWidth: "0",
	userSelect: "none",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	color: "text.primary",
});

const tileInner = css({
	position: "absolute",
	inset: "0",
	zIndex: "0",
	minHeight: "0",
	minWidth: "0",
	overflow: "hidden",
	borderRadius: "shell-sm",
});

const tileFrameSelected = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-ws-gridcell-ring-border-selected)",
});

const tileFrameDefault = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "var(--color-ty-ws-gridcell-ring-border)",
});

const tileFrameOverlay = css({
	pointerEvents: "none",
	position: "absolute",
	inset: "0",
	zIndex: "1",
	boxSizing: "border-box",
	borderRadius: "shell-sm",
	borderStyle: "solid",
	transitionProperty: "border-color",
	transitionDuration: "100ms",
	transitionTimingFunction: "ease-out",
});

export type WorkspaceTileFrameProps = {
	selected?: boolean;
	style?: CSSProperties;
	/** Host integration attributes (e.g. `ATTR_*` markers). */
	attrs?: Record<string, string>;
	className?: string;
	children: ReactNode;
};

export function WorkspaceTileFrame(
	props: WorkspaceTileFrameProps,
): JSX.Element {
	const { selected = false, style, attrs, className, children } = props;
	const frameBorder = selected ? tileFrameSelected : tileFrameDefault;

	return (
		<div {...attrs} className={cx(tileShell, className)} style={style}>
			<div className={tileInner}>{children}</div>
			<div aria-hidden className={cx(tileFrameOverlay, frameBorder)} />
		</div>
	);
}
