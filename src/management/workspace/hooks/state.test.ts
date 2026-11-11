import { describe, expect, it, vi } from "vitest";

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

import { createInstanceId } from "@/management/storage/ids";
import type { Tile } from "@/management/workspace/surface/tiles";
import { createInitialSurfaceState } from "../state";
import { ensurePrimaryPanelWidgets } from "./state";

describe("ensurePrimaryPanelWidgets", () => {
	it("adds default widgets to panel-1 when its surface is empty (existing behavior)", () => {
		const base = createInitialSurfaceState({ mode: "static", panelId: "panel-1" });
		const empty: SurfaceStateLike = {
			...base,
			surfaceTiles: [],
			widgetInstanceTypes: {},
		};
		const next = ensurePrimaryPanelWidgets(empty);
		expect(next.surfaceTiles.length).toBeGreaterThan(0);
	});

	it.each(["panel-2", "panel-3", "panel-4", "panel-5"] as const)(
		"is a no-op for %s even when its surface is empty (no auto-placement)",
		(panelId) => {
			const base = createInitialSurfaceState({
				mode: "static",
				panelId,
			});
			const empty: SurfaceStateLike = {
				...base,
				surfaceTiles: [],
				widgetInstanceTypes: {},
			};
			const next = ensurePrimaryPanelWidgets(empty);
			expect(next.surfaceTiles).toHaveLength(0);
			expect(next.widgetInstanceTypes).toEqual({});
		},
	);

	it.each(["panel-1", "panel-2", "panel-3", "panel-4", "panel-5"] as const)(
		"preserves existing renderable widgets on %s",
		(panelId) => {
			const base = createInitialSurfaceState({
				mode: "static",
				panelId,
			});
			const tile: Tile = {
				id: createInstanceId(),
				x: 0,
				y: 0,
				width: 2,
				height: 2,
			};
			const withTile: SurfaceStateLike = {
				...base,
				surfaceTiles: [tile],
				widgetInstanceTypes: { [tile.id]: "info" },
			};
			const next = ensurePrimaryPanelWidgets(withTile);
			expect(next.surfaceTiles).toHaveLength(1);
			expect(next.surfaceTiles[0]?.id).toBe(tile.id);
		},
	);
});

// Minimal shape required by `ensurePrimaryPanelWidgets` (keeps the test
// independent of unrelated SurfaceState fields).
type SurfaceStateLike = Parameters<typeof ensurePrimaryPanelWidgets>[0];
