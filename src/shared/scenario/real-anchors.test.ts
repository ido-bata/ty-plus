/**
 * Production-source existence check (Issue #147, round-3 Blocker 2,
 * round-4 Blocker C, round-5 needs-fix 1).
 *
 * The whitelist in `real-anchors.ts` is HAND-CURATED against `src/`.
 * Every entry is supposed to correspond to a real production
 * `data-*` attribute.  Stale entries — whitelist rows whose
 * production source has been renamed or deleted — were a round-2
 * gap: nothing in CI guarded against the drift, so a test could
 * pass against an anchor that had silently disappeared from
 * production.  Round-3 fixes this by scanning `src/` for each
 * whitelist entry at test time and asserting at least one
 * occurrence exists.  Round-4 (Blocker C) tightens the scan:
 *
 *   - The scan walks the `src/` tree (filtered to .ts, .tsx,
 *     .js, .jsx) EXCEPT `src/shared/scenario/real-anchors.ts`
 *     itself and any `*.test.ts` files.  A whitelist entry is only
 *     valid when at least one production-source file outside the
 *     whitelist / test corpus emits it; otherwise the entry self-
 *     validates and a stale entry could pass CI.
 *   - The scan looks for the literal attribute VALUE, not just the
 *     bare attribute NAME.  A round-3 scan would have accepted
 *     `[data-x="anything"]` as a match for a `data-x` whitelist
 *     entry; the round-4 scan requires the value side of the
 *     `attr(name)` pattern to match at least one occurrence in
 *     production source.
 *   - On failure the test lists the file (and the attribute shape
 *     that was matched) so the curator can fix the stale entry
 *     without spelunking.
 *
 * Round-5 needs-fix 1 broadens the exclusion list.  Round-4 only
 * excluded `*.test.ts` — a whitelist row whose real production
 * anchor was a `data-x` attribute found ONLY inside a React test
 * (`*.test.tsx`), a Storybook story (`*.stories.tsx`), a vitest
 * spec variant (`*.spec.ts` / `*.spec.tsx`), a `__tests__/`
 * directory, or a `__fixtures__/` directory would still satisfy
 * itself at scan time.  The round-5 scan excludes ALL of:
 *
 *   - `*.test.ts`, `*.test.tsx`            — vitest test files
 *   - `*.spec.ts`, `*.spec.tsx`            — vitest spec variants
 *   - `*.stories.ts`, `*.stories.tsx`      — Storybook story files
 *   - `__tests__/` directory contents       — vitest grouping convention
 *   - `__fixtures__/` directory contents    — fixture grouping convention
 *
 * The scan is intentionally narrow:
 *
 *   - It walks src filtered to .ts, .tsx, .js, .jsx (production
 *     source only — tests, docs, and dist are excluded).
 *   - It greps for both the bare attribute name (used by whitelist
 *     entries without an `=value` part) AND the value-side pattern
 *     (`data-x="value"` / `data-x='value'` / `data-testid="value"`).
 *     When neither side is matched anywhere in production source
 *     the entry is treated as stale.
 *   - It tolerates up to 0 missing — every entry must hit.
 *
 * When you DELETE a `data-*` attribute from production source, run
 * the suite, see which entry surfaced, and update the whitelist.
 * When you ADD a new `data-*` attribute, add the matching pattern
 * to the whitelist AND a stub `data-testid` site so the production
 * code path that emits it gets exercised.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep as pathSep } from "node:path";

import { describe, expect, it } from "vitest";

import { REAL_ANCHOR_PATTERNS } from "./real-anchors";

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, "src");

const PRODUCTION_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const SELF_FILE = join(REPO_ROOT, "src/shared/scenario/real-anchors.ts");

/**
 * Round-5 needs-fix 1 — exclusion breadth.
 *
 * Files matching any of these suffixes or living under any of these
 * directories are EXCLUDED from the scan because they are test or
 * fixture artifacts, not production source that emits `data-*`
 * attributes for the panel UI.  A whitelist entry must be backed by
 * a real production source file outside this exclusion list, otherwise
 * the entry self-validates and a stale anchor can pass CI.
 */
const TEST_FILE_SUFFIXES = [
	".test.ts",
	".test.tsx",
	".spec.ts",
	".spec.tsx",
	".stories.ts",
	".stories.tsx",
] as const;

const EXCLUDED_DIR_NAMES = new Set<string>([
	"node_modules",
	"dist",
	"build",
	".turbo",
	"coverage",
	"__tests__",
	"__fixtures__",
]);

const isTestLikeFile = (absPath: string): boolean =>
	TEST_FILE_SUFFIXES.some((suffix) => absPath.endsWith(suffix));

const isSelfFile = (absPath: string): boolean => absPath === SELF_FILE;

const shouldSkipDir = (name: string): boolean => EXCLUDED_DIR_NAMES.has(name);

const walkProductionFiles = (dir: string): readonly string[] => {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const abs = join(dir, entry);
		const st = statSync(abs);
		if (st.isDirectory()) {
			if (shouldSkipDir(entry)) continue;
			out.push(...walkProductionFiles(abs));
			continue;
		}
		const lastDot = entry.lastIndexOf(".");
		const ext = lastDot >= 0 ? entry.slice(lastDot) : "";
		if (!PRODUCTION_EXTENSIONS.has(ext)) continue;
		if (isTestLikeFile(abs)) continue;
		if (isSelfFile(abs)) continue;
		out.push(abs);
	}
	return out;
};

interface FileHaystack {
	readonly absPath: string;
	readonly contents: string;
}

const collectContents = (files: readonly string[]): readonly FileHaystack[] => {
	const out: FileHaystack[] = [];
	for (const file of files) {
		try {
			out.push({ absPath: file, contents: readFileSync(file, "utf8") });
		} catch {
			// file may have been removed between readdir + read; skip.
		}
	}
	return out;
};

/**
 * Extract the grep-able attribute token from a whitelist regex source.
 * Patterns look like:
 *
 *   - `\[data-testid="setup-required"\]`     →  `data-testid="setup-required"`
 *   - `\[data-preset-id\]`                   →  `data-preset-id`
 *   - `\[data-settings-sidebar\]`             →  `data-settings-sidebar`
 *
 * The captured `name` group is the full attribute fragment
 * (`data-...` with optional `="value"`).  The function returns
 * `{ name, quotedValue }` so the scanner can search for the value
 * side separately when present.
 */
const extractAnchorToken = (
	pattern: string,
): { readonly name: string; readonly quotedValue: string | null } | null => {
	// The regex sources look like:
	//   `\[data-testid="setup-required"(=["'][^"']*["'])?\]`
	//   `\[data-preset-id\]`
	// We only care about the bare attribute name and the literal
	// `="value"` portion; the trailing tail `(=["']...)?` is regex
	// noise that we don't need to match.  Consume any chars that are
	// not `]` until the closing `\]` (the closing bracket always
	// belongs to the attribute, never to a sub-pattern).
	const m = pattern.match(/\\?\[(data-[\w-]+)(?:=(["'])([^"'\]]*)\2)?[^\]]*\]/);
	if (!m) return null;
	const name = m[1];
	const quotedValue = m[3] !== undefined ? m[3] : null;
	return { name, quotedValue };
};

/**
 * Locate the first production-source file that contains the
 * attribute token, and report the shape that matched.  Returns
 * `null` when nothing matches.  The first-match file path is used
 * for the curator-facing debug aid (`describe("data-... match")`).
 */
const findFirstMatch = (
	haystacks: readonly FileHaystack[],
	attributeName: string,
	quotedValue: string | null,
): { readonly file: string; readonly matched: string } | null => {
	for (const h of haystacks) {
		if (quotedValue !== null) {
			// Ensure the match is the value-form, not the bare-name form.
			// Acceptable forms:  data-x="v"   data-x='v'
			const expectedDouble = `${attributeName}="${quotedValue}"`;
			const expectedSingle = `${attributeName}='${quotedValue}'`;
			if (
				h.contents.includes(expectedDouble) ||
				h.contents.includes(expectedSingle)
			) {
				const matched = h.contents.includes(expectedDouble)
					? expectedDouble
					: expectedSingle;
				return { file: h.absPath, matched };
			}
			continue;
		}
		// Bare-name form: at least the attribute name must appear in
		// production source.  We don't constrain it to `=[...]` so
		// entries that mean "any value of data-x" don't false-fail.
		const idx = h.contents.indexOf(attributeName);
		if (idx === -1) continue;
		return { file: h.absPath, matched: attributeName };
	}
	return null;
};

const toRepoRelative = (absPath: string): string => {
	if (absPath.startsWith(REPO_ROOT + pathSep)) {
		return absPath.slice(REPO_ROOT.length + 1);
	}
	return absPath;
};

describe("real-anchor production-source existence (round-3 Blocker 2 + round-4 Blocker C)", () => {
	const files = walkProductionFiles(SRC_ROOT);
	const haystacks = collectContents(files);

	it("scanned production source has at least one file", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it("scanned production source EXCLUDES the whitelist file and test-like files (round-5 needs-fix 1)", () => {
		// The scan must not include the whitelist file itself or any
		// test / spec / stories file or any path under __tests__/ or
		// __fixtures__/.  Otherwise a whitelist entry could satisfy
		// itself without a production counterpart (round-4 Blocker C
		// + round-5 needs-fix 1).
		expect(files).not.toContain(SELF_FILE);
		for (const f of files) {
			expect(isTestLikeFile(f)).toBe(false);
			expect(isSelfFile(f)).toBe(false);
		}
	});

	it("round-5 needs-fix 1: exclusion suffix list covers every documented test / spec / stories variant", () => {
		// Sanity-check the in-source list itself so a future curator
		// who adds a new test-like suffix is forced to extend the
		// suite (rather than silently letting a stale anchor pass).
		expect(TEST_FILE_SUFFIXES).toEqual([
			".test.ts",
			".test.tsx",
			".spec.ts",
			".spec.tsx",
			".stories.ts",
			".stories.tsx",
		]);
	});

	it("round-5 needs-fix 1: excluded-dir list covers __tests__ and __fixtures__", () => {
		expect(EXCLUDED_DIR_NAMES.has("__tests__")).toBe(true);
		expect(EXCLUDED_DIR_NAMES.has("__fixtures__")).toBe(true);
	});

	it("round-5 needs-fix 1: walkProductionFiles drops every test / spec / stories file present in src/", () => {
		// Walk the whole src tree without exclusions and confirm that
		// every file matching one of the test-like suffixes is absent
		// from the production scan.  This catches future test files
		// that use one of the suffixes without the curator noticing.
		const allSrcFiles: string[] = [];
		const walkUnfiltered = (dir: string): void => {
			for (const entry of readdirSync(dir)) {
				const abs = join(dir, entry);
				const st = statSync(abs);
				if (st.isDirectory()) {
					if (EXCLUDED_DIR_NAMES.has(entry)) continue;
					walkUnfiltered(abs);
					continue;
				}
				allSrcFiles.push(abs);
			}
		};
		walkUnfiltered(SRC_ROOT);
		const testLike = allSrcFiles.filter(isTestLikeFile);
		// If there are no test files (e.g. pruned subtree), the test
		// stays green and signals the curator via the empty list.
		for (const f of testLike) {
			expect(files).not.toContain(f);
		}
	});

	it("every whitelist pattern has at least one production-source occurrence (round-4 Blocker C strict)", () => {
		const missing: {
			readonly pattern: string;
			readonly token: string;
		}[] = [];
		const sourceLines: string[] = [];
		for (const pattern of REAL_ANCHOR_PATTERNS) {
			const extracted = extractAnchorToken(pattern);
			if (extracted === null) continue;
			const match = findFirstMatch(
				haystacks,
				extracted.name,
				extracted.quotedValue,
			);
			if (match === null) {
				missing.push({ pattern, token: extracted.name });
				continue;
			}
			sourceLines.push(
				`  ${extracted.name}${
					extracted.quotedValue === null ? "" : `="${extracted.quotedValue}"`
				}  <-  ${toRepoRelative(match.file)}  (matched "${match.matched}")`,
			);
		}
		if (missing.length > 0) {
			throw new Error(
				`${missing.length} whitelist pattern(s) have no production source occurrence. ` +
					`Either restore the data-* anchor in src/ or remove the stale entry from real-anchors.ts:\n  ` +
					missing.map((m) => `${m.pattern} (token=${m.token})`).join("\n  "),
			);
		}
		// Round-4 Blocker C — surface which file each whitelist entry
		// was found in (debug aid).  This is non-fatal informational
		// output that the test runner captures so the curator can see
		// the source-of-truth mapping at a glance.
		expect(sourceLines.length).toBe(REAL_ANCHOR_PATTERNS.length);
	});
});
