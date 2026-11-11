import type { Layout, LayoutItem } from "@/management/workspace/layout/grid-document";
import { createInitialSurfaceState } from "@/management/workspace/state";
import type { SurfaceState } from "@/management/workspace/state";
import { describe, expect, it, vi } from "vitest";
import { applyWidgets } from "./widget-mgmt";

vi.mock("@/management/widget/registry", () => ({
	registry: {
		widgets: [
			{ type: "info", available: true },
			{ type: "quick-actions", available: true },
		],
		getConfig: (t: string) =>
			t === "info" || t === "quick-actions"
				? ({ type: t, available: true } as never)
				: undefined,
	},
}));

const baseState = (): SurfaceState =>
	createInitialSurfaceState({ mode: "static", panelId: "panel-1" });

describe("applyWidgets", () => {
	it("returns null when widgets is null", () => {
		expect(applyWidgets(null, baseState())).toBeNull();
	});

	it("preserves widgetInstanceTypes when given LayoutItem[] (no widgetType)", () => {
		// Regression: snapshot restore goes through `doc.gridCells as Layout[]`
		// in history.saveSnapshot, so widgetType is undefined at runtime even
		// though the type lies. The authoritative widget type lives in the
		// widgetInstanceTypes record; we must not clobber it.
		const state = baseState();
		const existingTypes: SurfaceState["widgetInstanceTypes"] = {
			"w-1": "info",
			"w-2": "quick-actions",
		};
		const items: LayoutItem[] = [
			{ id: "w-1", x: 0, y: 0, width: 2, height: 2 },
			{ id: "w-2", x: 2, y: 0, width: 2, height: 2 },
		];
		// Cast mirrors the actual call site in `restoreSnapshot`.
		const result = applyWidgets(items as unknown as Layout[], {
			...state,
			widgetInstanceTypes: existingTypes,
		});
		expect(result).not.toBeNull();
		expect(result?.widgetInstanceTypes).toEqual(existingTypes);
	});

	it("overwrites widgetInstanceTypes when given Layout[] with widgetType", () => {
		const state = baseState();
		const layouts: Layout[] = [
			{
				id: "w-1",
				widgetType: "quick-actions",
				x: 0,
				y: 0,
				width: 2,
				height: 2,
			},
		];
		const result = applyWidgets(layouts, {
			...state,
			widgetInstanceTypes: { "w-1": "info" },
		});
		expect(result?.widgetInstanceTypes["w-1"]).toBe("quick-actions");
	});

	it("merges layout-defined types with existing types when both are present", () => {
		// Mixed input: some entries have widgetType (in-memory), some don't
		// (LayoutItem cast). Defined types should win; undefined entries
		// should fall through to existing types.
		const state = baseState();
		const mixed: Array<Layout | LayoutItem> = [
			{
				id: "w-1",
				widgetType: "info",
				x: 0,
				y: 0,
				width: 2,
				height: 2,
			},
			{ id: "w-2", x: 2, y: 0, width: 2, height: 2 },
		];
		const result = applyWidgets(mixed as unknown as Layout[], {
			...state,
			widgetInstanceTypes: { "w-2": "quick-actions" },
		});
		expect(result?.widgetInstanceTypes["w-1"]).toBe("info");
		expect(result?.widgetInstanceTypes["w-2"]).toBe("quick-actions");
	});
});
