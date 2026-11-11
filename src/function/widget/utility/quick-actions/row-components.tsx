import { Wand2 } from "lucide-react";
import type { CSSProperties, JSX } from "react";
import type { Preset, PresetType } from "@/management/preset/contract";
import {
	useIsPresetAssetMissing,
	useIsPresetAssetUnverifiable,
} from "@/management/preset/use-preset-asset-health";
import { WorkspacePresetGlyph } from "@/management/preset/workspace/glyph";
import { css } from "@/styled-system/css";
import { rootFilePresetType } from "./scoring";
import type { PluginEffectIndexRow, QuickActionRootFileRow } from "./types";

type RowPropsBase = {
	idx: number;
	selected: boolean;
	widgetInstanceId: string;
	onSelect: (idx: number) => void;
};

const rowContainerBase = css({
	borderBottomWidth: "1px",
	borderBottomStyle: "solid",
	borderColor: "border.default",
	_last: { borderBottomWidth: 0 },
});

const rowButtonClass = css({
	display: "flex",
	width: "full",
	cursor: "pointer",
	alignItems: "stretch",
	gap: "var(--ty-space-1-5)",
	paddingInline: "var(--ty-space-1-5)",
	paddingBlock: "var(--ty-space-1)",
	textAlign: "left",
	fontFamily: "inherit",
	fontSize: "text-xs",
	color: "text.primary",
});

const rowIconBoxClass = css({
	display: "flex",
	height: "9",
	width: "9",
	flexShrink: 0,
	alignItems: "center",
	justifyContent: "center",
	borderRadius: "var(--ty-space-1)",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	color: "text.muted",
});

const rowIconGlyphClass = css({ position: "relative", overflow: "hidden" });

const rowTextBlockClass = css({
	display: "flex",
	minWidth: 0,
	flex: 1,
	flexDirection: "column",
	gap: "px",
});

const rowTitleClass = css({
	truncate: true,
	fontWeight: "medium",
	color: "text.primary",
});

const rowSubtitleClass = css({
	truncate: true,
	fontSize: "text-2xs",
	color: "text.muted",
});

const rowSelectedClass = css({ backgroundColor: "interactive.hover" });

export function EffectRow(
	props: {
		effect: PluginEffectIndexRow;
		t: (key: string) => string;
	} & RowPropsBase,
): JSX.Element {
	const { effect, idx, selected, widgetInstanceId, t, onSelect } = props;
	return (
		<div
			key={`${widgetInstanceId}-fx-${effect.matchName}`}
			data-palette-index={idx}
			className={`${rowContainerBase} ${selected ? rowSelectedClass : ""}`}
		>
			<button
				type="button"
				className={rowButtonClass}
				data-ws-action="apply-effect"
				data-effect-match={effect.matchName}
				onMouseEnter={() => onSelect(idx)}
				onFocus={() => onSelect(idx)}
			>
				<span className={rowIconBoxClass} aria-hidden>
					<Wand2 className={css({ height: "4", width: "4" })} strokeWidth={2} />
				</span>
				<span className={rowTextBlockClass}>
					<span className={rowTitleClass}>{effect.displayName}</span>
					<span className={rowSubtitleClass}>
						{t("quickActions.effectRowKind")}
						{effect.filePath ? ` · ${effect.filePath}` : ""}
					</span>
				</span>
			</button>
		</div>
	);
}

export function RootFileRow(
	props: {
		rootFile: QuickActionRootFileRow;
		t: (key: string) => string;
		typeLabel: (ty: PresetType) => string;
	} & RowPropsBase,
): JSX.Element {
	const { rootFile, idx, selected, widgetInstanceId, t, typeLabel, onSelect } =
		props;
	const anchor = typeLabel(rootFilePresetType(rootFile));
	return (
		<div
			key={`${widgetInstanceId}-rf-${rootFile.filePath}`}
			data-palette-index={idx}
			className={`${rowContainerBase} ${selected ? rowSelectedClass : ""}`}
		>
			<button
				type="button"
				className={rowButtonClass}
				data-ws-action="quick-action-root-file"
				data-file-path={rootFile.filePath}
				onMouseEnter={() => onSelect(idx)}
				onFocus={() => onSelect(idx)}
			>
				<span
					className={`${rowIconBoxClass} ${rowIconGlyphClass}`}
					style={
						{
							containerType: "size",
						} as CSSProperties
					}
				>
					<WorkspacePresetGlyph preset={rootFile} />
				</span>
				<span className={rowTextBlockClass}>
					<span className={rowTitleClass}>{rootFile.title}</span>
					<span className={rowSubtitleClass}>
						{t("quickActions.rootFileRowKind")} · {anchor}
						{rootFile.filePath ? ` · ${rootFile.filePath}` : ""}
					</span>
				</span>
			</button>
		</div>
	);
}

export function PresetRow(
	props: {
		preset: Preset;
		tl: string;
	} & RowPropsBase,
): JSX.Element {
	const { preset, idx, selected, widgetInstanceId, tl, onSelect } = props;
	// Issue #130: subscribe to the boot-time asset-health store so the
	// row re-renders when the scan completes. Only `missing` disables
	// the row's run affordance; `unverifiable` keeps it enabled but
	// surfaces a different title (see tooltip below).
	const isMissing = useIsPresetAssetMissing(preset.id);
	const isUnverifiable = useIsPresetAssetUnverifiable(preset.id);
	const runTitle = isMissing
		? "Preset asset is missing on disk — run is disabled"
		: isUnverifiable
			? "Could not verify preset asset (host unavailable) — retry"
			: undefined;
	return (
		<div
			key={`${widgetInstanceId}-p-${preset.id}`}
			data-palette-index={idx}
			className={`${rowContainerBase} ${selected ? rowSelectedClass : ""}`}
		>
			<button
				type="button"
				className={rowButtonClass}
				data-ws-action="run-preset"
				data-preset-id={preset.id}
				disabled={isMissing}
				aria-disabled={isMissing}
				title={runTitle}
				onMouseEnter={() => onSelect(idx)}
				onFocus={() => onSelect(idx)}
			>
				<span
					className={`${rowIconBoxClass} ${rowIconGlyphClass}`}
					style={
						{
							containerType: "size",
						} as CSSProperties
					}
				>
					<WorkspacePresetGlyph preset={preset} />
				</span>
				<span className={rowTextBlockClass}>
					<span className={rowTitleClass}>
						{preset.title.trim() || preset.id}
					</span>
					<span className={rowSubtitleClass}>
						{tl}
						{preset.filePath ? ` · ${preset.filePath}` : ""}
					</span>
				</span>
			</button>
		</div>
	);
}
