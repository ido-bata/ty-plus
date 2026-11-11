/**
 * Regression test: the CodeEditor must register a Monaco
 * `setLanguageConfiguration` for both `javascript` and `typescript` so
 * that auto-closing pairs (e.g. `(` → `)`), surrounding pairs (used by
 * `surroundWithSnippet`), and comment tokens all behave the same as VS
 * Code. Without this, Monaco's built-in defaults apply and the
 * `notIn: ["string"]` guard on `"` is missing — the classic
 * double-quote double-insert bug.
 *
 * The CodeEditor component itself is excluded from CI (monaco-editor +
 * happy-dom), so source-level assertions are the practical way to lock
 * this in. Same pattern as `Code-resize.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const codeSource = readFileSync(new URL("./Code.tsx", import.meta.url), "utf8");

describe("CodeEditor registers a language configuration", () => {
	it("declares an EXTENDSCRIPT_LANG_CONFIG constant", () => {
		expect(codeSource).toMatch(
			/const\s+EXTENDSCRIPT_LANG_CONFIG\s*:\s*monaco\.languages\.LanguageConfiguration\s*=/,
		);
	});

	it("configuration includes autoClosingPairs with notIn: string for double quote", () => {
		// The `notIn: ["string"]` guard on `"` is the specific bug we're
		// guarding against — a string literal that types another `"` must
		// NOT auto-insert a second `"` (which would escape the string).
		const configMatch = codeSource.match(
			/const\s+EXTENDSCRIPT_LANG_CONFIG\s*:\s*monaco\.languages\.LanguageConfiguration\s*=\s*\{([\s\S]*?)\n\s*\};/,
		);
		expect(configMatch).not.toBeNull();
		const body = configMatch?.[1] ?? "";
		expect(body).toMatch(/autoClosingPairs\s*:/);
		expect(body).toMatch(/notIn\s*:\s*\[\s*["']string["']\s*\]/);
	});

	it("configuration includes surroundingPairs", () => {
		const configMatch = codeSource.match(
			/const\s+EXTENDSCRIPT_LANG_CONFIG\s*:\s*monaco\.languages\.LanguageConfiguration\s*=\s*\{([\s\S]*?)\n\s*\};/,
		);
		expect(configMatch).not.toBeNull();
		const body = configMatch?.[1] ?? "";
		expect(body).toMatch(/surroundingPairs\s*:/);
	});

	it("configuration includes comments and brackets", () => {
		const configMatch = codeSource.match(
			/const\s+EXTENDSCRIPT_LANG_CONFIG\s*:\s*monaco\.languages\.LanguageConfiguration\s*=\s*\{([\s\S]*?)\n\s*\};/,
		);
		expect(configMatch).not.toBeNull();
		const body = configMatch?.[1] ?? "";
		expect(body).toMatch(/comments\s*:/);
		expect(body).toMatch(/lineComment\s*:\s*["']\/\/["']/);
		expect(body).toMatch(/brackets\s*:/);
	});

	it("ensureLanguageConfigurations registers the config for both javascript and typescript", () => {
		// Both languages must receive the same configuration object so a
		// future dialog that opens with `language="typescript"` behaves
		// identically to the JS path.
		const helperMatch = codeSource.match(
			/const\s+ensureLanguageConfigurations\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/,
		);
		expect(helperMatch).not.toBeNull();
		const body = helperMatch?.[1] ?? "";
		expect(body).toMatch(/["']javascript["']/);
		expect(body).toMatch(/["']typescript["']/);
		expect(body).toMatch(/setLanguageConfiguration/);
	});

	it("wires ensureLanguageConfigurations into the editor mount effect", () => {
		// The helper must be called from the same useEffect that creates
		// the Monaco editor instance.
		expect(codeSource).toMatch(
			/ensureMonacoEnvironment\(\);[\s\S]{0,80}?ensureLanguageConfigurations\(\)/,
		);
	});

	it("imports ensureExtendscriptLanguage from ./textmate", () => {
		// `monaco.languages.setLanguageConfiguration("extendscript", ...)`
		// throws `Cannot set configuration for unknown language extendscript`
		// unless the language is registered first. The registration lives
		// in textmate.ts and must be imported here so we can call it from
		// the synchronous `ensureLanguageConfigurations` helper (the
		// `initTextMate` call is async and runs AFTER the config is set,
		// so it cannot gate this path).
		expect(codeSource).toMatch(
			/import\s*\{[^}]*ensureExtendscriptLanguage[^}]*\}\s*from\s*["']\.\/textmate["']/,
		);
	});

	it("ensureLanguageConfigurations registers extendscript before calling setLanguageConfiguration", () => {
		// Order matters: `monaco.languages.setLanguageConfiguration` throws
		// on an unregistered language id. The fix for the editor-open
		// crash is to call `ensureExtendscriptLanguage()` from the same
		// helper that calls `setLanguageConfiguration`, BEFORE the loop.
		// Asserting the order inside the helper body prevents a future
		// refactor from re-introducing the crash.
		// Search for `setLanguageConfiguration(` (with the open paren) so
		// the substring inside the explanatory comment is skipped.
		const helperMatch = codeSource.match(
			/const\s+ensureLanguageConfigurations\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/,
		);
		expect(helperMatch).not.toBeNull();
		const body = helperMatch?.[1] ?? "";
		const callIndex = body.indexOf("ensureExtendscriptLanguage()");
		const setIndex = body.indexOf("setLanguageConfiguration(");
		expect(callIndex).toBeGreaterThanOrEqual(0);
		expect(setIndex).toBeGreaterThanOrEqual(0);
		expect(callIndex).toBeLessThan(setIndex);
	});
});
