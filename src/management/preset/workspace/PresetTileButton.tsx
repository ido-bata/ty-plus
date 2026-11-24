import { Button, cx } from "@ty-plus/ui";
import type { CSSProperties, JSX, MouseEvent } from "react";
import type { Preset } from "@/management/preset/contract";
import {
	PresetCatalogGlyphHost,
	WorkspacePresetGlyph,
} from "@/management/preset/workspace/glyph/WorkspaceGlyph";
import { WorkspaceTileFrame } from "@/management/workspace/surface/TileFrame";
import { css } from "@/styled-system/css";

/**
 * Clickable preset tile: the workspace tile chrome (`WorkspaceTileFrame`)
 * plus the catalog glyph layer (`PresetCatalogGlyphHost` →
 * `WorkspacePresetGlyph`), the same render path as a workspace grid cell.
 *
 * The workspace grid itself keeps its placement-shell interaction model
 * (drag / select / run handled by the surface); this button variant is for
 * catalog-style surfaces that need native button semantics — e.g. the
 * official Web demo. Interaction capabilities beyond `onSelect` /
 * `onHoverChange` are the caller's responsibility.
 */

const root = css({
	position: "relative",
	display: "block",
	width: "full",
	height: "full",
	minHeight: "0",
	minWidth: "0",
});

const frameFill = css({
	height: "full",
	width: "full",
});

const hitArea = css({
	position: "absolute",
	inset: "0",
	padding: "0",
	cursor: "pointer",
	_hover: { backgroundColor: "interactive.hover" },
	// The one focus indicator: the same ring every focusable control paints.
	_focusVisible: {
		boxShadow: "var(--color-focus-ring)",
	},
});

export type PresetTileButtonProps = {
	preset: Preset;
	/** Accessible name; defaults to `preset.title`. */
	label?: string;
	selected?: boolean;
	/**
	 * Click handler; receives the button's mouse event so callers can honor
	 * modifier-click contracts (Ctrl/Cmd toggle, Shift add, plain activate)
	 * without wrapping the tile in a non-semantic click surface.
	 */
	onSelect?: (ev: MouseEvent<HTMLButtonElement>) => void;
	/** Mirrors the workspace hover contract: preset id on enter, null on leave. */
	onHoverChange?: (presetId: string | null) => void;
	className?: string;
	style?: CSSProperties;
};

export function PresetTileButton(props: PresetTileButtonProps): JSX.Element {
	const {
		preset,
		label,
		selected = false,
		onSelect,
		onHoverChange,
		className,
		style,
	} = props;
	const presetId = preset.id.trim() ? preset.id.trim() : null;
	const accessibleName = label ?? preset.title?.trim() ?? presetId ?? "Preset";

	return (
		<div
			className={cx(root, className)}
			style={style}
			onPointerEnter={() => {
				if (presetId) onHoverChange?.(presetId);
			}}
			onPointerLeave={() => {
				if (presetId) onHoverChange?.(null);
			}}
		>
			<WorkspaceTileFrame selected={selected} className={frameFill}>
				<PresetCatalogGlyphHost
					title={accessibleName}
					{...(presetId ? { "data-preset-id": presetId } : {})}
				>
					<WorkspacePresetGlyph preset={preset} />
				</PresetCatalogGlyphHost>
			</WorkspaceTileFrame>
			<Button
				type="button"
				variant="bare"
				uiSize="sm"
				className={hitArea}
				aria-pressed={selected}
				aria-label={accessibleName}
				onClick={onSelect}
			/>
		</div>
	);
}
