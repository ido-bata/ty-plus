import { type JSX, useMemo } from "react";
import { css, cx } from "@/styled-system/css";
import { computeFenceLineKinds, renderLineToReact } from "./renderSegments";

const lineClass = css({
	minHeight: "1.5rem",
	lineHeight: "1.5rem",
	outline: "none",
});

/**
 * Fenced-code rendering (#755): lines inside a ``` / ~~~ block bypass the
 * inline markdown tokenizer and paint as literal monospace text, so fence
 * content no longer leaks stray backticks or fake headings. Delimiter
 * lines stay visible (this is a source editor) but render muted mono.
 */
const fenceMarkerClass = css({
	fontFamily: "mono",
	fontSize: "0.9em",
	color: "text.muted",
});

const codeLineClass = css({
	fontFamily: "mono",
	fontSize: "0.9em",
	backgroundColor: "surface.panel",
	paddingInline: "1",
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
	const fenceKinds = useMemo(() => computeFenceLineKinds(lines), [lines]);
	return (
		<>
			{lines.map((line, idx) => {
				const isCursor = idx === cursorLineIndex;
				const fenceKind = fenceKinds[idx] ?? "normal";
				return (
					<div
						key={`${idx}-${line.length}-${line.slice(0, 16)}`}
						data-line={idx}
						data-fence-kind={fenceKind === "normal" ? undefined : fenceKind}
						contentEditable={isCursor}
						aria-hidden="true"
						suppressContentEditableWarning
						className={cx(
							lineClass,
							fenceKind === "fence" ? fenceMarkerClass : "",
							fenceKind === "code" ? codeLineClass : "",
						)}
					>
						{isCursor ? (
							<span ref={cursorLineRef} suppressContentEditableWarning />
						) : line === "" ? (
							""
						) : fenceKind !== "normal" ? (
							line
						) : (
							renderLineToReact(line)
						)}
					</div>
				);
			})}
		</>
	);
}
