import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	checkCoverage,
	collectTKeyReferences,
	readLocaleJson,
} from "./check-i18n-locale-coverage";

const writeJson = async (dir: string, name: string, value: unknown) => {
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, name), JSON.stringify(value), "utf8");
};

const fixtureLocales = async () => {
	const root = mkdtempSync(join(tmpdir(), "ty-plus-i18n-gate-"));
	const enDir = join(root, "locales", "en");
	const xxDir = join(root, "locales", "xx");
	await writeJson(enDir, "a.json", { hello: "Hello", nested: { x: "X" } });
	await writeJson(enDir, "b.json", { y: "Y" });
	await writeJson(xxDir, "a.json", {
		hello: "Hallo",
		stale: "Stale",
	});
	await writeJson(xxDir, "b.json", { y: "TODO: Y" });
	const srcDir = join(root, "src");
	await mkdir(join(srcDir, "comp"), { recursive: true });
	await writeFile(
		join(srcDir, "comp", "Component.tsx"),
		[
			'import { useTranslation } from "react-i18next";',
			'export const label = (t: (k: string) => string) => t("a.hello");',
			'export const missing = (t: (k: string) => string) => t("a.nope");',
			"export const dynamic = (t: (k: string) => string, v: string) =>",
			"  t(`a.${v}`);",
			'export const descriptor = { nameKey: "a.nested.x" };',
			'export const dangling = { nameKey: "a.gone" };',
			"",
		].join("\n"),
		"utf8",
	);
	return { root, localesDir: join(root, "locales"), srcDir };
};

describe("check-i18n-locale-coverage gate", () => {
	it("flags missing keys and TODO placeholders on the default stage", async () => {
		const { localesDir } = await fixtureLocales();
		const result = await checkCoverage(localesDir, {
			locales: ["xx"],
			strictEnCanonical: false,
			srcDir: join(localesDir, "..", "src"),
		});
		expect(result.errors.some((e) => e.includes("missing"))).toBe(true);
		expect(result.errors.some((e) => e.includes("TODO"))).toBe(true);
		// Extra keys stay warnings on the default stage.
		expect(result.errors.some((e) => e.includes("extra key"))).toBe(false);
		expect(result.warnings.some((w) => w.includes("stale"))).toBe(true);
		await rm(join(localesDir, ".."), { recursive: true, force: true });
	});

	it("fails extra keys and dangling references under --strict-en-canonical", async () => {
		const { localesDir, srcDir } = await fixtureLocales();
		const result = await checkCoverage(localesDir, {
			locales: ["xx"],
			strictEnCanonical: true,
			srcDir,
		});
		expect(result.errors.some((e) => e.includes("extra key"))).toBe(true);
		expect(
			result.errors.some((e) => e.includes("a.nope") || e.includes("a.gone")),
		).toBe(true);
		await rm(join(localesDir, ".."), { recursive: true, force: true });
	});

	it("skips dynamically composed t() keys", async () => {
		const { srcDir } = await fixtureLocales();
		const refs = await collectTKeyReferences(srcDir, ["a", "b"]);
		expect(refs.some((r) => r.key.includes("${"))).toBe(false);
		expect(refs.map((r) => r.key)).toContain("a.nope");
		await rm(join(srcDir, ".."), { recursive: true, force: true });
	});

	it("reads en namespaces for reference resolution", async () => {
		const { localesDir } = await fixtureLocales();
		const en = await readLocaleJson(join(localesDir, "en"));
		expect(Object.keys(en).sort()).toEqual(["a", "b"]);
		await rm(join(localesDir, ".."), { recursive: true, force: true });
	});
});
