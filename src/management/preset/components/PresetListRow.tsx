import { Button, Icon, IconButton, isIMEComposing } from "@ty-plus/ui";
import { Play } from "lucide-react";
import type { JSX } from "react";
import { basenamePath } from "@/management/preset/catalog-browser/preset-browser-helpers";
import type { Preset } from "@/management/preset/contract";
import {
	useIsPresetAssetMissing,
	useIsPresetAssetUnverifiable,
} from "@/management/preset/assets/use-health";
import { PresetGlyphById } from "@/management/preset/workspace/glyph-by-id";
import { css } from "@/styled-system/css";

export type PresetListRowProps = {
	preset: Preset;
	presetGlyphSiblingProps: Record<string, unknown>;
	activateCatalogPresetRow: (filePath: string) => void;
	runPreset: (id: string) => Promise<void> | void;
	actionsRunLabel: string;
	/** Title shown when the preset asset is missing on disk. */
	actionsRunBlockedMissingLabel: string;
	/** Title shown when the preset asset could not be verified. */
	actionsRunBlockedUnverifiableLabel: string;
};

export function PresetListRow({
	preset: p,
	presetGlyphSiblingProps,
	activateCatalogPresetRow,
	runPreset,
	actionsRunLabel,
	actionsRunBlockedMissingLabel,
	actionsRunBlockedUnverifiableLabel,
}: PresetListRowProps): JSX.Element {
	// Issue #130: subscribe to the boot-time asset-health store so this
	// row re-renders when the scan completes. Only `missing` disables
	// the run affordance; `unverifiable` keeps it enabled but flips the
	// title to "unknown / retry".
	const isMissing = useIsPresetAssetMissing(p.id);
	const isUnverifiable = useIsPresetAssetUnverifiable(p.id);
	const runTitle = isMissing
		? actionsRunBlockedMissingLabel
		: isUnverifiable
			? actionsRunBlockedUnverifiableLabel
			: actionsRunLabel;
	return (
		<li className={css({ backgroundColor: "surface.dialog" })}>
			<div
				className={css({
					display: "flex",
					minWidth: 0,
					alignItems: "center",
					gap: "2",
					paddingInline: "2",
					paddingBlock: "1.5",
				})}
				data-directory-browser-entry
				data-entry-kind="preset"
				data-entry-path={p.filePath}
				data-preset-id={p.id}
			>
				{/*
				 * The row itself is the activation surface: `bare` keeps the
				 * shared focus ring and size scale without painting a second
				 * border on top of the list container. Activation stays on
				 * double-click and Enter — a single click only selects.
				 */}
				<Button
					type="button"
					variant="bare"
					uiSize="md"
					className={css({
						display: "flex",
						minWidth: 0,
						flex: "1",
						alignItems: "center",
						justifyContent: "flex-start",
						gap: "2",
					})}
					onDoubleClick={() => {
						activateCatalogPresetRow(p.filePath);
					}}
					onKeyDown={(ev) => {
						if (isIMEComposing(ev)) return;
						if (ev.key !== "Enter") {
							return;
						}
						ev.preventDefault();
						activateCatalogPresetRow(p.filePath);
					}}
				>
					<PresetGlyphById
						presetId={p.id}
						preset={p}
						surface="framed"
						boxClass={css({ height: "7", width: "7", flexShrink: 0 })}
						{...presetGlyphSiblingProps}
					/>
					<div className={css({ minWidth: 0, flex: "1" })}>
						<div
							className={css({
								truncate: true,
								fontSize: "shell-text-sm",
								fontWeight: "medium",
								color: "text.primary",
							})}
						>
							{p.title}
						</div>
						<div
							className={css({
								truncate: true,
								fontSize: "text-xs",
								color: "text.muted",
							})}
						>
							{p.type} · {basenamePath(p.filePath)}
						</div>
					</div>
				</Button>
				<IconButton
					type="button"
					variant="default"
					size="sm"
					onClick={() => {
						void runPreset(p.id);
					}}
					disabled={isMissing}
					aria-disabled={isMissing}
					aria-label={runTitle}
					title={runTitle}
				>
					<Icon icon={Play} size={12} />
				</IconButton>
			</div>
		</li>
	);
}
