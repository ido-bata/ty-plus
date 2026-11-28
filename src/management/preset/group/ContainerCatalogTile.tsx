import type { JSX } from "react";
import type { Preset } from "@/management/preset/contract";
import { memberCountFromGroupPreset } from "@/management/preset/group/synthesize";
import { GridCatalogTile } from "@/management/preset/workspace/GridCatalogTile";
import { css } from "@/styled-system/css";

const tileClass = css({
	position: "relative",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
});

// The shared placement ring (`ws.gridcell-ring-border`) is darker than
// `surface.widget`, so on the dark canvas the tile edge all but disappears.
// Paint the catalog tile's own keyline one hairline inside that ring; the
// ring stays the selection/hover chrome, this line keeps the tile readable
// when the frame is absent (stories, host-free surfaces).
const tileSurfaceClass = css({
	position: "absolute",
	inset: "px",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
});

const badgeClass = css({
	pointerEvents: "none",
	position: "absolute",
	bottom: "0.5",
	right: "0.5",
	zIndex: "var(--ty-z-overlay)",
	boxSizing: "border-box",
	display: "flex",
	minHeight: "3.5",
	minWidth: "3.5",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "full",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	backgroundColor: "surface.dialog",
	paddingInline: "0.5",
	textAlign: "center",
	fontSize: "2xs",
	fontWeight: "semibold",
	lineHeight: "1",
	color: "text.primary",
	fontVariantNumeric: "tabular-nums",
});

/**
 * Workspace group **container** tile: normal catalog glyph + member count badge.
 */
export function GroupContainerCatalogTile(props: {
	preset: Preset;
	label: string;
}): JSX.Element {
	const count = memberCountFromGroupPreset(props.preset);
	return (
		<div className={tileClass}>
			<div className={tileSurfaceClass}>
				<GridCatalogTile preset={props.preset} label={props.label} />
				<span className={badgeClass} aria-hidden data-member-count-badge>
					{count > 99 ? "99+" : String(count)}
				</span>
			</div>
		</div>
	);
}
