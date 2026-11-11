import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
/**
 * Regression test: every `t("directoryBrowser.*")` call the component makes,
 * and every `nameKey` the widget descriptor references, must resolve to a leaf
 * string in `en/widgets.json` (the source of truth for the `widgets` namespace).
 *
 * This test would have caught the `699f4785` regression where nested
 * `directoryBrowser.*` keys were flattened to a single `"Directory browser"`
 * string. The locale-to-locale parity check is blind to use-side `t()` calls;
 * this test is not.
 */
import enWidgets from "@/management/i18n/locales/en/widgets.json";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, "Component.tsx");
const indexPath = resolve(here, "index.ts");

const componentSrc = readFileSync(componentPath, "utf8");
const indexSrc = readFileSync(indexPath, "utf8");

const resolveKey = (root: Json, key: string): Json => {
	const parts = key.split(".");
	let cursor: Json = root;
	for (const part of parts) {
		if (
			cursor === null ||
			typeof cursor !== "object" ||
			Array.isArray(cursor)
		) {
			throw new Error(
				`Key "${key}" resolves through a non-object at "${part}"`,
			);
		}
		cursor = (cursor as Record<string, Json>)[part];
		if (cursor === undefined) {
			throw new Error(`Key "${key}" not found (missing "${part}")`);
		}
	}
	return cursor;
};

const extractTCalls = (src: string): string[] => {
	const re =
		/\bt\(\s*"((?:widgets:)?directoryBrowser(?:\.[A-Za-z0-9_]+)+)"\s*[,)]/g;
	return Array.from(src.matchAll(re), (m) =>
		(m[1] ?? "").replace(/^widgets:/, ""),
	);
};

const extractNameKeys = (src: string): string[] => {
	const re = /nameKey:\s*"(widgets\.[A-Za-z0-9_.]+)"/g;
	return Array.from(src.matchAll(re), (m) => m[1] ?? "");
};

const isLeafString = (value: Json): value is string =>
	typeof value === "string";

describe("directory browser i18n keys", () => {
	const tKeys = extractTCalls(componentSrc);
	const nameKeys = extractNameKeys(indexSrc);
	const enRoot = enWidgets as unknown as Json;

	it("Component.tsx references at least one directoryBrowser key", () => {
		expect(tKeys.length).toBeGreaterThan(0);
	});

	it("index.ts declares a nameKey for the widget descriptor", () => {
		expect(nameKeys.length).toBeGreaterThan(0);
	});

	it.each(tKeys)("t(%s) resolves to a string in en/widgets.json", (key) => {
		const value = resolveKey(enRoot, key);
		expect(isLeafString(value)).toBe(true);
	});

	it.each(nameKeys)(
		"nameKey %s resolves to a string in en/widgets.json",
		(key) => {
			const stripped = key.replace(/^widgets\./, "");
			const value = resolveKey(enRoot, stripped);
			expect(isLeafString(value)).toBe(true);
		},
	);

	it("does not reference any flat (non-nested) directoryBrowser key", () => {
		// i18next keySeparator is ".". A "flat" entry would be the leaf
		// `directoryBrowser` being a string. Catches the 699f4785 regression
		// where the nested object was collapsed into a single label.
		const dbRoot = (enRoot as Record<string, Json>).directoryBrowser;
		expect(dbRoot).toBeDefined();
		expect(typeof dbRoot).toBe("object");
		expect(dbRoot).not.toBeNull();
		expect(Array.isArray(dbRoot)).toBe(false);
	});
});
