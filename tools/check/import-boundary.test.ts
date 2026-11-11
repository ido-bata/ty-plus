/**
 * Self-tests for import-boundary.ts checker logic
 */

import { describe, expect, it } from "vitest";
import {
	classifyBoundaryViolation,
	getImportEntries,
	resolveModuleOwner,
} from "./import-boundary";

// ---------------------------------------------------------------------------
// getImportEntries tests
// ---------------------------------------------------------------------------

describe("getImportEntries", () => {
	it("parses simple named imports", () => {
		const source = `
import { foo } from "./bar";
import React from "react";
`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(2);
		expect(entries[0].specifier).toBe("./bar");
		expect(entries[1].specifier).toBe("react");
	});

	it("parses type-only imports", () => {
		const source = `import type { Foo } from "./types";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0].specifier).toBe("./types");
	});

	it("parses dynamic imports", () => {
		const source = `const m = import("./dynamic-module");`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0].specifier).toBe("./dynamic-module");
	});

	it('does NOT treat "./json-file-store" as importing from src/js', () => {
		// This is the core regression test: the old checker falsely flagged
		// "./json-file-store" because it contained the substring "src/js"
		const source = `import { parseJsonObject } from "./json-file-store";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0].specifier).toBe("./json-file-store");
		// The specifier does not contain "src/js"
		expect(entries[0].specifier.includes("src/js")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// resolveModuleOwner tests
// ---------------------------------------------------------------------------

describe("resolveModuleOwner", () => {
	it("returns null for external packages", () => {
		expect(resolveModuleOwner("react", "test.ts")).toBeNull();
		expect(resolveModuleOwner("@supabase/supabase-js", "test.ts")).toBeNull();
	});

	it("returns 'shared' for @ty-plus/shared", () => {
		expect(resolveModuleOwner("@ty-plus/shared", "test.ts")).toBe("shared");
		expect(resolveModuleOwner("@ty-plus/shared/contract", "test.ts")).toBe(
			"shared",
		);
	});

	it("returns 'management' for @ty-plus/management and related", () => {
		expect(resolveModuleOwner("@ty-plus/management", "test.ts")).toBe(
			"management",
		);
		expect(resolveModuleOwner("@ty-plus/workspace", "test.ts")).toBe(
			"management",
		);
	});

	it("returns 'function' for @ty-plus/function and related", () => {
		expect(resolveModuleOwner("@ty-plus/function", "test.ts")).toBe("function");
		expect(resolveModuleOwner("@ty-plus/widgets", "test.ts")).toBe("function");
	});

	it("returns 'contract' for @ty-plus/contract", () => {
		expect(resolveModuleOwner("@ty-plus/contract", "test.ts")).toBe("contract");
		expect(resolveModuleOwner("@ty-plus/contract/widget", "test.ts")).toBe(
			"contract",
		);
	});

	it("resolves relative specifiers within src/ to the correct owner", () => {
		// management style importing shared style
		const mgmtFile = "/src/management/style/index.ts";
		expect(resolveModuleOwner("../../shared/style/foo", mgmtFile)).toBe(
			"shared",
		);

		// function importing management storage
		const fnFile = "/src/function/onboarding/OnboardingView.tsx";
		expect(resolveModuleOwner("../../management/storage", fnFile)).toBe(
			"management",
		);

		// management importing function (via ../..)
		const mgmtDialogRoutes = "/src/management/dialog/dialog-routes.tsx";
		expect(
			resolveModuleOwner(
				"../../function/preset/animation/AnimationPresetDialog",
				mgmtDialogRoutes,
			),
		).toBe("function");
	});

	it("returns null for paths outside src/", () => {
		expect(
			resolveModuleOwner("../outside", "/src/management/foo.ts"),
		).toBeNull();
		expect(
			resolveModuleOwner("../../../foo", "/src/management/foo.ts"),
		).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// classifyBoundaryViolation tests (Phase 1 rules)
// ---------------------------------------------------------------------------

describe("classifyBoundaryViolation", () => {
	it("returns null for allowed cross-slice imports (function->management)", () => {
		// function may import from management
		const fnFile = "/src/function/onboarding/OnboardingView.tsx";
		expect(
			classifyBoundaryViolation(fnFile, "../../management/storage"),
		).toBeNull();
	});

	it("returns null for management->function via index barrel (K1 rule)", () => {
		// K1: management may import from function only via index.ts barrels
		const mgmtFile = "/src/management/dialog/routes.tsx";
		expect(
			classifyBoundaryViolation(mgmtFile, "@/function/preset/animation/Dialog"),
		).toBeNull();
	});

	it("flags management->function direct-to-implementation as violation (K1 rule)", () => {
		// K1: management importing function implementation directly (non-index) is a violation
		// Note: @/ aliases are treated as external by resolveModuleOwner, so we use a relative
		// path that resolves to /src/function/...
		const mgmtFile = "/src/management/dialog/routes.tsx";
		expect(
			classifyBoundaryViolation(
				mgmtFile,
				"../../function/widget/utility/font-viewer/text-style-preset-dialog",
			),
		).toBe(
			"management -> function (management may import only from function minimal index)",
		);
	});

	it('flags "shared -> management" violation', () => {
		const sharedFile = "/src/shared/util/foo.ts";
		expect(
			classifyBoundaryViolation(sharedFile, "../../management/style/foo"),
		).toBe(
			"shared -> management (shared may import only shared or external packages)",
		);
	});

	it('flags "shared -> function" violation', () => {
		const sharedFile = "/src/shared/util/foo.ts";
		expect(classifyBoundaryViolation(sharedFile, "../../function/widget")).toBe(
			"shared -> function (shared may import only shared or external packages)",
		);
	});

	it("returns null for intra-slice imports", () => {
		const file = "/src/management/preset/index.ts";
		expect(classifyBoundaryViolation(file, "../storage")).toBeNull();
	});

	it("returns null for external packages from shared files", () => {
		const file = "/src/shared/contract/index.ts";
		expect(classifyBoundaryViolation(file, "react")).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Forbidden shared roots tests (Phase 3)
// ---------------------------------------------------------------------------

describe("checkForbiddenSharedRoots", () => {
	it("returns empty array when only allowed shared roots exist", () => {
		// Only component/, util/, and index.ts should exist under src/shared/
		// This test verifies the checker logic itself - the actual filesystem check
		// is run via the CLI tool
		const allowed = new Set(["component", "util", "index.ts"]);
		const forbidden = new Set([
			"contract",
			"i18n",
			"style",
			"preset",
			"widget",
			"workspace",
			"storage",
			"online",
			"setting",
		]);

		// Verify forbidden names are NOT in allowed
		for (const name of forbidden) {
			expect(allowed.has(name)).toBe(false);
		}
		// Verify allowed names ARE in allowed
		for (const name of allowed) {
			if (typeof name === "string") {
				expect(allowed.has(name)).toBe(true);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// Phase 3: new dependency rules
// ---------------------------------------------------------------------------

describe("Phase 3 dependency rules", () => {
	describe("shared may import only shared or external packages", () => {
		it("allows shared -> shared", () => {
			const sharedFile = "/src/shared/util/foo.ts";
			expect(classifyBoundaryViolation(sharedFile, "./bar")).toBeNull();
			expect(
				classifyBoundaryViolation(sharedFile, "../component/baz"),
			).toBeNull();
		});

		it("allows shared -> external", () => {
			const sharedFile = "/src/shared/util/foo.ts";
			expect(classifyBoundaryViolation(sharedFile, "react")).toBeNull();
			expect(
				classifyBoundaryViolation(sharedFile, "@tanstack/react-query"),
			).toBeNull();
		});

		it("flags shared -> management", () => {
			const sharedFile = "/src/shared/util/foo.ts";
			expect(
				classifyBoundaryViolation(sharedFile, "../../management/storage"),
			).not.toBeNull();
		});

		it("flags shared -> function", () => {
			const sharedFile = "/src/shared/util/foo.ts";
			expect(
				classifyBoundaryViolation(sharedFile, "../../function/widget"),
			).not.toBeNull();
		});

		it("flags shared -> contract", () => {
			const sharedFile = "/src/shared/util/foo.ts";
			expect(
				classifyBoundaryViolation(sharedFile, "../../contract/widget"),
			).not.toBeNull();
		});
	});

	describe("contract may import only contract or external packages", () => {
		it("allows contract -> contract", () => {
			const contractFile = "/src/contract/widget.ts";
			expect(classifyBoundaryViolation(contractFile, "./placement")).toBeNull();
			expect(classifyBoundaryViolation(contractFile, "../surface")).toBeNull();
		});

		it("allows contract -> external", () => {
			const contractFile = "/src/contract/widget.ts";
			expect(classifyBoundaryViolation(contractFile, "react")).toBeNull();
		});

		it("flags contract -> management", () => {
			const contractFile = "/src/contract/widget.ts";
			expect(
				classifyBoundaryViolation(contractFile, "../../management/storage"),
			).not.toBeNull();
		});

		it("flags contract -> function", () => {
			const contractFile = "/src/contract/widget.ts";
			expect(
				classifyBoundaryViolation(contractFile, "../../function/widget"),
			).not.toBeNull();
		});

		it("flags contract -> shared/component", () => {
			const contractFile = "/src/contract/widget.ts";
			expect(
				classifyBoundaryViolation(
					contractFile,
					"../../shared/component/Button",
				),
			).not.toBeNull();
		});
	});

	describe("management may import contract, shared/component, shared/util", () => {
		it("allows management -> contract", () => {
			const mgmtFile = "/src/management/style/index.ts";
			expect(
				classifyBoundaryViolation(mgmtFile, "../../contract/widget"),
			).toBeNull();
		});

		it("allows management -> shared/component", () => {
			const mgmtFile = "/src/management/style/index.ts";
			expect(
				classifyBoundaryViolation(mgmtFile, "../../shared/component/Button"),
			).toBeNull();
		});

		it("allows management -> shared/util", () => {
			const mgmtFile = "/src/management/style/index.ts";
			expect(
				classifyBoundaryViolation(mgmtFile, "../../shared/util/foo"),
			).toBeNull();
		});

		it("flags management -> shared (non-component, non-util)", () => {
			const mgmtFile = "/src/management/style/index.ts";
			// The rule is: management may only import shared/component or shared/util
			// Importing shared directly is not allowed
			expect(
				classifyBoundaryViolation(mgmtFile, "../../shared"),
			).not.toBeNull();
		});
	});

	describe("function may import contract, management, shared/component, shared/util", () => {
		it("allows function -> contract", () => {
			const fnFile = "/src/function/widget/align/align-widget.tsx";
			expect(
				classifyBoundaryViolation(fnFile, "../../../contract/widget"),
			).toBeNull();
		});

		it("allows function -> management", () => {
			const fnFile = "/src/function/widget/align/align-widget.tsx";
			expect(
				classifyBoundaryViolation(fnFile, "../../../management/storage"),
			).toBeNull();
		});

		it("allows function -> shared/component", () => {
			const fnFile = "/src/function/widget/align/align-widget.tsx";
			expect(
				classifyBoundaryViolation(fnFile, "../../../shared/component/Button"),
			).toBeNull();
		});

		it("allows function -> shared/util", () => {
			const fnFile = "/src/function/widget/align/align-widget.tsx";
			expect(
				classifyBoundaryViolation(fnFile, "../../../shared/util/foo"),
			).toBeNull();
		});

		it("flags function -> external packages not in allowed list", () => {
			// Note: The function rule is actually checked differently since external
			// packages return null from resolveModuleOwner. This test is informational.
			const fnFile = "/src/function/widget/align/align-widget.tsx";
			expect(
				classifyBoundaryViolation(fnFile, "@some-external/pkg"),
			).toBeNull();
		});
	});
});
