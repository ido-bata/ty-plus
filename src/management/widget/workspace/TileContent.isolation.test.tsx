/**
 * @vitest-environment jsdom
 *
 * Widget-level isolation integration test for `Widget` (the per-tile mount
 * adapter exported from `TileContent.tsx`).
 *
 * The PR that introduced `renderDescriptorSafe` in `function/widget/registry.ts`
 * must prove the acceptance criterion: a render exception inside ONE tile is
 * contained to that tile and does NOT blank the sibling tiles. The bare
 * `renderDescriptor()` adapter has no boundary, so this test exercises the
 * production call site -- `Widget` -> `renderDescriptorSafe` -- to make sure
 * the safe adapter is actually wired up.
 *
 * Strategy:
 *   1. Stub the management-side `getWidgetDescriptor` so the test owns which
 *      descriptors the production code sees. The thrower is a real React
 *      component that throws during render; the healthy stub is a plain
 *      functional component. No production widgets are pulled in.
 *   2. Mount two `Widget` tiles side by side: one healthy, one throwing. This
 *      mirrors the way `Main.tsx` -> `Grid.tsx` -> `GridTile.tsx` renders
 *      every tile as an independent `Widget`.
 *   3. Assert the healthy tile still renders AND the throwing tile shows the
 *      ErrorBoundary fallback (`role="alert"`). A regression to the bare
 *      `renderDescriptor()` call would either unmount the healthy sibling
 *      (uncaught throw in render) or replace both tiles with a single
 *      fallback (a blanket boundary above the row instead of per tile).
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, JSX } from "react";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { DEFAULT_GRID } from "../../workspace/layout/default";
import type { Layout } from "../../workspace/layout/grid-document";
import { createInitialSurfaceState } from "../../workspace/state";
import { Widget } from "./TileContent";

// Keep non-target widget dependency trees out of this focused isolation
// test, the same way the existing `TileContent.test.tsx` does. The glob in
// `@/function/widget/registry` eagerly loads every descriptor at import
// time; without these stubs the directory-browser widget would pull in
// the monaco-editor (used by the code preset dialog) and break the test
// environment with a `document.queryCommandSupported` ReferenceError.
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

// Minimal local descriptor shape. The production `WidgetDescriptor` type
// lives in `function/widget/define`; importing it here would violate the
// management -> function import boundary. We only need a structural
// compatibility shape -- the production call site reads `descriptor.type`
// and passes `descriptor.component` to React. No other fields are touched.
type TestDescriptor = {
	type: string;
	nameKey: string;
	icon: string;
	minSize: { cols: number; rows: number };
	maxSize: { cols: number; rows: number };
	defaultSize: { cols: number; rows: number };
	available: boolean;
	resizable: boolean;
	component: ComponentType<{ layout: Layout }>;
};

// `Widget` imports `getWidgetDescriptor` from `@/management/widget/registry`.
// Replace it so the test owns the descriptor table and stays free of any
// direct `function/widget` implementation import (the boundary check rejects
// those).
vi.mock("../registry", () => ({
	allWidgetDescriptors: () => [],
	getWidgetDescriptor: (type: string): TestDescriptor | undefined => {
		if (type === HEALTHY_TYPE) {
			return makeHealthyDescriptor();
		}
		if (type === THROWING_TYPE) {
			return makeThrowingDescriptor();
		}
		return undefined;
	},
}));

// ── Stubs ──────────────────────────────────────────────────────────────────────

function HealthyStub(): JSX.Element {
	return (
		<div data-testid="healthy-stub" role="application">
			healthy-widget-body
		</div>
	);
}

function ThrowingWidget(): never {
	throw new Error("isolated widget boom");
}

const HEALTHY_TYPE = "test-healthy-widget";
const THROWING_TYPE = "test-throwing-widget";

const makeHealthyDescriptor = (): TestDescriptor => ({
	type: HEALTHY_TYPE,
	nameKey: "widgets.test.healthy.name",
	icon: "Box",
	minSize: { cols: 1, rows: 1 },
	maxSize: { cols: 1, rows: 1 },
	defaultSize: { cols: 1, rows: 1 },
	available: true,
	resizable: false,
	component: HealthyStub,
});

const makeThrowingDescriptor = (): TestDescriptor => ({
	type: THROWING_TYPE,
	nameKey: "widgets.test.throwing.name",
	icon: "Box",
	minSize: { cols: 1, rows: 1 },
	maxSize: { cols: 1, rows: 1 },
	defaultSize: { cols: 1, rows: 1 },
	available: true,
	resizable: false,
	component: ThrowingWidget,
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

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

const healthyLayout: Layout = {
	id: "widget-healthy",
	widgetType: HEALTHY_TYPE,
	x: 0,
	y: 0,
	width: 2,
	height: 2,
};

const throwingLayout: Layout = {
	id: "widget-throwing",
	widgetType: THROWING_TYPE,
	x: 2,
	y: 0,
	width: 2,
	height: 2,
};

/** Mirrors how `Main.tsx` -> `Grid.tsx` -> `GridTile.tsx` mounts tiles: each
 * tile is its own independent `Widget` rendered alongside its siblings. A
 * boundary scoped above this row would defeat the per-tile isolation we
 * are asserting, so the wrapper deliberately does NOT add one. */
function TileRow(): JSX.Element {
	return (
		<>
			<section data-testid="tile-healthy">
				<Widget layout={healthyLayout} state={state} grid={grid} />
			</section>
			<section data-testid="tile-throwing">
				<Widget layout={throwingLayout} state={state} grid={grid} />
			</section>
		</>
	);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Widget isolation via renderDescriptorSafe", () => {
	beforeAll(() => {
		vi.stubGlobal("ResizeObserver", ResizeObserverStub);
		// The boundary routes caught errors through console.error; silence
		// it so the test output stays clean. The assertion is on the DOM,
		// not on log lines.
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(cleanup);

	afterAll(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("renders the healthy sibling even when the other tile throws", () => {
		render(<TileRow />);

		// Healthy tile: the stub's body is present and the tile shell is
		// intact. If the production call site regressed to the bare
		// `renderDescriptor()` adapter, this assertion fails because the
		// React render phase throws before the healthy sibling commits.
		const healthyTile = screen.getByTestId("tile-healthy");
		expect(
			healthyTile.querySelector('[data-testid="healthy-stub"]'),
		).not.toBeNull();
		expect(healthyTile.querySelector('[role="application"]')).not.toBeNull();

		// Throwing tile: the per-tile boundary caught the throw and
		// rendered the localized fallback (`role="alert"`). Exactly one
		// fallback is expected -- a blanket boundary around the row
		// would surface a single fallback that swallows BOTH tiles.
		const fallbacks = screen.getAllByRole("alert");
		expect(fallbacks).toHaveLength(1);
		expect(fallbacks[0]?.getAttribute("data-ty-error-boundary-name")).toBe(
			THROWING_TYPE,
		);
		expect(fallbacks[0]?.textContent ?? "").toMatch(/isolated widget boom/);

		// Both tile shells remain in the DOM. A regression to the bare
		// `renderDescriptor()` call (no boundary) would unmount the row
		// entirely; a blanket boundary would also strip the healthy
		// tile's body.
		expect(screen.getByTestId("tile-healthy")).toBeDefined();
		expect(screen.getByTestId("tile-throwing")).toBeDefined();
	});
});
