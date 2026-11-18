/**
 * Guard test: no `https://www.notion.so/...` or `https://www.notion.com/...`
 * string literals may live in `src/**`. The online Preset Library /
 * public-links / Supabase surface was removed under the offline-core policy
 * (#170, #193); this guard remains as reinfection prevention so a restored
 * online surface cannot silently reintroduce hardcoded documentation URLs.
 *
 * Allowed-list: only this file (it names the patterns it forbids).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

const ALLOWED_PATHS: string[] = [
	// This file (it names the forbidden patterns in its own source)
	path.join("tools", "check", "no-inline-notion-url.test.ts"),
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
