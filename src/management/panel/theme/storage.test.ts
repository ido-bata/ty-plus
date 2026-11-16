// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

const readThemeCssMock = vi.hoisted(() => vi.fn());
const readThemeCssStrictMock = vi.hoisted(() => vi.fn());
const writeThemeCssMock = vi.hoisted(() => vi.fn());

vi.mock("@/management/storage", () => ({
	readThemeCss: readThemeCssMock,
	readThemeCssStrict: readThemeCssStrictMock,
	writeThemeCss: writeThemeCssMock,
}));

import { applyCepShellTheme } from "@/management/panel/inject-styles";
import {
	cacheCepShellThemeOverridesFromCssText,
	loadCepShellThemeFromCss,
	loadCepShellThemeOverridesForWrite,
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
	readThemeCssStrictMock.mockReset();
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

	it("does not update the cache when the theme.css write fails", async () => {
		setThemeOverrideCache({ "ty-ws-cell": "48px" });
		writeThemeCssMock.mockRejectedValue(new Error("EACCES"));
		await expect(
			saveCepShellThemeToCss(window, { "ty-ws-cell": "96px" }),
		).rejects.toThrow("EACCES");
		// Cache must not run ahead of the file: re-injection keeps the last
		// durable values, not the unsaved ones.
		expect(getThemeOverrideCache()).toEqual({ "ty-ws-cell": "48px" });
	});

	it("strict loader rejects on I/O errors instead of reporting empty", async () => {
		readThemeCssStrictMock.mockRejectedValue(new Error("EACCES"));
		await expect(loadCepShellThemeOverridesForWrite(window)).rejects.toThrow(
			"EACCES",
		);
		// Genuinely absent/blank file is the only "empty" case.
		readThemeCssStrictMock.mockResolvedValue(null);
		await expect(loadCepShellThemeOverridesForWrite(window)).resolves.toEqual(
			{},
		);
		readThemeCssStrictMock.mockResolvedValue("");
		await expect(loadCepShellThemeOverridesForWrite(window)).resolves.toEqual(
			{},
		);
	});

	it("strict loader returns persisted overrides for read-modify-write", async () => {
		readThemeCssStrictMock.mockResolvedValue(
			":root {\n  --ty-ws-cell: 96px;\n  --ty-ws-grid-gap: 12px;\n}",
		);
		const loaded = await loadCepShellThemeOverridesForWrite(window);
		expect(loaded).toMatchObject({
			"ty-ws-cell": "96px",
			"ty-ws-grid-gap": "12px",
		});
		expect(getThemeOverrideCache()).toMatchObject({
			"ty-ws-cell": "96px",
			"ty-ws-grid-gap": "12px",
		});
	});

	it("a slow disk load does not clobber a newer cache update", async () => {
		let resolveRead: ((v: string) => void) | undefined;
		readThemeCssMock.mockImplementation(
			() =>
				new Promise<string>((resolve) => {
					resolveRead = resolve;
				}),
		);
		const pending = loadCepShellThemeFromCss(window);
		// A save/live merge lands while the host read is still in flight.
		setThemeOverrideCache({ "ty-ws-cell": "64px" });
		resolveRead?.(":root {\n  --ty-ws-cell: 96px;\n}");
		const loaded = await pending;
		// Return value still reflects the disk snapshot for the caller, but
		// the sync cache keeps the newer value.
		expect(loaded).toMatchObject({ "ty-ws-cell": "96px" });
		expect(getThemeOverrideCache()).toEqual({ "ty-ws-cell": "64px" });
	});
});
