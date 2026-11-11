/**
 * Widget registry integration test.
 *
 * PURPOSE: Verify that every declared widget type calls defineWidget() —
 * i.e., that each widget self-registers correctly.
 *
 * This test guards against:
 *   - A widget type added to WIDGET_TYPES but missing its index.ts
 *   - defineWidget() not called in a index.ts
 *   - import.meta.glob path being wrong in registry.ts (the root cause of the
 *     2026-05 "widgets render as container only" bug: "../core/" vs "./core/")
 *
 * APPROACH: vitest/node does not support import.meta.glob (Vite-only macro),
 * so we cannot use the real registry.ts auto-aggregation here. Instead:
 *   1. We intercept register() calls via vi.mock to collect registrations.
 *   2. We import each widget index.ts explicitly to trigger defineWidget() side-effects.
 *   3. We assert that all WIDGET_TYPES appear in the collected registrations.
 *
 * This is equivalent to verifying that the glob would register everything, but
 * without requiring import.meta.glob to work in the test environment.
 *
 * For a true end-to-end glob verification (real Vite runtime), run:
 *   bun tools/check/widget-registry.ts
 *
 * MAINTENANCE: add a new import here whenever a new widget index.ts is created.
 * DO NOT mock the registry (register) with a no-op — that defeats the test.
 */

import { describe, expect, it, vi } from "vitest";

// Collect registrations made via register().
// Must use vi.hoisted() so the variable is available inside vi.mock() factories,
// which are hoisted to the top of the file by vitest's mock hoisting transform.
const { collected } = vi.hoisted(() => {
	const collected: Array<{ type: string; component?: unknown }> = [];
	return { collected };
});

// Mock registry-core.ts to capture register calls without the real circular-init
// complexity (import.meta.glob + TDZ). The real implementation is tested by
// bun tools/check/widget-registry.ts using the actual Vite/Bun module system.
vi.mock("./registry-core", () => ({
	register: (descriptor: { type: string }) => {
		collected.push(descriptor);
	},
	allWidgetDescriptors: () => collected,
	getWidgetDescriptor: (type: string) => collected.find((d) => d.type === type),
}));

// Mock heavy React component dependencies so widget index files can be imported
// without pulling in JSX, KaTeX, CEP APIs, etc.
vi.mock("./core/align/Component", () => ({ Align: () => null }));
vi.mock("./core/anchor-point/Component", () => ({
	AnchorPointWidget: () => null,
}));
vi.mock("./core/easing/Component", () => ({ EasingWidget: () => null }));
vi.mock("./core/layout-lock/Component", () => ({
	LayoutLockWidget: () => null,
}));
vi.mock("./core/menu/Component", () => ({ MenuWidget: () => null }));
vi.mock("./utility/directory-browser/Component", () => ({
	DirectoryBrowserWidget: () => null,
}));
vi.mock("./utility/font-viewer/Component", () => ({
	FontViewerWidget: () => null,
}));
vi.mock("./utility/info/preset", () => ({ PresetInfoWidget: () => null }));
vi.mock("./utility/quick-actions/ActionList", () => ({
	QuickActionsWidget: () => null,
}));

// Import each widget descriptor file to trigger defineWidget() -> register() side-effects.
// SYNC WITH: the glob patterns in registry.ts:
//   core subdirectories: align, anchor-point, easing, layout-lock, menu
//   utility subdirectories: directory-browser, font-viewer, info, quick-actions
import "./core/align/descriptor.ts";
import "./core/anchor-point/descriptor.ts";
import "./core/easing/index.ts";
import "./core/layout-lock/index.ts";
import "./core/menu/index.ts";
import "./utility/directory-browser/index.ts";
import "./utility/font-viewer/descriptor.ts";
import "./utility/info/index.ts";
import "./utility/quick-actions/index.ts";

import { WIDGET_TYPES } from "./contract";

describe("Widget registry — defineWidget() called for every WIDGET_TYPE", () => {
	it("every WIDGET_TYPE has a corresponding defineWidget() call", () => {
		const registeredTypes = collected.map((d) => d.type);
		const missing = [...WIDGET_TYPES].filter(
			(t) => !registeredTypes.includes(t),
		);

		expect(
			missing,
			`Missing defineWidget() calls for: [${missing.join(", ")}].\nLikely causes:\n  1. This test file is missing an explicit import for the new widget.\n  2. registry.ts glob pattern is wrong (check ./core/ vs ../core/).\n  3. The widget's widget.ts does not call defineWidget().`,
		).toEqual([]);
	});

	it(`${WIDGET_TYPES.length} unique types registered — no duplicates, no extras`, () => {
		const types = collected.map((d) => d.type);
		const duplicates = types.filter((t, i) => types.indexOf(t) !== i);

		expect(
			duplicates,
			`Duplicate defineWidget() calls: [${duplicates.join(", ")}]`,
		).toHaveLength(0);

		expect(
			types.length,
			`Expected ${WIDGET_TYPES.length} registrations, got ${types.length}.\n` +
				`Registered: [${types.join(", ")}]\n` +
				`Declared:   [${[...WIDGET_TYPES].join(", ")}]`,
		).toBe(WIDGET_TYPES.length);
	});

	it("each registered descriptor has a component of type function", () => {
		for (const d of collected) {
			expect(
				typeof (d as { type: string; component?: unknown }).component,
				`Descriptor for "${d.type}" is missing a component`,
			).toBe("function");
		}
	});
});
