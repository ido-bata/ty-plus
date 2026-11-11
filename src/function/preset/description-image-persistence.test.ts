/**
 * Regression test: the function preset authoring dialogs (layer-comp,
 * animation, code) all render an ArchiveDetailsSection that lets the user
 * pick a description image. Each dialog's save path must persist that
 * descriptionImage onto the Preset record, otherwise it is silently dropped
 * on save and never re-appears in the Edit dialog.
 *
 * The dialog tests are excluded from CI (monaco-editor + happy-dom), so
 * source-level assertions are the practical way to lock this in. This is the
 * same pattern as `code/dialog-source.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layerCompSource = readFileSync(
	new URL("./layer-comp/Dialog.tsx", import.meta.url),
	"utf8",
);
const animationSource = readFileSync(
	new URL("./animation/Dialog.tsx", import.meta.url),
	"utf8",
);
const codeSource = readFileSync(
	new URL("./code/Dialog.tsx", import.meta.url),
	"utf8",
);

const writesDescriptionImage = (source: string): boolean => {
	// Match any of the three safe patterns: spread+ternary, conditional, or
	// direct assignment. The bug we are guarding against is the absence of
	// any `descriptionImage` reference inside the Preset record literal.
	return /descriptionImage\s*:/.test(source);
};

describe("function preset authoring dialogs persist descriptionImage", () => {
	it("layer-comp persistOverride writes descriptionImage onto the record", () => {
		expect(writesDescriptionImage(layerCompSource)).toBe(true);
	});

	it("animation onSave writes descriptionImage onto the record", () => {
		expect(writesDescriptionImage(animationSource)).toBe(true);
	});

	it("code onSave and persistOverride both write descriptionImage", () => {
		const matches = codeSource.match(/descriptionImage\s*:/g) ?? [];
		// Two save paths in this dialog (onSave + persistOverride) → at least
		// two writes are required. The useState declaration and the JSX prop
		// use `=` not `:`, so they don't match.
		expect(matches.length).toBeGreaterThanOrEqual(2);
	});
});
