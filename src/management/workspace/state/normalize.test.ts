import { describe, expect, it } from "vitest";
import { isOpaqueInstanceId } from "../../storage";
import type { SurfaceState } from "../state";
import { createInitialSurfaceState } from "../state";
import { normalizeState } from "./normalize";

describe("normalizeWorkspaceStateForInstanceIds (widget tiles)", () => {
	it("replaces non-opaque widget id on a tile", () => {
		const legacyId = "legacy-widget-layout-id";
		const base = createInitialSurfaceState({
			mode: "static",
			panelId: "panel-1",
		});
		const state: SurfaceState = {
			...base,
			surfaceTiles: [
				{
					id: legacyId,
					x: 0,
					y: 0,
					width: 2,
					height: 2,
				},
			],
			widgetInstanceTypes: {
				...base.widgetInstanceTypes,
				[legacyId]: "info",
			},
		};

		const next = normalizeState(state);
		const widgetTile = next.surfaceTiles[0];
		expect(widgetTile).toBeDefined();
		expect(isOpaqueInstanceId(String(widgetTile?.id))).toBe(true);
		expect(widgetTile?.id).not.toBe(legacyId);
	});

	it("leaves already-opaque widget ids unchanged", () => {
		const opaqueId = "00000000-0000-4000-8000-000000000099";
		const base = createInitialSurfaceState({
			mode: "static",
			panelId: "panel-1",
		});
		const state: SurfaceState = {
			...base,
			surfaceTiles: [
				{
					id: opaqueId,
					x: 0,
					y: 0,
					width: 2,
					height: 2,
				},
			],
			widgetInstanceTypes: {
				...base.widgetInstanceTypes,
				[opaqueId]: "info",
			},
		};

		const next = normalizeState(state);
		const widgetTile = next.surfaceTiles.find((t) => t.id === opaqueId);
		expect(widgetTile).toBeDefined();
	});
});
