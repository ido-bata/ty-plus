import {
	PresetInfoBody,
	type PresetInfoSource,
	presetInfoMode,
} from "@ty-plus/product/function/widget/utility/info/preset-card";
import {
	type Preset,
	PresetTileButton,
} from "@ty-plus/product/management/preset/workspace";
import { Badge } from "@ty-plus/ui";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { css } from "@/styled-system/css";
import { DEMO_PRESETS } from "../lib/demo-presets";

/**
 * Web demo composed entirely from shared product UI:
 * `PresetTileButton` (workspace tile chrome + catalog glyph layer + native
 * button semantics) and `PresetInfoBody` (the info widget's card render
 * path). Interaction state is local React state mirroring the panel's
 * contract (`src/management/workspace/events/handler.ts`):
 *
 * - Hover raises `presetHoverId`; the info surface shows the hover preset
 *   only while nothing is selected (selection wins, like the panel).
 * - Plain click "applies" the preset. After Effects cannot run here, so
 *   the demo surfaces an explicit note instead of faking execution.
 * - Ctrl/Cmd+click toggles a tile in the selection; Shift+click adds to
 *   it. Selected tiles feed the info surface (multi mode when >1), and
 *   the surface keeps the last non-empty items after the selection
 *   clears — the same sticky behavior as `PresetInfoWidget`.
 * - Clicking empty stage area clears the selection, as the panel does.
 * - On coarse pointers there is no hover and no modifier-click, so a tap
 *   toggles selection (the inspect gesture); the footer copy states this
 *   demo scope explicitly.
 *
 * Layout per viewport:
 * - lg+: tile grid (4 columns) beside a persistent info column that
 *   stretches to the grid's height; body content is vertically centered
 *   and the footer (apply note / hints / disclaimer) pins to the bottom.
 * - Below lg: the info card is a full-width row placed after the last
 *   tile of the row containing the tile that produced the current
 *   content (last selected tile, else hovered tile, else where it last
 *   was). It starts on a fresh row instead of splitting the anchor's
 *   row, so no grid cells are left blank and tiles below simply shift
 *   down by one row.
 */

const COARSE_POINTER = "(pointer: coarse)";

const isCoarsePointer = (): boolean =>
	typeof window !== "undefined" && window.matchMedia(COARSE_POINTER).matches;

const stage = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "0.75rem",
	lg: {
		gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
		gap: "1rem",
		alignItems: "stretch",
	},
});

// Below lg the stage grid is 3 columns (see `stage` base); the info
// card's `order` targets the last tile of the anchor's row.
const NARROW_COLS = 3;

/* Below lg the tile grid dissolves into the stage grid (`display:
   contents`) so tile boxes and the info card share one coordinate
   system; `order` then places the card after that row's last tile. */
const tileGrid = css({
	display: "contents",
	lg: {
		display: "grid",
		gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
		gap: "0.75rem",
	},
});

const tileBox = css({
	position: "relative",
	aspectRatio: "1",
	// Keep tiles clear of the sticky site header when scroll-into-view
	// (and real anchor navigation) brings them to the top edge.
	scrollMarginTop: "5rem",
});

const infoCard = css({
	display: "flex",
	flexDirection: "column",
	gridColumn: { base: "1 / -1", lg: "auto" },
	padding: "0.875rem 1rem",
	borderRadius: "surface-card",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	background: "surface.panel",
	minHeight: "9rem",
	maxHeight: { base: "24rem", lg: "none" },
});

const infoHead = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "0.5rem",
});

const infoBody = css({
	flex: "1",
	minHeight: "0",
	overflowY: "auto",
	display: "flex",
	flexDirection: "column",
});

const infoBodyInner = css({
	marginBlock: "auto",
	paddingBlock: "0.25rem",
});

const infoFoot = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.375rem",
	paddingBlockStart: "0.75rem",
	marginBlockStart: "0.75rem",
	borderTopWidth: "hairline",
	borderTopStyle: "solid",
	borderTopColor: "border.subtle",
	fontSize: "xs",
	lineHeight: "relaxed",
	color: "text.muted",
});

const applyNote = css({
	color: "text.primary",
});

function modeLabel(
	items: readonly Preset[],
	source: PresetInfoSource,
	stale: boolean,
	stickySource: PresetInfoSource | null,
): string {
	if (items.length === 0) return "empty";
	// Sticky content outlives the gesture that produced it; saying
	// "selected"/"hover" while nothing is selected or hovered would
	// misreport the current state, so name it as retained content.
	if (stale) {
		return stickySource === "selection"
			? items.length > 1
				? "last selection"
				: "last selected"
			: "recent";
	}
	if (source === "selection") {
		return items.length > 1 ? `${items.length} selected` : "selected";
	}
	return "hover";
}

export function PresetStage({
	presets = DEMO_PRESETS,
}: {
	presets?: Preset[];
}) {
	// One tile starts selected so the info surface demonstrates its value on
	// first paint; everything after that is driven by the gestures above.
	const seedIndex = Math.min(2, Math.max(0, presets.length - 1));
	const [selectedIds, setSelectedIds] = useState<string[]>(() =>
		presets[seedIndex] ? [presets[seedIndex].id] : [],
	);
	const [hoverId, setHoverId] = useState<string | null>(null);
	const [applied, setApplied] = useState<Preset | null>(null);
	// Anchor tile for the info card's grid position on narrow layouts.
	// Tracks the tile that produced the current content — the last selected
	// tile while a selection is live, else the hovered tile — and holds its
	// last value while the surface shows sticky items.
	const [anchorIndex, setAnchorIndex] = useState(seedIndex);
	// Pointer capability for the footer hint copy. Resolved after mount so
	// prerendered HTML stays deterministic (both hints render `hidden`
	// until the media query is read on the client).
	const [pointerKind, setPointerKind] = useState<"fine" | "coarse" | null>(
		null,
	);
	useEffect(() => {
		const mq = window.matchMedia(COARSE_POINTER);
		const update = () => setPointerKind(mq.matches ? "coarse" : "fine");
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);
	// Sticky last non-empty items, mirroring `PresetInfoWidget`'s
	// `presetInfoLast`: clearing the selection must not blank the surface.
	const [sticky, setSticky] = useState<{
		items: Preset[];
		source: PresetInfoSource;
	} | null>(null);

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const live = useMemo(() => {
		if (selectedIds.length > 0) {
			const byId = new Map(presets.map((p) => [p.id, p]));
			return {
				source: "selection" as PresetInfoSource,
				items: selectedIds
					.map((id) => byId.get(id))
					.filter((p): p is Preset => p !== undefined),
			};
		}
		const hovered = hoverId ? presets.find((p) => p.id === hoverId) : undefined;
		return {
			source: "hover" as PresetInfoSource,
			items: hovered ? [hovered] : [],
		};
	}, [presets, selectedIds, hoverId]);

	useEffect(() => {
		if (live.items.length > 0) {
			setSticky({ items: live.items, source: live.source });
		}
	}, [live.items, live.source]);

	const items = live.items.length > 0 ? live.items : (sticky?.items ?? []);
	// Like the panel, the card body is tagged with the *current* gesture
	// source; sticky items keep rendering after the gesture ends.
	const source = live.source;
	const stale = live.items.length === 0 && items.length > 0;

	// Which tile the info card should sit next to on narrow layouts.
	const derivedAnchor = useMemo(() => {
		const lastSelected = selectedIds.at(-1);
		if (lastSelected) {
			return presets.findIndex((p) => p.id === lastSelected);
		}
		if (hoverId) {
			return presets.findIndex((p) => p.id === hoverId);
		}
		return -1;
	}, [presets, selectedIds, hoverId]);
	useEffect(() => {
		if (derivedAnchor >= 0) setAnchorIndex(derivedAnchor);
	}, [derivedAnchor]);

	// Grid index the info card's `order` targets: the last tile of the
	// anchor's row, so the full-width card starts on a fresh row instead
	// of splitting the anchor's row and leaving empty cells behind.
	const cardOrderIndex = useMemo(() => {
		if (anchorIndex < 0) return presets.length;
		return Math.min(
			Math.floor(anchorIndex / NARROW_COLS) * NARROW_COLS + NARROW_COLS - 1,
			presets.length - 1,
		);
	}, [anchorIndex, presets.length]);

	const toggleSelected = (id: string) =>
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	const addSelected = (id: string) =>
		setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

	const handleTileClick = (
		ev: MouseEvent<HTMLButtonElement>,
		preset: Preset,
	) => {
		if (ev.altKey) return;
		// Touch has no modifiers: a tap is the inspect gesture, so it
		// toggles selection membership (the panel's Ctrl/Cmd+click role).
		if (isCoarsePointer()) {
			setApplied(null);
			toggleSelected(preset.id);
			return;
		}
		if (ev.ctrlKey || ev.metaKey) {
			setApplied(null);
			toggleSelected(preset.id);
			return;
		}
		if (ev.shiftKey) {
			ev.preventDefault();
			setApplied(null);
			addSelected(preset.id);
			return;
		}
		// Plain click = apply. The panel would run the preset on the active
		// layer; here we only record the intent honestly.
		setApplied(preset);
	};

	// Plain click on empty stage area clears the selection, matching the
	// panel's grid-background click.
	const handleStageClick = (ev: MouseEvent<HTMLDivElement>) => {
		if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
		const target = ev.target as Element | null;
		if (
			target?.closest("[data-preset-tile]") ||
			target?.closest("[data-info-card]")
		) {
			return;
		}
		setSelectedIds([]);
		setApplied(null);
	};

	return (
		<div
			className={stage}
			data-preset-stage
			role="group"
			aria-label="Preset tiles demo"
			onClick={handleStageClick}
			onKeyDown={(ev) => {
				// Escape mirrors the panel's click-empty-grid deselect for
				// keyboard users who cannot click the stage background.
				if (
					ev.key === "Escape" &&
					(selectedIds.length > 0 || applied !== null)
				) {
					setSelectedIds([]);
					setApplied(null);
				}
			}}
		>
			<div className={tileGrid}>
				{presets.map((p, i) => (
					<div
						key={p.id}
						ref={(el) => {
							if (el) el.style.order = String(i * 2);
						}}
						className={tileBox}
						data-preset-tile
					>
						<PresetTileButton
							preset={p}
							selected={selectedSet.has(p.id)}
							onSelect={(ev) => handleTileClick(ev, p)}
							onHoverChange={setHoverId}
						/>
					</div>
				))}
			</div>
			<div
				ref={(el) => {
					if (el) {
						el.style.order = String(cardOrderIndex * 2 + 1);
					}
				}}
				className={infoCard}
				data-info-card
				data-mode={presetInfoMode(items)}
			>
				<div className={infoHead}>
					<Badge
						tone={
							source === "selection" && !stale && items.length > 0
								? "accent"
								: "neutral"
						}
					>
						{modeLabel(items, source, stale, sticky?.source ?? null)}
					</Badge>
				</div>
				<div className={infoBody}>
					<div className={infoBodyInner}>
						<PresetInfoBody items={items} source={source} />
					</div>
				</div>
				<div className={infoFoot}>
					{applied ? (
						<p className={applyNote} data-apply-note aria-live="polite">
							“{applied.title}” — in the panel a plain click applies this preset
							to the active layer.
						</p>
					) : null}
					<p hidden={pointerKind !== "fine"}>
						Hover to inspect · ⌘/Ctrl+click toggles selection · Shift+click adds
						· click applies in the panel
					</p>
					<p hidden={pointerKind !== "coarse"}>
						Tap to inspect and select · in the panel a tap would apply the
						preset to the active layer
					</p>
					<p>
						Web demo · selection is local state · runs in the After Effects
						panel
					</p>
				</div>
			</div>
		</div>
	);
}
