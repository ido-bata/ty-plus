// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

const readThemeCssMock = vi.hoisted(() => vi.fn());
const writeThemeCssMock = vi.hoisted(() => vi.fn());

vi.mock("@/management/storage", () => ({
	readThemeCss: readThemeCssMock,
	writeThemeCss: writeThemeCssMock,
}));

import { applyCepShellTheme } from "@/management/panel/inject-styles";
import {
	cacheCepShellThemeOverridesFromCssText,
	loadCepShellThemeFromCss,
	saveCepShellThemeToCss,
} from "@/management/panel/theme/storage";
import { loadThemeOverrides } from "@/management/style/load-overrides";
import { mergePanelTheme } from "@/management/style/merge-theme";
import {
	clearThemeOverrideCache,
	getThemeOverrideCache,
	setThemeOverrideCache,
} from "@/management/style/theme-overrides-cache";

const THEME_STYLE_ID = "ty-plus-theme-vars";

const themeStyleText = (): string =>
	document.getElementById(THEME_STYLE_ID)?.textContent ?? "";

beforeEach(() => {
	clearThemeOverrideCache();
	readThemeCssMock.mockReset();
	writeThemeCssMock.mockReset();
	document.getElementById(THEME_STYLE_ID)?.remove();
});

describe("cep shell theme persistence lifecycle (Issue #91)", () => {
	it("re-injection after boot keeps persisted overrides instead of reverting to defaults", async () => {
		readThemeCssMock.mockResolvedValue(
			":root {\n  --ty-ws-cell: 96px;\n  --ty-ws-grid-gap: 12px;\n  --ty-ws-grid-radius: 9px;\n}",
		);

		const loaded = await loadCepShellThemeFromCss(window);
		expect(loaded).toMatchObject({
			"ty-ws-cell": "96px",
			"ty-ws-grid-gap": "12px",
			"ty-ws-grid-radius": "9px",
		});

		// Boot applies overrides once (mirrorHost path).
		applyCepShellTheme(document, { themeOverrides: loaded ?? {} });
		expect(themeStyleText()).toContain("--ty-ws-cell: 96px");

		// Synchronous re-injection (viewport resync / style recovery /
		// post-mirror finally) must not rebuild :root from defaults only.
		applyCepShellTheme(document);
		applyCepShellTheme(document);
		const text = themeStyleText();
		expect(text).toContain("--ty-ws-cell: 96px");
		expect(text).toContain("--ty-ws-grid-gap: 12px");
		expect(text).toContain("--ty-ws-grid-radius: 9px");
	});

	it("parses legacy malformed theme.css (nested :root) written by older builds", async () => {
		readThemeCssMock.mockResolvedValue(
			":root {\n:root {\n  --ty-ws-cell: 96px;\n  --ty-status-error: #ff0000;\n  --color-surface-panel: var(--ty-surface-panel);\n}\n}",
		);
		const loaded = await loadCepShellThemeFromCss(window);
		expect(loaded).toMatchObject({
			"ty-ws-cell": "96px",
			"ty-status-error": "#ff0000",
		});
		// Bridge-only keys are not valid theme tokens and must be dropped.
		expect(loaded).not.toHaveProperty("color-surface-panel");
	});

	it("saveCepShellThemeToCss writes a single :root block without the injected bridge", async () => {
		await saveCepShellThemeToCss(window, { "ty-ws-cell": "96px" });
		const written = writeThemeCssMock.mock.calls[0]?.[1] as string;
		expect(written.startsWith(":root {")).toBe(true);
		expect(written).not.toContain(":root {\n:root {");
		expect(written).toContain("--ty-ws-cell: 96px;");
		expect(written).not.toContain("--color-surface-panel");
		// Cache reflects what was persisted.
		expect(getThemeOverrideCache()).toMatchObject({ "ty-ws-cell": "96px" });
		expect(loadThemeOverrides()).toMatchObject({ "ty-ws-cell": "96px" });
	});

	it("empty theme.css clears the override cache", async () => {
		setThemeOverrideCache({ "ty-ws-cell": "96px" });
		readThemeCssMock.mockResolvedValue("");
		const loaded = await loadCepShellThemeFromCss(window);
		expect(loaded).toEqual({});
		expect(getThemeOverrideCache()).toEqual({});
	});

	it("mergePanelTheme layers cached storage overrides under explicit overrides", () => {
		setThemeOverrideCache({ "ty-ws-cell": "96px" });
		const merged = mergePanelTheme({ "ty-ws-cell": "64px" });
		expect(merged["ty-ws-cell"]).toBe("64px");
		const mergedDefault = mergePanelTheme();
		expect(mergedDefault["ty-ws-cell"]).toBe("96px");
	});

	it("cacheCepShellThemeOverridesFromCssText updates the cache for direct file writers", () => {
		cacheCepShellThemeOverridesFromCssText(
			":root {\n  --ty-ws-grid-radius: 9px;\n}",
		);
		expect(getThemeOverrideCache()).toEqual({ "ty-ws-grid-radius": "9px" });
		cacheCepShellThemeOverridesFromCssText("");
		expect(getThemeOverrideCache()).toEqual({});
	});
});
