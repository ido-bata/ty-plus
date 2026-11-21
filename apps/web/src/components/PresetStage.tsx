import type { Preset } from "@ty-plus/product/management/preset/contract";
import { Tile } from "@ty-plus/product/management/preset/workspace/Tile";
import { cx } from "@ty-plus/ui/util/cx";
import { useState } from "react";
import { css } from "@/styled-system/css";
import { DEMO_PRESETS } from "../lib/demo-presets";

/**
 * Web demo composed from the product's own preset tile layer:
 * `Tile` → `PresetCatalogGlyphHost` → `WorkspacePresetGlyph` →
 * `CanvasEasingIcon`, the same render path the workspace grid cell uses.
 * Selection and hover are local React state mirroring the panel's
 * info-widget precedence (selection first, hover fallback) — After
 * Effects execution is not faked on this page.
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

const cell = css({
	display: "flex",
	flexDirection: "column",
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

const cellSelected = css({
	borderColor: "interactive.focus",
	background: "interactive.active",
});

const cellIcon = css({
	display: "flex",
	aspectRatio: "1",
	width: "full",
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "surface-detail",
	background: "surface.widget",
	overflow: "hidden",
});

const cellTitle = css({
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

function PresetCell({
	preset,
	selected,
	hovered,
	onSelect,
	onHover,
}: {
	preset: Preset;
	selected: boolean;
	hovered: boolean;
	onSelect: () => void;
	onHover: (id: string | null) => void;
}) {
	return (
		// role="button" + keyboard handling: the shared @ty-plus/ui primitives
		// own control chrome, while this composite cell is LP composition
		// around the product's real tile glyph layer.
		<div
			role="button"
			tabIndex={0}
			aria-pressed={selected}
			className={cx(
				cell,
				selected && cellSelected,
				hovered && !selected && css({ borderColor: "border.strong" }),
			)}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
		>
			<span className={cellIcon}>
				<Tile
					preset={preset}
					label={preset.title}
					onHoverChange={(id) => onHover(id)}
				/>
			</span>
			<span className={cellTitle}>{preset.title}</span>
		</div>
	);
}

export function PresetStage({
	presets = DEMO_PRESETS,
}: {
	presets?: Preset[];
}) {
	// Pre-select one tile so the demo shows its value on first paint; the
	// info readout mirrors the product's selection→hover precedence.
	const [selectedId, setSelectedId] = useState<string | null>(
		() => presets[2]?.id ?? null,
	);
	const [hoverId, setHoverId] = useState<string | null>(null);
	const active =
		presets.find((p) => p.id === selectedId) ??
		presets.find((p) => p.id === hoverId) ??
		null;

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "1rem" })}
		>
			<div className={stage} role="group" aria-label="Preset tiles demo">
				{presets.map((p) => (
					<PresetCell
						key={p.id}
						preset={p}
						selected={p.id === selectedId}
						hovered={p.id === hoverId}
						onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
						onHover={setHoverId}
					/>
				))}
			</div>
			<div className={infoCard} aria-live="polite">
				{active ? (
					<>
						<span className={infoTitle}>{active.title}</span>
						<span className={infoMeta}>
							Animation preset ·{" "}
							{selectedId === active.id ? "selected" : "hover"} · demo data
						</span>
					</>
				) : (
					<>
						<span className={infoTitle}>No preset selected</span>
						<span className={infoMeta}>
							Hover or select a tile — the readout mirrors the panel's info
							widget.
						</span>
					</>
				)}
			</div>
		</div>
	);
}

/** Decorative rail of real preset tiles for the hero — no interaction. */
export function PresetRail({
	presets = DEMO_PRESETS.slice(0, 6),
}: {
	presets?: Preset[];
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
					})}
					data-rail-index={i}
				>
					<span
						className={css({
							display: "flex",
							width: { base: "3.5rem", md: "4.5rem" },
							aspectRatio: "1",
							alignItems: "center",
							justifyContent: "center",
							overflow: "hidden",
						})}
					>
						<Tile preset={p} label={p.title} />
					</span>
					<span className={cellTitle}>{p.title}</span>
				</div>
			))}
		</div>
	);
}
