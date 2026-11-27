import type { ReactNode } from "react";
import { css } from "@/styled-system/css";
import { type RenderSegment, renderMarkdown } from "./render";

export function renderLineToReact(line: string): ReactNode {
	if (line === "") return null;
	return renderSegmentsToReact(renderMarkdown(line));
}

/**
 * Per-line fenced-code classification for the live editor (#755).
 *
 * The editor renders one `div[data-line]` per source line and parses each
 * non-cursor line independently, so a multi-line ``` fence used to leak
 * into the inline tokenizer: the delimiter rendered as stray backticks
 * and fence content was parsed as markdown (headings, emphasis) instead
 * of literal code.
 *
 * `"fence"` marks the delimiter lines (``` / ~~~, opening and closing);
 * `"code"` marks the literal lines between them; `"normal"` is everything
 * else. An unclosed fence keeps the rest of the document in `"code"`,
 * matching CommonMark behaviour.
 */
export type FenceLineKind = "normal" | "fence" | "code";

const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;

const fenceRun = (line: string): string | null => {
	const m = FENCE_OPEN_RE.exec(line);
	return m ? m[1] : null;
};

const isFenceClose = (
	line: string,
	openChar: string,
	openLen: number,
): boolean => {
	const m = FENCE_CLOSE_RE.exec(line);
	if (!m) return false;
	const run = m[1];
	return run[0] === openChar && run.length >= openLen;
};

export function computeFenceLineKinds(
	lines: readonly string[],
): FenceLineKind[] {
	const kinds: FenceLineKind[] = new Array(lines.length).fill("normal");
	let openChar: string | null = null;
	let openLen = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const run = fenceRun(line);
		if (openChar === null) {
			if (run) {
				kinds[i] = "fence";
				openChar = run[0];
				openLen = run.length;
			}
			continue;
		}
		if (isFenceClose(line, openChar, openLen)) {
			kinds[i] = "fence";
			openChar = null;
			openLen = 0;
			continue;
		}
		kinds[i] = "code";
	}
	return kinds;
}

const ulListClass = css({
	listStyleType: "disc",
	paddingLeft: "5",
});

const h1Class = css({
	fontSize: "2xl",
	fontWeight: "bold",
	lineHeight: "tight",
});

const h2Class = css({
	fontSize: "xl",
	fontWeight: "bold",
	lineHeight: "tight",
});

const h3Class = css({
	fontSize: "lg",
	fontWeight: "bold",
	lineHeight: "tight",
});

const strongClass = css({ fontWeight: "bold" });
const emClass = css({ fontStyle: "italic" });

const codeClass = css({
	borderRadius: "sm",
	backgroundColor: "surface.panel",
	paddingInline: "1",
	paddingBlock: "0.5",
	fontFamily: "mono",
	fontSize: "0.9em",
});

const linkClass = css({
	color: "text.accent",
	textDecoration: "underline",
});

const paragraphClass = css({ marginBlock: "2" });

function renderSegmentsToReact(segments: RenderSegment[]): ReactNode {
	const out: ReactNode[] = [];
	let i = 0;
	while (i < segments.length) {
		const seg = segments[i];
		if (seg.tag === "ul") {
			const items: ReactNode[] = [];
			i++;
			while (i < segments.length && segments[i].tag === "li") {
				items.push(<li key={segments[i].key}>{segments[i].content}</li>);
				i++;
			}
			if (i < segments.length && segments[i].tag === "ul") i++;
			out.push(
				<ul key={`ul-group-${out.length}`} className={ulListClass}>
					{items}
				</ul>,
			);
			continue;
		}
		if (seg.tag === "h1") {
			out.push(
				<h1 key={seg.key} className={h1Class}>
					{seg.content}
				</h1>,
			);
		} else if (seg.tag === "h2") {
			out.push(
				<h2 key={seg.key} className={h2Class}>
					{seg.content}
				</h2>,
			);
		} else if (seg.tag === "h3") {
			out.push(
				<h3 key={seg.key} className={h3Class}>
					{seg.content}
				</h3>,
			);
		} else if (seg.tag === "strong") {
			out.push(
				<strong key={seg.key} className={strongClass}>
					{seg.content}
				</strong>,
			);
		} else if (seg.tag === "em") {
			out.push(
				<em key={seg.key} className={emClass}>
					{seg.content}
				</em>,
			);
		} else if (seg.tag === "code") {
			out.push(
				<code key={seg.key} className={codeClass}>
					{seg.content}
				</code>,
			);
		} else if (seg.tag === "a") {
			out.push(
				<a
					key={seg.key}
					href={seg.href}
					className={linkClass}
					target="_blank"
					rel="noreferrer noopener"
				>
					{seg.content}
				</a>,
			);
		} else if (seg.tag === "br") {
			out.push(<br key={seg.key} />);
		} else if (seg.tag === "p") {
			out.push(<p key={seg.key} className={paragraphClass} />);
		} else if (seg.content) {
			out.push(<span key={seg.key}>{seg.content}</span>);
		}
		i++;
	}
	return out;
}
