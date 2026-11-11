/**
 * Regression test: the CodeEditor must register Volar providers
 * (`registerProviders` from `@volar/monaco`) for **both** `javascript`
 * and `typescript`. If only `javascript` is wired, a future dialog that
 * opens with `language="typescript"` falls back to Monaco's built-in TS
 * service — which does NOT see the virtual types-for-adobe `.d.ts`
 * files loaded by the worker, so completions/hover/diagnostics on
 * `app.*` / `$.*` go dark.
 *
 * The CodeEditor component itself is excluded from CI (monaco-editor +
 * happy-dom), so source-level assertions are the practical way to lock
 * this in. Same pattern as `Code-resize.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const codeSource = readFileSync(new URL("./Code.tsx", import.meta.url), "utf8");

describe("CodeEditor registers Volar providers for both languages", () => {
	it("calls registerProviders with both 'javascript' and 'typescript'", () => {
		// Look for an array literal containing both language ids followed
		// by a `.map(` call. The regex allows for an `(arr as const)`
		// type assertion between the bracket and the dot.
		expect(codeSource).toMatch(
			/\[\s*["']javascript["']\s*,\s*["']typescript["']\s*\][\s\S]{0,40}?\.map\(/,
		);
	});

	it("registerProviders call syncs the main model URI via getSyncUris", () => {
		// The previous implementation used `() => []`, which told Monaco
		// not to sync any models to the worker. The TS service then had
		// no main file to analyze, so `app` / `$` could not be resolved
		// against the inlined `types-for-adobe` types and no semantic
		// tokens were emitted. The fix returns the editor's model URI
		// (captured at provider-registration time) so the worker sees
		// the file content. The virtual `.d.ts` files are still loaded
		// by the worker via `languagePlugins` in `typescript-worker.ts`.
		expect(codeSource).not.toMatch(
			/registerProviders\([\s\S]{0,400}?\(\)\s*=>\s*\[\s*\]\s*,/,
		);
		// The callback must reference the editor's model URI somehow.
		// We assert the call site captures a `syncUri` (or similar) and
		// returns it inside the array literal. The window is wide enough
		// to span the editor→getModel→uri chain.
		expect(codeSource).toMatch(
			/registerProviders\([\s\S]{0,600}?\(\)\s*=>\s*\(\s*\w+\s*\?\s*\[\s*\w+\s*\]\s*:\s*\[\s*\]\s*\)/,
		);
	});

	it("registerProviders is awaited inside the editor init useEffect", () => {
		// The call must be awaited (not fire-and-forget) so a race where
		// the user types before providers are registered does not
		// silently break completions. The window is wide enough to
		// span the multi-line comment that lives between the .map
		// callback's start and the inner registerProviders call. As of
		// the `activateMarkers` addition, `volarDisposables` is an
		// array literal whose spread contains the awaited
		// `Promise.all` — we no longer assert the literal
		// `volarDisposables = await Promise.all(` prefix, just that
		// `registerProviders` is wrapped in `await Promise.all(`.
		expect(codeSource).toMatch(
			/await\s+Promise\.all\([\s\S]{0,800}?registerProviders/,
		);
	});

	it("disposes all Volar disposables on editor unmount", () => {
		// The cleanup function must iterate over the disposables array via
		// the shared `cleanup` closure, which is called both by the catch
		// path and the effect's returned cleanup function.
		expect(codeSource).toMatch(
			/for\s*\(\s*const\s+d\s+of\s+volarDisposables\s*\)\s*d\.dispose\(\)/,
		);
	});

	it("imports activateMarkers from @volar/monaco", () => {
		// Red squigglies are wired by a separate export,
		// `activateMarkers` in `@volar/monaco/lib/editor.js`.
		// `registerProviders` alone does not publish markers; the
		// diagnostic pipeline requires this second call. A future
		// refactor that drops it would silently turn off red
		// squigglies — this assertion prevents that.
		expect(codeSource).toMatch(
			/import\s*\{[^}]*activateMarkers[^}]*\}\s*from\s*["']@volar\/monaco["']/,
		);
	});

	it("calls activateMarkers with the languages array and the monaco.editor namespace", () => {
		// The call must:
		//  1. Pass `["javascript", "typescript"]` as the language
		//     selector (a string array, not a single id — different
		//     from `registerProviders` which takes a single id).
		//  2. Pass a non-empty, project-specific owner string for
		//     `setModelMarkers` so the Volar markers don't collide
		//     with another source's markers.
		//  3. Pass `monaco.editor` (the editor namespace), NOT
		//     `monaco.languages` — `activateMarkers` calls
		//     `editor.onDidCreateModel` / `editor.setModelMarkers`
		//     which are editor-namespace methods. The wrong
		//     namespace throws at runtime on
		//     `monaco.languages.onDidCreateModel` (not a function).
		expect(codeSource).toMatch(
			/activateMarkers\([\s\S]{0,400}?\[\s*["']javascript["']\s*,\s*["']typescript["']\s*\]/,
		);
		expect(codeSource).toMatch(
			/activateMarkers\([\s\S]{0,400}?["']ty-plus-volar["']/,
		);
		expect(codeSource).toMatch(
			/activateMarkers\([\s\S]{0,800}?monaco\.editor[\s\S]*?\)/,
		);
	});

	// The `activateMarkers` wiring above is necessary but not sufficient.
	// The Volar worker (typescript-worker.ts) classifies a document by
	// its URI's file extension via the `getLanguageId` language plugin.
	// Monaco's default `inmemory://model/N` URI has no extension, so
	// the worker returns `undefined` for `languageId` and
	// `@volar/language-core/index.js:60` logs `languageId not found
	// for ...` and skips the document entirely. The downstream effect
	// is that `volar-service-typescript`'s `isTsDocument` guard short-
	// circuits and no diagnostics are ever produced — the
	// `activateMarkers` subscription fires but the worker returns no
	// markers. We pre-create the model with a URI that carries the
	// matching file extension (`.jsx` for JavaScript, `.ts` for
	// TypeScript) so the worker classifies it as a real JS/TS file.
	// The `monaco.editor.create` call then receives the model via its
	// `model` option; passing `value`/`language` alongside `model`
	// throws, so both must be absent in the `create` call site.
	it("creates the main model with a URI that has a file extension", () => {
		// `monaco.editor.createModel(value, language, uri)` is the
		// load-bearing call. The URI must interpolate the extension
		// from `editorLanguage` so a JavaScript preset gets `.jsx`
		// (Volar classifies it as `javascriptreact`) and a TypeScript
		// preset gets `.ts` (Volar classifies it as `typescript`).
		// The regex is intentionally narrow: it pins the URI shape
		// and the conditional extension selection.
		expect(codeSource).toMatch(
			/monaco\.Uri\.parse\(\s*[`"]inmemory:\/\/model\/preset\.\$\{modelExtension\}[`"]\s*,?\s*\)/,
		);
		// `modelExtension` must come from a conditional on
		// `editorLanguage` so the extension matches the language.
		expect(codeSource).toMatch(
			/modelExtension\s*=\s*editorLanguage\s*===\s*["']typescript["']\s*\?\s*["']ts["']\s*:\s*["']jsx["']/,
		);
		// The model must be created via `monaco.editor.createModel`
		// (not via the legacy `value`+`language` pair in
		// `monaco.editor.create`).
		expect(codeSource).toMatch(
			/monaco\.editor\.createModel\(\s*valueRef\.current\s*,\s*editorLanguage\s*,\s*modelUri\s*,?\s*\)/,
		);
	});

	it("passes the pre-created model to monaco.editor.create via the model option", () => {
		// Passing `value`/`language` alongside `model` throws, so
		// the call site must use the `model` option (not the
		// legacy `value`+`language` pair). The wrapper
		// `createMonacoEditor` is what calls `monaco.editor.create`
		// internally; the regex matches either spelling.
		expect(codeSource).toMatch(
			/monaco\.editor\.create\(\s*container\s*,\s*\{[\s\S]{0,200}?model\s*,/,
		);
	});
});
