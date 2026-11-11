import type { JSX } from "react";
import { AuthoringSegment } from "@/management/preset/tool-shell/archive-layout";
import { css } from "@/styled-system/css";

const wrapperClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
});

const labelClass = css({
	fontSize: "xs",
	fontWeight: "medium",
	textTransform: "uppercase",
	letterSpacing: "wide",
	color: "text.muted",
});

export function FolderScanDepthSelector({
	recursive,
	onRecursiveChange,
}: {
	recursive: string;
	onRecursiveChange: (value: string) => void;
}): JSX.Element {
	return (
		<div className={wrapperClass}>
			<span className={labelClass}>Folder scan depth</span>
			<AuthoringSegment
				value={recursive === "true" ? "recursive" : "flat"}
				onChange={onRecursiveChange}
				options={[
					{ value: "flat", label: "Direct" },
					{ value: "recursive", label: "Include descendants" },
				]}
			/>
		</div>
	);
}
