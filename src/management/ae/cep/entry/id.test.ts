/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePanelSurfaceId, resolvePanelSurfaceIdForBoot } from "./id";

describe("resolvePanelSurfaceId", () => {
	afterEach(() => {
		window.__TY_PLUS_PANEL_SURFACE_ID__ = undefined;
		vi.restoreAllMocks();
	});

	it("prefers window.__TY_PLUS_PANEL_SURFACE_ID__", () => {
		window.__TY_PLUS_PANEL_SURFACE_ID__ = "panel-3";
		expect(resolvePanelSurfaceId()).toBe("panel-3");
	});

	it("derives from extension id app.ty-plus.panel.N with dot", () => {
		vi.stubGlobal(
			"CSInterface",
			class {
				getExtensionID() {
					return "app.ty-plus.panel.2";
				}
			},
		);
		expect(resolvePanelSurfaceId()).toBe("panel-2");
	});

	it("derives from extension id app.ty-plus.panelN without dot", () => {
		vi.stubGlobal(
			"CSInterface",
			class {
				getExtensionID() {
					return "app.ty-plus.panel4";
				}
			},
		);
		expect(resolvePanelSurfaceId()).toBe("panel-4");
	});

	it("derives from dev extension id app.ty-plus.dev.panelN", () => {
		vi.stubGlobal(
			"CSInterface",
			class {
				getExtensionID() {
					return "app.ty-plus.dev.panel3";
				}
			},
		);
		expect(resolvePanelSurfaceId()).toBe("panel-3");
	});

	it("falls back to panel-1", () => {
		vi.stubGlobal(
			"CSInterface",
			class {
				getExtensionID() {
					return "com.other.extension";
				}
			},
		);
		expect(resolvePanelSurfaceId()).toBe("panel-1");
	});
});

describe("resolvePanelSurfaceIdForBoot", () => {
	afterEach(() => {
		window.__TY_PLUS_PANEL_SURFACE_ID__ = undefined;
		vi.restoreAllMocks();
	});

	it("returns window.__TY_PLUS_PANEL_SURFACE_ID__ immediately when set", async () => {
		window.__TY_PLUS_PANEL_SURFACE_ID__ = "panel-3";
		await expect(resolvePanelSurfaceIdForBoot()).resolves.toBe("panel-3");
	});

	it("returns the panel id when CSInterface.getExtensionID resolves it", async () => {
		vi.stubGlobal(
			"CSInterface",
			class {
				getExtensionID() {
					return "app.ty-plus.panel2";
				}
			},
		);
		await expect(resolvePanelSurfaceIdForBoot()).resolves.toBe("panel-2");
	});

	it("falls back to panel-1 after polling when no extension id is reachable", {
		timeout: 15_000,
	}, async () => {
		vi.stubGlobal(
			"CSInterface",
			class {
				getExtensionID() {
					return "";
				}
			},
		);
		window.__TY_PLUS_PANEL_SURFACE_ID__ = undefined;
		await expect(resolvePanelSurfaceIdForBoot()).resolves.toBe("panel-1");
	});
});
