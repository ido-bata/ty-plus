import {
	PresetInfoBody,
	type PresetInfoSource,
	presetInfoMode,
} from "@ty-plus/product/function/widget/utility/info/preset-card";
import {
	type Preset,
	PresetTileButton,
} from "@ty-plus/product/management/preset/workspace";
import { useState } from "react";
import { css } from "@/styled-system/css";
import { DEMO_PRESETS } from "../lib/demo-presets";

/**
 * Web demo composed entirely from shared product UI:
 * `PresetTileButton` (workspace tile chrome + catalog glyph layer + native
 * button semantics) and `PresetInfoBody` (the info widget's card render
 * path). Selection and hover are local React state mirroring the panel's
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

const tileBox = css({
	position: "relative",
	aspectRatio: "1",
});

const infoCard = css({
	display: "flex",
	flexDirection: "column",
	gap: "0.75rem",
	padding: "0.875rem 1rem",
	borderRadius: "surface-card",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.subtle",
	background: "surface.panel",
	minHeight: "9rem",
});

const infoMeta = css({
	marginTop: "auto",
	fontSize: "xs",
	color: "text.muted",
});

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
	const source: PresetInfoSource =
		active && selectedId === active.id ? "selection" : "hover";
	const infoItems = active ? [active] : [];

	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "1rem" })}
		>
			<div className={stage} role="group" aria-label="Preset tiles demo">
				{presets.map((p) => (
					<div key={p.id} className={tileBox}>
						<PresetTileButton
							preset={p}
							selected={p.id === selectedId}
							onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
							onHoverChange={setHoverId}
						/>
					</div>
				))}
			</div>
			<div className={infoCard} data-mode={presetInfoMode(infoItems)}>
				<PresetInfoBody items={infoItems} source={source} />
				<span className={infoMeta}>
					Web demo · selection is local state · runs in the After Effects panel
				</span>
			</div>
		</div>
	);
}
