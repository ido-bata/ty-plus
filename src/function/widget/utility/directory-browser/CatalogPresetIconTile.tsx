import { Play } from "lucide-react";
import type { JSX } from "react";
import type { IconTileAspect } from "@/management/preset";
import { iconTileMediaClass, PresetGlyphById } from "@/management/preset";
import type { Preset } from "@/management/preset/contract";
import { Icon } from "@/shared/component";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type CatalogPresetIconTileProps = {
	preset: Preset;
	iconTileAspect: IconTileAspect;
	presetGlyphSiblingProps: Record<string, unknown>;
	setFileBrowserSelectedPath: (path: string) => void;
	runPreset: (id: string) => Promise<void> | void;
	actionsRunLabel: string;
};

export function CatalogPresetIconTile({
	preset: p,
	iconTileAspect,
	presetGlyphSiblingProps,
	setFileBrowserSelectedPath,
	runPreset,
	actionsRunLabel,
}: CatalogPresetIconTileProps): JSX.Element {
	return (
		<div
			className={css({
				position: "relative",
				display: "flex",
				minWidth: 0,
				flexDirection: "column",
			})}
			data-directory-browser-entry
			data-entry-kind="preset"
			data-entry-path={p.filePath}
			data-preset-id={p.id}
		>
			<button
				type="button"
				className={css({
					display: "flex",
					width: "full",
					minWidth: 0,
					flexDirection: "column",
					alignItems: "stretch",
					borderRadius: "shell-sm",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					backgroundColor: "surface.dialog",
					padding: "1",
					textAlign: "left",
					outline: "none",
					_hover: { backgroundColor: "interactive.hover" },
					_focusVisible: {
						boxShadow: "0 0 0 2px var(--color-interactive-focus)",
					},
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
							boxClass={css({
								height: "full",
								width: "full",
								maxHeight: "full",
								maxWidth: "full",
								borderWidth: 0,
								padding: "0.5",
							})}
							emojiClass={css({
								"& .ws-preset-icon--emoji": { fontSize: "3xl" },
								"& .ws-preset-icon--text:not([data-ws-preset-text-fit])": {
									fontSize: "shell-text-sm",
								},
							})}
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
			</button>
			<button
				type="button"
				className={css({
					position: "absolute",
					right: "1",
					bottom: "1",
					display: "inline-flex",
					height: "6",
					width: "6",
					alignItems: "center",
					justifyContent: "center",
					borderRadius: "shell-sm",
					borderWidth: "1px",
					borderStyle: "solid",
					borderColor: "border.default",
					backgroundColor: "surface.dialog",
					opacity: 0.9,
					color: "text.muted",
					boxShadow: "sm",
					_hover: {
						backgroundColor: "interactive.hover",
						color: "text.primary",
					},
				})}
				onClick={() => {
					void runPreset(p.id);
				}}
				aria-label={actionsRunLabel}
			>
				<Icon icon={Play} size={11} />
			</button>
		</div>
	);
}
