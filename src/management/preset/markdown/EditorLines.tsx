import type { JSX } from "react";
import { css } from "@/styled-system/css";
import { renderLineToReact } from "./renderSegments";

const lineClass = css({
	minHeight: "1.5rem",
	lineHeight: "6",
	outline: "none",
});

export function EditorLines({
	lines,
	cursorLineIndex,
	cursorLineRef,
}: {
	lines: string[];
	cursorLineIndex: number;
	cursorLineRef: React.RefObject<HTMLSpanElement | null>;
}): JSX.Element {
	return (
		<>
			{lines.map((line, idx) => {
				const isCursor = idx === cursorLineIndex;
				return (
					<div
						key={`${idx}-${line.length}-${line.slice(0, 16)}`}
						data-line={idx}
						contentEditable={isCursor}
						aria-hidden="true"
						suppressContentEditableWarning
						className={lineClass}
					>
						{isCursor ? (
							<span ref={cursorLineRef} suppressContentEditableWarning />
						) : line === "" ? (
							""
						) : (
							renderLineToReact(line)
						)}
					</div>
				);
			})}
		</>
	);
}
