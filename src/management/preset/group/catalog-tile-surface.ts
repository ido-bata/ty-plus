import { css } from "@/styled-system/css";

// The shared placement ring (`ws.gridcell-ring-border`) is darker than
// `surface.widget`, so on the dark canvas the tile edge all but disappears.
// Paint the catalog tile's own keyline one hairline inside that ring; the
// ring stays the selection/hover chrome, this line keeps the tile readable
// when the frame is absent (stories, host-free surfaces). Shared by
// `GroupContainerCatalogTile` and the preset/unknown branch of
// `WorkspaceCatalogTileBody` so every catalog tile paints the same
// surface — kept in a non-component module because Fast Refresh only
// tolerates component exports from `.tsx` files (react-doctor
// `only-export-components`, issue #794).
export const catalogTileFrameClass = css({
	position: "relative",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
});

export const catalogTileSurfaceClass = css({
	position: "absolute",
	inset: "px",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
});
