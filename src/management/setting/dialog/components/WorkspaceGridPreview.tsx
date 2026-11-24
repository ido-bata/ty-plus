import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import { GRID_THEME_TOKEN_KEYS } from "@/management/setting/dialog/grid-theme-sync";
import { css } from "@/styled-system/css";

const _PREVIEW_CELL_COUNT = 8;

const CELL_IDS = ["tl", "tr", "bl", "br", "tl2", "tr2", "bl2", "br2"] as const;

const rootStyle = css({
	width: "full",
	minWidth: 0,
	borderRadius: "shell-sm",
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	padding: "var(--ty-space-3)",
});

const gridStyle = css({
	display: "grid",
	width: "full",
	minWidth: 0,
});

const cellStyle = css({
	boxSizing: "border-box",
	minHeight: 0,
	minWidth: 0,
	borderWidth: "hairline",
	borderStyle: "solid",
	borderColor: "ws.gridcell-ring-border",
	backgroundColor: "surface.widget",
});

export function WorkspaceGridPreview(): JSX.Element {
	return (
		<div
			className={rootStyle}
			role="img"
			aria-label={i18n.t("settings:gridSection.previewAria")}
		>
			<div
				className={gridStyle}
				style={{
					gridTemplateColumns: `repeat(4, var(--${GRID_THEME_TOKEN_KEYS.cellSize}))`,
					gap: `var(--${GRID_THEME_TOKEN_KEYS.gap})`,
				}}
			>
				{CELL_IDS.map((id) => (
					<div
						key={id}
						className={cellStyle}
						style={{
							width: `var(--${GRID_THEME_TOKEN_KEYS.cellSize})`,
							height: `var(--${GRID_THEME_TOKEN_KEYS.cellSize})`,
							borderRadius: `var(--${GRID_THEME_TOKEN_KEYS.radius})`,
						}}
					/>
				))}
			</div>
		</div>
	);
}
