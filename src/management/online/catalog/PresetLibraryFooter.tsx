import type { JSX } from "react";
import { css } from "@/styled-system/css";

export type PresetLibraryFooterProps = {
	filtered: number;
	catalog: number;
	mode: string;
	scale: number;
};

const footerClass = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "2",
	paddingInline: "4",
	paddingBlock: "1.5",
	flexShrink: 0,
	borderTopWidth: "1px",
	borderTopStyle: "solid",
	borderTopColor: "border.default",
});

const countClass = css({
	fontSize: "xs",
	color: "text.muted",
});

const zoomClass = css({
	fontSize: "2xs",
	color: "text.muted",
});

export function PresetLibraryFooter(
	props: PresetLibraryFooterProps,
): JSX.Element {
	const { filtered, catalog, mode, scale } = props;
	return (
		<div className={footerClass}>
			<span className={countClass}>
				{filtered} / {catalog} items
			</span>
			{mode === "gallery" && (
				<span className={zoomClass}>
					Ctrl+Wheel: {Math.round(scale * 100)}%
				</span>
			)}
		</div>
	);
}
