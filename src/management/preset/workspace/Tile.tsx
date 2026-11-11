import type { CSSProperties, JSX } from "react";
import { useEffect } from "react";
import { logCatalogTileDisplay } from "@/management/catalog-tile-display-log";
import type { Preset } from "@/management/preset/contract";
import {
	PresetCatalogGlyphHost,
	WorkspacePresetGlyph,
} from "@/management/preset/workspace/glyph";
import { css } from "@/styled-system/css";

const missingIconClass = css({
	boxSizing: "border-box",
	display: "flex",
	height: "full",
	minHeight: "0",
	width: "full",
	minWidth: "0",
	cursor: "pointer",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
	padding: "0.5px",
	fontWeight: "medium",
	color: "text.primary",
});

const missingLabelClass = css({
	display: "inline-block",
	maxWidth: "full",
	minWidth: "0",
	cursor: "pointer",
	whiteSpace: "nowrap",
	textAlign: "center",
	lineHeight: "none",
	color: "text.primary",
});

export function Tile({
	preset,
	label,
	onHoverChange,
}: {
	preset: Preset | undefined;
	label: string;
	onHoverChange?: (presetId: string | null) => void;
}): JSX.Element {
	useEffect(() => {
		if (!preset) {
			logCatalogTileDisplay("receive", "preset-tile-missing-row", { label });
		}
	}, [label, preset]);
	const presetId = preset?.id?.trim() ? preset.id.trim() : null;
	return (
		<PresetCatalogGlyphHost
			title={label}
			{...(presetId ? { "data-preset-id": presetId } : {})}
			onPointerEnter={() => {
				if (presetId) onHoverChange?.(presetId);
			}}
			onPointerLeave={() => {
				if (presetId) onHoverChange?.(null);
			}}
		>
			{preset ? (
				<WorkspacePresetGlyph preset={preset} />
			) : (
				<span
					data-ws-preset-text-fit="scale"
					className={`ws-preset-icon ws-preset-icon--text ${missingIconClass}`}
					aria-hidden="true"
				>
					<span
						className={missingLabelClass}
						style={{ fontSize: "clamp(4px, 10cqi, 96px)" } as CSSProperties}
					>
						?
					</span>
				</span>
			)}
		</PresetCatalogGlyphHost>
	);
}
