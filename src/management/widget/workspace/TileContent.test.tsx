/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { Align } from "../../../function/widget/core/align/Component";
import { DEFAULT_GRID } from "../../workspace/layout/default";
import type { Layout } from "../../workspace/layout/grid-document";
import { createInitialSurfaceState } from "../../workspace/state";
import { getWidgetDescriptor } from "../registry";
import { Widget } from "./TileContent";

// Keep non-target widget dependency trees out of this focused registry-routing test.
// Align is intentionally not mocked: its descriptor must register the real component.
vi.mock("../../../management/preset", () => ({
	WorkspacePresetGlyph: () => null,
}));
vi.mock("../../../function/widget/core/anchor-point/Component", () => ({
	AnchorPointWidget: () => null,
}));
vi.mock("../../../function/widget/utility/directory-browser/Component", () => ({
	DirectoryBrowserWidget: () => null,
}));
vi.mock("../../../function/widget/core/easing/Component", () => ({
	EasingWidget: () => null,
}));
vi.mock("../../../function/widget/utility/font-viewer/Component", () => ({
	FontViewerWidget: () => null,
}));
vi.mock("../../../function/widget/utility/info/preset", () => ({
	PresetInfoWidget: () => null,
}));
vi.mock("../../../function/widget/core/layout-lock/Component", () => ({
	LayoutLockWidget: () => null,
}));
vi.mock("../../../function/widget/core/menu/Component", () => ({
	MenuWidget: () => null,
}));
vi.mock("../../../function/widget/utility/quick-actions", () => ({
	QuickActionsWidget: () => null,
}));

class ResizeObserverStub implements ResizeObserver {
	disconnect(): void {}
	observe(_target: Element, _options?: ResizeObserverOptions): void {}
	unobserve(_target: Element): void {}
}

const grid = DEFAULT_GRID;
const state = createInitialSurfaceState({
	grid,
	panelId: "panel-1",
	mode: "static",
});
const alignLayout: Layout = {
	id: "widget-align",
	widgetType: "align",
	x: 0,
	y: 0,
	width: 2,
	height: 2,
};

describe("Widget", () => {
	beforeAll(() => {
		vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	});

	afterEach(cleanup);

	afterAll(() => {
		vi.unstubAllGlobals();
	});

	it("routes align through the registry to the real workspace component", () => {
		expect(Align).toBeTypeOf("function");
		expect(getWidgetDescriptor("align")?.component).toBe(Align);

		render(<Widget layout={alignLayout} state={state} grid={grid} />);

		expect(screen.getByRole("application")).toHaveAttribute(
			"data-two-groups",
			"false",
		);
		for (const action of [
			"align-left",
			"align-center-h",
			"align-right",
			"align-top",
			"align-center-v",
			"align-bottom",
		]) {
			expect(screen.getByTitle(action)).toBeInstanceOf(HTMLButtonElement);
		}
	});
});
