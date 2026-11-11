/**
 * Regression test: the Volar worker's `getLanguageId` language plugin
 * must classify the main Monaco model as a real JS/TS document so the
 * diagnostic pipeline (`activateMarkers` in Code.tsx) can produce red
 * squigglies. The previous implementation only returned `"typescript"`
 * for `.d.ts` URIs and `undefined` for everything else — which made
 * `@volar/language-core/index.js:60` log `languageId not found for ...`
 * and skip the document entirely. The downstream effect is that
 * `volar-service-typescript`'s `isTsDocument` guard short-circuits and
 * no diagnostics are ever produced.
 *
 * The worker itself is excluded from CI (it runs inside a Web Worker
 * that the test harness cannot stand up), so source-level assertions
 * are the practical way to lock this in. Same pattern as
 * `Code-volar.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
	new URL("./typescript-worker.ts", import.meta.url),
	"utf8",
);

describe("typescript-worker language plugin", () => {
	it("imports resolveFileLanguageId from @volar/typescript", () => {
		// The canonical helper that maps a URI's file extension to
		// a Monaco-compatible `languageId` (`.js` → `javascript`,
		// `.jsx` → `javascriptreact`, `.ts` → `typescript`,
		// `.tsx` → `typescriptreact`, etc.). Delegating to it is
		// the load-bearing detail: the worker's previous
		// `scriptId.path.endsWith(".d.ts") ? "typescript" : undefined`
		// returned `undefined` for the main model URI, which made
		// `@volar/language-core` skip the document.
		expect(workerSource).toMatch(
			/import\s*\{[^}]*resolveFileLanguageId[^}]*\}\s*from\s*["']@volar\/typescript\/lib\/common\.js["']/,
		);
	});

	it("calls resolveFileLanguageId inside the getLanguageId plugin", () => {
		// The plugin must delegate to the resolver; a hand-rolled
		// `endsWith(".d.ts")` check is the bug we are guarding
		// against. The window is wide enough to span the
		// `getLanguageId(scriptId) { ... return resolveFileLanguageId(...) ... }`
		// body.
		expect(workerSource).toMatch(
			/getLanguageId\(\s*scriptId\s*\)[\s\S]{0,400}?resolveFileLanguageId\(\s*scriptId\.path\s*\)/,
		);
	});

	it("does not return undefined from getLanguageId for non-.d.ts URIs", () => {
		// The old implementation returned `undefined` for any URI
		// that did not end with `.d.ts`. That was the root cause
		// of the missing diagnostics — `@volar/language-core`
		// treats `undefined` as "skip this document". A future
		// refactor that reverts to the conditional would silently
		// turn off red squigglies again.
		expect(workerSource).not.toMatch(
			/getLanguageId[\s\S]{0,200}?endsWith\(\s*["']\.d\.ts["']\s*\)\s*\?\s*["']typescript["']\s*:\s*undefined/,
		);
	});

	// The `getLanguageId` delegation above is necessary but not
	// sufficient. The deeper bug was in the `asFileName`/`asUri`
	// pair: `@volar/monaco/worker.js:47` uses
	// `model.uri.toString() === uri.toString()` to find the Monaco
	// model for a given URI. The default `URI.file` + `uri.fsPath`
	// only round-trip for `file://` URIs — for the main model's
	// `inmemory://model/preset.jsx`, the conversion produces
	// `file:///preset.jsx` on the vscode-uri side, the strings
	// don't match, the model is never found, the script is never
	// registered, and the TS service has no document to analyze
	// (even though the diagnostic pipeline is correctly wired).
	// The fix detects the scheme and round-trips via
	// `toString`/`URI.parse` for non-`file` URIs.
	it("asFileName returns the full URI string for non-file schemes", () => {
		// The old one-liner `uri.fsPath` returned just the path
		// component (e.g., `/preset.jsx` for
		// `inmemory://model/preset.jsx`), which broke the
		// vscode-uri round-trip. A future refactor that reverts
		// to `uri.fsPath` would silently turn off red squigglies
		// again because the worker can no longer match the model.
		expect(workerSource).toMatch(
			/asFileName[\s\S]{0,400}?scheme\s*!==\s*["']file["'][\s\S]{0,200}?uri\.toString\(\)/,
		);
	});

	it("asUri uses URI.parse for non-file URI strings", () => {
		// The old one-liner `URI.file` interpreted any incoming
		// string as an OS file path, producing a `file://` URI
		// regardless of the original scheme. The fix checks for
		// the `://` marker (with a `file://` exclusion) and uses
		// `URI.parse` so the scheme is preserved.
		expect(workerSource).toMatch(/asUri[\s\S]{0,400}?URI\.parse\(fileName\)/);
		expect(workerSource).not.toMatch(
			/^const asUri\s*=\s*\(fileName:\s*string\):\s*URI\s*=>\s*URI\.file\(fileName\)\s*;?\s*$/m,
		);
	});

	it("gates the language-service plugins on the TS surface probe", () => {
		// `volar-service-typescript` 0.0.71 builds its service through
		// `typescript-auto-import-cache`, which reads
		// `ts.LanguageServiceMode.Semantic` and calls `ts.createProjectService`
		// while the service is created. Neither member exists on the reduced
		// proxy above, so passing the plugins unconditionally threw
		// `Cannot read properties of undefined (reading 'Semantic')` inside
		// the Web Worker on the first diagnostics request. The plugin list
		// must be produced by the probe, not by `createTypeScriptService`
		// directly.
		expect(workerSource).toMatch(
			/languageServicePlugins\s*=\s*supportsTypeScriptLanguageService\(\s*ts\s*\)[\s\S]{0,120}?createTypeScriptService\(\s*ts\s*\)[\s\S]{0,40}?:\s*\[\]/,
		);
		expect(workerSource).not.toMatch(
			/languageServicePlugins:\s*createTypeScriptService\(\s*ts\s*\)/,
		);
	});
});
