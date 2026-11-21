import { Button, cx, Icon, IconButton } from "@ty-plus/ui";
import { Play } from "lucide-react";
import type { JSX } from "react";
import type { IconTileAspect } from "@/management/preset";
import {
	glyphBoxFlushClass,
	glyphEmojiProminentClass,
	iconTileMediaClass,
	PresetGlyphById,
} from "@/management/preset";
import type { Preset } from "@/management/preset/contract";
import {
	useIsPresetAssetMissing,
	useIsPresetAssetUnverifiable,
} from "@/management/preset/use-preset-asset-health";
import { css } from "@/styled-system/css";

export type CatalogPresetIconTileProps = {
	preset: Preset;
	iconTileAspect: IconTileAspect;
	presetGlyphSiblingProps: Record<string, unknown>;
	setFileBrowserSelectedPath: (path: string) => void;
	runPreset: (id: string) => Promise<void> | void;
	actionsRunLabel: string;
	/** Title shown when the preset asset is missing on disk. */
	actionsRunBlockedMissingLabel: string;
	/** Title shown when the preset asset could not be verified. */
	actionsRunBlockedUnverifiableLabel: string;
};

export function CatalogPresetIconTile({
	preset: p,
	iconTileAspect,
	presetGlyphSiblingProps,
	setFileBrowserSelectedPath,
	runPreset,
	actionsRunLabel,
	actionsRunBlockedMissingLabel,
	actionsRunBlockedUnverifiableLabel,
}: CatalogPresetIconTileProps): JSX.Element {
	// Issue #130: same subscription pattern as the list row — only
	// `missing` disables the run affordance. `unverifiable` keeps it
	// clickable and surfaces a different title so the user knows the
	// panel could not confirm asset presence.
	const isMissing = useIsPresetAssetMissing(p.id);
	const isUnverifiable = useIsPresetAssetUnverifiable(p.id);
	const runTitle = isMissing
		? actionsRunBlockedMissingLabel
		: isUnverifiable
			? actionsRunBlockedUnverifiableLabel
			: actionsRunLabel;
	return (
		<div
			className={css({
				position: "relative",
				display: "flex",
				minWidth: 0,
				flexDirection: "column",
				overflow: "hidden",
				borderRadius: "shell-sm",
				borderWidth: "1px",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.dialog",
				_hover: { backgroundColor: "interactive.hover" },
			})}
			data-directory-browser-entry
			data-entry-kind="preset"
			data-entry-path={p.filePath}
			data-preset-id={p.id}
		>
			{/*
			 * The tile is one composite surface: the container owns the
			 * border / fill, the `bare` button owns the activation. The
			 * shared Button has no content-sized step yet, so the tile
			 * opts out of the fixed height with a runtime size value
			 * (see the report: the shared library should grow an
			 * auto-height / stretch step for tile surfaces).
			 */}
			<Button
				type="button"
				variant="bare"
				uiSize="sm"
				fullWidth
				style={{ height: "auto" }}
				className={css({
					display: "flex",
					minWidth: 0,
					flexDirection: "column",
					alignItems: "stretch",
					justifyContent: "flex-start",
				})}
				onClick={() => setFileBrowserSelectedPath(p.filePath)}
				title={p.filePath}
			>
				<div
					className={cx(
						iconTileMediaClass(iconTileAspect),
						css({
							overflow: "hidden",
							borderRadius: "shell-sm",
							borderWidth: "1px",
							borderStyle: "solid",
							borderColor: "border.default",
							backgroundColor: "surface.widget",
						}),
					)}
				>
					<div
						className={css({
							display: "flex",
							height: "full",
							width: "full",
							alignItems: "center",
							justifyContent: "center",
							padding: "0.5",
						})}
					>
						<PresetGlyphById
							presetId={p.id}
							preset={p}
							boxClass={glyphBoxFlushClass}
							emojiClass={glyphEmojiProminentClass}
							{...presetGlyphSiblingProps}
						/>
					</div>
				</div>
				<div
					className={css({
						marginTop: "0.5",
						minWidth: 0,
						paddingInline: "0.5",
					})}
				>
					<div
						className={css({
							truncate: true,
							textAlign: "left",
							fontSize: "shell-text-sm",
							fontWeight: "medium",
							lineHeight: "tight",
							color: "text.primary",
						})}
					>
						{p.title}
					</div>
				</div>
			</Button>
			<IconButton
				type="button"
				variant="default"
				size="xs"
				className={css({
					position: "absolute",
					right: "1",
					bottom: "1",
				})}
				onClick={() => {
					void runPreset(p.id);
				}}
				disabled={isMissing}
				aria-disabled={isMissing}
				aria-label={runTitle}
				title={runTitle}
			>
				<Icon icon={Play} size={11} />
			</IconButton>
		</div>
	);
}
