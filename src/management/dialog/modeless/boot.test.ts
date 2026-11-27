import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync(new URL("./boot.tsx", import.meta.url), "utf8");

describe("bootTyPlusModelessDialog", () => {
	test("does not block debug-console rendering on log retention", () => {
		expect(source).toContain("void initializeLogRetention(window).catch");
		expect(source).not.toContain("await initializeLogRetention(window)");
	});

	test("renders debug-console without awaiting i18n, refreshing once ready", () => {
		const i18nStartIndex = source.indexOf("initializeI18n(window)");
		const debugRenderIndex = source.indexOf("<DebugConsoleI18nGate");
		const i18nAwaitIndex = source.indexOf("await i18nInit");

		expect(debugRenderIndex).toBeGreaterThan(-1);
		expect(i18nStartIndex).toBeGreaterThan(-1);
		expect(i18nAwaitIndex).toBeGreaterThan(-1);
		expect(i18nStartIndex).toBeLessThan(debugRenderIndex);
		expect(debugRenderIndex).toBeLessThan(i18nAwaitIndex);
	});
});
