// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { gridClientPointToCell } from "./grid-coords";

const grid = { cellSize: 40, gap: 4, radius: 4 } as const;

function makeGridEl(rect: {
	left: number;
	top: number;
	right: number;
	bottom: number;
}): HTMLElement {
	const el = document.createElement("div");
	el.setAttribute("data-workspace-grid", "");
	// JSDOM ignores layout: stub getBoundingClientRect for this test.
	el.getBoundingClientRect = () => ({
		x: rect.left,
		y: rect.top,
		left: rect.left,
		top: rect.top,
		right: rect.right,
		bottom: rect.bottom,
		width: rect.right - rect.left,
		height: rect.bottom - rect.top,
		toJSON: () => ({}),
	});
	document.body.appendChild(el);
	return el;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("gridClientPointToCell", () => {
	it("returns null when gridEl is null", () => {
		expect(
			gridClientPointToCell(50, 50, null, { cellSize: 40, gap: 4, radius: 4 }),
		).toBeNull();
	});

	it("maps top-left client point to (0, 0)", () => {
		const el = makeGridEl({ left: 10, top: 20, right: 410, bottom: 320 });
		expect(gridClientPointToCell(10, 20, el, grid)).toEqual({ x: 0, y: 0 });
	});

	it("maps the second column and third row correctly", () => {
		const el = makeGridEl({ left: 0, top: 0, right: 400, bottom: 400 });
		// stride = 44. col=1 starts at 44, col=2 at 88.
		// row=2 starts at 88. center of cell (1,2) is at (44+20, 88+20) = (64, 108).
		expect(gridClientPointToCell(64, 108, el, grid)).toEqual({ x: 1, y: 2 });
	});

	it("clamps to non-negative even when local coordinates go negative", () => {
		// JSDOM does not scroll, so the closest('[data-workspace-scroll]') lookup
		// returns null and scrollLeft/Top default to 0.
		const el = makeGridEl({ left: 0, top: 0, right: 400, bottom: 400 });
		expect(gridClientPointToCell(0, 0, el, grid)).toEqual({ x: 0, y: 0 });
	});

	it("returns null when the point is outside the grid", () => {
		const el = makeGridEl({ left: 100, top: 100, right: 200, bottom: 200 });
		expect(gridClientPointToCell(50, 150, el, grid)).toBeNull();
		expect(gridClientPointToCell(250, 150, el, grid)).toBeNull();
		expect(gridClientPointToCell(150, 50, el, grid)).toBeNull();
		expect(gridClientPointToCell(150, 250, el, grid)).toBeNull();
	});

	it("returns null when cell stride is non-positive", () => {
		const el = makeGridEl({ left: 0, top: 0, right: 400, bottom: 400 });
		expect(
			gridClientPointToCell(50, 50, el, { cellSize: 0, gap: 0, radius: 0 }),
		).toBeNull();
	});
});
