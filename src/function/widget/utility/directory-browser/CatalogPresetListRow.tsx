import { Play } from "lucide-react";
import type { JSX } from "react";
import { PresetGlyphById } from "@/management/preset";
import type { Preset } from "@/management/preset/contract";
import { Icon } from "@/shared/component";
import { isIMEComposing } from "@/shared/util/keyboard";
import { css } from "@/styled-system/css";
import { basenamePath } from "./lib/file-entry";

export type CatalogPresetListRowProps = {
	preset: Preset;
	presetGlyphSiblingProps: Record<string, unknown>;
	activateCatalogPresetRow: (filePath: string) => void;
	runPreset: (id: string) => Promise<void> | void;
	actionsRunLabel: string;
};

export function CatalogPresetListRow({
	preset: p,
	presetGlyphSiblingProps,
	activateCatalogPresetRow,
	runPreset,
	actionsRunLabel,
}: CatalogPresetListRowProps): JSX.Element {
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
				<button
					type="button"
					className={css({
						display: "flex",
						minWidth: 0,
						flex: 1,
						alignItems: "center",
						gap: "2",
						borderWidth: 0,
						backgroundColor: "transparent",
						padding: 0,
						textAlign: "left",
						fontFamily: "inherit",
						boxShadow: "none",
						outline: "none",
						_hover: { opacity: 0.9 },
						_focusVisible: {
							boxShadow: "0 0 0 2px var(--color-interactive-focus)",
						},
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
					<div className={css({ minWidth: 0 })}>
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
				</button>
				<button
					type="button"
					className={css({
						display: "inline-flex",
						height: "7",
						width: "7",
						flexShrink: 0,
						alignItems: "center",
						justifyContent: "center",
						borderRadius: "shell-sm",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "border.default",
						backgroundColor: "surface.widget",
						opacity: 0.5,
						color: "text.muted",
						_hover: {
							backgroundColor: "interactive.hover",
							color: "text.primary",
						},
					})}
					onClick={() => {
						void runPreset(p.id);
					}}
					aria-label={actionsRunLabel}
					title={actionsRunLabel}
				>
					<Icon icon={Play} size={12} />
				</button>
			</div>
		</li>
	);
}
