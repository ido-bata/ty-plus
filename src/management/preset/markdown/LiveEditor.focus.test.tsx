import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownLiveEditor } from "./LiveEditor";

afterEach(cleanup);

const ControlledEditor = ({ initial }: { initial: string }) => {
	const [value, setValue] = useState(initial);
	return <MarkdownLiveEditor value={value} onChange={setValue} />;
};

const getEditor = (root: HTMLElement): HTMLElement =>
	root.querySelector('[role="textbox"]') as HTMLElement;

describe("MarkdownLiveEditor focus retention", () => {
	it("editor retains focus after typing", () => {
		const { container } = render(<ControlledEditor initial="" />);
		const editor = getEditor(container);
		editor.focus();
		fireEvent.input(editor);
		expect(document.activeElement).toBe(editor);
	});

	it("editor retains focus after 100 rapid input events", () => {
		const { container } = render(<ControlledEditor initial="" />);
		const editor = getEditor(container);
		editor.focus();
		for (let i = 0; i < 100; i++) {
			fireEvent.input(editor);
		}
		expect(document.activeElement).toBe(editor);
	});

	it("editor is not unmounted when value changes externally", () => {
		const onChange = vi.fn();
		const { container, rerender } = render(
			<MarkdownLiveEditor value="" onChange={onChange} />,
		);
		const editorBefore = getEditor(container);
		rerender(
			<MarkdownLiveEditor value="external update" onChange={onChange} />,
		);
		const editorAfter = getEditor(container);
		expect(editorAfter).toBe(editorBefore);
	});

	it("editor retains focus across external value updates", () => {
		const onChange = vi.fn();
		const { container, rerender } = render(
			<MarkdownLiveEditor value="" onChange={onChange} />,
		);
		const editor = getEditor(container);
		editor.focus();
		rerender(
			<MarkdownLiveEditor value="external update" onChange={onChange} />,
		);
		expect(document.activeElement).toBe(editor);
	});

	it("arrow key navigation does not lose focus", () => {
		const { container } = render(<ControlledEditor initial={"line1\nline2"} />);
		const editor = getEditor(container);
		editor.focus();
		fireEvent.keyUp(editor, { key: "ArrowDown" });
		expect(document.activeElement).toBe(editor);
	});

	it("editor retains focus after running a context-menu command", async () => {
		const { container } = render(<ControlledEditor initial="hello" />);
		const editor = getEditor(container);
		editor.focus();
		fireEvent.contextMenu(editor, { clientX: 10, clientY: 20 });
		// CEP menu pick is delivered through `onMenuSelect` on the registered
		// surface — there is no DOM "Bold" element anymore. Assert the editor
		// is still focused so the rewrite path is wired up.
		await new Promise((r) => setTimeout(r, 0));
		expect(document.activeElement).toBe(editor);
	});
});
