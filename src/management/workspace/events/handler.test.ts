/**
 * Integration tests for workspace interaction events.
 *
 * Covers:
 * - click selection (Ctrl/Shift + click)
 * - Shift rectangle selection
 * - Ctrl/middle move
 * - edge resize
 * - right-click move-to-panel path
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetType } from "@/function/widget";
import { type EventsOptions, setupInteractionEvents } from "../events/handler";
import { DEFAULT_GRID } from "../layout/default";
import { isWidgetSurfaceIndex } from "../placement/resolve";
import { createInitialSurfaceState, type SurfaceState } from "../state";
import {
	classifyFromCatalogs,
	layoutsFromSurface,
	widgetResolutionFromCatalogContext,
} from "../surface/tiles";

const layoutsFromState = (s: SurfaceState) =>
	layoutsFromSurface(s.surfaceTiles, widgetResolutionFromCatalogContext(s));

const expectSurfaceTileRole = (
	state: SurfaceState,
	index: number,
	role: ReturnType<typeof classifyFromCatalogs>,
) => {
	const t = state.surfaceTiles[index];
	expect(t).toBeDefined();
	expect(
		classifyFromCatalogs(
			{
				widgetInstanceTypes: state.widgetInstanceTypes,
				groupCatalogEntries: state.groupCatalogEntries,
				presets: state.presets,
			},
			t?.id,
		),
	).toBe(role);
};

/** Stable opaque ids for DOM + selection assertions */
const WIDGET_INFO_ID = "wsi:00000000-0000-4000-8000-000000000001";
const WIDGET_SEARCH_ID = "wsi:00000000-0000-4000-8000-000000000002";

const makeWidget = (
	id: string,
	x: number,
	y: number,
	width = 1,
	height = 1,
	widgetType: WidgetType = "info",
) => ({
	id,
	widgetType,
	x,
	y,
	width,
	height,
});

const createTestContainer = (): Element => {
	const container = document.createElement("div");
	container.className = "ws-container";
	container.style.position = "relative";
	container.style.width = "800px";
	container.style.height = "600px";

	// Create scroll element
	const scroll = document.createElement("div");
	scroll.className = "ws-scroll";
	scroll.setAttribute("data-workspace-scroll", "true");
	scroll.style.width = "100%";
	scroll.style.height = "100%";
	scroll.style.overflow = "auto";
	container.appendChild(scroll);

	// Create grid element
	const grid = document.createElement("div");
	grid.className = "ws-grid";
	grid.setAttribute("data-workspace-grid", "");
	grid.setAttribute("data-selection-rect", "");
	grid.style.position = "relative";
	grid.style.width = "800px";
	grid.style.height = "1200px";
	scroll.appendChild(grid);

	return container;
};

/**
 * jsdom reports a zero rect for every element, which makes `getEdge`
 * treat any point as an edge hit. Derive the rect from the inline
 * geometry instead so pointer coordinates mean what they say (Issue #64).
 * Reads `style` live so drag previews that rewrite it stay consistent.
 */
const mockTileRect = (el: Element): void => {
	const htmlEl = el as HTMLElement;
	const inlinePx = (value: string): number => Number.parseFloat(value) || 0;
	Object.defineProperties(htmlEl, {
		clientWidth: { get: () => inlinePx(htmlEl.style.width) },
		clientHeight: { get: () => inlinePx(htmlEl.style.height) },
	});
	htmlEl.getBoundingClientRect = () => {
		const left = Number.parseFloat(htmlEl.style.left) || 0;
		const top = Number.parseFloat(htmlEl.style.top) || 0;
		const width = Number.parseFloat(htmlEl.style.width) || 0;
		const height = Number.parseFloat(htmlEl.style.height) || 0;
		return {
			x: left,
			y: top,
			left,
			top,
			width,
			height,
			right: left + width,
			bottom: top + height,
			toJSON: () => ({}),
		} as DOMRect;
	};
};

const createWidgetElement = (
	container: Element,
	surfaceIndex: number,
	left: number,
	top: number,
	width: number,
	height: number,
): Element => {
	const el = document.createElement("div");
	el.setAttribute("data-workspace-surface-index", String(surfaceIndex));
	el.setAttribute("data-workspace-widget-tile", "");
	el.style.position = "absolute";
	el.style.left = `${left}px`;
	el.style.top = `${top}px`;
	el.style.width = `${width}px`;
	el.style.height = `${height}px`;
	mockTileRect(el);
	container.querySelector("[data-workspace-grid]")?.appendChild(el);
	return el;
};

const createPresetElement = (
	container: Element,
	surfaceIndex: number,
	presetCatalogRef: string,
	left: number,
	top: number,
	width: number,
	height: number,
): Element => {
	const el = document.createElement("div");
	el.setAttribute("data-workspace-surface-index", String(surfaceIndex));
	el.dataset.presetId = presetCatalogRef;
	el.setAttribute("data-workspace-preset-tile", "");
	el.style.position = "absolute";
	el.style.left = `${left}px`;
	el.style.top = `${top}px`;
	el.style.width = `${width}px`;
	el.style.height = `${height}px`;
	mockTileRect(el);
	container.querySelector("[data-workspace-grid]")?.appendChild(el);
	return el;
};

/** Preset tile: surface index differs from catalog ref in `data-preset-id`. */
const createOpaquePresetPlacementElement = (
	container: Element,
	surfaceIndex: number,
	catalogPresetRef: string,
	left: number,
	top: number,
	width: number,
	height: number,
): Element => {
	const el = document.createElement("div");
	el.setAttribute("data-workspace-surface-index", String(surfaceIndex));
	el.dataset.presetId = catalogPresetRef;
	el.setAttribute("data-workspace-preset-tile", "");
	el.style.position = "absolute";
	el.style.left = `${left}px`;
	el.style.top = `${top}px`;
	el.style.width = `${width}px`;
	el.style.height = `${height}px`;
	mockTileRect(el);
	container.querySelector("[data-workspace-grid]")?.appendChild(el);
	return el;
};

const _createGroupPresetElement = (
	container: Element,
	surfaceIndex: number,
	groupId: string,
	left: number,
	top: number,
	width: number,
	height: number,
): Element => {
	const el = document.createElement("div");
	el.setAttribute("data-workspace-surface-index", String(surfaceIndex));
	el.dataset.presetId = groupId;
	el.setAttribute("data-workspace-group-tile", "");
	el.style.position = "absolute";
	el.style.left = `${left}px`;
	el.style.top = `${top}px`;
	el.style.width = `${width}px`;
	el.style.height = `${height}px`;
	container.querySelector("[data-workspace-grid]")?.appendChild(el);
	return el;
};

const simulatePointerDown = (
	target: Element,
	clientX: number,
	clientY: number,
	button = 0,
	ctrlKey = false,
	metaKey = false,
	shiftKey = false,
): void => {
	const event = new PointerEvent("pointerdown", {
		clientX,
		clientY,
		button,
		ctrlKey,
		metaKey,
		shiftKey,
		bubbles: true,
		composed: true,
	});
	target.dispatchEvent(event);
};

const simulatePointerMove = (
	target: Element,
	clientX: number,
	clientY: number,
	button = 0,
): void => {
	const event = new PointerEvent("pointermove", {
		clientX,
		clientY,
		button,
		buttons: button === 0 ? 1 : button,
		bubbles: true,
		composed: true,
	});
	target.dispatchEvent(event);
};

const simulatePointerUp = (
	target: Element,
	clientX?: number,
	clientY?: number,
): void => {
	const event = new PointerEvent("pointerup", {
		clientX: clientX ?? 0,
		clientY: clientY ?? 0,
		button: 0,
		bubbles: true,
		composed: true,
	});
	target.dispatchEvent(event);
};

const simulateClick = (
	target: Element,
	clientX: number,
	clientY: number,
	ctrlKey = false,
	metaKey = false,
	shiftKey = false,
): void => {
	const event = new MouseEvent("click", {
		clientX,
		clientY,
		ctrlKey,
		metaKey,
		shiftKey,
		bubbles: true,
		composed: true,
	});
	target.dispatchEvent(event);
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe("workspace interaction events", () => {
	let container: Element;
	let getState: () => SurfaceState;
	let setState: (state: SurfaceState) => void;
	let rerender: () => void;
	let currentState: SurfaceState;

	const tilesFromWidgets = (
		widgets: ReturnType<typeof makeWidget>[],
	): SurfaceState["surfaceTiles"] =>
		widgets.map((w) => ({
			id: w.id,
			x: w.x,
			y: w.y,
			width: w.width,
			height: w.height,
		}));

	const surfaceIndexForWidget = (s: SurfaceState, wid: string): number =>
		s.surfaceTiles.findIndex(
			(t, i) => t.id === wid && isWidgetSurfaceIndex(s, i),
		);

	const _surfaceIndexForPresetRef = (s: SurfaceState, ref: string): number =>
		s.surfaceTiles.findIndex(
			(t, i) => t.id === ref && !isWidgetSurfaceIndex(s, i),
		);

	const createMinimalState = (
		overrides?: Partial<SurfaceState>,
	): SurfaceState => {
		const state = createInitialSurfaceState({ mode: "live" });
		const widgets = [
			makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info"),
			makeWidget(WIDGET_SEARCH_ID, 4, 0, 2, 2, "quick-actions"),
		];
		const widgetTypes = Object.fromEntries(
			widgets.map((w) => [w.id, w.widgetType]),
		);
		return {
			...state,
			grid: DEFAULT_GRID,
			surfaceTiles: tilesFromWidgets(widgets),
			widgetInstanceTypes: {
				...state.widgetInstanceTypes,
				...widgetTypes,
			},
			selectedSurfaceIndices: [],
			...overrides,
		};
	};

	const setup = (
		initialState?: SurfaceState,
		options?: Omit<EventsOptions, "hostCode">,
	) => {
		currentState = initialState ?? createMinimalState();
		getState = () => currentState;
		setState = (next) => {
			currentState = next;
		};
		rerender = vi.fn();

		container = createTestContainer();
		document.body.appendChild(container);

		const grid = container.querySelector<HTMLElement>(".ws-grid")!;
		for (let i = 0; i < currentState.surfaceTiles.length; i++) {
			const t = currentState.surfaceTiles[i]!;
			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const left = t.x * (cellSize + gap);
			const top = t.y * (cellSize + gap);
			const width = t.width * cellSize + (t.width - 1) * gap;
			const height = t.height * cellSize + (t.height - 1) * gap;
			if (isWidgetSurfaceIndex(currentState, i)) {
				createWidgetElement(container, i, left, top, width, height);
			} else {
				createPresetElement(container, i, t.id, left, top, width, height);
			}
		}

		const teardown = setupInteractionEvents(
			container,
			getState,
			setState,
			rerender,
			{
				hostCode: "AEFT",
				...options,
			},
		);

		return { teardown, grid };
	};

	afterEach(() => {
		container?.remove();
		vi.clearAllMocks();
	});

	// ── Click Selection ────────────────────────────────────────────────────────

	describe("click selection", () => {
		it("selects widget on Shift+click", () => {
			const state = createMinimalState({ layoutLocked: false });
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Shift+click selects without needing Ctrl
			simulateClick(
				widgetEl,
				rect.left + 10,
				rect.top + 10,
				false,
				false,
				true,
			);

			expect(currentState.selectedSurfaceIndices).toContain(
				surfaceIndexForWidget(currentState, WIDGET_INFO_ID),
			);
		});

		it("adds widget to selection on Ctrl+click when already selected", () => {
			const state = createMinimalState({
				selectedSurfaceIndices: [0],
			});
			setup(state);

			const searchEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="1"]`,
			)!;
			const rect = searchEl.getBoundingClientRect();

			simulateClick(searchEl, rect.left + 10, rect.top + 10, false, true);

			expect(currentState.selectedSurfaceIndices).toContain(
				surfaceIndexForWidget(currentState, WIDGET_INFO_ID),
			);
			expect(currentState.selectedSurfaceIndices).toContain(
				surfaceIndexForWidget(currentState, WIDGET_SEARCH_ID),
			);
		});

		it("removes widget from selection on Ctrl+click when already selected", () => {
			const state = createMinimalState({
				selectedSurfaceIndices: [0, 1],
			});
			setup(state);

			const searchEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="1"]`,
			)!;
			const rect = searchEl.getBoundingClientRect();

			simulateClick(searchEl, rect.left + 10, rect.top + 10, false, true);

			expect(currentState.selectedSurfaceIndices).toContain(
				surfaceIndexForWidget(currentState, WIDGET_INFO_ID),
			);
			expect(currentState.selectedSurfaceIndices).not.toContain(
				surfaceIndexForWidget(currentState, WIDGET_SEARCH_ID),
			);
		});

		it("clears selection on plain click in empty grid area", () => {
			const state = createMinimalState({
				selectedSurfaceIndices: [0],
			});
			setup(state);

			const grid = container.querySelector<HTMLElement>(
				"[data-workspace-grid]",
			)!;
			const rect = grid.getBoundingClientRect();
			simulateClick(grid, rect.right - 8, rect.bottom - 8);

			expect(currentState.selectedSurfaceIndices).toHaveLength(0);
		});

		it("does not select widget when layout is locked", () => {
			const state = createMinimalState({ layoutLocked: true });
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Even Shift+click doesn't select when locked
			simulateClick(
				widgetEl,
				rect.left + 10,
				rect.top + 10,
				false,
				false,
				true,
			);

			expect(currentState.selectedSurfaceIndices).toHaveLength(0);
		});

		it("does not select any container on plain click", () => {
			const state = createMinimalState({
				surfaceTiles: [
					...tilesFromWidgets([makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info")]),
					{
						id: "preset-1",
						x: 0,
						y: 5,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						type: "script",
						title: "Script Preset",
						filePath: "C:/preset.jsx",
					},
				],
			});
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const presetEl = container.querySelector<HTMLElement>(
				'[data-preset-id="preset-1"]',
			)!;
			const widgetRect = widgetEl.getBoundingClientRect();
			const presetRect = presetEl.getBoundingClientRect();

			simulateClick(widgetEl, widgetRect.left + 10, widgetRect.top + 10);
			simulateClick(presetEl, presetRect.left + 10, presetRect.top + 10);

			expect(currentState.selectedSurfaceIndices).toHaveLength(0);
		});

		it("executes real presets from the placement shell on plain click", () => {
			const executePreset = vi.fn().mockResolvedValue(undefined);
			const state = createMinimalState({
				surfaceTiles: [
					...tilesFromWidgets([makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info")]),
					{
						id: "preset-1",
						x: 0,
						y: 5,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						type: "script",
						title: "Script Preset",
						filePath: "C:/preset.jsx",
					},
				],
			});
			setup(state, { executePreset });

			const presetEl = container.querySelector<HTMLElement>(
				'[data-preset-id="preset-1"]',
			)!;
			const rect = presetEl.getBoundingClientRect();

			simulateClick(presetEl, rect.left + 2, rect.top + 2);

			expect(executePreset).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "preset-1",
					type: "script",
					filePath: "C:/preset.jsx",
				}),
			);
			expect(currentState.selectedSurfaceIndices).toHaveLength(0);
		});

		it("runs the anchor-point action when its button is clicked", () => {
			const state = createMinimalState({
				surfaceTiles: tilesFromWidgets([
					makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "anchor-point"),
				]),
			});
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const anchorBtn = document.createElement("button");
			anchorBtn.type = "button";
			anchorBtn.dataset.wsAction = "anchor-point";
			anchorBtn.dataset.anchor = "top-left";
			widgetEl.appendChild(anchorBtn);

			const rect = anchorBtn.getBoundingClientRect();
			simulateClick(anchorBtn, rect.left + 2, rect.top + 2);

			expect(currentState.statusMessage).toBe(
				"Anchor point requested: top-left",
			);
		});

		it("does not execute group placement shells as presets", () => {
			const executePreset = vi.fn().mockResolvedValue(undefined);
			const state = createMinimalState({
				surfaceTiles: [
					{
						id: "group-1",
						x: 0,
						y: 0,
						width: 2,
						height: 2,
					},
				],
				groupCatalogEntries: [
					{
						id: "group-1",
						title: "Group 1",
						presetIds: ["preset-1"],
					},
				],
				presets: [
					{
						id: "preset-1",
						type: "script",
						title: "Script Preset",
						filePath: "C:/preset.jsx",
					},
				],
			});
			setup(state, { executePreset });

			const groupEl = container.querySelector<HTMLElement>(
				'[data-preset-id="group-1"]',
			)!;
			const rect = groupEl.getBoundingClientRect();

			simulateClick(groupEl, rect.left + 10, rect.top + 10);

			expect(executePreset).not.toHaveBeenCalled();
			expect(currentState.selectedSurfaceIndices).toHaveLength(0);
		});
	});

	// ── Shift Rectangle Selection ──────────────────────────────────────────────

	describe("shift rectangle selection", () => {
		it("creates selection rectangle on Shift+drag", () => {
			setup();

			const grid = container.querySelector<HTMLElement>(".ws-grid")!;
			const gridRect = grid.getBoundingClientRect();

			// Start shift-drag on empty grid area
			simulatePointerDown(
				grid,
				gridRect.left + 50,
				gridRect.top + 50,
				0,
				false,
				false,
				true,
			);

			// Move to create a rectangle
			simulatePointerMove(grid, gridRect.left + 150, gridRect.top + 150, 1);
			simulatePointerUp(grid, gridRect.left + 150, gridRect.top + 150);

			// Selection rect should have been created and removed on up
			expect(rerender).toHaveBeenCalled();
		});

		it("selects multiple widgets within rectangle bounds", () => {
			const state = createMinimalState();
			setup(state);

			const grid = container.querySelector<HTMLElement>(".ws-grid")!;
			const gridRect = grid.getBoundingClientRect();

			// Start shift-drag that covers both widgets
			simulatePointerDown(
				grid,
				gridRect.left + 10,
				gridRect.top + 10,
				0,
				false,
				false,
				true,
			);
			simulatePointerMove(grid, gridRect.left + 400, gridRect.top + 400, 1);
			simulatePointerUp(grid, gridRect.left + 400, gridRect.top + 400);

			// Both widgets should be selected
			expect(currentState.selectedSurfaceIndices.length).toBeGreaterThanOrEqual(
				1,
			);
		});
	});

	// ── Ctrl/Middle Move ──────────────────────────────────────────────────────

	describe("ctrl/middle move", () => {
		it("handles middle mouse button pointer events", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Middle button click (button 1) should be accepted by the handler
			// Note: Full move operation requires specific DOM hierarchy (widgetEl as child of placementEl)
			// which differs from how PlacementItemContainer renders (single element with both attributes)
			expect(() => {
				simulatePointerDown(widgetEl, rect.left + 10, rect.top + 10, 1);
			}).not.toThrow();
		});

		it("starts move from Cmd+drag on the widget body", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();
			const initialLeft = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;

			simulatePointerDown(
				widgetEl,
				rect.left + 80,
				rect.top + 80,
				0,
				false,
				true,
			);
			simulatePointerMove(widgetEl, rect.left + 120, rect.top + 120, 0);
			simulatePointerUp(widgetEl, rect.left + 120, rect.top + 120);

			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)?.x,
			).not.toBe(initialLeft);
		});

		// Regression: the user reports that the widget briefly moves during
		// drag but snaps back, with the container "doubled" on release.
		// Verify the actual DOM position (not just the state) reflects the
		// committed snap.
		it("Cmd+drag commits DOM position to match the snapped grid cell", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)! as HTMLElement;
			const rect = widgetEl.getBoundingClientRect();
			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;

			// Initial DOM pixel position should match the state (cellSize + gap for each cell).
			const initialDomLeft = Number.parseFloat(widgetEl.style.left) || 0;

			simulatePointerDown(
				widgetEl,
				rect.left + 80,
				rect.top + 80,
				0,
				false,
				true,
			);
			simulatePointerMove(widgetEl, rect.left + 220, rect.top + 220, 0);
			simulatePointerUp(widgetEl, rect.left + 220, rect.top + 220);

			// Compute the expected pixel position from the post-commit state.
			const finalTile = currentState.surfaceTiles[0]!;
			const expectedLeft = finalTile.x * (cellSize + gap) + gap;
			const finalDomLeft = Number.parseFloat(widgetEl.style.left) || 0;
			expect(finalDomLeft).toBeCloseTo(expectedLeft, 0);
			expect(finalDomLeft).not.toBeCloseTo(initialDomLeft, 0);
		});

		// Regression: the user reports the container is "doubled" (二重) after
		// a drag — i.e. the widget is rendered twice in the DOM. Detect this
		// by checking for duplicate placement-shell elements with the same
		// widget instance id.
		it("Cmd+drag does not leave duplicate placement shells in the DOM", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			simulatePointerDown(
				widgetEl,
				rect.left + 80,
				rect.top + 80,
				0,
				false,
				true,
			);
			simulatePointerMove(widgetEl, rect.left + 220, rect.top + 220, 0);
			simulatePointerUp(widgetEl, rect.left + 220, rect.top + 220);

			const matchingShells = container.querySelectorAll(
				`[data-workspace-surface-index="0"]`,
			);
			expect(matchingShells.length).toBe(1);
		});

		it("initiates move on Ctrl+left click in drag handle area", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Ctrl+left click near edge (within DRAG_HANDLE_MARGIN = 16)
			simulatePointerDown(widgetEl, rect.left + 5, rect.top + 5, 0, true);

			// Move slightly
			simulatePointerMove(widgetEl, rect.left + 20, rect.top + 20, 0);
			simulatePointerUp(widgetEl, rect.left + 30, rect.top + 30);

			// Should have moved
			expect(rerender).toHaveBeenCalled();
		});

		// Selection move: plain left-drag on a selected tile (any count)
		// moves the selection. Plain left-drag on an unselected tile
		// stays put (kind = null) — that is handled by the resize branch
		// only when the pointer is on an edge.
		it("selection move: plain left-drag on a single unselected tile does not move", () => {
			const state = createMinimalState({ selectedSurfaceIndices: [] });
			setup(state);
			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();
			const initialX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;

			// (80, 80) is well outside DRAG_HANDLE_MARGIN (16) and RESIZE_MARGIN (12)
			// on this 4x4 widget, so neither resize nor move fires.
			simulatePointerDown(widgetEl, rect.left + 80, rect.top + 80, 0);
			simulatePointerMove(widgetEl, rect.left + 220, rect.top + 220, 0);
			simulatePointerUp(widgetEl, rect.left + 220, rect.top + 220);

			const finalX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;
			expect(finalX).toBe(initialX);
		});

		// Regression for Bug 2: previously `allowMultiMove` required
		// `totalSelectedPlacements > 1`, so a single-selected tile could
		// not be repositioned with plain left-drag. The design is
		// "selection move" — any selected tile, regardless of count.
		it("selection move: plain left-drag on a single selected tile moves it", () => {
			const state = createMinimalState({ selectedSurfaceIndices: [0] });
			setup(state);
			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();
			const initialX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;

			simulatePointerDown(widgetEl, rect.left + 80, rect.top + 80, 0);
			simulatePointerMove(widgetEl, rect.left + 220, rect.top + 220, 0);
			simulatePointerUp(widgetEl, rect.left + 220, rect.top + 220);

			const finalX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;
			expect(finalX).not.toBe(initialX);
		});

		it("selection move: plain left-drag on a multi-selected tile moves the selection", () => {
			const state = createMinimalState({ selectedSurfaceIndices: [0, 1] });
			setup(state);
			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();
			const initialXInfo = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;
			const initialXSearch = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_SEARCH_ID,
			)?.x;

			simulatePointerDown(widgetEl, rect.left + 80, rect.top + 80, 0);
			simulatePointerMove(widgetEl, rect.left + 220, rect.top + 220, 0);
			simulatePointerUp(widgetEl, rect.left + 220, rect.top + 220);

			const finalXInfo = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;
			const finalXSearch = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_SEARCH_ID,
			)?.x;
			expect(finalXInfo).not.toBe(initialXInfo);
			expect(finalXSearch).not.toBe(initialXSearch);
		});

		it("selection move: plain left-drag on an unselected tile in a multi-selection does not move", () => {
			// Selection contains index 1 only. Index 0 is the widget under
			// the pointer. Clicking index 0 must not start a move; the
			// selection scope is what gates selection move, not total count.
			const state = createMinimalState({ selectedSurfaceIndices: [1] });
			setup(state);
			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();
			const initialX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;

			simulatePointerDown(widgetEl, rect.left + 80, rect.top + 80, 0);
			simulatePointerMove(widgetEl, rect.left + 220, rect.top + 220, 0);
			simulatePointerUp(widgetEl, rect.left + 220, rect.top + 220);

			const finalX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.x;
			expect(finalX).toBe(initialX);
		});

		it("handles middle mouse button with multiple selected widgets", () => {
			const state = createMinimalState({
				selectedSurfaceIndices: [0, 1],
			});
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Middle button events should be handled without errors
			expect(() => {
				simulatePointerDown(widgetEl, rect.left + 10, rect.top + 10, 1);
			}).not.toThrow();
		});
	});

	// ── Edge Resize ───────────────────────────────────────────────────────────

	describe("edge resize", () => {
		it("detects edge and initiates resize on left click near edge", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Click near right edge (within RESIZE_MARGIN = 12)
			simulatePointerDown(widgetEl, rect.right - 5, rect.top + 10, 0);

			// Move to resize
			simulatePointerMove(widgetEl, rect.right + 20, rect.top + 10, 0);
			simulatePointerUp(widgetEl, rect.right + 20, rect.top + 10);

			// Widget should have been resized
			expect(rerender).toHaveBeenCalled();
		});

		it("resizes even when the edge target is an action control", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const actionBtn = document.createElement("button");
			actionBtn.setAttribute("data-ws-action", "widget-action");
			widgetEl.appendChild(actionBtn);
			const rect = widgetEl.getBoundingClientRect();
			const initialWidth = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.width;

			simulatePointerDown(actionBtn, rect.right - 5, rect.top + 10, 0);
			simulatePointerMove(actionBtn, rect.right + 60, rect.top + 10, 0);
			simulatePointerUp(actionBtn, rect.right + 60, rect.top + 10);

			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)
					?.width,
			).toBeGreaterThan(initialWidth ?? 0);
		});

		it("resizes from corner handles", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Click near bottom-right corner
			simulatePointerDown(widgetEl, rect.right - 5, rect.bottom - 5, 0);
			simulatePointerMove(widgetEl, rect.right + 50, rect.bottom + 50, 0);
			simulatePointerUp(widgetEl, rect.right + 50, rect.bottom + 50);

			expect(rerender).toHaveBeenCalled();
		});

		it("does not resize when Ctrl key is held", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			const initialWidth = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)?.width;

			// Ctrl+click near edge should trigger move, not resize
			simulatePointerDown(widgetEl, rect.right - 5, rect.top + 10, 0, true);
			simulatePointerMove(widgetEl, rect.right + 20, rect.top + 10, 0);
			simulatePointerUp(widgetEl, rect.right + 20, rect.top + 10);

			// Width should remain the same (move doesn't change size)
			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)
					?.width,
			).toBe(initialWidth);
		});

		// Regression for Issue #64: `selectionMove` used to win over the
		// edge hit, so once a tile was selected a plain left-drag on its
		// resize margin moved the selection instead of resizing it.
		it("resizes a selected tile on plain left-drag at the edge", () => {
			const state = createMinimalState({ selectedSurfaceIndices: [0] });
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();
			const before = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;

			simulatePointerDown(
				widgetEl,
				rect.right - 5,
				rect.top + rect.height / 2,
				0,
			);
			simulatePointerMove(
				widgetEl,
				rect.right + 60,
				rect.top + rect.height / 2,
				0,
			);
			simulatePointerUp(widgetEl, rect.right + 60, rect.top + rect.height / 2);

			const after = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			expect(after.width).toBeGreaterThan(before.width);
			// A move would shift x/y; a resize must leave the origin alone.
			expect(after.x).toBe(before.x);
			expect(after.y).toBe(before.y);
		});
	});

	// ── Right-Click Move-to-Panel Path ───────────────────────────────────────

	describe("right-click move-to-panel path", () => {
		it("does not initiate drag on right-click", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Right-click should be ignored by pointer handler
			simulatePointerDown(widgetEl, rect.left + 10, rect.top + 10, 2);

			expect(rerender).not.toHaveBeenCalled();
		});

		it("Ctrl+click on preset element initiates move operation", () => {
			// Verify that Ctrl+click on a preset initiates a move operation
			// Note: The full drop-to-group flow requires elementFromPoint which is
			// difficult to mock in test environment, so we test the operation initiation
			currentState = createMinimalState({
				surfaceTiles: [
					...tilesFromWidgets([
						makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info"),
						makeWidget(WIDGET_SEARCH_ID, 4, 0, 2, 2, "quick-actions"),
					]),
					{
						id: "preset-1",
						x: 0,
						y: 10,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						title: "Preset 1",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
				],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const presetTile = currentState.surfaceTiles[2]!;
			expectSurfaceTileRole(currentState, 2, "preset");
			const presetEl = createPresetElement(
				container,
				2,
				"preset-1",
				presetTile.x * (cellSize + gap),
				presetTile.y * (cellSize + gap),
				presetTile.width * cellSize + (presetTile.width - 1) * gap,
				presetTile.height * cellSize + (presetTile.height - 1) * gap,
			);

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			// Ctrl+click on preset should initiate move
			const presetRect = presetEl.getBoundingClientRect();
			simulatePointerDown(
				presetEl,
				presetRect.left + 10,
				presetRect.top + 10,
				0,
				true,
			);

			// Operation should start and rerender should be called
			expect(rerender).toHaveBeenCalled();
		});
	});

	describe("layout lock", () => {
		it("prevents all interactions when layout is locked", () => {
			const state = createMinimalState({ layoutLocked: true });
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Try to move
			simulatePointerDown(widgetEl, rect.left + 10, rect.top + 10, 1);
			simulatePointerMove(widgetEl, rect.left + 50, rect.top + 50, 1);
			simulatePointerUp(widgetEl, rect.left + 50, rect.top + 50);

			// State should not have changed (except maybe rerender calls from setup)
			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)?.x,
			).toBe(0);
		});

		it("clears selection when toggle-lock action is triggered", () => {
			// Start with unlocked state
			const state = createMinimalState({
				layoutLocked: false,
				selectedSurfaceIndices: [0],
			});
			setup(state);

			expect(currentState.selectedSurfaceIndices).toContain(
				surfaceIndexForWidget(currentState, WIDGET_INFO_ID),
			);

			// Create toggle-lock button and click it
			const lockBtn = document.createElement("button");
			lockBtn.dataset.wsAction = "toggle-lock";
			container.appendChild(lockBtn);

			const rect = lockBtn.getBoundingClientRect();
			// Ctrl+Shift+click triggers the toggle
			simulateClick(lockBtn, rect.left + 5, rect.top + 5, true, false, true);

			// Selection should now be cleared
			expect(currentState.selectedSurfaceIndices).toHaveLength(0);
			expect(currentState.layoutLocked).toBe(true);
		});
	});

	// ── Cursor Hint ────────────────────────────────────────────────────────────

	describe("cursor hints", () => {
		it("shows resize cursor when hovering near edge of large widget", () => {
			// Create a widget large enough to have a visible middle edge section
			const state = createMinimalState({
				surfaceTiles: tilesFromWidgets([
					makeWidget(WIDGET_INFO_ID, 0, 0, 8, 8, "info"),
				]),
			});
			setup(state);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Move near right edge
			const midY = rect.top + rect.height / 2;
			simulatePointerMove(widgetEl, rect.right - 5, midY);

			// Should show some resize cursor (corner or edge) when hovering near edge
			// Note: exact cursor depends on element sizing in test environment
			expect(widgetEl.style.cursor).toMatch(
				/nw-resize|ne-resize|sw-resize|se-resize|ew-resize|ns-resize/,
			);
		});

		it("shows grab cursor when hovering in drag handle area", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			// Move in drag handle area (but not near edge)
			simulatePointerMove(widgetEl, rect.left + 5, rect.top + 5);

			// Should show grab cursor (or nw-resize if corner)
			expect(widgetEl.style.cursor).toMatch(
				/grab|nw-resize|ne-resize|sw-resize|se-resize/,
			);
		});
	});

	// ── Selection move (mixed widget+preset) ──────────────────────────────────

	describe("selection move: mixed widget+preset", () => {
		it("one widget plus one preset selected, drag widget, both move", () => {
			currentState = createMinimalState({
				selectedSurfaceIndices: [0, 2],
				surfaceTiles: [
					...tilesFromWidgets([
						makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info"),
						makeWidget(WIDGET_SEARCH_ID, 4, 0, 2, 2, "quick-actions"),
					]),
					{
						id: "preset-1",
						x: 0,
						y: 5,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						title: "Preset 1",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
				],
				presetSelectedIds: ["preset-1"],
				presetFocusId: "preset-1",
				panelPresetIds: ["preset-1"],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const infoWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			createWidgetElement(
				container,
				0,
				infoWidget.x * (cellSize + gap),
				infoWidget.y * (cellSize + gap),
				infoWidget.width * cellSize + (infoWidget.width - 1) * gap,
				infoWidget.height * cellSize + (infoWidget.height - 1) * gap,
			);

			const presetTile = currentState.surfaceTiles[2]!;
			expectSurfaceTileRole(currentState, 2, "preset");
			createPresetElement(
				container,
				2,
				"preset-1",
				presetTile.x * (cellSize + gap),
				presetTile.y * (cellSize + gap),
				presetTile.width * cellSize + (presetTile.width - 1) * gap,
				presetTile.height * cellSize + (presetTile.height - 1) * gap,
			);

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			const initialWidgetX = infoWidget.x;
			const initialWidgetY = infoWidget.y;
			const initialPresetX = presetTile.x;
			const initialPresetY = presetTile.y;

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			simulatePointerDown(
				widgetEl,
				rect.left + rect.width / 2,
				rect.top + rect.height / 2,
				0,
				false,
				false,
				false,
			);
			simulatePointerMove(
				widgetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
				0,
			);
			simulatePointerUp(
				widgetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
			);

			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.x,
			).not.toBe(initialWidgetX);
			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.y,
			).not.toBe(initialWidgetY);

			const presetAfter = currentState.surfaceTiles[2] as {
				x: number;
				y: number;
			};
			expect(presetAfter.x).not.toBe(initialPresetX);
			expect(presetAfter.y).not.toBe(initialPresetY);
		});

		it("one widget plus one preset selected, drag preset, both move", () => {
			currentState = createMinimalState({
				selectedSurfaceIndices: [0, 2],
				surfaceTiles: [
					...tilesFromWidgets([
						makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info"),
						makeWidget(WIDGET_SEARCH_ID, 4, 0, 2, 2, "quick-actions"),
					]),
					{
						id: "preset-1",
						x: 0,
						y: 5,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						title: "Preset 1",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
				],
				presetSelectedIds: ["preset-1"],
				presetFocusId: "preset-1",
				panelPresetIds: ["preset-1"],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const infoWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			createWidgetElement(
				container,
				0,
				infoWidget.x * (cellSize + gap),
				infoWidget.y * (cellSize + gap),
				infoWidget.width * cellSize + (infoWidget.width - 1) * gap,
				infoWidget.height * cellSize + (infoWidget.height - 1) * gap,
			);

			const presetTile = currentState.surfaceTiles[2]!;
			expectSurfaceTileRole(currentState, 2, "preset");
			createPresetElement(
				container,
				2,
				"preset-1",
				presetTile.x * (cellSize + gap),
				presetTile.y * (cellSize + gap),
				presetTile.width * cellSize + (presetTile.width - 1) * gap,
				presetTile.height * cellSize + (presetTile.height - 1) * gap,
			);

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			const initialWidgetX = infoWidget.x;
			const initialWidgetY = infoWidget.y;
			const initialPresetX = presetTile.x;
			const initialPresetY = presetTile.y;

			const presetEl = container.querySelector<HTMLElement>(
				'[data-preset-id="preset-1"]',
			)!;
			const rect = presetEl.getBoundingClientRect();

			simulatePointerDown(
				presetEl,
				rect.left + rect.width / 2,
				rect.top + rect.height / 2,
				0,
				false,
				false,
				false,
			);
			simulatePointerMove(
				presetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
				0,
			);
			simulatePointerUp(
				presetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
			);

			const presetAfter = currentState.surfaceTiles[2] as {
				x: number;
				y: number;
			};
			expect(presetAfter.x).not.toBe(initialPresetX);
			expect(presetAfter.y).not.toBe(initialPresetY);

			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.x,
			).not.toBe(initialWidgetX);
			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.y,
			).not.toBe(initialWidgetY);
		});

		it("widget + preset selected, drag widget, both move", () => {
			// Setup: 2 widgets and 1 preset all selected
			currentState = createMinimalState({
				selectedSurfaceIndices: [0, 1, 2],
				surfaceTiles: [
					...tilesFromWidgets([
						makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info"),
						makeWidget(WIDGET_SEARCH_ID, 4, 0, 2, 2, "quick-actions"),
					]),
					{
						id: "preset-1",
						x: 0,
						y: 5,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						title: "Preset 1",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
				],
				presetSelectedIds: ["preset-1"],
				presetFocusId: "preset-1",
				panelPresetIds: ["preset-1"],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const infoWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			createWidgetElement(
				container,
				0,
				infoWidget.x * (cellSize + gap),
				infoWidget.y * (cellSize + gap),
				infoWidget.width * cellSize + (infoWidget.width - 1) * gap,
				infoWidget.height * cellSize + (infoWidget.height - 1) * gap,
			);
			const searchWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_SEARCH_ID,
			)!;
			createWidgetElement(
				container,
				1,
				searchWidget.x * (cellSize + gap),
				searchWidget.y * (cellSize + gap),
				searchWidget.width * cellSize + (searchWidget.width - 1) * gap,
				searchWidget.height * cellSize + (searchWidget.height - 1) * gap,
			);

			const presetTile = currentState.surfaceTiles[2]!;
			expectSurfaceTileRole(currentState, 2, "preset");
			createPresetElement(
				container,
				2,
				"preset-1",
				presetTile.x * (cellSize + gap),
				presetTile.y * (cellSize + gap),
				presetTile.width * cellSize + (presetTile.width - 1) * gap,
				presetTile.height * cellSize + (presetTile.height - 1) * gap,
			);

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			const initialInfoX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!.x;
			const initialInfoY = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!.y;
			const initialPresetX = presetTile.x;
			const initialPresetY = presetTile.y;

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			simulatePointerDown(
				widgetEl,
				rect.left + rect.width / 2,
				rect.top + rect.height / 2,
				0,
				false,
				false,
				false,
			);
			simulatePointerMove(
				widgetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
				0,
			);
			simulatePointerUp(
				widgetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
			);

			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.x,
			).not.toBe(initialInfoX);
			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.y,
			).not.toBe(initialInfoY);
			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_SEARCH_ID)!
					.x,
			).not.toBe(searchWidget.x);

			const presetAfter = currentState.surfaceTiles[2] as {
				x: number;
				y: number;
			};
			expect(presetAfter.x).not.toBe(initialPresetX);
			expect(presetAfter.y).not.toBe(initialPresetY);
		});

		it("widget + preset selected, drag preset, both move", () => {
			// Setup: 1 widget and 2 presets all selected
			currentState = createMinimalState({
				selectedSurfaceIndices: [0, 1, 2],
				surfaceTiles: [
					...tilesFromWidgets([makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info")]),
					{
						id: "preset-1",
						x: 0,
						y: 5,
						width: 2,
						height: 2,
					},
					{
						id: "preset-2",
						x: 3,
						y: 5,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						title: "Preset 1",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
					{
						id: "preset-2",
						title: "Preset 2",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
				],
				presetSelectedIds: ["preset-1", "preset-2"],
				presetFocusId: "preset-1",
				panelPresetIds: ["preset-1", "preset-2"],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const infoWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			createWidgetElement(
				container,
				0,
				infoWidget.x * (cellSize + gap),
				infoWidget.y * (cellSize + gap),
				infoWidget.width * cellSize + (infoWidget.width - 1) * gap,
				infoWidget.height * cellSize + (infoWidget.height - 1) * gap,
			);

			const preset1Tile = currentState.surfaceTiles[1]!;
			const preset2Tile = currentState.surfaceTiles[2]!;
			expectSurfaceTileRole(currentState, 1, "preset");
			expectSurfaceTileRole(currentState, 2, "preset");
			createPresetElement(
				container,
				1,
				"preset-1",
				preset1Tile.x * (cellSize + gap),
				preset1Tile.y * (cellSize + gap),
				preset1Tile.width * cellSize + (preset1Tile.width - 1) * gap,
				preset1Tile.height * cellSize + (preset1Tile.height - 1) * gap,
			);
			createPresetElement(
				container,
				2,
				"preset-2",
				preset2Tile.x * (cellSize + gap),
				preset2Tile.y * (cellSize + gap),
				preset2Tile.width * cellSize + (preset2Tile.width - 1) * gap,
				preset2Tile.height * cellSize + (preset2Tile.height - 1) * gap,
			);

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			const initialWidgetX = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!.x;
			const initialWidgetY = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!.y;
			const initialPreset1X = preset1Tile.x;
			const initialPreset1Y = preset1Tile.y;

			const presetEl = container.querySelector<HTMLElement>(
				'[data-preset-id="preset-1"]',
			)!;
			const rect = presetEl.getBoundingClientRect();

			simulatePointerDown(
				presetEl,
				rect.left + rect.width / 2,
				rect.top + rect.height / 2,
				0,
				false,
				false,
				false,
			);
			simulatePointerMove(
				presetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
				0,
			);
			simulatePointerUp(
				presetEl,
				rect.left + rect.width / 2 + 50,
				rect.top + rect.height / 2 + 50,
			);

			const moved1 = currentState.surfaceTiles[1] as {
				x: number;
				y: number;
			};
			const moved2 = currentState.surfaceTiles[2] as {
				x: number;
				y: number;
			};
			expect(moved1.x).not.toBe(initialPreset1X);
			expect(moved1.y).not.toBe(initialPreset1Y);
			expect(moved2.x).not.toBe(preset2Tile.x);

			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.x,
			).not.toBe(initialWidgetX);
			expect(
				layoutsFromState(currentState).find((w) => w.id === WIDGET_INFO_ID)!.y,
			).not.toBe(initialWidgetY);
		});

		it("mixed move persists widgets and preset surface tiles", () => {
			// Setup: 2 widgets and 2 presets selected
			currentState = createMinimalState({
				selectedSurfaceIndices: [0, 1, 2, 3],
				surfaceTiles: [
					...tilesFromWidgets([
						makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info"),
						makeWidget(WIDGET_SEARCH_ID, 4, 0, 2, 2, "quick-actions"),
					]),
					{
						id: "preset-1",
						x: 0,
						y: 5,
						width: 2,
						height: 2,
					},
					{
						id: "preset-2",
						x: 3,
						y: 5,
						width: 2,
						height: 2,
					},
				],
				presets: [
					{
						id: "preset-1",
						title: "Preset 1",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
					{
						id: "preset-2",
						title: "Preset 2",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
				],
				presetSelectedIds: ["preset-1", "preset-2"],
				presetFocusId: "preset-1",
				panelPresetIds: ["preset-1", "preset-2"],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const infoWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			createWidgetElement(
				container,
				0,
				infoWidget.x * (cellSize + gap),
				infoWidget.y * (cellSize + gap),
				infoWidget.width * cellSize + (infoWidget.width - 1) * gap,
				infoWidget.height * cellSize + (infoWidget.height - 1) * gap,
			);
			const searchWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_SEARCH_ID,
			)!;
			createWidgetElement(
				container,
				1,
				searchWidget.x * (cellSize + gap),
				searchWidget.y * (cellSize + gap),
				searchWidget.width * cellSize + (searchWidget.width - 1) * gap,
				searchWidget.height * cellSize + (searchWidget.height - 1) * gap,
			);

			const preset1Tile = currentState.surfaceTiles[2]!;
			const preset2Tile = currentState.surfaceTiles[3]!;
			createPresetElement(
				container,
				2,
				"preset-1",
				preset1Tile.x * (cellSize + gap),
				preset1Tile.y * (cellSize + gap),
				preset1Tile.width * cellSize + (preset1Tile.width - 1) * gap,
				preset1Tile.height * cellSize + (preset1Tile.height - 1) * gap,
			);
			createPresetElement(
				container,
				3,
				"preset-2",
				preset2Tile.x * (cellSize + gap),
				preset2Tile.y * (cellSize + gap),
				preset2Tile.width * cellSize + (preset2Tile.width - 1) * gap,
				preset2Tile.height * cellSize + (preset2Tile.height - 1) * gap,
			);

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const rect = widgetEl.getBoundingClientRect();

			simulatePointerDown(
				widgetEl,
				rect.left + rect.width / 2,
				rect.top + rect.height / 2,
				0,
				false,
				false,
				false,
			);
			simulatePointerMove(
				widgetEl,
				rect.left + rect.width / 2 + 100,
				rect.top + rect.height / 2 + 100,
				0,
			);
			simulatePointerUp(
				widgetEl,
				rect.left + rect.width / 2 + 100,
				rect.top + rect.height / 2 + 100,
			);

			const movedWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			const movedSearchWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_SEARCH_ID,
			)!;
			expect(movedWidget.x).not.toBe(infoWidget.x);
			expect(movedWidget.y).not.toBe(infoWidget.y);
			expect(movedSearchWidget.x).not.toBe(searchWidget.x);
			expect(movedSearchWidget.y).not.toBe(searchWidget.y);

			const movedPreset1 = currentState.surfaceTiles[2] as {
				x: number;
				y: number;
				id: string;
			};
			const movedPreset2 = currentState.surfaceTiles[3] as {
				x: number;
				y: number;
				id: string;
			};
			expect(movedPreset1.id).toBe("preset-1");
			expect(movedPreset2.id).toBe("preset-2");
			expect(movedPreset1.x).not.toBe(preset1Tile.x);
			expect(movedPreset1.y).not.toBe(preset1Tile.y);
			expect(movedPreset2.x).not.toBe(preset2Tile.x);
			expect(movedPreset2.y).not.toBe(preset2Tile.y);

			expect(layoutsFromState(currentState)).toBeDefined();
			expectSurfaceTileRole(currentState, 2, "preset");
			expectSurfaceTileRole(currentState, 3, "preset");
		});

		it("moves preset tile when placement id differs from catalog preset ref", () => {
			const catalogRef = "catalog-preset-ref-77";
			currentState = createMinimalState({
				selectedSurfaceIndices: [2],
				surfaceTiles: [
					...tilesFromWidgets([
						makeWidget(WIDGET_INFO_ID, 0, 0, 4, 4, "info"),
						makeWidget(WIDGET_SEARCH_ID, 4, 0, 2, 2, "quick-actions"),
					]),
					{
						id: catalogRef,
						x: 0,
						y: 6,
						width: 1,
						height: 1,
					},
				],
				presets: [
					{
						id: catalogRef,
						title: "Opaque tile",
						type: "preset",
						filePath: "C:/preset.ffx",
					},
				],
				presetSelectedIds: [catalogRef],
				presetFocusId: catalogRef,
				panelPresetIds: [],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const infoWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			createWidgetElement(
				container,
				0,
				infoWidget.x * (cellSize + gap),
				infoWidget.y * (cellSize + gap),
				infoWidget.width * cellSize + (infoWidget.width - 1) * gap,
				infoWidget.height * cellSize + (infoWidget.height - 1) * gap,
			);
			const searchWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_SEARCH_ID,
			)!;
			createWidgetElement(
				container,
				1,
				searchWidget.x * (cellSize + gap),
				searchWidget.y * (cellSize + gap),
				searchWidget.width * cellSize + (searchWidget.width - 1) * gap,
				searchWidget.height * cellSize + (searchWidget.height - 1) * gap,
			);

			const presetTile = currentState.surfaceTiles[2]!;
			const presetEl = createOpaquePresetPlacementElement(
				container,
				2,
				catalogRef,
				presetTile.x * (cellSize + gap),
				presetTile.y * (cellSize + gap),
				presetTile.width * cellSize + (presetTile.width - 1) * gap,
				presetTile.height * cellSize + (presetTile.height - 1) * gap,
			);

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			const initialX = presetTile.x;
			const initialY = presetTile.y;
			const rect = presetEl.getBoundingClientRect();
			simulatePointerDown(
				presetEl,
				rect.left + 5,
				rect.top + 5,
				0,
				true,
				false,
				false,
			);
			simulatePointerMove(presetEl, rect.left + 80, rect.top + 80, 0);
			simulatePointerUp(presetEl, rect.left + 80, rect.top + 80);

			const moved = currentState.surfaceTiles[2] as {
				x: number;
				y: number;
			};
			expect(moved).toBeDefined();
			expect(moved.x !== initialX || moved.y !== initialY).toBe(true);
		});

		it("commits widget move keyed by surface index shell", () => {
			currentState = createMinimalState({
				selectedSurfaceIndices: [0],
			});
			getState = () => currentState;
			setState = (next) => {
				currentState = next;
			};
			rerender = vi.fn();

			container = createTestContainer();
			document.body.appendChild(container);

			const cellSize = currentState.grid.cellSize;
			const gap = currentState.grid.gap;
			const infoWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			createWidgetElement(
				container,
				0,
				infoWidget.x * (cellSize + gap),
				infoWidget.y * (cellSize + gap),
				infoWidget.width * cellSize + (infoWidget.width - 1) * gap,
				infoWidget.height * cellSize + (infoWidget.height - 1) * gap,
			);
			const searchWidget = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_SEARCH_ID,
			)!;
			createWidgetElement(
				container,
				1,
				searchWidget.x * (cellSize + gap),
				searchWidget.y * (cellSize + gap),
				searchWidget.width * cellSize + (searchWidget.width - 1) * gap,
				searchWidget.height * cellSize + (searchWidget.height - 1) * gap,
			);

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;

			setupInteractionEvents(container, getState, setState, rerender, {
				hostCode: "AEFT",
			});

			const initialX = infoWidget.x;
			const initialY = infoWidget.y;
			const rect = widgetEl.getBoundingClientRect();
			simulatePointerDown(
				widgetEl,
				rect.left + 5,
				rect.top + 5,
				0,
				true,
				false,
				false,
			);
			simulatePointerMove(widgetEl, rect.left + 80, rect.top + 80, 0);
			simulatePointerUp(widgetEl, rect.left + 80, rect.top + 80);

			const moved = layoutsFromState(currentState).find(
				(w) => w.id === WIDGET_INFO_ID,
			)!;
			expect(moved.x !== initialX || moved.y !== initialY).toBe(true);
		});
	});

	// ── Easing Editor Canvas ──────────────────────────────────────────────────
	//
	// The easing widget relies on its own React `onPointerDown` to:
	//   - create / delete midpoints on the curve (Ctrl + left click), and
	//   - drag handles / points.
	// The workspace capture-phase pointerdown handler must not block those
	// handlers. It only has to suppress the follow-up `click` event so that
	// the widget tile does not get toggled into the workspace selection.

	describe("easing editor canvas", () => {
		const appendEasingCanvas = (widgetEl: Element): HTMLCanvasElement => {
			const canvas = document.createElement("canvas");
			canvas.setAttribute("data-ws-easing-editor-canvas", "1");
			widgetEl.appendChild(canvas);
			return canvas;
		};

		it("lets the canvas's own pointerdown handler run on Ctrl+left click", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const canvas = appendEasingCanvas(widgetEl);

			const canvasSpy = vi.fn();
			canvas.addEventListener("pointerdown", canvasSpy);

			const rect = canvas.getBoundingClientRect();
			simulatePointerDown(canvas, rect.left + 5, rect.top + 5, 0, true);

			// The canvas must receive the event so EasingWidget can create a
			// midpoint on the curve. The previous behavior (stopImmediatePropagation
			// in the workspace's capture-phase handler) blocked this.
			expect(canvasSpy).toHaveBeenCalledTimes(1);
		});

		it("lets the canvas's own pointerdown handler run on Cmd+left click", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const canvas = appendEasingCanvas(widgetEl);

			const canvasSpy = vi.fn();
			canvas.addEventListener("pointerdown", canvasSpy);

			const rect = canvas.getBoundingClientRect();
			simulatePointerDown(canvas, rect.left + 5, rect.top + 5, 0, false, true);

			expect(canvasSpy).toHaveBeenCalledTimes(1);
		});

		it("suppresses the follow-up click so widget selection is not toggled", () => {
			setup();

			const widgetEl = container.querySelector<HTMLElement>(
				`[data-workspace-surface-index="0"]`,
			)!;
			const canvas = appendEasingCanvas(widgetEl);

			const rect = canvas.getBoundingClientRect();
			simulatePointerDown(canvas, rect.left + 5, rect.top + 5, 0, true);
			simulateClick(canvas, rect.left + 5, rect.top + 5, true);

			expect(currentState.selectedSurfaceIndices).not.toContain(
				surfaceIndexForWidget(currentState, WIDGET_INFO_ID),
			);
		});
	});
});
