/**
 * Regression test for the Volar language-service capability gate.
 *
 * The gate exists because the reduced `ts` proxy in `typescript-worker.ts`
 * cannot back `volar-service-typescript` 0.0.71: its semantic plugin builds
 * the service through `typescript-auto-import-cache`, which reads
 * `ts.LanguageServiceMode.Semantic` and calls `ts.createProjectService`.
 * On a `ts` without those members that threw
 * `Cannot read properties of undefined (reading 'Semantic')` inside the Web
 * Worker at the first diagnostics request — an uncaught error that killed
 * the worker (and failed the Storybook/Vitest run) instead of degrading the
 * feature.
 *
 * The probe itself is a pure function over a structural type, so it is
 * exercised here against hand-built objects rather than source-text
 * assertions. The wiring in the worker itself is covered by the source-level
 * assertions in `typescript-worker.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { supportsTypeScriptLanguageService } from "./ts-language-service-support";

/**
 * The exact shape `typescript-worker.ts` builds: `version` plus a
 * `ScriptSnapshot.fromString` constructor and nothing else. This is the
 * object that used to crash the worker, so it is the case that matters most.
 */
const REDUCED_TS_PROXY = {
	version: "7.0.2",
	ScriptSnapshot: {
		fromString: (text: string) => ({
			getText: (_start: number, end: number) => text.slice(0, end),
			getLength: () => text.length,
			getChangeRange: () => undefined,
		}),
	},
};

describe("supportsTypeScriptLanguageService", () => {
	it("rejects the reduced ts proxy the worker actually ships", () => {
		// Regression case: this object reached `createTypeScriptService` and
		// took the worker down with `reading 'Semantic'`.
		expect(supportsTypeScriptLanguageService(REDUCED_TS_PROXY)).toBe(false);
	});

	it("rejects an empty surface", () => {
		expect(supportsTypeScriptLanguageService({})).toBe(false);
	});

	it("accepts a surface carrying createLanguageService and LanguageServiceMode", () => {
		// The TypeScript 5 shape Volar 0.0.71 was written against: both
		// members present means the auto-import cache can build the service.
		expect(
			supportsTypeScriptLanguageService({
				createLanguageService: () => undefined,
				LanguageServiceMode: { Semantic: 0, PartialSemantic: 1 },
			}),
		).toBe(true);
	});

	it("rejects a surface missing only the enum", () => {
		// `createProjectService(ts, …, ts.LanguageServiceMode.Semantic)`
		// reads the enum first, so a surface with just the factory still
		// throws on the `.Semantic` dereference.
		expect(
			supportsTypeScriptLanguageService({
				createLanguageService: () => undefined,
			}),
		).toBe(false);
	});

	it("rejects a surface missing only the factory", () => {
		expect(
			supportsTypeScriptLanguageService({
				LanguageServiceMode: { Semantic: 0 },
			}),
		).toBe(false);
	});

	it("rejects a non-callable createLanguageService", () => {
		// Guard against a truthy-but-wrong shape slipping through: the
		// factory is invoked, so `typeof` has to be checked, not existence.
		expect(
			supportsTypeScriptLanguageService({
				createLanguageService: "not-a-function",
				LanguageServiceMode: { Semantic: 0 },
			}),
		).toBe(false);
	});

	it("rejects a null LanguageServiceMode", () => {
		expect(
			supportsTypeScriptLanguageService({
				createLanguageService: () => undefined,
				LanguageServiceMode: null,
			}),
		).toBe(false);
	});
});
