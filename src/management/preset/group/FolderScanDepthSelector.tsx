import { sectionLabelClass } from "@ty-plus/ui";
import type { JSX } from "react";
import { AuthoringSegment } from "@/management/preset/authoring-layout";
import { css } from "@/styled-system/css";

const wrapperClass = css({
	display: "flex",
	flexDirection: "column",
	gap: "1",
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
			<span className={sectionLabelClass}>Folder scan depth</span>
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
