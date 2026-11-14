import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/management/setting/models/settings";
import { themeOverridesFromUiSettings } from "./ui-theme-sync";

/**
 * Issue #94 — `settings.ui.*` projection into theme tokens.
 * Defaults must emit nothing (untouched installs keep the shipped look);
 * non-default values must produce the token overrides the theme pipeline
 * persists and broadcasts.
 */

describe("themeOverridesFromUiSettings", () => {
	it("emits nothing for default ui settings", () => {
		expect(themeOverridesFromUiSettings(DEFAULT_SETTINGS.ui)).toEqual({});
	});

	it("maps accentColor to accent channels and color-ty-accent", () => {
		const out = themeOverridesFromUiSettings({
			...DEFAULT_SETTINGS.ui,
			accentColor: "#ff0000",
		});
		expect(out).toMatchObject({
			"accent-r": "255",
			"accent-g": "0",
			"accent-b": "0",
			"color-ty-accent": "#ff0000",
		});
	});

	it("maps textColor to text channels", () => {
		const out = themeOverridesFromUiSettings({
			...DEFAULT_SETTINGS.ui,
			textColor: "#00ff00",
		});
		expect(out).toMatchObject({
			"text-r": "0",
			"text-g": "255",
			"text-b": "0",
		});
		expect(out).not.toHaveProperty("accent-r");
	});

	it("maps widget background + opacity to a translucent token", () => {
		const out = themeOverridesFromUiSettings({
			...DEFAULT_SETTINGS.ui,
			widget: { backgroundColor: "#112233", opacity: 50 },
		});
		expect(out["color-ty-widget-bg"]).toBe("rgba(17, 34, 51, 0.5)");
	});

	it("maps panel background + opacity to color-ty-bg-app", () => {
		const out = themeOverridesFromUiSettings({
			...DEFAULT_SETTINGS.ui,
			panel: { backgroundColor: "#334455", opacity: 100 },
		});
		expect(out["color-ty-bg-app"]).toBe("rgba(51, 68, 85, 1)");
	});

	it("emits widget token when only opacity changes", () => {
		const out = themeOverridesFromUiSettings({
			...DEFAULT_SETTINGS.ui,
			widget: {
				backgroundColor: DEFAULT_SETTINGS.ui.widget?.backgroundColor ?? "",
				opacity: 40,
			},
		});
		expect(out["color-ty-widget-bg"]).toContain("rgba(26, 26, 26, 0.4)");
	});

	it("ignores malformed colors instead of writing bad tokens", () => {
		const out = themeOverridesFromUiSettings({
			...DEFAULT_SETTINGS.ui,
			accentColor: "not-a-color",
			textColor: "#12345",
		});
		expect(out).toEqual({});
	});
});
