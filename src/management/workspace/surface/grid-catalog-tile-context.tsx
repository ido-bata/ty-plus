import { createContext, type JSX, type ReactNode, useContext } from "react";
import { logCatalogTileDisplay } from "@/management/catalog-tile-display-log";
import type { Preset } from "@/management/preset/contract";
import { css } from "@/styled-system/css";

/** Props for rendering a non-widget catalog cell (preset / group / unknown). */
export type CatalogTileBodyProps = {
	preset: Preset | undefined;
	label: string;
	tileId: string;
};

export type CatalogTileBodyRenderer = (
	props: CatalogTileBodyProps,
) => ReactNode;

const fallbackCard = css({
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	paddingInline: "1",
	textAlign: "center",
	fontSize: "text-2xs",
	color: "text.muted",
});

const fallbackLabel = css({
	lineClamp: 2,
	overflow: "hidden",
	wordBreak: "break-all",
});

const defaultRenderCatalogTileBody: CatalogTileBodyRenderer = ({
	label,
	tileId,
	preset,
}) => {
	logCatalogTileDisplay("receive", "default-body-renderer-fallback", {
		tileId,
		label,
		hasPresetRow: Boolean(preset),
		presetId: preset?.id,
		hint: "GridCatalogTileBodyProvider is not on the outside, or render was not passed",
	});
	return (
		<div className={fallbackCard} title={tileId}>
			<span className={fallbackLabel}>{label}</span>
		</div>
	);
};

const CatalogTileBodyContext = createContext<CatalogTileBodyRenderer>(
	defaultRenderCatalogTileBody,
);

/**
 * Host integration: workspace `Grid` owns placement shells; product-specific
 * preset catalog chrome (icons, etc.) is supplied here from `panel` / `preset`.
 */
export function GridCatalogTileBodyProvider(props: {
	children: ReactNode;
	render: CatalogTileBodyRenderer;
}): JSX.Element {
	return (
		<CatalogTileBodyContext.Provider value={props.render}>
			{props.children}
		</CatalogTileBodyContext.Provider>
	);
}

export function useGridCatalogTileBody(): CatalogTileBodyRenderer {
	return useContext(CatalogTileBodyContext);
}
