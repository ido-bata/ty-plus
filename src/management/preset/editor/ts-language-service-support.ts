/**
 * Capability probe for the Volar TypeScript language service.
 *
 * The editor worker hands `volar-service-typescript` a reduced `ts`-shaped
 * proxy rather than the real `typescript` module — see the comment on the
 * proxy in `typescript-worker.ts` for why (TS 7 is the Go-based rewrite and
 * no longer exposes the compiler API from the `typescript` entry point).
 *
 * Volar 0.0.71 does not build the service from that proxy on its own: its
 * semantic plugin routes through `typescript-auto-import-cache`, which does
 *
 *     createProjectService(ts, sys, …, ts.LanguageServiceMode.Semantic)
 *
 * the moment the worker is asked for diagnostics. Against a `ts` without
 * those members that is a `TypeError` — `Cannot read properties of undefined
 * (reading 'Semantic')` — thrown at plugin-creation time inside the Web
 * Worker, which kills the worker instead of degrading the feature. The
 * editor is left with no semantic tokens and no diagnostics either way; the
 * difference is that a crash also takes the TextMate tokenization path's
 * worker down and, in the test harness, fails the whole run.
 *
 * Gating the plugin list on this probe makes the degraded state explicit:
 * with no language-service surface the editor keeps tokenizing and reports
 * no TS diagnostics, which is the documented state until Volar ships a
 * TypeScript 7 compatible release.
 */

/**
 * The subset of the `ts` surface the probe looks at. Declared structurally
 * so the probe can be exercised against hand-built objects in tests without
 * dragging a real TypeScript install into the test.
 */
export type TypeScriptLanguageServiceSurface = {
	readonly createLanguageService?: unknown;
	readonly LanguageServiceMode?: unknown;
	// The worker hands in its reduced `ts` proxy, which carries members that
	// are irrelevant here (`version`, `ScriptSnapshot`). The index signature
	// keeps TypeScript's weak-type check from rejecting a shape that shares no
	// key with the two the probe actually reads.
	readonly [otherMember: string]: unknown;
};

/**
 * `true` when `candidate` carries the two members
 * `typescript-auto-import-cache` reaches for while constructing the Volar
 * language service: the `createLanguageService` factory and the
 * `LanguageServiceMode` enum it reads `.Semantic` from.
 */
export const supportsTypeScriptLanguageService = (
	candidate: TypeScriptLanguageServiceSurface,
): boolean =>
	typeof candidate.createLanguageService === "function" &&
	typeof candidate.LanguageServiceMode === "object" &&
	candidate.LanguageServiceMode !== null;
