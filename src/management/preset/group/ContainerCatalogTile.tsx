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

const badgeClass = css({
	pointerEvents: "none",
	position: "absolute",
	bottom: "0.5",
	right: "0.5",
	zIndex: "10",
	boxSizing: "border-box",
	minHeight: "3.5",
	minWidth: "3.5",
	borderRadius: "sm",
	backgroundColor: "surface.widget",
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
			<GridCatalogTile preset={props.preset} label={props.label} />
			<span className={badgeClass} aria-hidden>
				{count > 99 ? "99+" : String(count)}
			</span>
		</div>
	);
}
