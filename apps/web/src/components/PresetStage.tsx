import { CanvasEasingIcon } from "@ty-plus/product/management/preset/workspace/CanvasEasingIcon";
import { cx } from "@ty-plus/ui/util/cx";
import { useState } from "react";
import { css } from "@/styled-system/css";
import { DEMO_PRESETS, type DemoPreset } from "../lib/demo-presets";

/**
 * Web demo built from the product's own `CanvasEasingIcon` — the same canvas
 * renderer the panel uses for canvas-type preset glyphs. Selection state is
 * local React state: this demonstrates the hover/select interaction model,
 * not After Effects execution.
 */

const stage = css({
	display: "grid",
	gridTemplateColumns: {
		base: "repeat(2, minmax(0, 1fr))",
		sm: "repeat(3, minmax(0, 1fr))",
		lg: "repeat(5, minmax(0, 1fr))",
	},
	gap: "0.75rem",
});

const tile = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "stretch",
	gap: "0.5rem",
	padding: "0.75rem",
	borderRadius: "surface-card",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	background: "surface.panel",
	cursor: "pointer",
	textAlign: "left",
	transition: "border-color 120ms ease, background 120ms ease",
	_hover: { borderColor: "border.strong", background: "interactive.hover" },
	_focusVisible: {
		outlineWidth: "hairline",
		outlineStyle: "solid",
		outlineColor: "interactive.focus",
		outlineOffset: "0",
	},
});

const tileSelected = css({
	borderColor: "interactive.focus",
	background: "interactive.active",
});

const tileIcon = css({
	display: "flex",
	aspectRatio: "1",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "surface-detail",
	background: "surface.widget",
	color: "text.primary",
});

const tileTitle = css({
	fontSize: "xs",
	fontWeight: "medium",
	color: "text.primary",
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
});

const infoCard = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.25rem",
	padding: "0.875rem 1rem",
	borderRadius: "surface-card",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	background: "surface.panel",
});

const infoTitle = css({
	fontSize: "sm",
	fontWeight: "semibold",
	color: "text.primary",
});
const infoMeta = css({ fontSize: "xs", color: "text.muted" });

function PresetTile({
	preset,
	selected,
	onSelect,
}: {
	preset: DemoPreset;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		// role="button" + keyboard handling: the shared @ty-plus/ui primitives
		// own control chrome, while this composite tile is LP composition.
		<div
			role="button"
			tabIndex={0}
			aria-pressed={selected}
			className={cx(tile, selected && tileSelected)}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
		>
			<span className={tileIcon} aria-hidden="true">
				<CanvasEasingIcon cubic={preset.cubic} color={preset.color} />
			</span>
			<span className={tileTitle}>{preset.title}</span>
		</div>
	);
}

export function PresetStage({
	presets = DEMO_PRESETS,
}: {
	presets?: DemoPreset[];
}) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = presets.find((p) => p.id === selectedId) ?? null;

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "1rem" })}
		>
			<div className={stage} role="group" aria-label="Preset tiles demo">
				{presets.map((p) => (
					<PresetTile
						key={p.id}
						preset={p}
						selected={p.id === selectedId}
						onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
					/>
				))}
			</div>
			<div className={infoCard} aria-live="polite">
				{selected ? (
					<>
						<span className={infoTitle}>{selected.title}</span>
						<span className={infoMeta}>
							Animation preset · easing glyph · demo data
						</span>
					</>
				) : (
					<>
						<span className={infoTitle}>No preset selected</span>
						<span className={infoMeta}>
							Select a tile to see what the info widget shows in the panel.
						</span>
					</>
				)}
			</div>
		</div>
	);
}

/** Decorative rail of real easing icons for the hero — no interaction. */
export function PresetRail({
	presets = DEMO_PRESETS.slice(0, 6),
}: {
	presets?: DemoPreset[];
}) {
	return (
		<div
			className={css({
				display: "flex",
				flexWrap: "wrap",
				gap: "0.75rem",
				alignItems: "flex-end",
			})}
			aria-hidden="true"
		>
			{presets.map((p, i) => (
				<div
					key={p.id}
					className={css({
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "0.375rem",
						padding: "0.75rem",
						borderRadius: "surface-card",
						borderWidth: "hairline",
						borderStyle: "solid",
						borderColor: "border.subtle",
						background: "surface.panel",
						transform: { md: i % 2 === 1 ? "translateY(0.75rem)" : undefined },
					})}
				>
					<span
						className={css({
							display: "flex",
							width: { base: "3.5rem", md: "4.5rem" },
							aspectRatio: "1",
							alignItems: "center",
							justifyContent: "center",
							color: "text.primary",
						})}
					>
						<CanvasEasingIcon cubic={p.cubic} color={p.color} />
					</span>
					<span className={tileTitle}>{p.title}</span>
				</div>
			))}
		</div>
	);
}
