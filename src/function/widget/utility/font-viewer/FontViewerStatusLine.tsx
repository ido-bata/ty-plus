import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";
import type { FontLoadVia } from "./use-font-catalog";

export type FontViewerStatusLineProps = {
	loading: boolean;
	familyCount: number;
	filteredFaceCount: number;
	total: number;
	via: FontLoadVia | null;
};

export function FontViewerStatusLine({
	loading,
	familyCount,
	filteredFaceCount,
	total,
	via,
}: FontViewerStatusLineProps): JSX.Element {
	const { t } = useTranslation("widgets");
	return (
		<div
			className={css({
				display: "flex",
				flexShrink: 0,
				flexWrap: "wrap",
				justifyContent: "space-between",
				columnGap: "2",
				rowGap: "0.5",
				borderBottomWidth: "1px",
				borderBottomStyle: "solid",
				borderColor: "border.default",
				opacity: 0.5,
				paddingInline: "0.5",
				paddingBottom: "1",
				fontSize: "text-xs",
				color: "text.muted",
			})}
		>
			<span className={css({ minWidth: 0 })}>
				{loading
					? t("fontViewer.loading", { defaultValue: "Loading…" })
					: t("fontViewer.statsLine", {
							families: familyCount,
							faces: filteredFaceCount,
							total,
						})}
			</span>
			{via ? (
				<span className={css({ flexShrink: 0 })}>
					{via === "after-effects"
						? t("fontViewer.viaAfterEffects", {
								defaultValue: "After Effects (app.fonts)",
							})
						: via === "queryLocalFonts"
							? t("fontViewer.viaLocalApi", {
									defaultValue: "Local Font Access API",
								})
							: t("fontViewer.viaDocumentFonts", {
									defaultValue: "document.fonts (subset)",
								})}
				</span>
			) : null}
		</div>
	);
}
