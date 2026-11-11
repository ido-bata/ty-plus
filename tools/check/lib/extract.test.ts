/**
 * Self-tests for tools/check/lib/extract.ts.
 */

import { describe, expect, it } from "vitest";
import { getImportEntries, getNamedSymbols } from "./extract.js";

describe("getImportEntries", () => {
	it("parses simple named imports", () => {
		const source = `
import { foo } from "./bar";
import React from "react";
`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(2);
		expect(entries[0]?.specifier).toBe("./bar");
		expect(entries[1]?.specifier).toBe("react");
	});

	it("parses type-only imports", () => {
		const source = `import type { Foo } from "./types";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./types");
	});

	it("parses dynamic imports", () => {
		const source = `const m = import("./dynamic-module");`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./dynamic-module");
	});

	it('does NOT treat "./json-file-store" as importing from src/js', () => {
		const source = `import { parseJsonObject } from "./json-file-store";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./json-file-store");
	});

	it("parses export ... from re-exports", () => {
		const source = `export { ACTIONS } from "./script.ext";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./script.ext");
	});

	it("parses export * from star re-exports", () => {
		const source = `export * from "./registry-core";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./registry-core");
	});

	it("parses multi-line imports", () => {
		const source = `import {
	foo,
	bar,
} from "./module";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./module");
	});

	it("ignores comments containing import-shaped text", () => {
		const source = `// import foo from "./comment-spec";
import actual from "./real";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./real");
	});

	it("ignores string literals containing import-shaped text", () => {
		const source = `const tpl = "import x from \\"./tpl-spec\\"";
import actual from "./real";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./real");
	});

	it("parses side-effect imports", () => {
		const source = `import "./polyfill";`;
		const entries = getImportEntries("test.ts", source);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.specifier).toBe("./polyfill");
	});
});

describe("getNamedSymbols", () => {
	it("extracts top-level arrow functions from export const", () => {
		const source = `export const alignComponent = () => null;\n`;
		const symbols = getNamedSymbols("test.ts", source);
		expect(symbols.map((s) => s.name)).toContain("alignComponent");
	});

	it("extracts function declarations", () => {
		const source = `function helper() { return 1; }\n`;
		const symbols = getNamedSymbols("test.ts", source);
		expect(symbols.map((s) => s.name)).toContain("helper");
	});

	it("extracts class declarations", () => {
		const source = `class Widget {}\n`;
		const symbols = getNamedSymbols("test.ts", source);
		expect(symbols.map((s) => s.name)).toContain("Widget");
	});

	it("skips const with non-function initializers", () => {
		const source = `export const utils = 1;\n`;
		const symbols = getNamedSymbols("test.ts", source);
		expect(symbols.map((s) => s.name)).not.toContain("utils");
	});
});
