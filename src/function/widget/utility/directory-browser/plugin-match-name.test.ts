/**
 * Regression test for the .aex/.plugin import path in the directory browser.
 *
 * Bug: the directory browser extracted the filename stem (e.g. "AddGrain" from
 * "AddGrain.aex") and passed it to `applyEffectByMatchName` as the matchName.
 * After Effects then raised a PropertyGroup error because the actual matchName
 * stored in the plugin's PICA resource is something like
 * "ADBE AddGrain" / "ADDGRAIN" — unrelated to the on-disk filename.
 *
 * The candidates cache (`@/management/storage/candidates-cache`) indexes every
 * installed plugin with the catalog-resolved matchName. The import path must
 * look up the matchName there, not derive it from the filename.
 */
import { describe, expect, it } from "vitest";
import { resolveEffectMatchName } from "./plugin-match-name";

describe("resolveEffectMatchName", () => {
	const candidates = [
		{
			filePath: "C:/Plugins/AddGrain.aex",
			matchName: "ADBE AddGrain",
			displayName: "AddGrain",
		},
		{
			filePath: "C:/Plugins/Sapphire/Blur.aex",
			matchName: "BCC Blur",
			displayName: "Blur",
		},
	];

	it("returns the catalog matchName for a plugin file with the exact same path", () => {
		expect(resolveEffectMatchName("C:/Plugins/AddGrain.aex", candidates)).toBe(
			"ADBE AddGrain",
		);
	});

	it("matches case-insensitively on Windows-style paths", () => {
		expect(resolveEffectMatchName("c:/plugins/addgrain.aex", candidates)).toBe(
			"ADBE AddGrain",
		);
	});

	it("normalizes backslashes to forward slashes when matching", () => {
		expect(
			resolveEffectMatchName("C:\\Plugins\\AddGrain.aex", candidates),
		).toBe("ADBE AddGrain");
	});

	it("returns a different catalog matchName when the file differs", () => {
		expect(
			resolveEffectMatchName("C:/Plugins/Sapphire/Blur.aex", candidates),
		).toBe("BCC Blur");
	});

	it("does NOT return the filename stem when no catalog entry exists", () => {
		// The bug was returning "AddGrain" (the stem) for a path whose catalog
		// matchName is "ADBE AddGrain". With no catalog entry the function must
		// throw, not silently fall back to the stem — that fallback IS the bug.
		expect(() =>
			resolveEffectMatchName("C:/Plugins/Unlisted.aex", candidates),
		).toThrow(/matchName/i);
	});

	it("throws when the candidates list is empty", () => {
		expect(() => resolveEffectMatchName("C:/Plugins/AddGrain.aex", [])).toThrow(
			/matchName/i,
		);
	});
});
