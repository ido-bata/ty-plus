/**
 * Loop widget toolbar: cycle count, applied/conflict badge, live value readout
 * and the preview play/pause toggle.
 */

import { Button } from "@ty-plus/ui";
import { Pause, Play } from "lucide-react";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";

export type ToolbarProps = {
	cycles: number;
	applied: boolean;
	conflict: boolean;
	/** Normalized preview value (0..1), or null when idle. */
	currentValue: number | null;
	playing: boolean;
	onTogglePlay: () => void;
};

export function Toolbar({
	cycles,
	applied,
	conflict,
	currentValue,
	playing,
	onTogglePlay,
}: ToolbarProps): JSX.Element {
	const { t } = useTranslation("widgets");
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "2",
				paddingInline: "2",
				paddingBlock: "1",
				borderBottomWidth: "1px",
				borderBottomStyle: "solid",
				borderBottomColor: "border.default",
				fontSize: "text-2xs",
				color: "text.muted",
			})}
		>
			<span className={css({ whiteSpace: "nowrap" })}>
				{t("loop.cycles")} {cycles}
			</span>
			{applied ? (
				<span
					className={css({
						color: conflict ? "status.error" : "text.muted",
					})}
				>
					{conflict ? t("loop.conflict") : t("loop.applied")}
				</span>
			) : null}
			<span className={css({ marginLeft: "auto", whiteSpace: "nowrap" })}>
				{currentValue === null ? "" : `${(currentValue * 100).toFixed(0)}%`}
			</span>
			<Button
				variant="ghost"
				uiSize="sm"
				aria-label={playing ? t("loop.pause") : t("loop.play")}
				data-ws-action="loop-preview-toggle"
				onClick={onTogglePlay}
			>
				{playing ? (
					<Pause className={css({ height: "3", width: "3" })} aria-hidden />
				) : (
					<Play className={css({ height: "3", width: "3" })} aria-hidden />
				)}
			</Button>
		</div>
	);
}
