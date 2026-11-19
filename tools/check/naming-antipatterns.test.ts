/**
 * Self-tests for naming-antipatterns.ts detectors.
 *
 * collectFindings is exercised against synthetic repo-relative path lists so
 * each rule can be proven to fire (and not fire) without touching the real
 * tree. Symbol-level rules need source text and are tested separately.
 */

import { describe, expect, it } from "vitest";
import {
	caseClassOf,
	codeStem,
	collectFindings,
	firstMeaningfulToken,
	normalizeNumber,
	sameName,
	tokensOf,
} from "./naming-antipatterns";

const rulesFor = (paths: string[], rule: string) =>
	collectFindings(paths).filter((f) => f.rule === rule);

describe("codeStem", () => {
	it("strips test and variant qualifiers", () => {
		expect(codeStem("PanelRoot.offline.test.ts")).toBe("PanelRoot");
		expect(codeStem("script.ext.ts")).toBe("script");
		expect(codeStem("catalog-json-text.full-roundtrip.test.ts")).toBe(
			"catalog-json-text",
		);
		expect(codeStem("Button.stories.tsx")).toBe("Button");
	});
});

describe("caseClassOf", () => {
	it("classifies the repository conventions", () => {
		expect(caseClassOf("add-dialog-pool")).toBe("kebab");
		expect(caseClassOf("useCardZoom")).toBe("camel");
		expect(caseClassOf("DirectoryBrowserMenu")).toBe("pascal");
		expect(caseClassOf("Code-language-config")).toBe("mixed");
		expect(caseClassOf("runtime")).toBe("lower");
	});
});

describe("firstMeaningfulToken", () => {
	it("drops the use prefix of hook names", () => {
		expect(firstMeaningfulToken("use-group-panel-drag")).toBe("group");
		expect(firstMeaningfulToken("operation-worker-runner")).toBe("operation");
	});
});

describe("sameName", () => {
	it("matches singular and plural forms", () => {
		expect(sameName("dialog", "dialogs")).toBe(true);
		expect(sameName("group", "groups")).toBe(true);
		expect(sameName("browser", "directory")).toBe(false);
	});

	it("normalizeNumber handles common plurals", () => {
		expect(normalizeNumber("dialogs")).toBe("dialog");
		expect(normalizeNumber("settings")).toBe("setting");
	});
});

describe("tokensOf", () => {
	it("splits kebab, snake and camel forms", () => {
		expect(tokensOf("use-group-panel-drag")).toEqual([
			"use",
			"group",
			"panel",
			"drag",
		]);
		expect(tokensOf("DirectoryBrowserMenu")).toEqual([
			"directory",
			"browser",
			"menu",
		]);
	});
});

describe("artifact-residue", () => {
	it("flags committed backup artifacts", () => {
		const findings = rulesFor(
			["src/widget/state-slice-contract.ts.bak"],
			"artifact-residue",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("error");
	});

	it("ignores normal source files", () => {
		expect(
			rulesFor(["src/widget/contract.ts"], "artifact-residue"),
		).toHaveLength(0);
	});
});

describe("transient-name", () => {
	it("flags ticket numbers, rounds and process tokens", () => {
		expect(
			rulesFor(["src/a/issue-138-transport.test.ts"], "transient-name"),
		).toHaveLength(1);
		expect(
			rulesFor(
				["src/a/cross-surface-clear-race-round6.test.ts"],
				"transient-name",
			),
		).toHaveLength(1);
		expect(
			rulesFor(["src/a/preset.bug-pattern.test.ts"], "transient-name"),
		).toHaveLength(1);
	});

	it("does not flag durable names", () => {
		expect(
			rulesFor(["src/a/catalog-json-text.ts"], "transient-name"),
		).toHaveLength(0);
	});
});

describe("e2e-in-name", () => {
	it("flags e2e markers inside file names", () => {
		expect(
			rulesFor(
				["src/a/multi-select-checkbox.end-to-end.test.tsx"],
				"e2e-in-name",
			),
		).toHaveLength(1);
	});
});

describe("case-convention", () => {
	it("flags PascalCase .ts files", () => {
		const findings = rulesFor(
			["src/management/storage/ui/directory-browser/Menu.ts"],
			"case-convention",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("warn");
	});

	it("flags mixed kebab/PascalCase names", () => {
		expect(
			rulesFor(["src/a/Code-language-config.test.ts"], "case-convention"),
		).toHaveLength(1);
	});

	it("allows kebab .ts, camel use* hooks and PascalCase .tsx", () => {
		const paths = [
			"src/a/add-dialog-pool.ts",
			"src/a/use-card-zoom.ts",
			"src/a/Button.tsx",
		];
		expect(rulesFor(paths, "case-convention")).toHaveLength(0);
	});

	it("flags lowercase .tsx at info severity", () => {
		const findings = rulesFor(["src/a/routes.tsx"], "case-convention");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("info");
	});
});

describe("dir-stutter and file-stutter", () => {
	it("flags a child directory repeating its parent", () => {
		const findings = rulesFor(
			[
				"src/management/dialog/dialogs/bridge.ts",
				"src/management/dialog/Root.tsx",
			],
			"dir-stutter",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.file).toBe("src/management/dialog/dialogs/");
	});

	it("does not flag distinct directory names", () => {
		expect(
			rulesFor(["src/management/storage/read/json-file.ts"], "dir-stutter"),
		).toHaveLength(0);
	});

	it("flags file names repeating the parent directory", () => {
		const findings = rulesFor(
			["src/management/preset/group/release.ts"],
			"file-stutter",
		);
		expect(findings).toHaveLength(1);
	});

	it("does not flag files whose first token differs from the parent", () => {
		expect(
			rulesFor(
				["src/management/storage/ui/directory-browser/Component.tsx"],
				"file-stutter",
			),
		).toHaveLength(0);
	});
});

describe("duplicate-basename", () => {
	it("reports non-role duplicate file names", () => {
		const findings = rulesFor(
			["src/a/useClose.ts", "src/b/dialogs/hooks/useClose.ts"],
			"duplicate-basename",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.detail).toContain("useClose.ts");
	});

	it("excludes per-module role names like Dialog.tsx and contract.ts", () => {
		expect(
			rulesFor(
				[
					"src/a/Dialog.tsx",
					"src/b/Dialog.tsx",
					"src/c/contract.ts",
					"src/d/contract.ts",
				],
				"duplicate-basename",
			),
		).toHaveLength(0);
	});
});

describe("prefix-group", () => {
	it("flags flat directories with many files sharing a prefix", () => {
		const paths = Array.from(
			{ length: 9 },
			(_, i) => `src/management/ipc/operation-worker/part${i}.ts`,
		);
		const findings = rulesFor(paths, "prefix-group");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.file).toBe("src/management/ipc/");
	});

	it("ignores small groups and short tokens", () => {
		const paths = Array.from({ length: 9 }, (_, i) => `src/a/use-thing${i}.ts`);
		expect(rulesFor(paths, "prefix-group")).toHaveLength(0);
	});
});

describe("vague names", () => {
	it("flags vague file stems", () => {
		expect(rulesFor(["src/a/use-cases.ts"], "vague-file")).toHaveLength(1);
	});

	it("flags vague directory names", () => {
		const findings = rulesFor(["src/shared/util/cx.ts"], "vague-dir");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.file).toBe("src/shared/util/");
	});

	it("flags generic component file names", () => {
		expect(rulesFor(["src/a/panel/Main.tsx"], "vague-component")).toHaveLength(
			1,
		);
	});
});

describe("gitkeep-stale", () => {
	it("flags .gitkeep in a directory that has real files", () => {
		const findings = rulesFor(
			["src/a/dialogs/.gitkeep", "src/a/dialogs/bridge.ts"],
			"gitkeep-stale",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("error");
	});
});

describe("script-language and rust rules", () => {
	it("flags .mjs scripts under scripts/", () => {
		const findings = rulesFor(
			["scripts/build/clean-cep-stale-dirs.mjs"],
			"script-language",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("warn");
	});

	it("does not flag .config.* files or TypeScript scripts", () => {
		expect(
			rulesFor(
				["postcss.config.cjs", "scripts/check/check-x.ts"],
				"script-language",
			),
		).toHaveLength(0);
	});

	it("flags non-snake-case Rust files", () => {
		expect(
			rulesFor(["rust/crates/x/src/FooBar.rs"], "rust-file-case"),
		).toHaveLength(1);
	});

	it("flags .test.rs files inside src/", () => {
		expect(
			rulesFor(
				["rust/crates/x/src/thumbnails/cache_root.test.rs"],
				"rust-test-location",
			),
		).toHaveLength(1);
	});
});

describe("init-variant", () => {
	it("reports mixed bootstrap naming families", () => {
		const findings = rulesFor(
			[
				"src/a/initialize.ts",
				"src/b/initialize.ts",
				"src/c/initialization.ts",
				"src/c/initialization.test.ts",
			],
			"init-variant",
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.detail).toContain("initialize");
		expect(findings[0]?.detail).toContain("initialization");
	});
});

describe("dir-overload", () => {
	const clusterDir = (prefix: string, n: number, dir = "src/a") =>
		Array.from({ length: n }, (_, i) => `${dir}/${prefix}-module-${i}.ts`);

	it("surveys an overloaded flat directory and suggests subdirectories", () => {
		const paths = [
			...clusterDir("alpha", 6),
			...clusterDir("beta", 5),
			...clusterDir("gamma", 4),
		];
		const findings = rulesFor(paths, "dir-overload");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("warn");
		expect(findings[0]?.detail).toContain("alpha-module");
		expect(findings[0]?.detail).toContain("clusterable");
	});

	it("flags a dominant prefix that repeats the directory name", () => {
		const paths = clusterDir("check", 16, "scripts/check");
		const findings = rulesFor(paths, "dir-overload");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("warn");
		expect(findings[0]?.detail).toContain("repeats the directory name");
	});

	it("reports grab-bag directories without clusters at info severity", () => {
		const paths = Array.from(
			{ length: 16 },
			(_, i) => `src/a/${String.fromCharCode(97 + i)}bc-lone-${i}.ts`,
		);
		const findings = rulesFor(paths, "dir-overload");
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe("info");
		expect(findings[0]?.detail).toContain("unrelated singletons");
	});

	it("ignores directories below the file threshold", () => {
		const paths = clusterDir("alpha", 5);
		expect(rulesFor(paths, "dir-overload")).toHaveLength(0);
	});
});

describe("skipped areas", () => {
	it("does not apply rules to vendored or prose directories", () => {
		expect(
			rulesFor([".agents/skills/x/scripts/lint.py"], "python-script"),
		).toHaveLength(0);
		expect(
			rulesFor(["docs/analysis/issue-84.md"], "transient-name"),
		).toHaveLength(0);
	});
});
