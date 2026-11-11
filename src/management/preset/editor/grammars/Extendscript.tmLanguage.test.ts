/**
 * Regression test: the project-authored extendscript TextMate grammar
 * must define an `extendscript-globals` repository pattern that tags the
 * ExtendScript-specific identifiers declared as `var` / `function` in
 * `types-for-adobe/shared/global.d.ts` with the `support.type.extendscript`
 * scope. Without this, those identifiers come out of the TS service as
 * plain `variable` semantic tokens, which Monaco paints light blue —
 * the same color as user-declared local variables — so the user cannot
 * tell them apart.
 *
 * The grammar is loaded as a JSON file (not via Monaco), so a true
 * runtime test would require standing up the full TextMate pipeline. We
 * assert the source structure instead (the same `monaco-editor +
 * happy-dom` is excluded from CI). Same pattern as the Code.tsx
 * source-level tests in this directory.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const grammarSource = readFileSync(
	new URL("./Extendscript.tmLanguage.json", import.meta.url),
	"utf8",
);

describe("Extendscript.tmLanguage.json globals pattern", () => {
	it("declares an extendscript-globals repository entry", () => {
		// The pattern is referenced from the top-level `patterns` array via
		// `{ "include": "#extendscript-globals" }` and defined under
		// `repository.extendscript-globals`. Both must exist for the rule
		// to resolve; if the include reference is missing, vscode-textmate
		// silently falls through and the identifiers stay classified as
		// plain `variable`.
		expect(grammarSource).toMatch(/"extendscript-globals"\s*:/);
		expect(grammarSource).toMatch(/["']#extendscript-globals["']/);
	});

	it("tags globals with the support.type.extendscript scope", () => {
		// The scope is what the theme rule in `Code.tsx` keys on. If the
		// scope name drifts (e.g. someone renames it to
		// `entity.global.function.extendscript`), the theme rule stops
		// matching and the blue color disappears.
		expect(grammarSource).toMatch(/"support\.type\.extendscript"/);
	});

	// The user pushed back: don't just cover `app` — all ExtendScript
	// globals exposed by `types-for-adobe/shared/global.d.ts` need to
	// read as ExtendScript, not as anonymous JavaScript. The following
	// assertions pin the specific identifiers the pattern is supposed
	// to catch. If someone removes one of them in a refactor, this test
	// fails and forces a deliberate decision.
	const REQUIRED_GLOBALS = [
		// `app` is the most common — the After Effects Application root.
		"app",
		// `system` is the System global (the only `declare var` sibling
		// of `app` in the same file).
		"system",
		// Functions declared in `types-for-adobe/shared/global.d.ts`:
		// `clearOutput`, `currentFormatToTime`, `timeToCurrentFormat`,
		// `isValid`, `write`, `writeLn`. The BridgeTalk global from
		// `AfterEffects/22.0/index.d.ts` is included as a representative
		// namespace declared further down.
		"clearOutput",
		"currentFormatToTime",
		"timeToCurrentFormat",
		"isValid",
		"write",
		"writeLn",
		"BridgeTalk",
	];

	for (const name of REQUIRED_GLOBALS) {
		it(`includes the global "${name}" in the pattern`, () => {
			// The pattern body is a single regex string stored in the
			// `match` field. On disk the word boundaries are written as
			// the JSON-escaped `\\b` (backslash-backslash-b). We assert
			// the identifier is bounded by alternation separators (`|`)
			// or the group boundary (`(?:…)` / `)`) so a partial match
			// like `appX` doesn't satisfy the assertion. The check
			// accepts any of the four boundary shapes an alternation
			// member can have.
			const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const boundaries = [
				`(?:${escaped}`,
				`|${escaped}`,
				`${escaped}|`,
				`${escaped})`,
			];
			const pattern = new RegExp(boundaries.join("|"));
			expect(grammarSource).toMatch(pattern);
		});
	}
});
