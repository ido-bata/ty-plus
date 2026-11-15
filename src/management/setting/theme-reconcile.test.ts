import { describe, expect, it } from "vitest";
import { themeReconcilePlanFromSettingsJson } from "./theme-reconcile";

/**
 * Issue #112 — boot reconcile plan: app.json `ui.*` / `workspace.grid`
 * must project into the theme override domains this module owns, and
 * unusable input must yield `null` so the persisted theme stays untouched.
 */

describe("themeReconcilePlanFromSettingsJson", () => {
	it("returns null for missing or unparseable settings", () => {
		expect(themeReconcilePlanFromSettingsJson(null)).toBeNull();
		expect(themeReconcilePlanFromSettingsJson("")).toBeNull();
		expect(themeReconcilePlanFromSettingsJson("not json")).toBeNull();
	});

	it("projects a non-default accentColor into ui-owned tokens", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({
				ui: { accentColor: "#12ab34" },
			}),
		);
		expect(plan?.ui).toMatchObject({
			"accent-r": "18",
			"accent-g": "171",
			"accent-b": "52",
			"color-ty-accent": "#12ab34",
		});
	});

	it("emits no ui overrides when ui settings equal defaults", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({ ui: { accentColor: "#5886ff" } }),
		);
		expect(plan?.ui).toEqual({});
	});

	it("projects workspace.grid into the three grid tokens", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({
				workspace: { grid: { cellSize: 80, gap: 6, radius: 4 } },
			}),
		);
		expect(plan?.grid).toEqual({
			"ty-ws-cell": "80px",
			"ty-ws-grid-gap": "6px",
			"ty-ws-grid-radius": "4px",
		});
	});

	it("returns null grid when workspace.grid is absent so tokens reset to defaults", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({ ui: { language: "ja" } }),
		);
		expect(plan?.grid).toBeNull();
	});

	it("returns null grid when workspace.grid is unusable", () => {
		const plan = themeReconcilePlanFromSettingsJson(
			JSON.stringify({
				workspace: { grid: { cellSize: "big", gap: 6, radius: 4 } },
			}),
		);
		expect(plan?.grid).toBeNull();
	});
});
