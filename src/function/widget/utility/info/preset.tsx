import { type JSX, useEffect, useMemo, useState } from "react";
import { i18n } from "@/management/i18n/index";
import type { Preset } from "@/management/preset/contract";
import { resolvePresetsForInfoByCatalogIds } from "@/management/preset/group/info-resolution";
import type {
	GridSettings,
	Layout,
	SurfaceState,
} from "@/management/workspace/core/state";
import { catalogRefsForSurfaceIds } from "@/management/workspace/placement/resolve";
import { css } from "@/styled-system/css";
import { CompSections } from "./comp-sections";
import {
	PresetInfoBody,
	type PresetInfoSource,
	presetInfoMode,
	SectionLabel,
} from "./preset-card";

function HostFooter({ state }: { state: SurfaceState }): JSX.Element | null {
	const compBlock =
		state.compInfo !== null ? (
			<div
				className={css({
					marginTop: "var(--ty-space-2)",
					borderTopWidth: "1px",
					borderTopStyle: "solid",
					borderColor: "border.subtle",
					paddingTop: "var(--ty-space-2)",
				})}
			>
				<SectionLabel>{i18n.t("widgets:info.activeComp")}</SectionLabel>
				<CompSections comp={state.compInfo} />
			</div>
		) : state.compInfoError?.trim() ? (
			<div
				className={css({
					marginTop: "var(--ty-space-2)",
					borderTopWidth: "1px",
					borderTopStyle: "solid",
					borderColor: "border.subtle",
					paddingTop: "var(--ty-space-2)",
					fontSize: "text-xs",
					color: "var(--color-text-muted)",
				})}
			>
				<span
					className={css({
						fontWeight: "semibold",
						color: "var(--color-text-primary)",
					})}
				>
					{i18n.t("widgets:info.compInfo")}
				</span>
				{": "}
				{state.compInfoError.trim()}
			</div>
		) : null;

	return compBlock;
}

const infoContainerClass = css({
	display: "flex",
	height: "full",
	minHeight: 0,
	width: "full",
	flexDirection: "column",
	overflow: "auto",
	borderRadius: "var(--radius-shell)",
	backgroundColor: "var(--color-surface-widget)",
	padding: "var(--ty-ws-grid-padding-clamp)",
});

export function PresetInfoWidget({
	state,
	layout: _layout,
	grid: _grid,
}: {
	state: SurfaceState;
	layout: Layout;
	grid: GridSettings;
}): JSX.Element {
	void _layout;
	void _grid;
	// Issue #87: `resolvePresetsForInfoByCatalogIds` allocates a fresh
	// `Preset[]` on every call, so the `useEffect` dep below would fail
	// `Object.is` on every render and the effect would loop indefinitely
	// whenever `items.length > 0`. Compute the source mode and resolve
	// the items inside a single `useMemo` keyed on the content-stable
	// state slices. The selection / hover → ids derivation is local to
	// the factory so the closure is clean for biome's exhaustive-deps
	// check, and the memo output is reference-stable across re-renders
	// that do not change the upstream state.
	const { source, items } = useMemo(() => {
		const fromGrid = catalogRefsForSurfaceIds(
			state,
			state.selectedSurfaceIndices.map(String),
		);
		const selectedCatalogLocal =
			fromGrid.length > 0 ? fromGrid : state.presetSelectedIds;
		const idsLocal =
			selectedCatalogLocal.length > 0
				? [...selectedCatalogLocal]
				: state.presetHoverId
					? [state.presetHoverId]
					: [];
		const resolved = resolvePresetsForInfoByCatalogIds(state, idsLocal);
		const nextSource: PresetInfoSource =
			fromGrid.length > 0 || state.presetSelectedIds.length > 0
				? "selection"
				: "hover";
		return { source: nextSource, items: resolved };
	}, [state]);
	const [presetInfoLast, setPresetInfoLast] = useState<Preset[]>([]);
	useEffect(() => {
		if (items.length > 0) {
			setPresetInfoLast(items);
		}
	}, [items]);
	const effective = items.length > 0 ? items : presetInfoLast;

	return (
		<div className={infoContainerClass} data-mode={presetInfoMode(effective)}>
			<PresetInfoBody items={effective} source={source} />
			<HostFooter state={state} />
		</div>
	);
}

function _PresetMeta({
	fileName,
	kindLabel,
}: {
	fileName: string | null;
	kindLabel: string | null;
}): JSX.Element {
	return (
		<div
			className={css({
				display: "flex",
				flexDirection: "column",
				gap: "var(--ty-space-1)",
				borderTopWidth: "1px",
				borderTopStyle: "solid",
				borderColor: "border.subtle",
				paddingTop: "var(--ty-space-2)",
			})}
		>
			<SectionLabel>{i18n.t("presets:presetTool.form.details")}</SectionLabel>
			<div
				className={css({
					display: "flex",
					flexDirection: "column",
					gap: "var(--ty-space-0-5)",
				})}
			>
				<div
					className={css({
						display: "flex",
						justifyContent: "space-between",
						gap: "var(--ty-space-2)",
						fontSize: "text-xs",
					})}
				>
					<span
						className={css({ flexShrink: 0, color: "var(--color-text-muted)" })}
					>
						{i18n.t("widgets:info.file")}
					</span>
					<span
						className={css({
							minWidth: 0,
							wordBreak: "break-all",
							textAlign: "right",
							color: "var(--color-text-primary)",
						})}
					>
						{fileName ?? "-"}
					</span>
				</div>
				<div
					className={css({
						display: "flex",
						justifyContent: "space-between",
						fontSize: "text-xs",
					})}
				>
					<span className={css({ color: "var(--color-text-muted)" })}>
						{i18n.t("widgets:info.kind")}
					</span>
					<span className={css({ color: "var(--color-text-primary)" })}>
						{kindLabel ?? "-"}
					</span>
				</div>
			</div>
		</div>
	);
}
