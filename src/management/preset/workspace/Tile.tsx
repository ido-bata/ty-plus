import type { CSSProperties, JSX } from "react";
import { useEffect, useRef } from "react";
import { logCatalogTileDisplay } from "@/management/catalog-tile-display-log";
import type { Preset } from "@/management/preset/contract";
import { useFrameMetrics } from "@/management/preset/frame-fit";
import {
	PresetCatalogGlyphHost,
	WorkspacePresetGlyph,
} from "@/management/preset/workspace/glyph/WorkspaceGlyph";
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
	fontSize: "var(--missing-glyph-font-px)",
});

/**
 * Missing-preset "?" mark. Owns its frame measurement so the hook mounts
 * with the shell (the branch only renders when `preset` is undefined).
 */
function MissingGlyph(): JSX.Element {
	const shellRef = useRef<HTMLSpanElement>(null);
	const metrics = useFrameMetrics(shellRef);
	// Old `clamp(8px, 10cqi, 96px)`: 10% of the frame's inline size,
	// floored at 8px for legibility (Issue #522) and capped at 96px.
	const fontPx = metrics
		? Math.min(96, Math.max(8, metrics.boxWidth * 0.1))
		: 8;
	return (
		<span
			ref={shellRef}
			data-ws-preset-text-fit="scale"
			className={`ws-preset-icon ws-preset-icon--text ${missingIconClass}`}
			aria-hidden="true"
		>
			<span
				className={missingLabelClass}
				style={
					{
						"--missing-glyph-font-px": `${fontPx}px`,
					} as CSSProperties
				}
			>
				?
			</span>
		</span>
	);
}

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
			{preset ? <WorkspacePresetGlyph preset={preset} /> : <MissingGlyph />}
		</PresetCatalogGlyphHost>
	);
}
