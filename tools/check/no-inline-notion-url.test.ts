/**
 * Guard test: no `https://www.notion.so/...` or `https://www.notion.com/...`
 * string literals may live in `src/**`. Documentation URLs must go through
 * the public-links API (Supabase + JSON cache) and never be hardcoded.
 *
 * Allowed-list (intentional test/fixture URLs):
 *   - `src/management/online/contract.ts` (PublicLink fixtures/examples)
 *   - `src/management/online/catalog/runtime-cloud-gateway.ts` (fixture mode
 *     fixture URL)
 *   - `src/management/online/public-link/**` (intentional Notion URL
 *     documentation comments)
 *   - `supabase/**` (migrations / Edge Function code is server-side, not
 *     bundled into the CEP extension)
 *   - `tools/check/no-inline-notion-url.test.ts` (this file)
 *   - `docs/no-use/**` and `archive/**` (legacy / reference, not bundled)
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

const ALLOWED_PATHS: string[] = [
	// This file (explanation)
	path.join("tools", "check", "no-inline-notion-url.test.ts"),
	// Public link types / fixture URL
	path.join("src", "management", "online", "contract.ts"),
	path.join(
		"src",
		"management",
		"online",
		"catalog",
		"runtime-cloud-gateway.ts",
	),
	path.join(
		"src",
		"management",
		"online",
		"catalog",
		"runtime-cloud-gateway.test.ts",
	),
	path.join("src", "management", "online", "runtime-gateway.test.ts"),
	path.join("src", "management", "online", "public-link", "usePublicLink.ts"),
	path.join(
		"src",
		"management",
		"online",
		"public-link",
		"usePublicLink.test.ts",
	),
	// Seeded entry lives in the migration, not in src/
];

const NOTION_PATTERNS: RegExp[] = [
	/https:\/\/www\.notion\.so\//,
	/https:\/\/www\.notion\.com\//,
	/https:\/\/notion\.so\//,
	/https:\/\/notion\.com\//,
];

const isAllowed = (relPath: string): boolean =>
	ALLOWED_PATHS.some((allowed) => relPath.endsWith(allowed));

const collectFiles = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectFiles(abs)));
		} else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
			out.push(abs);
		}
	}
	return out;
};

const fileExists = async (p: string): Promise<boolean> => {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
};

describe("no inline Notion URLs in src/", () => {
	it("scans src/ recursively and fails on any hardcoded notion host", {
		timeout: 15_000,
	}, async () => {
		if (!(await fileExists(SRC))) {
			throw new Error(`Source root not found: ${SRC}`);
		}
		const files = await collectFiles(SRC);
		const violations: Array<{ file: string; line: number; text: string }> = [];
		for (const abs of files) {
			const rel = path.relative(ROOT, abs);
			if (isAllowed(rel)) continue;
			const text = await readFile(abs, "utf8");
			const lines = text.split(/\r?\n/);
			lines.forEach((line, idx) => {
				// Skip comments that mention notion.so as documentation
				if (/^\s*\*/.test(line)) return;
				for (const pat of NOTION_PATTERNS) {
					if (pat.test(line)) {
						violations.push({
							file: rel,
							line: idx + 1,
							text: line.trim().slice(0, 120),
						});
						break;
					}
				}
			});
		}
		expect(violations).toEqual([]);
	});
});
