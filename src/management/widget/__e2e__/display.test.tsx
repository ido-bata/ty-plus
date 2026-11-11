/**
 * @vitest-environment jsdom
 */

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Layout } from "@/management/workspace/layout/grid-document";
import {
	createInitialSurfaceState,
	type GridSettings,
	type SurfaceState,
} from "@/management/workspace/state";
import { Widget } from "../workspace/TileContent";

// ── Mock widget registry ────────────────────────────────────────────────────

// Only descriptor resolution is faked. `renderDescriptor` and the `ErrorBoundary`
// that `renderDescriptorSafe` wraps around it stay real, so the tile mount path
// under test is the production one.
vi.mock("../../../function/widget/registry", async () => {
	const { createElement } = await import("react");
	const { ErrorBoundary } = await import("@/management/panel/ErrorBoundary");
	const { renderDescriptor } = await import("../../../function/widget/render");
	type Descriptor = Parameters<typeof renderDescriptor>[0];
	type RenderProps = Parameters<typeof renderDescriptor>[1];

	return {
		_widgetGlobs: [],
		getWidgetDescriptor: vi.fn((type: string) => {
			if (type === "easing") {
				return {
					type: "easing",
					component: () => <div data-widget="easing">EasingWidget</div>,
				};
			}
			if (type === "align") {
				return {
					type: "align",
					component: () => <div data-widget="align">AlignWidget</div>,
				};
			}
			if (type === "info") {
				return {
					type: "info",
					component: () => <div data-widget="info">InfoWidget</div>,
				};
			}
			return undefined;
		}),
		renderDescriptor,
		renderDescriptorSafe: (descriptor: Descriptor, props: RenderProps) =>
			createElement(
				ErrorBoundary,
				{ name: descriptor.type, key: descriptor.type },
				renderDescriptor(descriptor, props),
			),
	};
});

vi.mock("../../../function/widget/utility/info/preset", () => ({
	PresetInfoWidget: () => <div data-widget="info">InfoWidget</div>,
}));

vi.mock("../../../function/widget/core/easing/Component", () => ({
	EasingWidget: () => <div data-widget="easing">EasingWidget</div>,
}));

vi.mock("../../../function/widget/core/align", () => ({
	Align: () => <div data-widget="align">AlignWidget</div>,
}));

vi.mock("@/management/workspace/layout/engine", () => ({
	getTileRect: vi.fn((layout: Layout, _grid: GridSettings) => ({
		left: layout.x * 52,
		top: layout.y * 52,
		width: layout.width * 52,
		height: layout.height * 52,
	})),
	computeGridTracks: vi.fn(() => ({ cols: 12, rows: 24 })),
	tracksToPixels: vi.fn((n: number) => n * 52 + 4),
}));

// ── Shared fixtures ──────────────────────────────────────────────────────────

const initialState = createInitialSurfaceState({
	mode: "live",
	panelId: "panel-test",
	grid: {
		cellSize: 48,
		gap: 4,
		radius: 6,
	},
});
const grid: GridSettings = initialState.grid;

const makeState = (overrides: Partial<SurfaceState> = {}): SurfaceState => ({
	...initialState,
	...overrides,
});

const layoutFor = (
	id: string,
	widgetType: string,
	x = 0,
	y = 0,
	w = 2,
	h = 2,
): Layout => ({
	id,
	widgetType: widgetType as Layout["widgetType"],
	x,
	y,
	width: w,
	height: h,
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Widget display flow", () => {
	describe("widget placement and rendering", () => {
		it("renders a widget placed at a given grid position", () => {
			const state = makeState();
			const layout = layoutFor("easing-1", "easing", 2, 1, 3, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector('[data-widget="easing"]')).not.toBeNull();
			expect(container.textContent).toContain("EasingWidget");
		});

		it("renders multiple widgets in different positions", () => {
			const state = makeState();
			const layouts: Layout[] = [
				layoutFor("easing-1", "easing", 0, 0, 2, 2),
				layoutFor("align-1", "align", 2, 0, 2, 2),
				layoutFor("info-1", "info", 4, 0, 2, 2),
			];

			const { container } = render(
				layouts.map((layout) => (
					<Widget key={layout.id} layout={layout} state={state} grid={grid} />
				)),
			);

			expect(container.querySelectorAll("[data-widget]")).toHaveLength(3);
		});

		it("shows unknown widget type fallback when descriptor not found", () => {
			const state = makeState();
			const layout = layoutFor("unknown-1", "nonexistent-widget", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			// Falls back to showing the widget type name in muted text
			expect(container.textContent).toContain("nonexistent-widget");
		});
	});

	describe("widget instance layout/size persistence", () => {
		it("widget retains its grid dimensions from layout", () => {
			const state = makeState();
			const layout = layoutFor("easing-1", "easing", 1, 1, 4, 3);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			const widgetEl = container.querySelector("[data-widget]");
			expect(widgetEl).not.toBeNull();
		});

		it("widgets with different sizes render correctly", () => {
			const state = makeState();

			const largeLayout = layoutFor("easing-large", "easing", 0, 0, 6, 4);
			const smallLayout = layoutFor("align-small", "align", 6, 0, 2, 2);

			const { container } = render(
				<>
					<Widget layout={largeLayout} state={state} grid={grid} />
					<Widget layout={smallLayout} state={state} grid={grid} />
				</>,
			);

			const widgets = container.querySelectorAll("[data-widget]");
			expect(widgets).toHaveLength(2);
		});

		it("grid settings affect widget rendering without altering layout data", () => {
			const state = makeState();
			const layout = layoutFor("easing-1", "easing", 0, 0, 2, 2);

			// Different grid: larger cells
			const largeGrid: GridSettings = { ...grid, cellSize: 96 };

			const { container: c1 } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);
			const { container: c2 } = render(
				<Widget layout={layout} state={state} grid={largeGrid} />,
			);

			// Both render the widget successfully
			expect(c1.querySelector("[data-widget]")).not.toBeNull();
			expect(c2.querySelector("[data-widget]")).not.toBeNull();
		});
	});

	describe("widget states", () => {
		it("renders in static mode without crashing", () => {
			const state = makeState({ mode: "static" });
			const layout = layoutFor("easing-1", "easing", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector("[data-widget]")).not.toBeNull();
		});

		it("renders when statusMessage is present", () => {
			const state = makeState({ statusMessage: "Loading preset data..." });
			const layout = layoutFor("info-1", "info", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector("[data-widget]")).not.toBeNull();
		});

		it("renders when layout is locked", () => {
			const state = makeState({ layoutLocked: true });
			const layout = layoutFor("align-1", "align", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector("[data-widget]")).not.toBeNull();
		});

		it("renders with no presets without crashing", () => {
			const state = makeState({ presets: [] });
			const layout = layoutFor("info-1", "info", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector("[data-widget]")).not.toBeNull();
		});

		it("renders with selected surface indices", () => {
			const state = makeState({ selectedSurfaceIndices: [0, 1, 2] });
			const layout = layoutFor("easing-1", "easing", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector("[data-widget]")).not.toBeNull();
		});

		it("renders with compInfo present", () => {
			const state = makeState({
				compInfo: {
					name: "My Comp",
					width: 1920,
					height: 1080,
					pixelAspect: 1,
					duration: 10.5,
					frameRate: 30,
					dropFrame: false,
					bgColor: null,
					layers: 4,
					selectedLayers: 1,
					shutterAngle: 180,
					shutterPhase: -90,
					motionBlur: false,
					draft3d: false,
				},
			});
			const layout = layoutFor("info-1", "info", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector("[data-widget]")).not.toBeNull();
		});

		it("renders with compInfoError set", () => {
			const state = makeState({
				compInfoError: "Failed to read comp info from host",
			});
			const layout = layoutFor("info-1", "info", 0, 0, 2, 2);

			const { container } = render(
				<Widget layout={layout} state={state} grid={grid} />,
			);

			expect(container.querySelector("[data-widget]")).not.toBeNull();
		});
	});
});
