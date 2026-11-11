/**
 * Regression test: the CodeEditor must enable a set of Monaco options
 * that make the editor feel VS Code-grade. Without these, the surface
 * works but feels minimal compared to the surrounding dialogs. The
 * list below mirrors what was enabled in the editor-deepening pass.
 *
 * The CodeEditor component itself is excluded from CI (monaco-editor +
 * happy-dom), so source-level assertions are the practical way to lock
 * these in. Same pattern as `Code-resize.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const codeSource = readFileSync(new URL("./Code.tsx", import.meta.url), "utf8");

describe("CodeEditor enables VS Code-grade Monaco options", () => {
	const REQUIRED_OPTIONS = [
		// Auto-closing and snippets
		"formatOnPaste",
		// Suggestions / parameter hints
		"quickSuggestionsDelay",
		"parameterHints",
		// Highlighting
		"selectionHighlight",
		"occurrencesHighlight",
		// Layout niceties
		"stickyScroll",
		// Caret / scroll
		"cursorBlinking",
		"cursorSmoothCaretAnimation",
		"smoothScrolling",
		// Folding
		"folding",
	];

	for (const option of REQUIRED_OPTIONS) {
		it(`declares option "${option}"`, () => {
			const pattern = new RegExp(
				`["']?${option.replace(/\./g, "\\.")}["']?\\s*:`,
			);
			expect(codeSource).toMatch(pattern);
		});
	}

	it("does not enable formatOnType (too aggressive in a small editor)", () => {
		// Explicitly opt OUT: `formatOnType` reformats the file on every
		// closing brace and is hostile in a small inline editor. The
		// regression test guards against an accidental flip.
		expect(codeSource).not.toMatch(/formatOnType\s*:\s*true/);
	});

	it("declares an SNIPPETS const with at least if / for / fn entries", () => {
		// The snippet map is a const literal; the test asserts the three
		// most useful entries (`if`, `for`, `fn`) are present so a future
		// refactor that accidentally drops the most common ones fails CI.
		expect(codeSource).toMatch(/const\s+SNIPPETS\s*:/);
		expect(codeSource).toMatch(/prefix\s*:\s*["']if["']/);
		expect(codeSource).toMatch(/prefix\s*:\s*["']for["']/);
		expect(codeSource).toMatch(/prefix\s*:\s*["']fn["']/);
	});

	it("registers snippet providers for both javascript and typescript", () => {
		// The snippet provider must be registered for both languages so
		// the user gets `if` → `if ($1) { ... }` regardless of which
		// language id the editor was opened with.
		const helperMatch = codeSource.match(
			/const\s+ensureSnippets\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/,
		);
		expect(helperMatch).not.toBeNull();
		const body = helperMatch?.[1] ?? "";
		expect(body).toMatch(/["']javascript["']/);
		expect(body).toMatch(/["']typescript["']/);
		expect(body).toMatch(/registerCompletionItemProvider/);
	});
});
