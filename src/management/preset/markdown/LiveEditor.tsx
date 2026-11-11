import type { JSX, ReactNode } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { css, cx } from "@/styled-system/css";
import type { EditorState } from "./commands";
import { PlaceholderOverlay } from "./PlaceholderOverlay";
import { type RenderSegment, renderMarkdown } from "./render";
import { useMarkdownContextMenu } from "./useMarkdownContextMenu";

export type MarkdownLiveEditorProps = {
	id?: string;
	"aria-label"?: string;
	"aria-labelledby"?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
};

const splitLines = (value: string): string[] => {
	if (value === "") return [""];
	return value.split("\n");
};

const lineIndexAtOffset = (value: string, offset: number): number => {
	let idx = 0;
	for (let i = 0; i < offset && i < value.length; i++) {
		if (value[i] === "\n") idx++;
	}
	return idx;
};

const lineOffsetInValue = (lines: string[], lineIndex: number): number => {
	let offset = 0;
	for (let i = 0; i < lineIndex; i++) {
		offset += lines[i].length + 1;
	}
	return offset;
};

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

const lineClass = css({
	minHeight: "1.5rem",
	lineHeight: "6",
	outline: "none",
});

const editorBaseClass = css({
	position: "relative",
	overflow: "hidden",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.widget",
	paddingInline: "3",
	paddingBlock: "3",
	fontSize: "sm",
	lineHeight: "6",
	color: "text.primary",
	transitionProperty: "border-color,box-shadow",
	outline: "none",
	_focusWithin: {
		borderColor: "interactive.focus",
		boxShadow: "inset 0 0 0 1px var(--color-interactive-focus)",
	},
});

const editorMinHeightClass = css({ minHeight: "160px" });

const renderSegmentsToReact = (segments: RenderSegment[]): ReactNode => {
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
};

const findLineElement = (
	node: Node | null,
	root: HTMLElement | null,
): HTMLElement | null => {
	let current: Node | null = node;
	while (current && current !== root) {
		if (current instanceof HTMLElement && current.hasAttribute("data-line")) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
};

const findTextNodeIn = (parent: HTMLElement | null): Text | null => {
	if (!parent) return null;
	let node: Node | null = parent.firstChild;
	while (node) {
		if (node.nodeType === Node.TEXT_NODE) return node as Text;
		node = node.nextSibling;
	}
	return null;
};

function placeCaret(
	textNode: Text,
	offset: number,
	sel: Selection | null,
): void {
	if (!sel) return;
	const range = document.createRange();
	range.setStart(textNode, offset);
	range.collapse(true);
	sel.removeAllRanges();
	sel.addRange(range);
}

function EditorLines({
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
							renderSegmentsToReact(renderMarkdown(line))
						)}
					</div>
				);
			})}
		</>
	);
}

export function MarkdownLiveEditor({
	id,
	value,
	onChange,
	placeholder,
	disabled,
	className,
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledBy,
}: MarkdownLiveEditorProps) {
	const [selection, setSelection] = useState<{
		start: number;
		end: number;
	} | null>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const cursorLineRef = useRef<HTMLSpanElement | null>(null);
	const isComposingRef = useRef(false);
	// True when handleInput captured a caret offset from the browser before
	// React commits. We replay it after the commit so the caret lands where
	// the user actually typed instead of being clobbered by a stale DOM state.
	const pendingCaretOffsetRef = useRef<number | null>(null);

	const lines = useMemo(() => splitLines(value), [value]);

	const cursorLineIndex = useMemo(
		() => (selection === null ? -1 : lineIndexAtOffset(value, selection.start)),
		[value, selection],
	);

	const cursorLineOffset = useMemo(
		() => (cursorLineIndex < 0 ? 0 : lineOffsetInValue(lines, cursorLineIndex)),
		[lines, cursorLineIndex],
	);

	const cursorOffsetInLine = useMemo(() => {
		if (!selection || cursorLineIndex < 0) return 0;
		const lineLen = lines[cursorLineIndex]?.length ?? 0;
		return Math.max(0, Math.min(selection.start - cursorLineOffset, lineLen));
	}, [selection, cursorLineIndex, cursorLineOffset, lines]);

	const applyCommand = useCallback(
		(next: EditorState) => {
			onChange(next.value);
			setSelection(next.selection);
		},
		[onChange],
	);

	useMarkdownContextMenu({
		getEditorState: () => ({
			value,
			selection: selection ?? { start: 0, end: 0 },
		}),
		onApply: applyCommand,
		disabled,
	});

	const handleInput = useCallback(() => {
		if (isComposingRef.current) return;
		if (!editorRef.current) return;

		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);

		const lineDiv = findLineElement(range.startContainer, editorRef.current);
		if (!lineDiv) return;
		const domCursorIdx = Number(lineDiv.getAttribute("data-line"));

		// Capture the caret offset before React commits, but only when the
		// cursor sits inside the current cursor-line span. After Enter or
		// arrow-key navigation the cursor lands on a different DOM node and
		// we let cursorOffsetInLine (derived from selection) do the work.
		if (
			range.startContainer.nodeType === Node.TEXT_NODE &&
			cursorLineRef.current &&
			cursorLineRef.current.contains(range.startContainer)
		) {
			pendingCaretOffsetRef.current = range.startOffset;
		}

		const allLineDivs = Array.from(
			editorRef.current.querySelectorAll("[data-line]"),
		) as HTMLElement[];
		const domLineCount = allLineDivs.length;
		const stateLineCount = lines.length;

		let newLines: string[];
		let newCursorIdx: number;
		if (domLineCount === stateLineCount) {
			// Normal: only the cursor line's text changed (typing or in-line edit).
			// Non-cursor lines are rendered markdown DOM, so their textContent
			// is the rendered text, not the markdown source. Keep state values
			// for them and only adopt the cursor line from DOM.
			newLines = lines.map((line, i) =>
				i === cursorLineIndex ? (allLineDivs[i].textContent ?? "") : line,
			);
			newCursorIdx = domCursorIdx;
		} else if (domLineCount === stateLineCount + 1) {
			// Enter: browser split the cursor line at the previous caret
			// position. The post-caret half is a browser-added div with no
			// React key — remove it before calling onChange so React's
			// reconciliation matches the new state line count.
			const stateCursorIdx = cursorLineIndex;
			const preText = allLineDivs[stateCursorIdx]?.textContent ?? "";
			const postText = allLineDivs[stateCursorIdx + 1]?.textContent ?? "";
			allLineDivs[stateCursorIdx + 1]?.remove();
			newLines = lines.slice();
			newLines.splice(stateCursorIdx, 1, preText, postText);
			newCursorIdx = stateCursorIdx + 1;
		} else if (domLineCount === stateLineCount - 1) {
			// Backspace at line start or Delete at line end: two state lines
			// were joined into one DOM line. domCursorIdx tells us which.
			const stateCursorIdx = cursorLineIndex;
			const joinedIdx =
				domCursorIdx === stateCursorIdx - 1
					? stateCursorIdx - 1
					: domCursorIdx === stateCursorIdx
						? stateCursorIdx
						: -1;
			if (joinedIdx < 0) return;
			newLines = [];
			for (let i = 0; i < domLineCount; i++) {
				if (i < joinedIdx) {
					newLines.push(lines[i] ?? "");
				} else if (i === joinedIdx) {
					newLines.push(allLineDivs[i].textContent ?? "");
				} else {
					newLines.push(lines[i + 1] ?? "");
				}
			}
			newCursorIdx = joinedIdx;
		} else {
			return;
		}

		const newValue = newLines.join("\n");
		const lineOffset = lineOffsetInValue(newLines, newCursorIdx);
		const lineLen = newLines[newCursorIdx]?.length ?? 0;
		const offsetInLine = Math.min(range.startOffset, lineLen);
		const newCursorOffset = lineOffset + offsetInLine;

		setSelection({ start: newCursorOffset, end: newCursorOffset });
		onChange(newValue);
	}, [cursorLineIndex, lines, onChange]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (isComposingRef.current) return;
			if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

			const sel = window.getSelection();
			if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
			const range = sel.getRangeAt(0);
			const currentLineDiv = findLineElement(
				range.startContainer,
				editorRef.current,
			);
			if (!currentLineDiv) return;
			const currentLineIdx = Number(currentLineDiv.getAttribute("data-line"));

			const targetLineIdx =
				e.key === "ArrowDown" ? currentLineIdx + 1 : currentLineIdx - 1;
			if (targetLineIdx < 0 || targetLineIdx >= lines.length) return;

			e.preventDefault();

			const targetLineDiv = editorRef.current.querySelector(
				`[data-line="${targetLineIdx}"]`,
			) as HTMLElement | null;
			if (!targetLineDiv) return;

			// Find a text node inside the target line. For non-cursor lines the
			// DOM is rendered markdown (e.g. <h1>Heading</h1>), so we walk the
			// subtree instead of relying on the first child.
			const walker = document.createTreeWalker(
				targetLineDiv,
				NodeFilter.SHOW_TEXT,
			);
			const firstText = walker.nextNode();
			if (!firstText) return;

			const currentOffset = range.startOffset;
			const targetOffset = Math.min(
				currentOffset,
				(firstText as Text).textContent?.length ?? 0,
			);
			const newRange = document.createRange();
			newRange.setStart(firstText as Text, targetOffset);
			newRange.collapse(true);
			sel.removeAllRanges();
			sel.addRange(newRange);
			// handleSelectionChange (onKeyUp) reads this selection and updates state.
		},
		[lines],
	);

	const handleSelectionChange = useCallback(() => {
		if (isComposingRef.current) return;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
		const range = sel.getRangeAt(0);

		const lineDiv = findLineElement(range.startContainer, editorRef.current);
		if (!lineDiv) return;

		const lineIndex = Number(lineDiv.getAttribute("data-line"));
		const lineOffset = lineOffsetInValue(lines, lineIndex);
		const lineLen = lines[lineIndex]?.length ?? 0;
		const offsetInLine = Math.min(range.startOffset, lineLen);
		const newOffset = lineOffset + offsetInLine;

		setSelection({ start: newOffset, end: newOffset });
	}, [lines]);

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!editorRef.current) return;
			const lineDiv = findLineElement(e.target as Node, editorRef.current);
			if (!lineDiv) return;

			const lineIndex = Number(lineDiv.getAttribute("data-line"));
			if (lineIndex === cursorLineIndex) {
				handleSelectionChange();
				return;
			}

			const lineOffset = lineOffsetInValue(lines, lineIndex);
			setSelection({ start: lineOffset, end: lineOffset });
			editorRef.current.focus();
		},
		[lines, cursorLineIndex, handleSelectionChange],
	);

	// Keep the cursor line's DOM text in sync with the controlled `value`.
	// The cursor line is rendered as an empty <span> on purpose — React must
	// not own its textContent, otherwise updating nodeValue on every keystroke
	// resets the caret to 0. The browser manages the text on typing; we only
	// write the DOM imperatively when the external value diverges from what
	// the DOM already shows.
	useLayoutEffect(() => {
		if (disabled) return;
		if (cursorLineIndex < 0) return;
		const span = cursorLineRef.current;
		if (!span) return;

		const expectedText = lines[cursorLineIndex] ?? "";
		const currentText = span.textContent ?? "";
		const textMatches = currentText === expectedText;

		const pendingOffset = pendingCaretOffsetRef.current;
		pendingCaretOffsetRef.current = null;

		if (!textMatches) {
			span.textContent = expectedText;
		}

		// Use an existing text node, or create one so we can place the caret
		// even when the cursor line is empty (e.g., just after Enter).
		let textNode = findTextNodeIn(span);
		if (!textNode) {
			textNode = document.createTextNode("");
			span.appendChild(textNode);
		}

		const textLength = textNode.textContent?.length ?? 0;
		const targetOffset =
			pendingOffset !== null
				? pendingOffset
				: Math.max(0, Math.min(cursorOffsetInLine, textLength));
		const safeOffset = Math.max(0, Math.min(targetOffset, textLength));

		const sel = window.getSelection();
		try {
			placeCaret(textNode, safeOffset, sel);
		} catch (err) {
			console.warn("caret placement failed", err);
		}
	}, [selection, value, lines, cursorLineIndex, cursorOffsetInLine, disabled]);

	return (
		<div
			ref={editorRef}
			id={id}
			data-markdown-editor=""
			role="textbox"
			tabIndex={0}
			aria-multiline="true"
			aria-disabled={disabled}
			aria-label={ariaLabel ?? placeholder ?? "Markdown editor"}
			aria-labelledby={ariaLabelledBy}
			contentEditable={!disabled}
			suppressContentEditableWarning
			onInput={handleInput}
			onKeyDown={handleKeyDown}
			onKeyUp={handleSelectionChange}
			onClick={handleClick}
			onCompositionStart={() => {
				isComposingRef.current = true;
			}}
			onCompositionEnd={() => {
				isComposingRef.current = false;
			}}
			className={cx(editorBaseClass, editorMinHeightClass, className)}
		>
			{value === "" && placeholder ? (
				<PlaceholderOverlay placeholder={placeholder} />
			) : null}
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
							renderSegmentsToReact(renderMarkdown(line))
						)}
					</div>
				);
			})}
		</div>
	);
}
