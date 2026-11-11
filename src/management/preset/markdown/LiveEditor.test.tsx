// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownLiveEditor } from "./LiveEditor";

afterEach(cleanup);

const getEditor = (): HTMLElement => screen.getByRole("textbox");

const Controlled = ({ initial }: { initial: string }) => {
	const [value, setValue] = useState(initial);
	return <MarkdownLiveEditor value={value} onChange={setValue} />;
};

describe("MarkdownLiveEditor", () => {
	it("renders a contentEditable editor", () => {
		render(<MarkdownLiveEditor value="" onChange={() => {}} />);
		const editor = getEditor();
		expect(editor).toBeInstanceOf(HTMLDivElement);
		expect(editor.getAttribute("contenteditable")).toBe("true");
	});

	it("displays the initial value as text content", () => {
		render(<MarkdownLiveEditor value="hello" onChange={() => {}} />);
		expect(getEditor().textContent).toContain("hello");
	});

	it("renders parsed markdown on non-cursor lines", () => {
		const { container } = render(
			<MarkdownLiveEditor value="# Heading" onChange={() => {}} />,
		);
		const h1 = container.querySelector("h1");
		expect(h1?.textContent).toBe("Heading");
	});

	it("renders placeholder when value is empty", () => {
		render(
			<MarkdownLiveEditor
				value=""
				onChange={() => {}}
				placeholder="Type here..."
			/>,
		);
		expect(screen.getByText("Type here...")).toBeInTheDocument();
	});

	it("applies input-style border and surface background to match other fields", () => {
		const { container } = render(
			<MarkdownLiveEditor value="hello" onChange={() => {}} />,
		);
		const wrapper = container.querySelector(
			"[data-markdown-editor]",
		) as HTMLElement;
		expect(wrapper).toBeTruthy();
		expect(wrapper.className).toContain("bdr_shell-sm");
		expect(wrapper.className).toContain("bd-c_border.default");
		expect(wrapper.className).toContain("bg-c_surface.widget");
		expect(wrapper.className).toContain("focusWithin:bd-c_interactive.focus");
	});

	it("renders each line as its own DOM element with line index", () => {
		const { container } = render(
			<MarkdownLiveEditor value={"line1\nline2\nline3"} onChange={() => {}} />,
		);
		const lineElements = container.querySelectorAll("[data-line]");
		expect(lineElements.length).toBe(3);
		expect(
			Array.from(lineElements).map((el) => el.getAttribute("data-line")),
		).toEqual(["0", "1", "2"]);
	});

	it("makes only the cursor line editable, the others non-editable", () => {
		const { container } = render(
			<MarkdownLiveEditor value={"line1\nline2\nline3"} onChange={() => {}} />,
		);
		const editor = getEditor();
		editor.focus();
		// Place the cursor on line 1 (position 6 = start of "line2").
		const sel = window.getSelection();
		const line1 = container.querySelector('[data-line="1"]') as HTMLElement;
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(line1.firstChild as Node, 0);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		const lines = container.querySelectorAll("[data-line]");
		expect((lines[0] as HTMLElement).getAttribute("contenteditable")).toBe(
			"false",
		);
		expect((lines[1] as HTMLElement).getAttribute("contenteditable")).toBe(
			"true",
		);
		expect((lines[2] as HTMLElement).getAttribute("contenteditable")).toBe(
			"false",
		);
	});

	it("shows raw markdown on the cursor line, rendered markdown on others", () => {
		const { container } = render(
			<MarkdownLiveEditor value={"**bold**\n# Heading"} onChange={() => {}} />,
		);
		const editor = getEditor();
		editor.focus();
		// Place the cursor on line 0 (the bold line).
		const line0 = container.querySelector('[data-line="0"]') as HTMLElement;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(line0.firstChild as Node, 0);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		const line0El = container.querySelector('[data-line="0"]') as HTMLElement;
		const line1El = container.querySelector('[data-line="1"]') as HTMLElement;

		// Cursor line shows raw markdown text, not rendered elements.
		expect(line0El.querySelector("strong")).toBeNull();
		expect(line0El.textContent).toBe("**bold**");

		// Non-cursor line shows the rendered element.
		expect(line1El.querySelector("h1")?.textContent).toBe("Heading");
	});

	it("preserves the caret inside the typed text after onInput", () => {
		const { container } = render(<Controlled initial="hello" />);
		const editor = getEditor();
		editor.focus();
		// Make line 0 the cursor line by placing caret in its first child.
		const line0 = container.querySelector('[data-line="0"]') as HTMLElement;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(line0.firstChild as Node, 0);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		const cursorLine = container.querySelector(
			'[data-line="0"]',
		) as HTMLElement;
		const textNode = cursorLine.querySelector("span")!.firstChild as Text;
		expect(textNode.textContent).toBe("hello");

		// Simulate browser typing: place caret at offset 5, then append 'x'
		// and move the caret to offset 6 (where the browser places it after
		// inserting text).
		const sel2 = window.getSelection();
		sel2?.removeAllRanges();
		const range2 = document.createRange();
		range2.setStart(textNode, 5);
		range2.collapse(true);
		sel2?.addRange(range2);
		fireEvent.keyUp(editor);
		textNode.appendData("x");
		const sel3 = window.getSelection();
		sel3?.removeAllRanges();
		const range3 = document.createRange();
		range3.setStart(textNode, 6);
		range3.collapse(true);
		sel3?.addRange(range3);
		fireEvent.input(editor);

		expect(container.querySelector('[data-line="0"]')!.textContent).toBe(
			"hellox",
		);
		// Caret must still be at offset 6 (right after the typed 'x'), not 0.
		expect(window.getSelection()?.getRangeAt(0).startOffset).toBe(6);
	});

	it("typing the first character into an empty cursor line renders it exactly once", () => {
		const { container } = render(<Controlled initial="" />);
		const editor = getEditor();
		editor.focus();
		const line0 = container.querySelector('[data-line="0"]') as HTMLElement;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(line0, 0);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		const span = line0.querySelector("span") as HTMLElement;
		const textNode = document.createTextNode("a");
		span.appendChild(textNode);
		const sel2 = window.getSelection();
		sel2?.removeAllRanges();
		const range2 = document.createRange();
		range2.setStart(textNode, 1);
		range2.collapse(true);
		sel2?.addRange(range2);
		fireEvent.input(editor);

		expect(container.querySelector('[data-line="0"]')!.textContent).toBe("a");
	});

	it("typing into the cursor line does not reset its content to the previous value", () => {
		const { container } = render(<Controlled initial="abc" />);
		const editor = getEditor();
		editor.focus();
		const line0 = container.querySelector('[data-line="0"]') as HTMLElement;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(line0.firstChild as Node, 0);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		const cursorLine = container.querySelector(
			'[data-line="0"]',
		) as HTMLElement;
		const textNode = cursorLine.querySelector("span")!.firstChild as Text;
		expect(textNode.textContent).toBe("abc");

		textNode.appendData("d");
		fireEvent.input(editor);

		expect(container.querySelector('[data-line="0"]')!.textContent).toBe(
			"abcd",
		);
	});

	it("applies font-bold to strong elements so bold actually looks bold", () => {
		const { container } = render(
			<MarkdownLiveEditor value="**bold**" onChange={() => {}} />,
		);
		const strong = container.querySelector("strong");
		expect(strong?.className).toContain("fw_bold");
	});

	it("applies italic to em elements", () => {
		const { container } = render(
			<MarkdownLiveEditor value="_italic_" onChange={() => {}} />,
		);
		const em = container.querySelector("em");
		expect(em?.className).toContain("font-style_italic");
	});

	it("applies h1/h2/h3 size and weight styles so headings actually look different", () => {
		const { container } = render(
			<MarkdownLiveEditor value={"# H1\n## H2\n### H3"} onChange={() => {}} />,
		);
		const h1 = container.querySelector("h1");
		const h2 = container.querySelector("h2");
		const h3 = container.querySelector("h3");
		expect(h1?.className).toContain("fs_2xl");
		expect(h1?.className).toContain("fw_bold");
		expect(h2?.className).toContain("fs_xl");
		expect(h2?.className).toContain("fw_bold");
		expect(h3?.className).toContain("fs_lg");
		expect(h3?.className).toContain("fw_bold");
	});

	// DOM-level test: pressing Enter on the cursor line splits it into two
	// line divs. handleInput must rebuild state.value with the extra \n and
	// place the cursor on the new line. (Regression: previously two lines
	// ended up with contenteditable=true and selection was stuck on the old line.)
	it("Enter on the cursor line creates a new line and reports the new value", () => {
		const onChange = vi.fn();
		const { container } = render(
			<ControlledWithSpy initial="abc" onChange={onChange} />,
		);
		const editor = getEditor();
		editor.focus();
		const line0 = container.querySelector('[data-line="0"]') as HTMLElement;
		// Place caret at end of "abc" (offset 3)
		const span = line0.querySelector("span") as HTMLElement;
		const textNode = span.firstChild as Text;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(textNode, 3);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		// Simulate browser Enter: split the cursor line and create a new line div
		// (don't set contenteditable — let React re-render and set it).
		const newLineDiv = document.createElement("div");
		newLineDiv.setAttribute("data-line", "1");
		newLineDiv.className = "min-h-[1.5rem] leading-6 outline-none";
		const newSpan = document.createElement("span");
		newLineDiv.appendChild(newSpan);
		line0.after(newLineDiv);
		// Move caret to new line at offset 0
		const sel2 = window.getSelection();
		sel2?.removeAllRanges();
		const range2 = document.createRange();
		range2.setStart(newSpan, 0);
		range2.collapse(true);
		sel2?.addRange(range2);
		fireEvent.input(editor);

		// After Enter: value should be "abc\n" + (rest). onChange called with new value.
		const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as
			| string
			| undefined;
		expect(lastCall).toBeDefined();
		expect(lastCall!.startsWith("abc\n")).toBe(true);
		// Exactly one line is editable after re-render (only the new cursor line)
		const editableLines = container.querySelectorAll(
			'[data-line][contenteditable="true"]',
		);
		expect(editableLines.length).toBe(1);
		expect(editableLines[0].getAttribute("data-line")).toBe("1");
	});

	// DOM-level test: ArrowDown must move the caret to the next line even when
	// the next line has contenteditable="false". The previous implementation
	// silently dropped the key because Chromium refuses to cross a non-editable
	// sibling.
	it("ArrowDown moves the caret to the next line", () => {
		const { container } = render(
			<MarkdownLiveEditor value={"abc\ndef"} onChange={() => {}} />,
		);
		const editor = getEditor();
		editor.focus();
		// Place caret at end of line 0 ("abc", offset 3)
		const line0 = container.querySelector('[data-line="0"]') as HTMLElement;
		const span = line0.querySelector("span") as HTMLElement;
		const textNode = span.firstChild as Text;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(textNode, 3);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		// Press ArrowDown — should move caret to line 1
		fireEvent.keyDown(editor, { key: "ArrowDown" });
		fireEvent.keyUp(editor);

		const lines = container.querySelectorAll("[data-line]");
		// Exactly one line is the cursor line after the move
		const editableLines = Array.from(lines).filter(
			(l) => l.getAttribute("contenteditable") === "true",
		);
		expect(editableLines.length).toBe(1);
		expect(editableLines[0].getAttribute("data-line")).toBe("1");
	});

	it("ArrowUp moves the caret to the previous line", () => {
		const { container } = render(
			<MarkdownLiveEditor value={"abc\ndef"} onChange={() => {}} />,
		);
		const editor = getEditor();
		editor.focus();
		// Place caret at end of line 1 ("def", offset 3) then commit the selection
		// via keyUp so the cursor-line span is identified.
		const line1 = container.querySelector('[data-line="1"]') as HTMLElement;
		const span = line1.querySelector("span") as HTMLElement;
		const textNode = span.firstChild as Text;
		const sel = window.getSelection();
		sel?.removeAllRanges();
		const range = document.createRange();
		range.setStart(textNode, 3);
		range.collapse(true);
		sel?.addRange(range);
		fireEvent.keyUp(editor);

		fireEvent.keyDown(editor, { key: "ArrowUp" });
		fireEvent.keyUp(editor);

		const lines = container.querySelectorAll("[data-line]");
		const editableLines = Array.from(lines).filter(
			(l) => l.getAttribute("contenteditable") === "true",
		);
		expect(editableLines.length).toBe(1);
		expect(editableLines[0].getAttribute("data-line")).toBe("0");
	});
});

const ControlledWithSpy = ({
	initial,
	onChange,
}: {
	initial: string;
	onChange: (value: string) => void;
}) => {
	const [value, setValue] = useState(initial);
	return (
		<MarkdownLiveEditor
			value={value}
			onChange={(v) => {
				setValue(v);
				onChange(v);
			}}
		/>
	);
};
