import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync(new URL("./boot.tsx", import.meta.url), "utf8");

describe("bootTyPlusModelessDialog", () => {
	test("does not block debug-console rendering on log retention", () => {
		expect(source).toContain("void initializeLogRetention(window).catch");
		expect(source).not.toContain("await initializeLogRetention(window)");
	});

	test("renders debug-console before i18n/provider bootstrapping", () => {
		const debugRenderIndex = source.indexOf(
			"createRoot(mount).render(<DebugDialogRoot surfaceId={surfaceId} />)",
		);
		const i18nIndex = source.indexOf("await initializeI18n(window)");

		expect(debugRenderIndex).toBeGreaterThan(-1);
		expect(i18nIndex).toBeGreaterThan(-1);
		expect(debugRenderIndex).toBeLessThan(i18nIndex);
	});
});
