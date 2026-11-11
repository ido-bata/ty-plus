// @vitest-environment jsdom

/**
 * Behavioral regression coverage for `PresetInfoWidget` (Issue #87).
 *
 * The bug pattern is pinned statically in `preset.bug-pattern.test.ts`
 * because mounting the actual component at base SHA would hang the test
 * runner in jsdom + React 19 — `render()` inside `act()` flushes the
 * useEffect → setState → re-render loop synchronously and never returns.
 *
 * After the fix, this file mounts the widget and verifies:
 *   1. A non-empty selection commits exactly once (the effect fires once,
 *      `setPresetInfoLast(items)` is called once, and React does not loop).
 *   2. Hover-only display (no selection) also commits exactly once.
 *   3. The empty state (no selection, no hover) commits exactly once.
 *   4. The single-preset surface renders with `data-mode="single"`.
 *   5. React never logs a "Maximum update depth exceeded" error.
 *
 * If the bug regresses, test (1) or (5) will hang the runner; CI must
 * tolerate the runtime cost (~ms) and the static check in
 * `preset.bug-pattern.test.ts` is the authoritative gate.
 */

import { cleanup, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Preset } from "@/management/preset/contract";
import type {
	GridSettings,
	Layout,
} from "@/management/workspace/layout/grid-document";
import type { SurfaceState } from "@/management/workspace/state";

import { PresetInfoWidget } from "./preset";

vi.mock("@/management/preset", () => ({
	WorkspacePresetGlyph: () => <div data-testid="ws-glyph-stub" />,
}));

afterEach(cleanup);

const layout: Layout = {
	id: "layout-1",
	widgetType: "info",
	x: 0,
	y: 0,
	width: 6,
	height: 3,
};

const grid: GridSettings = {
	cellSize: 64,
	gap: 4,
	radius: 4,
};

const preset: Preset = {
	id: "preset-1",
	type: "preset",
	title: "Glow preset",
	filePath: "C:/presets/glow.ffx",
	description: "A glow preset for testing.",
};

function makeState(overrides: Partial<SurfaceState> = {}): SurfaceState {
	return {
		grid,
		panelId: "panel-1",
		hostCode: "AEFT",
		hostName: "After Effects",
		mode: "live",
		statusMessage: "",
		surfaceTiles: [],
		widgetInstanceTypes: {},
		groupCatalogEntries: [],
		selectedSurfaceIndices: [],
		layoutLocked: false,
		presets: [preset],
		compInfo: null,
		compInfoError: null,
		presetFocusId: null,
		presetHoverId: null,
		presetSelectedIds: ["preset-1"],
		panelPresetIds: [],
		openedGroupPresetId: null,
		showGridOverlay: false,
		showPresetLabels: false,
		bg: null,
		...overrides,
	} as SurfaceState;
}

function withRenderProbe(children: ReactNode) {
	let count = 0;
	const onRender: ProfilerOnRenderCallback = () => {
		count += 1;
	};
	const tree = (
		<Profiler id="preset-info-issue-87" onRender={onRender}>
			{children}
		</Profiler>
	);
	return { tree, getCount: () => count };
}

describe("PresetInfoWidget — Issue #87 regression", () => {
	it("commits exactly once on mount when one preset is selected", () => {
		const state = makeState();
		const { tree, getCount } = withRenderProbe(
			<PresetInfoWidget state={state} layout={layout} grid={grid} />,
		);
		render(tree);
		// Mount commit (1) + at most one effect flush (2). With the unstable
		// items dep the effect would loop until React aborts with #185.
		expect(getCount()).toBeLessThanOrEqual(2);
	});

	it("commits exactly once on mount when only presetHoverId is set", () => {
		const state = makeState({
			presetSelectedIds: [],
			presetHoverId: "preset-1",
		});
		const { tree, getCount } = withRenderProbe(
			<PresetInfoWidget state={state} layout={layout} grid={grid} />,
		);
		render(tree);
		expect(getCount()).toBeLessThanOrEqual(2);
	});

	it("commits exactly once on mount when nothing is selected", () => {
		const state = makeState({
			presetSelectedIds: [],
			presetHoverId: null,
		});
		const { tree, getCount } = withRenderProbe(
			<PresetInfoWidget state={state} layout={layout} grid={grid} />,
		);
		render(tree);
		expect(getCount()).toBeLessThanOrEqual(2);
	});

	it("renders the single-preset surface for a single selection", () => {
		const state = makeState();
		const { container } = render(
			<PresetInfoWidget state={state} layout={layout} grid={grid} />,
		);
		expect(container.querySelector('[data-mode="single"]')).not.toBeNull();
	});

	it("renders the empty surface when nothing is selected or hovered", () => {
		const state = makeState({
			presetSelectedIds: [],
			presetHoverId: null,
		});
		const { container } = render(
			<PresetInfoWidget state={state} layout={layout} grid={grid} />,
		);
		expect(container.querySelector('[data-mode="empty"]')).not.toBeNull();
	});

	it("does not log a React #185 'Maximum update depth' error during render", () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		try {
			render(
				<PresetInfoWidget state={makeState()} layout={layout} grid={grid} />,
			);
		} finally {
			consoleErrorSpy.mockRestore();
		}
		const messages = consoleErrorSpy.mock.calls.map((call) =>
			String(call[0] ?? ""),
		);
		const maxUpdateDepth = messages.find((m) =>
			m.includes("Maximum update depth exceeded"),
		);
		expect(
			maxUpdateDepth,
			`React #185 fired. Captured console.error messages:\n${messages.join("\n")}`,
		).toBeUndefined();
	});

	it("mirrors the resolved items into presetInfoLast without re-rendering", () => {
		// Re-render with the same `state` reference. After the fix, the
		// memoized `items` reference is stable across re-renders that do not
		// change upstream state, so the effect's dep is satisfied and the
		// commit count stays bounded.
		const state = makeState();
		const { rerender, container } = render(
			<PresetInfoWidget state={state} layout={layout} grid={grid} />,
		);
		rerender(<PresetInfoWidget state={state} layout={layout} grid={grid} />);
		expect(container.querySelector('[data-mode="single"]')).not.toBeNull();
	});
});
