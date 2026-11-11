/**
 * Regression test: the CodeEditor (Monaco) container used to have a fixed
 * height baked into the component (200px inline style), with no way for the
 * user to grow or shrink it inside a dialog. ty-plus preset editors
 * established a pattern (invisible bottom handle, pointer drag, min/max
 * clamp) — the code editor must follow the same pattern so the user can
 * resize the editor body to fit longer scripts without losing visibility of
 * the rest of the form.
 *
 * The CodeEditor component itself is excluded from CI (monaco-editor +
 * happy-dom), so source-level assertions are the practical way to lock
 * this in. This matches the source-level assertion pattern used by
 * `markdown/LiveEditor.focus.test.tsx`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const codeSource = readFileSync(new URL("./Code.tsx", import.meta.url), "utf8");

describe("CodeEditor has a bottom resize handle", () => {
	it("declares min and max resize height constants", () => {
		// The clamp must come from named constants so the values are
		// discoverable in the source — magic numbers in JSX make the
		// min/max impossible to reason about.
		expect(codeSource).toMatch(/RESIZE_MIN_HEIGHT\s*=\s*200\b/);
		expect(codeSource).toMatch(/RESIZE_MAX_HEIGHT\s*=\s*800\b/);
	});

	it("renders an invisible resize handle with role=separator", () => {
		// A standard `separator` role with aria-orientation lets assistive
		// tech announce the handle as a draggable divider, matching the
		// existing accessibility contract.
		expect(codeSource).toMatch(/role=["']separator["']/);
		expect(codeSource).toMatch(/aria-orientation=["']horizontal["']/);
	});

	it("marks the handle with a stable data-ty-* selector", () => {
		// The data attribute is the canonical hook for any future CSS
		// override (e.g. widening the hit area in a future iteration) and
		// for any external automation that needs to find the handle.
		expect(codeSource).toMatch(/data-ty-code-resize-handle(?:=["']["'])?/);
	});

	it("exposes aria-valuemin / aria-valuemax / aria-valuenow on the handle", () => {
		// A separator without a current value is not a value-bearing
		// control; the aria-valuemin/max/now trio is what makes it one.
		expect(codeSource).toMatch(/aria-valuemin=\{RESIZE_MIN_HEIGHT\}/);
		expect(codeSource).toMatch(/aria-valuemax=\{RESIZE_MAX_HEIGHT\}/);
		expect(codeSource).toMatch(/aria-valuenow=\{editorHeight\}/);
	});

	it("wires pointer events for resize start/move/end", () => {
		// Pointer events (not mouse events) are required so the handle
		// works with touch + pen input, and so the editor surface does
		// not steal pointer events mid-drag. The ResizeHandle sub-component
		// forwards the four handlers from the parent via named props.
		expect(codeSource).toMatch(/onPointerDown=\{onResizeStart\}/);
		expect(codeSource).toMatch(/onPointerMove=\{onResizeMove\}/);
		expect(codeSource).toMatch(/onPointerUp=\{onResizeEnd\}/);
		expect(codeSource).toMatch(/onPointerCancel=\{onResizeEnd\}/);
	});

	it("gives the handle the ns-resize cursor and disables text selection on drag", () => {
		// The handle must show a vertical-resize cursor on hover and must
		// not start a text selection when the user drags it.
		expect(codeSource).toMatch(/cursor:\s*["']ns-resize["']/);
		expect(codeSource).toMatch(/touchAction:\s*["']none["']/);
		expect(codeSource).toMatch(/userSelect:\s*["']none["']/);
	});

	it("uses the footer-strip pattern with h-3 (12px) strip", () => {
		// The handle is a normal-flow 12px footer strip rendered as a
		// direct child of the CodeEditor wrapper. The dedicated grab area
		// is easier to discover than the previous invisible/overlapping
		// handle and stays consistent across both editor types — both
		// editors are resizeable via the same footer-strip affordance.
		expect(codeSource).toMatch(
			/height:\s*["']3["']\s*,\s*cursor:\s*["']ns-resize["']/,
		);
	});

	it("does not absolutely position the handle", () => {
		// The handle is a footer child in normal flow and must NOT use
		// absolute positioning. The previous `absolute inset-x-0 -bottom-1`
		// pattern was rejected because it overlapped the editor surface,
		// was hard to discover, and was inconsistent with the
		// ty-plus preset editor pattern.
		const handleMatch = codeSource.match(
			/role=["']separator["'][\s\S]*?data-ty-code-resize-handle(?:=["']["'])?/,
		);
		expect(handleMatch).not.toBeNull();
		expect(handleMatch?.[0]).not.toMatch(/\babsolute\b/);
		expect(handleMatch?.[0]).not.toMatch(/inset-x-0/);
	});

	it("uses the dynamic editor height for the Monaco container", () => {
		// The Monaco editor's container must take its height from
		// `editorHeight` (not a fixed 200px inline style) so that dragging
		// the handle actually resizes the editor surface.
		expect(codeSource).toMatch(/height:\s*`\$\{editorHeight\}px`/);
		expect(codeSource).not.toMatch(/height:\s*["']200px["']/);
	});

	it("owns its bordered wrapper so resizing changes the visible UI", () => {
		// The CodeEditor must own its border / border-radius / overflow /
		// background so that the visible bordered area grows when the user
		// drags the handle. This matches the ty-plus preset editor pattern,
		// where the editor IS the bordered wrapper. If the border lives on
		// a parent div instead, the resize only changes the inner Monaco
		// height and the outer UI does not move — which was the previous
		// regression.
		expect(codeSource).toMatch(/borderRadius:\s*["']shell-sm["']/);
		expect(codeSource).toMatch(/borderWidth:\s*["']1px["']/);
		expect(codeSource).toMatch(/borderStyle:\s*["']solid["']/);
		expect(codeSource).toMatch(/borderColor:\s*["']border\.default["']/);
		expect(codeSource).toMatch(/backgroundColor:\s*["']surface\.widget["']/);
		expect(codeSource).toMatch(/overflow:\s*["']hidden["']/);
	});
});
