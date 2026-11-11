/**
 * Regression test: the dark-plus theme used by the CodeEditor must give
 * the `//` of a comment line, the `"` of a string literal, the `.` of a
 * member access, and the keyword/import/export scopes a distinct color.
 * Without these rules, the corresponding glyphs fall through to Monaco's
 * default `D4D4D4`, which makes the editor look unstyled next to VS Code.
 *
 * The CodeEditor component itself is excluded from CI (monaco-editor +
 * happy-dom), so source-level assertions are the practical way to lock
 * these tokens in. Same pattern as `Code-resize.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const codeSource = readFileSync(new URL("./Code.tsx", import.meta.url), "utf8");

describe("CodeEditor theme covers TextMate scope chains", () => {
	const REQUIRED_TOKENS = [
		// Punctuation / structural — without these the delimiters fall through.
		"punctuation.definition.comment",
		"punctuation.definition.string",
		"punctuation.accessor",
		"punctuation.separator",
		"punctuation.terminator",
		// Meta — without these, imports/exports/function definitions all read
		// as plain identifiers.
		"meta.import",
		"meta.export",
		"meta.function",
		"meta.class",
		// Support — this is what gives ExtendScript globals (`app`, `$`,
		// `CompItem`, etc.) their class/type color rather than plain variable.
		"support.type",
		"support.type.extendscript",
		"support.constant",
		"support.variable",
		// Entities — namespace and inherited-class chains classify ExtendScript
		// `extends` relationships.
		"entity.name.namespace",
		"entity.other.inherited-class",
		// Variables — distinguishes read-write properties from constants.
		"variable.other.property",
		"variable.other.constant",
		// Preprocessor (ExtendScript `#target` / `#include`).
		"keyword.control.preprocessor.extendscript",
		"string.unquoted.preprocessor.extendscript",
	];

	for (const token of REQUIRED_TOKENS) {
		it(`declares a rule for token "${token}"`, () => {
			// Match the token inside a quoted string within a `token: "..."`
			// field. The escaped quotes disambiguate from a stray match
			// inside a comment.
			const pattern = new RegExp(
				`token:\\s*["']${token.replace(/\./g, "\\.")}["']`,
			);
			expect(codeSource).toMatch(pattern);
		});
	}

	// The `support.type.extendscript` rule exists specifically to make
	// ExtendScript globals (`app`, `$`, `system`, `clearOutput`, etc.)
	// visually distinct from plain local variables. The TS service emits
	// `variable` semantic tokens for `declare var app: Application`, which
	// Monaco paints light blue (9CDCFE) — the same color as `let foo = …`,
	// so the user cannot tell the difference. The grammar's
	// `extendscript-globals` pattern tags these names with
	// `support.type.extendscript`; this test pins the rule to blue
	// (569CD6, the Dark+ keyword color) so the distinction is visible.
	// Locking both scope and color catches the failure mode of someone
	// "fixing" the color back to light blue to match variables.
	it('uses Dark+ blue (569CD6) for "support.type.extendscript"', () => {
		// Find the rule object that declares the token, then assert the
		// foreground is `569CD6`. The pattern is intentionally narrow: it
		// must be the foreground of the same object literal that contains
		// the token. The `\s*` whitespace between key/colon/value and the
		// brace boundaries is permissive of formatting changes.
		const pattern =
			/\{[^{}]*?token:\s*["']support\.type\.extendscript["'][^{}]*?foreground:\s*["']569CD6["'][^{}]*?\}/;
		expect(codeSource).toMatch(pattern);
	});
});
