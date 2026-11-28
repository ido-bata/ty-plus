import type { JSX } from "react";
import type { Preset } from "@/management/preset/contract";
import {
	catalogTileFrameClass,
	catalogTileSurfaceClass,
} from "@/management/preset/group/catalog-tile-surface";
import { memberCountFromGroupPreset } from "@/management/preset/group/synthesize";
import { GridCatalogTile } from "@/management/preset/workspace/GridCatalogTile";
import { css } from "@/styled-system/css";

const badgeClass = css({
	pointerEvents: "none",
	position: "absolute",
	// Issue #794: the badge used to hug the tile corner (2px inset) at
	// 10px type — unreadable at capture size and crowded against the
	// tile border. A 4px inset, 12px tabular type and a slightly wider
	// pill keep "0"/"5"/"99+" legible.
	bottom: "1",
	right: "1",
	zIndex: "var(--ty-z-overlay)",
	boxSizing: "border-box",
	display: "flex",
	minHeight: "4",
	minWidth: "4",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "full",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.dialog",
	paddingInline: "1",
	textAlign: "center",
	fontSize: "xs",
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
		<div className={catalogTileFrameClass}>
			<div className={catalogTileSurfaceClass}>
				<GridCatalogTile preset={props.preset} label={props.label} />
				<span className={badgeClass} aria-hidden data-member-count-badge>
					{count > 99 ? "99+" : String(count)}
				</span>
			</div>
		</div>
	);
}
