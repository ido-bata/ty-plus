#!/usr/bin/env bun
/**
 * naming-antipatterns — static detectors for the anti-cases described in
 * `.agents/skills/code-naming/SKILL.md` that can be proven from the tracked
 * file tree and exported symbol names alone.
 *
 * This complements naming-redundancy.ts / naming-redundancy-symbols.ts, which
 * only measure *repetition*. This script covers the other skill criteria:
 *
 *   [stability]   artifact-residue, transient-name, e2e-in-name
 *   [consistency] case-convention, dir-case, suffix-convention,
 *                 script-language, rust-file-case, rust-test-location,
 *                 gitkeep-stale, python-script
 *   [stutter]     dir-stutter, file-stutter
 *   [repetition]  duplicate-basename, prefix-group, dir-overload
 *   [meaning]     vague-file, vague-dir, vague-component, vague-symbol
 *   [consistency] init-variant
 *
 * NOT statically decidable (left to review): whether a name carries enough
 * meaning at its actual reference sites (§2), whether a serialization key /
 * persisted field / wire name is an external contract (§3), and whether a
 * rename is safe (§5). Those require reading call sites and contracts.
 *
 * Severity: error = almost certainly wrong, warn = likely inconsistency,
 * info = review candidate. Exit code is 0 unless --strict is passed, in
 * which case error/warn findings fail the run.
 *
 * Usage: bun tools/check/naming-antipatterns.ts [--strict] [--rule <name>]
 *        [--path <substring>] [--min-files <n>]
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, posix } from "node:path";
import { getNamedSymbols } from "./lib/extract.js";

type Severity = "error" | "warn" | "info";

type Finding = {
	file: string;
	rule: string;
	severity: Severity;
	detail: string;
};

// Directories whose contents are vendored, generated, or local scratch and
// therefore not subject to this repository's naming rules.
const SKIP_PREFIXES = [
	".agents/",
	// Prose artifacts follow writing-discipline, not code-naming.
	"docs/",
	// CI workflow definitions are not code-named.
	".github/",
	"node_modules/",
	"dist/",
	"coverage/",
	"styled-system/",
	".tmp/",
	"__screenshots__/",
	"target/",
];

// Test/story qualifier suffixes stripped before case and stem analysis.
const QUALIFIER_SUFFIXES = [
	"test",
	"tests",
	"spec",
	"story",
	"stories",
	"d",
	"ext",
	"offline",
	"integration",
	"e2e",
	"end-to-end",
	"process",
	"live",
	"identity",
	"full-roundtrip",
	"roundtrip",
	"benchmark",
	"bench",
];

const VAGUE_FILE_STEMS = new Set([
	"data",
	"manager",
	"managers",
	"util",
	"utils",
	"helper",
	"helpers",
	"misc",
	"common",
	"stuff",
	"thing",
	"things",
	"temp",
	"tmp",
	"foo",
	"bar",
	"baz",
	"whatever",
	"something",
	"processor",
	"app",
	"root",
	"base",
	"abstract",
	"generic",
	"info",
	"details",
	"lib",
	"libs",
	"use-cases",
	"use-case",
]);

const VAGUE_DIR_NAMES = new Set([
	"util",
	"utils",
	"helper",
	"helpers",
	"misc",
	"common",
	"stuff",
	"temp",
	"tmp",
	"old",
	"new",
	"legacy",
	"deprecated",
	"backup",
	"backups",
	"todo",
	"fixme",
	"wip",
	"data",
	"types",
	"constants",
	"config",
	"lib",
	"libs",
]);

const VAGUE_COMPONENT_STEMS = new Set(["Main", "Root", "App"]);

// Whole-token markers that encode development process state rather than a
// durable responsibility (skill §2 安定性).
const TRANSIENT_TOKENS = new Set([
	"wip",
	"todo",
	"fixme",
	"hack",
	"workaround",
	"temporary",
	"residual",
	"deprecated",
	"draft",
	"bug",
]);

const SOFT_TRANSIENT_TOKENS = new Set(["legacy"]);

const TICKET_NAME_RE = /(?:issue|bug|ticket|pr)[-_.#]?\d+/iu;
const ROUND_NAME_RE = /round[-_.]?\d+/iu;

// "main"/"run" are conventional entry-point and test-helper names, and
// "handler"/"info" are idiomatic property and log-level names that the
// lightweight extractor cannot distinguish from declarations — all excluded.
const VAGUE_SYMBOLS = new Set([
	"data",
	"manager",
	"util",
	"helper",
	"misc",
	"common",
	"stuff",
	"temp",
	"tmp",
	"processor",
	"thing",
	"something",
	"whatever",
	"process",
	"handle",
	"do",
	"exec",
	"perform",
]);

const VAGUE_TYPE_NAMES = new Set([
	"Data",
	"Manager",
	"Util",
	"Helper",
	"Misc",
	"Common",
	"Stuff",
	"Temp",
	"Tmp",
	"Handler",
	"Processor",
	"Base",
	"Abstract",
	"Generic",
	"Info",
	"Details",
	"Thing",
	"Something",
	"Any",
	"Unknown",
]);

const VAGUE_CONST_NAMES = new Set([
	"DATA",
	"MANAGER",
	"UTILS",
	"HELPERS",
	"MISC",
	"COMMON",
	"STUFF",
	"TEMP",
	"TMP",
	"HANDLER",
	"PROCESSOR",
	"INFO",
	"DETAILS",
]);

// File basenames that are legitimate per-module "role" names. Duplicates of
// these across feature directories are the established convention, so they
// are excluded from duplicate-basename reporting.
const MODULE_ROLE_STEMS = new Set([
	"index",
	"dialog",
	"component",
	"contract",
	"types",
	"state",
	"runtime",
	"layout",
	"operation",
	"descriptor",
	"render",
	"store",
	"paths",
	"ids",
	"script",
	"initialize",
	"initialization",
	"shell",
	"content",
	"header",
	"footer",
	"body",
	"panel",
	"menu",
	"toolbar",
	"sidebar",
	"theme",
	"tokens",
	"registry",
	"service",
	"repository",
	"gateway",
	"bridge",
	"port",
	"codec",
	"frame",
	"transport",
	"session",
	"context",
	"provider",
	"factory",
	"parser",
	"validator",
	"schema",
	"migration",
	"fixture",
	"fixtures",
	"mock",
	"mocks",
	"stub",
	"stubs",
]);

const splitCamelCase = (value: string): string =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

const tokensOf = (value: string): string[] =>
	splitCamelCase(value)
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((token) => token.length > 0);

// Crude singular normalization for stutter comparison. Only used to compare
// two names that are already suspected of being the same word, so an
// occasional over-stem ("series" -> "serie") is harmless.
const normalizeNumber = (token: string): string => {
	if (token.length <= 3) return token;
	if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
	if (token.endsWith("es")) return token.slice(0, -2);
	if (token.endsWith("s")) return token.slice(0, -1);
	return token;
};

const sameName = (a: string, b: string): boolean =>
	normalizeNumber(a) === normalizeNumber(b);

const extensionOf = (fileName: string): string => {
	const idx = fileName.lastIndexOf(".");
	return idx === -1 ? "" : fileName.slice(idx);
};

// The part of a filename before test/story/variant qualifiers, e.g.
// "PanelRoot.offline.test.ts" -> "PanelRoot", "script.ext.ts" -> "script".
const codeStem = (fileName: string): string => {
	let stem = fileName.slice(0, fileName.length - extensionOf(fileName).length);
	for (;;) {
		const match = /\.([A-Za-z-]+)$/u.exec(stem);
		if (!match) break;
		const qualifier = match[1].toLowerCase();
		if (!QUALIFIER_SUFFIXES.includes(qualifier)) break;
		stem = stem.slice(0, match.index);
	}
	return stem;
};

// First meaningful token of a stem: drops the "use" prefix of hook names so
// "use-group-panel-drag" is compared as "group ...".
const firstMeaningfulToken = (stem: string): string | null => {
	const tokens = tokensOf(stem);
	const filtered = tokens[0] === "use" ? tokens.slice(1) : tokens;
	return filtered[0] ?? null;
};

const isSkipped = (path: string): boolean =>
	SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));

const repoRoot = (): string =>
	execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();

const trackedFiles = (root: string): string[] => {
	const out = execSync("git ls-files -z", {
		cwd: root,
		encoding: "utf-8",
		maxBuffer: 64 * 1024 * 1024,
	});
	return out.split("\0").filter((path) => path.length > 0);
};

const caseClassOf = (stem: string): string => {
	const firstSegment = stem.split(".")[0] ?? stem;
	const hasHyphen = firstSegment.includes("-");
	const hasUnderscore = firstSegment.includes("_");
	const hasUpper = /[A-Z]/u.test(firstSegment);
	const startsUpper = /^[A-Z]/u.test(firstSegment);
	if (hasHyphen && hasUpper) return "mixed";
	if (hasHyphen) return "kebab";
	if (hasUnderscore) return "snake";
	if (startsUpper) return "pascal";
	if (hasUpper) return "camel";
	return "lower";
};

const dirSegmentsOf = (path: string): string[] => {
	const dir = posix.dirname(path);
	return dir === "." ? [] : dir.split("/");
};

const lastDirSegment = (path: string): string | null => {
	const segments = dirSegmentsOf(path);
	return segments.length === 0 ? null : (segments[segments.length - 1] ?? null);
};

const isKebabDirName = (name: string): boolean =>
	name.startsWith(".") ||
	name.startsWith("__") ||
	/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name);

const isTestFileName = (fileName: string): boolean =>
	/\.(test|spec)[.-]/iu.test(fileName) ||
	/\.(test|spec)\.[tj]sx?$/iu.test(fileName);

const CODE_FILE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".rs",
]);

type FileKind = "component" | "story" | "test" | "logic" | "other";

const kindOfFile = (fileName: string): FileKind => {
	const ext = extensionOf(fileName);
	if (
		isTestFileName(fileName) ||
		/\.(test|spec)-(fixtures|utils|helpers|mocks|support)\.[tj]sx?$/iu.test(
			fileName,
		)
	) {
		return "test";
	}
	if (/\.stories?\./iu.test(fileName)) return "story";
	if (ext === ".tsx" || ext === ".jsx") return "component";
	if ([".ts", ".js", ".mjs", ".cjs", ".rs"].includes(ext)) return "logic";
	return "other";
};

const lastMeaningfulToken = (stem: string): string | null => {
	const tokens = tokensOf(stem);
	const filtered = tokens[0] === "use" ? tokens.slice(1) : tokens;
	return filtered[filtered.length - 1] ?? null;
};

// Longest common leading token run across a cluster, used to name the
// suggested subdirectory ("operation-worker-*" -> "operation-worker").
const commonTokenPrefix = (paths: string[]): string => {
	const tokenLists = paths.map((p) =>
		tokensOf(codeStem(basename(p))).filter((t) => t !== "use"),
	);
	if (tokenLists.length === 0) return "";
	const first = tokenLists[0] ?? [];
	let length = first.length;
	for (const tokens of tokenLists.slice(1)) {
		let i = 0;
		while (i < length && i < tokens.length && tokens[i] === first[i]) i++;
		length = i;
	}
	return first.slice(0, length).join("-");
};

const collectFindings = (
	paths: string[],
	readSource?: (path: string) => string,
	minDirFiles = 15,
): Finding[] => {
	const findings: Finding[] = [];
	const codePaths = paths.filter((path) => !isSkipped(path));
	const dirs = new Set<string>();
	const filesByDir = new Map<string, string[]>();
	const filesByBaseName = new Map<string, string[]>();
	// canonical init family -> spelling -> occurrence count
	const initFamilies = new Map<string, Map<string, number>>();

	const add = (
		file: string,
		rule: string,
		severity: Severity,
		detail: string,
	) => {
		findings.push({ file, rule, severity, detail });
	};

	for (const path of codePaths) {
		const fileName = basename(path);
		const ext = extensionOf(fileName);
		const dir = posix.dirname(path);
		if (dir !== ".") {
			dirs.add(dir);
			const list = filesByDir.get(dir) ?? [];
			list.push(path);
			filesByDir.set(dir, list);
		}

		// --- artifact residue (any tracked file) ---
		if (
			/\.(bak|orig|old|swp|swo|tmp|rej|patch)$/iu.test(fileName) ||
			/\.bak\./iu.test(fileName) ||
			fileName.endsWith("~")
		) {
			add(
				path,
				"artifact-residue",
				"error",
				"backup/temporary artifact committed to the repository",
			);
		}

		// --- python scripts (house rule: scripts are TypeScript) ---
		if (ext === ".py") {
			add(
				path,
				"python-script",
				"error",
				"house rule: new scripts must be TypeScript, not Python",
			);
		}

		// --- script language consistency ---
		const inScriptArea =
			(path.startsWith("scripts/") ||
				path.startsWith("tools/") ||
				!path.includes("/")) &&
			!fileName.includes(".config.");
		if (inScriptArea && [".mjs", ".cjs", ".js"].includes(ext)) {
			add(
				path,
				"script-language",
				"warn",
				"JavaScript script under scripts//tools/; house rule prefers TypeScript (.ts) for new and migrated scripts",
			);
		}
		if (inScriptArea && [".sh", ".bash", ".ps1", ".psm1"].includes(ext)) {
			add(
				path,
				"script-language",
				"info",
				"non-TypeScript script; verify it cannot be expressed as .ts",
			);
		}

		// --- rust file case ---
		if (ext === ".rs" && !/^[a-z0-9_]+(?:\.[a-z0-9_]+)*\.rs$/u.test(fileName)) {
			add(
				path,
				"rust-file-case",
				"error",
				"Rust source file names must be snake_case",
			);
		}
		if (
			ext === ".rs" &&
			fileName.endsWith(".test.rs") &&
			path.includes("/src/")
		) {
			add(
				path,
				"rust-test-location",
				"info",
				"test file inside src/; Rust convention is #[cfg(test)] modules or tests/",
			);
		}

		// --- code file naming ---
		if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
			const stem = codeStem(fileName);
			const stemLower = stem.toLowerCase();

			// transient / ticket markers in names
			if (TICKET_NAME_RE.test(stem) || ROUND_NAME_RE.test(stem)) {
				add(
					path,
					"transient-name",
					"warn",
					"name encodes a ticket number or iteration round instead of the verified behavior",
				);
			}
			const stemTokens = new Set(tokensOf(stem));
			const hardHit = [...stemTokens].filter((t) => TRANSIENT_TOKENS.has(t));
			if (hardHit.length > 0) {
				add(
					path,
					"transient-name",
					"warn",
					`name contains process-state token(s): ${hardHit.join(", ")}`,
				);
			}
			const softHit = [...stemTokens].filter((t) =>
				SOFT_TRANSIENT_TOKENS.has(t),
			);
			if (softHit.length > 0) {
				add(
					path,
					"transient-name",
					"info",
					`name contains "${softHit.join(", ")}"; verify it names a durable concept, not a migration leftover`,
				);
			}
			if (/end-to-end|e2e/iu.test(fileName)) {
				add(
					path,
					"e2e-in-name",
					"info",
					"e2e marker in file name; repository convention is the __e2e__/ directory",
				);
			}

			// vague file stems (.tsx/.jsx stems are covered by vague-component)
			if (VAGUE_FILE_STEMS.has(stemLower) && ext !== ".tsx" && ext !== ".jsx") {
				add(
					path,
					"vague-file",
					"warn",
					`file name "${stem}" does not identify a responsibility`,
				);
			}

			// case conventions
			const caseClass = caseClassOf(stem);
			if (ext === ".ts" || ext === ".js" || ext === ".mjs" || ext === ".cjs") {
				if (caseClass === "pascal") {
					add(
						path,
						"case-convention",
						"warn",
						"PascalCase .ts file; PascalCase is reserved for .tsx components — use kebab-case or a use* hook name",
					);
				} else if (caseClass === "camel" && !/^use[A-Z]/u.test(stem)) {
					add(
						path,
						"case-convention",
						"warn",
						"camelCase .ts file; use kebab-case unless it is a use* hook",
					);
				} else if (caseClass === "mixed") {
					add(
						path,
						"case-convention",
						"warn",
						"file name mixes kebab-case and PascalCase segments",
					);
				} else if (caseClass === "snake") {
					add(
						path,
						"case-convention",
						"info",
						"snake_case .ts file; repository convention is kebab-case",
					);
				}
			} else if (ext === ".tsx" || ext === ".jsx") {
				// Test files describe scenarios, not components — the
				// PascalCase expectation does not apply to them.
				if (!isTestFileName(fileName)) {
					if (caseClass === "mixed") {
						add(
							path,
							"case-convention",
							"warn",
							"file name mixes kebab-case and PascalCase segments",
						);
					} else if (caseClass !== "pascal") {
						add(
							path,
							"case-convention",
							"info",
							"component file is not PascalCase; verify it exports no components or rename",
						);
					}
				}
			}

			// test/spec token without the test-file suffix convention
			if (
				path.startsWith("src/") &&
				["test", "tests", "spec", "specs"].some((t) => stemTokens.has(t)) &&
				!isTestFileName(fileName) &&
				!/\.(test|spec)-(fixtures|utils|helpers|mocks|support)\.[tj]sx?$/iu.test(
					fileName,
				)
			) {
				add(
					path,
					"suffix-convention",
					"info",
					"name contains a test/spec token but is not a *.test.* / *.spec.* file",
				);
			}

			// vague component stems
			if (
				(ext === ".tsx" || ext === ".jsx") &&
				VAGUE_COMPONENT_STEMS.has(codeStem(fileName).split(".")[0] ?? "")
			) {
				add(
					path,
					"vague-component",
					"info",
					`component file name "${codeStem(fileName)}" does not identify what it renders`,
				);
			}

			// file/dir stutter: first meaningful stem token repeats the parent
			// directory's last token (singular-normalized)
			const parentLast = lastDirSegment(path);
			const firstToken = firstMeaningfulToken(stem);
			if (
				parentLast &&
				firstToken &&
				sameName(firstToken, tokensOf(parentLast).at(-1) ?? parentLast)
			) {
				add(
					path,
					"file-stutter",
					"warn",
					`file name repeats parent directory "${parentLast}"; the path already carries that context`,
				);
			}

			// duplicate basenames (module-role names are the per-feature
			// convention and excluded)
			const baseStem = codeStem(fileName).split(".")[0]?.toLowerCase() ?? "";
			if (!MODULE_ROLE_STEMS.has(baseStem)) {
				const list = filesByBaseName.get(fileName) ?? [];
				list.push(path);
				filesByBaseName.set(fileName, list);
			}

			// init-family variants: canonical family -> distinct spellings seen
			const initMatch =
				/^(initialization|initialize|initialise|init|bootstrap|boot|setup)/iu.exec(
					stem,
				);
			if (initMatch) {
				const spelling = initMatch[1].toLowerCase();
				const canonical =
					spelling === "boot" || spelling === "bootstrap"
						? "boot"
						: spelling === "setup"
							? "setup"
							: "initialize";
				const spellings = initFamilies.get(canonical) ?? new Map();
				spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
				initFamilies.set(canonical, spellings);
			}

			// vague exported symbols (TypeScript only)
			if (readSource && (ext === ".ts" || ext === ".tsx")) {
				for (const symbol of getNamedSymbols(path, readSource(path))) {
					if (/^[a-z]/u.test(symbol.name) && VAGUE_SYMBOLS.has(symbol.name)) {
						add(
							path,
							"vague-symbol",
							"warn",
							`${fileName}:${symbol.line} declares "${symbol.name}", which does not identify an operation or role`,
						);
					} else if (
						/^[A-Z]/u.test(symbol.name) &&
						VAGUE_TYPE_NAMES.has(symbol.name)
					) {
						add(
							path,
							"vague-symbol",
							"warn",
							`${fileName}:${symbol.line} declares "${symbol.name}", a type name that hides its domain meaning`,
						);
					} else if (
						/^[A-Z0-9_]+$/u.test(symbol.name) &&
						VAGUE_CONST_NAMES.has(symbol.name)
					) {
						add(
							path,
							"vague-symbol",
							"warn",
							`${fileName}:${symbol.line} declares "${symbol.name}", a constant name that hides its domain meaning`,
						);
					}
				}
			}
		}
	}

	// --- stale .gitkeep (post-pass: sibling listing needs the full file set) ---
	for (const path of codePaths) {
		if (basename(path) !== ".gitkeep") continue;
		const dir = posix.dirname(path);
		const siblings = codePaths.filter(
			(p) => p !== path && posix.dirname(p) === dir,
		);
		if (siblings.length > 0) {
			findings.push({
				file: path,
				rule: "gitkeep-stale",
				severity: "error",
				detail: `directory already contains ${siblings.length} tracked file(s); .gitkeep is stale`,
			});
		}
	}

	// --- directory-level rules ---
	for (const dir of dirs) {
		const segments = dir.split("/");
		const leaf = segments[segments.length - 1] ?? "";

		// dir stutter: child dir repeats parent dir (singular-normalized)
		if (segments.length >= 2) {
			const parentLeaf = segments[segments.length - 2] ?? "";
			if (sameName(leaf, parentLeaf)) {
				add(
					`${dir}/`,
					"dir-stutter",
					"warn",
					`directory "${leaf}" repeats parent "${parentLeaf}"`,
				);
			}
		}

		// dir case
		if (!isKebabDirName(leaf)) {
			add(`${dir}/`, "dir-case", "warn", "directory name is not kebab-case");
		}

		// vague dir names
		if (VAGUE_DIR_NAMES.has(leaf.toLowerCase())) {
			add(
				`${dir}/`,
				"vague-dir",
				"info",
				`directory name "${leaf}" does not identify a responsibility`,
			);
		}

		// prefix groups: many files in one flat dir sharing a leading token
		// suggests a missing subdirectory (skill §3 file/dir judgment)
		const prefixCounts = new Map<string, number>();
		for (const file of filesByDir.get(dir) ?? []) {
			const ext = extensionOf(basename(file));
			if (![".ts", ".tsx", ".rs"].includes(ext)) continue;
			const token = firstMeaningfulToken(codeStem(basename(file)));
			if (token && token.length >= 4) {
				prefixCounts.set(token, (prefixCounts.get(token) ?? 0) + 1);
			}
		}
		for (const [token, count] of prefixCounts) {
			if (count >= 8) {
				add(
					`${dir}/`,
					"prefix-group",
					"info",
					`${count} files share the leading token "${token}"; consider grouping them into a subdirectory`,
				);
			}
		}

		// dir-overload: a flat directory holding many code files is surveyed
		// as a whole — what kinds of files it mixes, which naming clusters
		// could become subdirectories, and whether the dominant prefix just
		// repeats the directory name (rename, don't group).
		const directCode = (filesByDir.get(dir) ?? []).filter((p) =>
			CODE_FILE_EXTENSIONS.has(extensionOf(basename(p))),
		);
		if (directCode.length < minDirFiles) continue;

		const kindCounts = new Map<FileKind, number>();
		const prefixClusters = new Map<string, string[]>();
		const suffixClusters = new Map<string, string[]>();
		const caseCounts = new Map<string, number>();
		for (const file of directCode) {
			const fileName = basename(file);
			const kind = kindOfFile(fileName);
			kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);

			const stem = codeStem(fileName);
			const first = firstMeaningfulToken(stem);
			if (first && first.length >= 4) {
				const list = prefixClusters.get(first) ?? [];
				list.push(file);
				prefixClusters.set(first, list);
			}
			const last = lastMeaningfulToken(stem);
			if (last && last.length >= 4 && last !== first) {
				const list = suffixClusters.get(last) ?? [];
				list.push(file);
				suffixClusters.set(last, list);
			}

			const ext = extensionOf(fileName);
			if ([".ts", ".js", ".mjs", ".cjs"].includes(ext)) {
				const caseClass = caseClassOf(stem);
				const bucket = caseClass === "lower" ? "kebab" : caseClass;
				caseCounts.set(bucket, (caseCounts.get(bucket) ?? 0) + 1);
			}
		}

		const bigClusters = [...prefixClusters.entries()]
			.filter(([, list]) => list.length >= 3)
			.sort((a, b) => b[1].length - a[1].length);
		const bigSuffixes = [...suffixClusters.entries()]
			.filter(([, list]) => list.length >= 3)
			.sort((a, b) => b[1].length - a[1].length);
		const clustered = bigClusters.reduce(
			(sum, [, list]) => sum + list.length,
			0,
		);
		const singletons = directCode.length - clustered;

		const stuttersDir = bigClusters.some(([token]) =>
			sameName(token, tokensOf(leaf).at(-1) ?? leaf),
		);
		const coverage = clustered / directCode.length;
		const mixedCase =
			[...caseCounts.keys()].filter((c) => c !== "kebab").length > 0 &&
			(caseCounts.get("kebab") ?? 0) > 0;

		const kindText = [...kindCounts.entries()]
			.map(([kind, count]) => `${kind} ${count}`)
			.join(", ");
		const clusterText = bigClusters
			.slice(0, 4)
			.map(
				([token, list]) => `${commonTokenPrefix(list) || token}×${list.length}`,
			)
			.join(", ");
		const suffixText = bigSuffixes
			.slice(0, 3)
			.map(([token, list]) => `-${token}×${list.length}`)
			.join(", ");
		const caseText = [...caseCounts.entries()]
			.map(([c, n]) => `${c} ${n}`)
			.join(" ");

		const problems: string[] = [];
		if (stuttersDir) {
			problems.push(
				"dominant prefix repeats the directory name — rename files instead of grouping",
			);
		} else if (bigClusters.length > 0) {
			problems.push(
				`clusterable into subdirectories: ${clusterText} (${Math.round(coverage * 100)}% of files)`,
			);
		}
		if (singletons >= 8) {
			problems.push(`${singletons} unrelated singletons — dir mixes concerns`);
		}
		if (mixedCase) {
			problems.push(`mixed case conventions among .ts files: ${caseText}`);
		}
		if (suffixText) {
			problems.push(`shared suffix families: ${suffixText}`);
		}

		const severity: Severity = stuttersDir || coverage >= 0.5 ? "warn" : "info";
		add(
			`${dir}/`,
			"dir-overload",
			severity,
			`${directCode.length} code files (${kindText}); ${problems.join("; ") || "no obvious consolidation pattern"}`,
		);
	}

	// --- duplicate basenames ---
	for (const [name, list] of filesByBaseName) {
		if (list.length < 2) continue;
		add(
			list[0] ?? name,
			"duplicate-basename",
			"info",
			`${list.length} files named "${name}": ${list.slice(0, 6).join(", ")}${list.length > 6 ? ", …" : ""}`,
		);
	}

	// --- init-family spelling variants ---
	for (const [canonical, spellings] of initFamilies) {
		const total = [...spellings.values()].reduce((a, b) => a + b, 0);
		if (spellings.size >= 2 && total >= 2) {
			const summary = [...spellings.entries()]
				.map(([spelling, count]) => `${spelling}(${count})`)
				.join(", ");
			add(
				"(repo)",
				"init-variant",
				"info",
				`"${canonical}" concept uses ${spellings.size} spellings: ${summary} — pick one for the same responsibility`,
			);
		}
	}

	return findings;
};

const parseArgs = (args: string[]) => {
	let strict = false;
	let rule: string | null = null;
	let pathFilter: string | null = null;
	let minDirFiles = 15;
	for (let i = 2; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--strict") {
			strict = true;
		} else if (arg === "--rule" && args[i + 1]) {
			rule = args[i + 1];
			i++;
		} else if (arg === "--path" && args[i + 1]) {
			pathFilter = args[i + 1];
			i++;
		} else if (arg === "--min-files" && args[i + 1]) {
			minDirFiles = Number(args[i + 1]);
			i++;
		}
	}
	return { strict, rule, pathFilter, minDirFiles };
};

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

const main = () => {
	const options = parseArgs(process.argv);
	const root = repoRoot();
	const paths = trackedFiles(root);
	const findings = collectFindings(
		paths,
		(path) => {
			try {
				return readFileSync(`${root}/${path}`, "utf-8");
			} catch {
				// Tracked but deleted in the working tree (in-progress rename).
				return "";
			}
		},
		options.minDirFiles,
	)
		.filter((f) => (options.rule ? f.rule === options.rule : true))
		.filter((f) =>
			options.pathFilter ? f.file.includes(options.pathFilter) : true,
		)
		.sort(
			(a, b) =>
				SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
				a.file.localeCompare(b.file),
		);

	const counts = { error: 0, warn: 0, info: 0 };
	for (const f of findings) counts[f.severity]++;

	if (findings.length === 0) {
		console.log(
			"naming-antipatterns: PASS - no naming anti-patterns detected.",
		);
		return;
	}

	console.log(
		`naming-antipatterns: ${findings.length} finding(s) ` +
			`(error:${counts.error} warn:${counts.warn} info:${counts.info}) ` +
			`across ${paths.length} tracked file(s).`,
	);
	for (const f of findings) {
		console.log(`${f.file} [${f.severity}/${f.rule}]`);
		console.log(`  ${f.detail}`);
	}

	if (options.strict && (counts.error > 0 || counts.warn > 0)) {
		process.exit(1);
	}
};

if (import.meta.main) {
	main();
}

export type { Finding, Severity };
export {
	caseClassOf,
	codeStem,
	collectFindings,
	firstMeaningfulToken,
	normalizeNumber,
	sameName,
	tokensOf,
};
