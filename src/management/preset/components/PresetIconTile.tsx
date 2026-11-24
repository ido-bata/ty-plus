import { Button, cx, Icon, IconButton, widgetSurfaceClass } from "@ty-plus/ui";
import { Play } from "lucide-react";
import type { JSX } from "react";
import {
	useIsPresetAssetMissing,
	useIsPresetAssetUnverifiable,
} from "@/management/preset/assets/use-health";
import type { IconTileAspect } from "@/management/preset/catalog-browser/layout";
import { iconTileMediaClass } from "@/management/preset/catalog-browser/layout";
import type { Preset } from "@/management/preset/contract";
import { PresetGlyphById } from "@/management/preset/workspace/glyph/by-id";
import {
	glyphBoxFlushClass,
	glyphEmojiProminentClass,
} from "@/management/preset/workspace/glyph/classes";
import { css } from "@/styled-system/css";

export type PresetIconTileProps = {
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

export function PresetIconTile({
	preset: p,
	iconTileAspect,
	presetGlyphSiblingProps,
	setFileBrowserSelectedPath,
	runPreset,
	actionsRunLabel,
	actionsRunBlockedMissingLabel,
	actionsRunBlockedUnverifiableLabel,
}: PresetIconTileProps): JSX.Element {
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
				borderWidth: "hairline",
				borderStyle: "solid",
				borderColor: "border.default",
				backgroundColor: "surface.dialog",
				// The tile is one composite surface: the container owns the
				// border, the fill and the hover. The inner button is
				// `bare`, so it has no hover of its own.
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
					className={cx(iconTileMediaClass(iconTileAspect), widgetSurfaceClass)}
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
						// The run button is absolutely positioned over the
						// tile's bottom-right corner; reserve its width plus
						// offset so long titles truncate before it.
						paddingLeft: "0.5",
						paddingRight: "8",
					})}
					data-preset-tile-title
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
