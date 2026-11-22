import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression test: every `t("fontViewer.*")` call the widget makes — the
 * shipped `Component.tsx` and the extracted components it renders — must
 * resolve to a leaf string in `en/widgets.json` (the source of truth for the
 * `widgets` namespace), and the descriptor's `nameKey` must resolve too.
 *
 * The locale-to-locale parity check is blind to use-side `t()` calls; this
 * test is not.
 */
import enWidgets from "@/management/i18n/locales/en/widgets.json";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, "Component.tsx");
const descriptorPath = resolve(here, "descriptor.ts");

const componentSrc = readFileSync(componentPath, "utf8");
const descriptorSrc = readFileSync(descriptorPath, "utf8");

// The widget is composed from the modules next to it (the banner row, the
// sample row, the status line). Their `t()` calls are part of the same
// use-side surface, so they are covered by the same key check.
const extractedSrcs: readonly { file: string; src: string }[] = [
	"FontViewerBanners.tsx",
	"FontViewerSampleRow.tsx",
	"FontViewerStatusLine.tsx",
].map((file) => ({ file, src: readFileSync(resolve(here, file), "utf8") }));

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
	const re = /\bt\(\s*"((?:widgets:)?fontViewer(?:\.[A-Za-z0-9_]+)+)"\s*[,)]/g;
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

describe("font viewer i18n keys", () => {
	const tKeys = extractTCalls(componentSrc);
	const extractedTKeys = extractedSrcs.flatMap(({ file, src }) =>
		extractTCalls(src).map((key) => ({ file, key })),
	);
	const nameKeys = extractNameKeys(descriptorSrc);
	const enRoot = enWidgets as unknown as Json;

	it("Component.tsx references at least one fontViewer key", () => {
		expect(tKeys.length).toBeGreaterThan(0);
	});

	it("every extracted component references fontViewer keys", () => {
		for (const { file, src } of extractedSrcs) {
			expect(extractTCalls(src).length, file).toBeGreaterThan(0);
		}
	});

	it("descriptor.ts declares a nameKey for the widget", () => {
		expect(nameKeys.length).toBeGreaterThan(0);
	});

	it.each(tKeys)("t(%s) resolves to a string in en/widgets.json", (key) => {
		const value = resolveKey(enRoot, key);
		expect(isLeafString(value)).toBe(true);
	});

	it.each(extractedTKeys)(
		"t(%s) in %s resolves to a string in en/widgets.json",
		({ key }) => {
			const value = resolveKey(enRoot, key);
			expect(isLeafString(value)).toBe(true);
		},
	);

	it.each(nameKeys)(
		"nameKey %s resolves to a string in en/widgets.json",
		(key) => {
			const stripped = key.replace(/^widgets\./, "");
			const value = resolveKey(enRoot, stripped);
			expect(isLeafString(value)).toBe(true);
		},
	);
});
