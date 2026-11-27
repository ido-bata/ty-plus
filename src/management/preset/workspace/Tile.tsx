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
	// floored for legibility (Issue #522) and capped at 96px. The floor
	// rises to 12px (#751): at the floor the old 8px rendered a speck-
	// sized "?" inside 48px grid cells — 12px keeps the missing-state
	// mark readable while large frames keep the 10% proportion.
	const fontPx = metrics
		? Math.min(96, Math.max(12, metrics.boxWidth * 0.1))
		: 12;
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
